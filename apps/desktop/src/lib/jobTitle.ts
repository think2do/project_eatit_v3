// Single source of truth for deriving a human-readable job title across
// ConfigPage SummarySidebar + InterviewPage SessionMetaStrip.
//
// Priority:
//   1. "${company} · ${role}" — both extracted from JD parse
//   2. role alone
//   3. company alone
//   4. JD filename with extension stripped — fallback when the LLM parse
//      didn't surface a role/company (e.g. role-less JD blurb pasted in,
//      or a non-conforming format).  Filename almost always carries a
//      readable hint like "字节大模型策略产品-JD" → strip ".pdf".
//   5. null — caller renders "—".

function stripExtension(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  // Last dot only; leading dots (".env"-like) keep as-is.
  const idx = trimmed.lastIndexOf(".");
  return idx > 0 ? trimmed.slice(0, idx) : trimmed;
}

export function deriveJobTitle(opts: {
  company?: string | null;
  role?: string | null;
  jdFileName?: string | null;
}): string | null {
  const company = opts.company?.trim();
  const role = opts.role?.trim();
  if (company && role) return `${company} · ${role}`;
  if (role) return role;
  if (company) return company;
  const file = opts.jdFileName ? stripExtension(opts.jdFileName) : "";
  return file || null;
}
