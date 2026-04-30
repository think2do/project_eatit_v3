// V32.M2.2.X audit fix (F-303) — DropZone "done" state metadata helpers.
// Pure functions so UploadPage can render the chip / meta strings and
// hand them to DropZone without DropZone having to know about the v3.2
// ParseResult shape.
import type { ParseResultPayload } from "@eatit/shared-types";

const RESUME_COMPANY_CAP = 3;
const RESUME_DOMAIN_TAG_CAP = 3;

export function buildResumeChips(payload: ParseResultPayload | null | undefined): string[] {
  if (!payload?.candidate_profile) return [];
  const chips: string[] = [];
  const candidate_profile = payload.candidate_profile;
  if (candidate_profile.role) {
    chips.push(`${candidate_profile.role}·${candidate_profile.years}年`);
  }
  const companies = candidate_profile.companies;
  if (companies.length > 0) {
    // Single combined chip per spec ("companies join"). Capped so the
    // chip row never overflows the DropZone box.
    const joined =
      companies.length <= RESUME_COMPANY_CAP
        ? companies.join(" · ")
        : companies.slice(0, RESUME_COMPANY_CAP).join(" · ");
    chips.push(joined);
  }
  candidate_profile.domain_tags
    .slice(0, RESUME_DOMAIN_TAG_CAP)
    .forEach((tag) => chips.push(tag));
  return chips;
}

// JD-side chips — spec carves out "若 JdProfile 存在,M2.2.1 已落地的 schema 内".
// JdProfile was NOT landed in M2.2.1 (only candidate_profile + match_score
// + advantages/gaps/interview_focus/project_hooks_v32 made it). Leaving
// the function in the export surface so the call site is stable when
// JdProfile lands; until then it just returns [].
export function buildJdChips(payload: ParseResultPayload | null | undefined): string[] {
  void payload;
  return [];
}

export function formatFileSizeMeta(sizeBytes: number | null | undefined): string | null {
  if (!sizeBytes || sizeBytes <= 0) return null;
  const kb = Math.max(1, Math.round(sizeBytes / 1024));
  return `· ${kb} KB`;
}
