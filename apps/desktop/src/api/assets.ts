// v3.4 repurpose note: candidate_assets.resume_file_ref / jd_file_ref no longer
// store filesystem paths. They store the PDF-extracted plain text (via pdf.extractText).
// Raw PDF bytes are never persisted — only structured text flows into SQLite.
// §A0.4: params passed to db.exec never contain ARK_API_KEY or other secrets.

import type {
  AssetUploadRequest,
  AssetUploadResponse,
  ParseRequestResponse,
  ParseResultResponse,
} from "@eatit/shared-types";
import { db } from "@/services/db";
import { pdf } from "@/services/pdf";
import { runParseAgent } from "@/core/agents/parse";
import { llm } from "@/core/llm";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Format: "data:<mime>;base64,<data>"
      const idx = dataUrl.indexOf("base64,");
      if (idx === -1) {
        reject(new Error("Failed to read file as base64"));
        return;
      }
      resolve(dataUrl.slice(idx + 7));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Public API — signatures unchanged from the axios version
// ---------------------------------------------------------------------------

export const uploadResume = async (
  file: File,
  request: AssetUploadRequest = {},
): Promise<AssetUploadResponse> => {
  const base64 = await fileToBase64(file);
  const { text } = await pdf.extractText(base64);
  const assetBundleId = request.asset_bundle_id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await db.exec(
    `INSERT INTO candidate_assets (id, user_id, resume_file_ref, resume_filename, resume_content_type, status, created_at, updated_at)
     VALUES (?, 'local', ?, ?, ?, 'ready', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       resume_file_ref = excluded.resume_file_ref,
       resume_filename = excluded.resume_filename,
       resume_content_type = excluded.resume_content_type,
       status = 'ready',
       updated_at = excluded.updated_at`,
    [assetBundleId, text, file.name, file.type || "application/pdf", now, now],
  );

  return {
    id: assetBundleId,
    asset_bundle_id: assetBundleId,
    status: "ready_for_parse",
    uploaded_kind: "resume",
    created_at: now,
    updated_at: now,
  };
};

export const uploadJd = async (
  file: File,
  request: AssetUploadRequest = {},
): Promise<AssetUploadResponse> => {
  const base64 = await fileToBase64(file);
  const { text } = await pdf.extractText(base64);
  const assetBundleId = request.asset_bundle_id ?? crypto.randomUUID();
  const now = new Date().toISOString();

  await db.exec(
    `INSERT INTO candidate_assets (id, user_id, jd_file_ref, jd_filename, jd_content_type, status, created_at, updated_at)
     VALUES (?, 'local', ?, ?, ?, 'ready', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       jd_file_ref = excluded.jd_file_ref,
       jd_filename = excluded.jd_filename,
       jd_content_type = excluded.jd_content_type,
       status = 'ready',
       updated_at = excluded.updated_at`,
    [assetBundleId, text, file.name, file.type || "application/pdf", now, now],
  );

  return {
    id: assetBundleId,
    asset_bundle_id: assetBundleId,
    status: "ready_for_parse",
    uploaded_kind: "jd",
    created_at: now,
    updated_at: now,
  };
};

export const triggerParse = async (assetBundleId: string): Promise<ParseRequestResponse> => {
  const rows = await db.query(
    "SELECT resume_file_ref, jd_file_ref FROM candidate_assets WHERE id = ?",
    [assetBundleId],
  );

  if (rows.length === 0) {
    throw new Error(`candidate_assets row not found for id=${assetBundleId}`);
  }

  const resumeText = (rows[0].resume_file_ref as string | null) ?? "";
  const jdText = (rows[0].jd_file_ref as string | null) ?? "";

  if (!resumeText || !jdText) {
    throw new Error("Resume or JD not yet uploaded for this asset bundle");
  }

  const output = await runParseAgent(
    { resume_text: resumeText, jd_text: jdText },
    { llm },
  );

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.exec(
    `INSERT INTO parse_results (id, candidate_asset_id, status, payload, match_summary, created_at, updated_at)
     VALUES (?, ?, 'ready', ?, '', ?, ?)
     ON CONFLICT(candidate_asset_id) DO UPDATE SET
       status = 'ready',
       payload = excluded.payload,
       updated_at = excluded.updated_at`,
    [id, assetBundleId, JSON.stringify(output), now, now],
  );

  return {
    asset_bundle_id: assetBundleId,
    status: "ready",
    payload: output,
    research_payload: null,
    predicted_questions: null,
  };
};

export const getParseResult = async (assetBundleId: string): Promise<ParseResultResponse> => {
  const rows = await db.query(
    "SELECT id, candidate_asset_id, status, payload, created_at, updated_at FROM parse_results WHERE candidate_asset_id = ?",
    [assetBundleId],
  );

  if (rows.length === 0) {
    throw new Error(`parse_results row not found for candidate_asset_id=${assetBundleId}`);
  }

  const row = rows[0];

  return {
    id: row.id as string,
    candidate_asset_id: row.candidate_asset_id as string,
    status: row.status as string,
    payload: JSON.parse(row.payload as string),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
};

export interface CandidateAssetMeta {
  resumeFilename: string | null;
  jdFilename: string | null;
}

/**
 * Lightweight read of just the human-facing filenames from `candidate_assets`,
 * used by InterviewPage / ReportPage to render fallback labels when the LLM
 * parse didn't surface a company/role.  Cheap (single-row PK lookup); never
 * touches the file_ref columns (those store extracted text + are bigger).
 */
export const getCandidateAssetMeta = async (
  assetBundleId: string,
): Promise<CandidateAssetMeta | null> => {
  const rows = await db.query(
    "SELECT resume_filename, jd_filename FROM candidate_assets WHERE id = ?",
    [assetBundleId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    resumeFilename: (row.resume_filename as string | null) ?? null,
    jdFilename: (row.jd_filename as string | null) ?? null,
  };
};
