// V32.M2.3.5 (F-320) — Industry insight card for ParsedPanel.
//
// Sibling of CompanyCard. landscape_summary is the lead, then three
// short lists: key_metrics, typical_pain_points, competitors_in_jd_ctx.
// Each list collapses to "—" when empty so the card shape stays
// predictable on under-evidenced sessions.
import type { IndustryProfile } from "@eatit/shared-types";

interface Props {
  industry: IndustryProfile;
}

export function IndustryCard({ industry }: Props): JSX.Element {
  return (
    <section
      className="card card-pad"
      data-testid="industry-card"
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
    >
      <header>
        <div className="eyebrow">行业洞察 · 联网情报</div>
        <h3 className="h3" style={{ margin: "4px 0 0" }}>
          {industry.name}
        </h3>
      </header>

      <p
        className="body"
        style={{
          fontSize: 14,
          lineHeight: 1.55,
          margin: 0,
          color: "var(--ink-900)",
        }}
      >
        {industry.landscape_summary}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
        }}
      >
        <ListBlock
          title="核心指标"
          items={industry.key_metrics}
          tagClass="tag tag-info"
          testId="industry-metric"
        />
        <ListBlock
          title="典型痛点"
          items={industry.typical_pain_points}
          tagClass="tag tag-warn"
          testId="industry-pain-point"
        />
      </div>

      <ListBlock
        title="JD 语境下的竞品"
        items={industry.competitors_in_jd_ctx}
        tagClass="tag tag-line"
        testId="industry-competitor"
      />
    </section>
  );
}

interface ListBlockProps {
  title: string;
  items: string[];
  tagClass: string;
  testId: string;
}

function ListBlock({
  title,
  items,
  tagClass,
  testId,
}: ListBlockProps): JSX.Element {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {title}
        {items.length > 0 ? `(${items.length})` : ""}
      </div>
      {items.length === 0 ? (
        <span className="muted" style={{ fontSize: 13 }}>
          —
        </span>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {items.map((item) => (
            <span
              key={item}
              className={tagClass}
              data-testid={testId}
              style={{ fontSize: 11.5 }}
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
