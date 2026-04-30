// V32.M2.3.5 (F-320) — Company insight card for ParsedPanel.
//
// Renders CompanyProfile from ResearchResult. Stays visually distinct
// from the existing match-/profile-cards so users can see "this came
// from web research, not your resume". Confidence chip and the
// degraded banner are the two key trust-signals.
import type { CompanyProfile, ResearchSignalType } from "@eatit/shared-types";

interface Props {
  company: CompanyProfile;
  degraded?: boolean;
}

const STAGE_LABEL: Record<CompanyProfile["stage"], string> = {
  seed: "种子期",
  growth: "成长期",
  mature: "成熟期",
  listed: "已上市",
  unknown: "阶段未知",
};

const SIGNAL_LABEL: Record<ResearchSignalType, string> = {
  funding: "融资",
  product: "产品",
  personnel: "人事",
  market: "市场",
  regulation: "监管",
};

const CONFIDENCE_CLASS: Record<CompanyProfile["confidence"], string> = {
  high: "tag tag-green",
  mid: "tag tag-info",
  low: "tag tag-warn",
};

const CONFIDENCE_LABEL: Record<CompanyProfile["confidence"], string> = {
  high: "高置信",
  mid: "中等置信",
  low: "低置信",
};

export function CompanyCard({ company, degraded = false }: Props): JSX.Element {
  return (
    <section
      className="card card-pad"
      data-testid="company-card"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <header className="row between" style={{ alignItems: "center" }}>
        <div>
          <div className="eyebrow">公司洞察 · 联网情报</div>
          <h3 className="h3" style={{ margin: "4px 0 0" }}>
            {company.name}
          </h3>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="tag tag-line">{STAGE_LABEL[company.stage]}</span>
          <span
            className={CONFIDENCE_CLASS[company.confidence]}
            data-testid="company-confidence"
          >
            {CONFIDENCE_LABEL[company.confidence]}
          </span>
        </div>
      </header>

      {degraded ? (
        <div
          data-testid="company-degraded-banner"
          style={{
            padding: "8px 12px",
            borderRadius: "var(--r-md)",
            background: "var(--bg-elev)",
            color: "var(--ink-500)",
            fontSize: 12.5,
          }}
        >
          半离线模式 · 信息可能陈旧
        </div>
      ) : null}

      <p
        className="body"
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          margin: 0,
          color: "var(--ink-900)",
        }}
      >
        {company.business_model}
      </p>

      {company.recent_signals.length > 0 ? (
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            近期信号({company.recent_signals.length})
          </div>
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
            {company.recent_signals.map((sig, i) => (
              <li
                key={`${sig.summary}-${i}`}
                data-testid="company-signal"
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "flex-start",
                  fontSize: 13,
                  color: "var(--ink-900)",
                  lineHeight: 1.5,
                }}
              >
                <span
                  className="tag tag-info"
                  style={{ flexShrink: 0, fontSize: 10.5 }}
                >
                  {SIGNAL_LABEL[sig.type]}
                </span>
                <span style={{ flex: 1 }}>{sig.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {company.evidence_links.length > 0 ? (
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            来源({company.evidence_links.length})
          </div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {company.evidence_links.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono"
                  style={{
                    fontSize: 11.5,
                    color: "var(--ink-500)",
                    wordBreak: "break-all",
                  }}
                  data-testid="company-evidence-link"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
