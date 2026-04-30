import { readQuotaMock } from "@/lib/quotaMock";

// F-315 — Sidebar quota visual placeholder. Reads localStorage only.
// 文案显式标注 "(占位)" 避免被误读为真实计费承诺(L0 A18)。
export function SidebarQuotaCard(): JSX.Element {
  const { used, limit } = readQuotaMock();
  const nearLimit = used >= Math.ceil(limit * 0.7);

  return (
    <div
      data-testid="sidebar-quota-card"
      style={{
        margin: "10px 6px 8px",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        background: "var(--brand-soft)",
        color: "var(--brand-ink)",
        borderRadius: "var(--r-sm)",
        fontSize: 12.5,
      }}
    >
      <div
        style={{
          fontFamily: "var(--f-mono)",
          fontSize: 11,
          letterSpacing: "0.04em",
          color: "var(--brand-ink)",
          opacity: 0.85,
        }}
      >
        本月配额(占位)
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span
          data-testid="sidebar-quota-used"
          style={{
            fontFamily: "var(--f-serif)",
            fontSize: 18,
            fontStyle: "italic",
            letterSpacing: "-0.02em",
          }}
        >
          {used}
        </span>
        <span style={{ fontFamily: "var(--f-mono)", fontSize: 12 }}>
          / {limit}
        </span>
      </div>
      {nearLimit ? (
        <span
          data-testid="sidebar-quota-near-limit"
          className="tag tag-warn"
          style={{ alignSelf: "flex-start", marginTop: 2 }}
        >
          近上限
        </span>
      ) : null}
    </div>
  );
}
