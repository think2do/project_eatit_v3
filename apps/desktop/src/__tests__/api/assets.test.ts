/**
 * api/assets — M5.4.dev.b PR2b
 *
 * Tests the db+pdf Bridge pattern for uploadResume / uploadJd /
 * triggerParse / getParseResult. The axios path is fully replaced:
 * File → FileReader → pdf.extractText → db.exec (uploads) and
 * db.query → runParseAgent → db.exec (parse trigger).
 *
 * §A0: no Tauri. §B9: db/pdf mocks mirror Zod Row/PDFExtractResult contracts.
 * §A0.4: ARK_API_KEY never appears in db.exec params; llm mock verifies this.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/db", () => ({
  db: {
    exec: vi.fn(),
    query: vi.fn(),
  },
}));

vi.mock("@/services/pdf", () => ({
  pdf: {
    extractText: vi.fn(),
  },
}));

vi.mock("@/core/agents/parse", () => ({
  runParseAgent: vi.fn(),
}));

vi.mock("@/core/llm", () => ({
  llm: { generateObject: vi.fn() },
}));

import { db } from "@/services/db";
import { pdf } from "@/services/pdf";
import { runParseAgent } from "@/core/agents/parse";
import { uploadResume, uploadJd, triggerParse, getParseResult } from "@/api/assets";

const mockExec = vi.mocked(db.exec);
const mockQuery = vi.mocked(db.query);
const mockExtractText = vi.mocked(pdf.extractText);
const mockRunParseAgent = vi.mocked(runParseAgent);

// ---------------------------------------------------------------------------
// FileReader mock helper
// ---------------------------------------------------------------------------

function mockFileReader(base64Result = "data:application/pdf;base64,JVBERi0xLjQ=") {
  const reader = {
    result: "" as string,
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    readAsDataURL: vi.fn(function (this: typeof reader) {
      setTimeout(() => {
        this.result = base64Result;
        this.onload?.();
      }, 0);
    }),
    error: null as DOMException | null,
  };
  vi.spyOn(global, "FileReader").mockImplementation(() => reader as unknown as FileReader);
  return reader;
}

function mockFileReaderError(error: Error) {
  const reader = {
    result: "",
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
    readAsDataURL: vi.fn(function (this: typeof reader) {
      setTimeout(() => {
        this.onerror?.();
      }, 0);
    }),
    error: error as unknown as DOMException,
  };
  vi.spyOn(global, "FileReader").mockImplementation(() => reader as unknown as FileReader);
}

const EXTRACTED_TEXT = "John Doe — Software Engineer with 5 years experience";
const ASSET_BUNDLE_ID = "550e8400-e29b-41d4-a716-446655440000";
const RESUME_FILE = new File(["fake-pdf-bytes"], "resume.pdf", { type: "application/pdf" });
const JD_FILE = new File(["fake-jd-bytes"], "jd.pdf", { type: "application/pdf" });

const SAMPLE_PARSE_OUTPUT = {
  job_requirements: [],
  candidate_highlights: [],
  candidate_risks: [],
  project_hooks: [],
  match_advantages: [],
  gaps: [],
  interview_focus: [
    {
      direction_id: "cross-func" as const,
      priority: "high" as const,
      title: "跨职能协作",
      description: "跨团队推进能力验证。",
    },
    {
      direction_id: "zero-to-one" as const,
      priority: "mid" as const,
      title: "0→1 推动力",
      description: "独立推进新项目节奏。",
    },
  ],
  project_hooks_v32: [],
  jd_industry_hints: [],
};

beforeEach(() => {
  mockExec.mockReset();
  mockQuery.mockReset();
  mockExtractText.mockReset();
  mockRunParseAgent.mockReset();
  vi.restoreAllMocks();

  mockExec.mockResolvedValue({ rowsAffected: 1 });
  mockExtractText.mockResolvedValue({ text: EXTRACTED_TEXT, pageCount: 2 });
  mockRunParseAgent.mockResolvedValue(SAMPLE_PARSE_OUTPUT);
});

// ---------------------------------------------------------------------------
// uploadResume
// ---------------------------------------------------------------------------

describe("uploadResume", () => {
  it("calls pdf.extractText with base64 from FileReader", async () => {
    mockFileReader();
    await uploadResume(RESUME_FILE);
    expect(mockExtractText).toHaveBeenCalledWith("JVBERi0xLjQ=");
  });

  it("writes resume_file_ref=extractedText and resume_filename to candidate_assets", async () => {
    mockFileReader();
    await uploadResume(RESUME_FILE, { asset_bundle_id: ASSET_BUNDLE_ID });
    const [sql, params] = mockExec.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO candidate_assets/i);
    expect(sql).toMatch(/resume_file_ref/i);
    expect(sql).toMatch(/ON CONFLICT\(id\) DO UPDATE/i);
    expect(params).toContain(ASSET_BUNDLE_ID);         // id
    expect(params).toContain(EXTRACTED_TEXT);           // resume_file_ref = plain text
    expect(params).toContain("resume.pdf");             // resume_filename
    expect(params).toContain("application/pdf");        // resume_content_type
  });

  it("uses provided asset_bundle_id when given", async () => {
    mockFileReader();
    const result = await uploadResume(RESUME_FILE, { asset_bundle_id: ASSET_BUNDLE_ID });
    expect(result.asset_bundle_id).toBe(ASSET_BUNDLE_ID);
    expect(result.id).toBe(ASSET_BUNDLE_ID);
  });

  it("generates a UUID when asset_bundle_id is not provided", async () => {
    mockFileReader();
    const result = await uploadResume(RESUME_FILE);
    expect(result.asset_bundle_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns AssetUploadResponse with uploaded_kind='resume' and status", async () => {
    mockFileReader();
    const result = await uploadResume(RESUME_FILE, { asset_bundle_id: ASSET_BUNDLE_ID });
    expect(result.uploaded_kind).toBe("resume");
    expect(result.status).toBeDefined();
    expect(result.created_at).toBeDefined();
    expect(result.updated_at).toBeDefined();
  });

  it("propagates error when pdf.extractText throws", async () => {
    mockFileReader();
    mockExtractText.mockRejectedValue(new Error("pdf.invalid-pdf"));
    await expect(uploadResume(RESUME_FILE)).rejects.toThrow("pdf.invalid-pdf");
  });

  it("propagates error when FileReader fails", async () => {
    mockFileReaderError(new Error("FileReader error"));
    await expect(uploadResume(RESUME_FILE)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// uploadJd
// ---------------------------------------------------------------------------

describe("uploadJd", () => {
  it("writes jd_file_ref=extractedText and jd_filename to candidate_assets", async () => {
    mockFileReader();
    await uploadJd(JD_FILE, { asset_bundle_id: ASSET_BUNDLE_ID });
    const [sql, params] = mockExec.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO candidate_assets/i);
    expect(sql).toMatch(/jd_file_ref/i);
    expect(sql).toMatch(/ON CONFLICT\(id\) DO UPDATE/i);
    expect(params).toContain(EXTRACTED_TEXT);   // jd_file_ref = plain text
    expect(params).toContain("jd.pdf");         // jd_filename
  });

  it("returns AssetUploadResponse with uploaded_kind='jd'", async () => {
    mockFileReader();
    const result = await uploadJd(JD_FILE, { asset_bundle_id: ASSET_BUNDLE_ID });
    expect(result.uploaded_kind).toBe("jd");
    expect(result.asset_bundle_id).toBe(ASSET_BUNDLE_ID);
  });

  it("does not write resume_* columns (separate upsert columns)", async () => {
    mockFileReader();
    await uploadJd(JD_FILE, { asset_bundle_id: ASSET_BUNDLE_ID });
    const [sql] = mockExec.mock.calls[0];
    expect(sql).not.toMatch(/resume_file_ref/i);
  });
});

// ---------------------------------------------------------------------------
// triggerParse
// ---------------------------------------------------------------------------

describe("triggerParse", () => {
  it("reads resume_file_ref and jd_file_ref from candidate_assets", async () => {
    mockQuery.mockResolvedValue([
      { resume_file_ref: "resume text", jd_file_ref: "jd text" },
    ]);
    await triggerParse(ASSET_BUNDLE_ID);
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT resume_file_ref, jd_file_ref FROM candidate_assets WHERE id = ?",
      [ASSET_BUNDLE_ID],
    );
  });

  it("calls runParseAgent with {resume_text, jd_text}", async () => {
    mockQuery.mockResolvedValue([
      { resume_file_ref: "my resume", jd_file_ref: "my jd" },
    ]);
    await triggerParse(ASSET_BUNDLE_ID);
    expect(mockRunParseAgent).toHaveBeenCalledWith(
      { resume_text: "my resume", jd_text: "my jd" },
      expect.objectContaining({ llm: expect.anything() }),
    );
  });

  it("writes parse_results with ON CONFLICT(candidate_asset_id) DO UPDATE", async () => {
    mockQuery.mockResolvedValue([
      { resume_file_ref: "resume text", jd_file_ref: "jd text" },
    ]);
    await triggerParse(ASSET_BUNDLE_ID);
    const [sql, params] = mockExec.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO parse_results/i);
    expect(sql).toMatch(/ON CONFLICT\(candidate_asset_id\) DO UPDATE/i);
    expect(params).toContain(ASSET_BUNDLE_ID);              // candidate_asset_id
    expect(params).toContain(JSON.stringify(SAMPLE_PARSE_OUTPUT)); // payload
  });

  it("returns ParseRequestResponse with research_payload=null and predicted_questions=null", async () => {
    mockQuery.mockResolvedValue([
      { resume_file_ref: "resume text", jd_file_ref: "jd text" },
    ]);
    const result = await triggerParse(ASSET_BUNDLE_ID);
    expect(result.asset_bundle_id).toBe(ASSET_BUNDLE_ID);
    expect(result.payload).toEqual(SAMPLE_PARSE_OUTPUT);
    expect(result.research_payload).toBeNull();
    expect(result.predicted_questions).toBeNull();
  });

  it("throws when candidate_assets row not found", async () => {
    mockQuery.mockResolvedValue([]);
    await expect(triggerParse(ASSET_BUNDLE_ID)).rejects.toThrow(
      `candidate_assets row not found for id=${ASSET_BUNDLE_ID}`,
    );
  });

  it("throws when resume_file_ref is empty (resume not yet uploaded)", async () => {
    mockQuery.mockResolvedValue([{ resume_file_ref: null, jd_file_ref: "jd text" }]);
    await expect(triggerParse(ASSET_BUNDLE_ID)).rejects.toThrow(
      "Resume or JD not yet uploaded for this asset bundle",
    );
  });

  it("throws when jd_file_ref is empty (jd not yet uploaded)", async () => {
    mockQuery.mockResolvedValue([{ resume_file_ref: "resume text", jd_file_ref: null }]);
    await expect(triggerParse(ASSET_BUNDLE_ID)).rejects.toThrow(
      "Resume or JD not yet uploaded for this asset bundle",
    );
  });
});

// ---------------------------------------------------------------------------
// getParseResult
// ---------------------------------------------------------------------------

describe("getParseResult", () => {
  const PAYLOAD_STR = JSON.stringify(SAMPLE_PARSE_OUTPUT);
  const PARSE_RESULT_ID = "660e8400-e29b-41d4-a716-446655440001";

  it("returns ParseResultResponse with JSON.parsed payload when row exists", async () => {
    mockQuery.mockResolvedValue([
      {
        id: PARSE_RESULT_ID,
        candidate_asset_id: ASSET_BUNDLE_ID,
        status: "ready",
        payload: PAYLOAD_STR,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    ]);
    const result = await getParseResult(ASSET_BUNDLE_ID);
    expect(result.id).toBe(PARSE_RESULT_ID);
    expect(result.candidate_asset_id).toBe(ASSET_BUNDLE_ID);
    expect(result.status).toBe("ready");
    expect(result.payload).toEqual(SAMPLE_PARSE_OUTPUT);
  });

  it("throws when parse_results row not found", async () => {
    mockQuery.mockResolvedValue([]);
    await expect(getParseResult(ASSET_BUNDLE_ID)).rejects.toThrow(
      `parse_results row not found for candidate_asset_id=${ASSET_BUNDLE_ID}`,
    );
  });

  it("propagates JSON.parse error when payload is corrupt", async () => {
    mockQuery.mockResolvedValue([
      {
        id: PARSE_RESULT_ID,
        candidate_asset_id: ASSET_BUNDLE_ID,
        status: "ready",
        payload: "not-valid-json{{",
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    ]);
    await expect(getParseResult(ASSET_BUNDLE_ID)).rejects.toThrow(SyntaxError);
  });

  it("binds candidate_asset_id in the SQL query", async () => {
    mockQuery.mockResolvedValue([
      {
        id: PARSE_RESULT_ID,
        candidate_asset_id: ASSET_BUNDLE_ID,
        status: "ready",
        payload: PAYLOAD_STR,
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:00.000Z",
      },
    ]);
    await getParseResult(ASSET_BUNDLE_ID);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE candidate_asset_id = ?"),
      [ASSET_BUNDLE_ID],
    );
  });
});
