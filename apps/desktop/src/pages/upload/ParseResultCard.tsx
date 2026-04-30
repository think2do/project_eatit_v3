import type { CandidateProfile, ParseResultPayload } from "@eatit/shared-types";

interface Props {
  payload: ParseResultPayload;
}

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  color: "var(--ink-500)",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  margin: "0 0 6px",
};

export function ParseResultCard({ payload }: Props): JSX.Element {
  const profile = payload.candidate_profile;
  return (
    <section
      className="ds-card"
      style={{ padding: 22, display: "flex", flexDirection: "column", gap: 18 }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: "var(--ink-900)",
          }}
        >
          解析结果
        </h2>
        {payload.match_summary ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--ink-500)", lineHeight: 1.6 }}>
            {payload.match_summary}
          </p>
        ) : null}
        {profile ? <ProfileChips profile={profile} /> : null}
      </header>

      <Block title="岗位要求" items={payload.job_requirements.map(
        (r) => ({ primary: r.title, secondary: r.detail })
      )} />
      <Block title="候选人亮点" items={payload.candidate_highlights.map(
        (r) => ({ primary: r.title, secondary: r.detail })
      )} />
      <Block title="面试薄弱点" items={payload.candidate_risks.map(
        (r) => ({ primary: r.title, secondary: r.detail })
      )} warn />

      {payload.project_hooks.length > 0 ? (
        <div>
          <h3 style={sectionTitle}>项目深挖切入点</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {payload.project_hooks.map((hook) => (
              <li
                key={hook.project_name}
                style={{
                  padding: "10px 12px",
                  background: "var(--bg-sunken)",
                  borderRadius: "var(--r-md)",
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-900)" }}>
                  {hook.project_name}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-500)", margin: "4px 0 6px", lineHeight: 1.5 }}>
                  {hook.reason}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {hook.focus_points.map((fp) => (
                    <span key={fp} className="ds-tag ds-tag-line">
                      {fp}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function ProfileChips({ profile }: { profile: CandidateProfile }): JSX.Element {
  // F-303 V32.M2.2.2 — candidate_profile meta chips. Shown when ParseAgent
  // emits the v3.2 profile block; legacy parses without it skip silently.
  const roleAndYears = profile.years > 0
    ? `${profile.role} · ${profile.years} 年`
    : profile.role;
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 4 }}>
      {profile.role ? (
        <span className="tag tag-line" data-testid="profile-chip-role">
          {roleAndYears}
        </span>
      ) : null}
      {profile.companies.map((company) => (
        <span key={company} className="tag tag-line" data-testid="profile-chip-company">
          {company}
        </span>
      ))}
      {profile.domain_tags.map((tag) => (
        <span key={tag} className="tag tag-info" data-testid="profile-chip-domain">
          {tag}
        </span>
      ))}
    </div>
  );
}

function Block({
  title,
  items,
  warn,
}: {
  title: string;
  items: { primary: string; secondary: string }[];
  warn?: boolean;
}): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 style={sectionTitle}>{title}</h3>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {items.map((it) => (
          <li
            key={it.primary}
            style={{
              padding: "8px 10px",
              borderRadius: "var(--r-md)",
              background: warn ? "var(--warn-softer)" : "var(--brand-softer)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: warn ? "var(--warn)" : "var(--brand-ink)",
              }}
            >
              {it.primary}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-700)", marginTop: 2, lineHeight: 1.5 }}>
              {it.secondary}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
