// F-316 V32.M3.1.4 — Dashboard 4-tab segment control. PRD §6.4 lists
// the four tabs verbatim:
//   全部 / 已完成 / 未完成 / 已标记
//
// "已标记" surfaces sessions the user manually pinned for later review
// (M4 plumbs the pin action; M3.1.4 ships the tab as an inert filter
// that always yields zero results when the predicate is missing).

export type FilterTabKey = "all" | "completed" | "incomplete" | "starred";

export type FilterTab = {
  key: FilterTabKey;
  label: string;
  count: number;
};

export type FilterTabsProps = {
  tabs: FilterTab[];
  activeKey: FilterTabKey;
  onSelect: (key: FilterTabKey) => void;
};

export const DEFAULT_FILTER_TAB_LABELS: Record<FilterTabKey, string> = {
  all: "全部",
  completed: "已完成",
  incomplete: "未完成",
  starred: "已标记",
};

export function FilterTabs({
  tabs,
  activeKey,
  onSelect,
}: FilterTabsProps): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="筛选面试记录"
      data-testid="filter-tabs"
      className="row"
      style={{
        gap: 4,
        padding: 4,
        background: "var(--bg-sunken)",
        borderRadius: "var(--r-md)",
        width: "fit-content",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-testid={`filter-tab-${tab.key}`}
            onClick={() => onSelect(tab.key)}
            style={{
              border: "1px solid transparent",
              borderRadius: "var(--r-sm)",
              padding: "5px 12px",
              fontSize: 12.5,
              fontWeight: isActive ? 600 : 500,
              background: isActive ? "var(--bg-elev)" : "transparent",
              color: isActive ? "var(--ink-900)" : "var(--ink-500)",
              cursor: "pointer",
              borderColor: isActive ? "var(--line)" : "transparent",
              boxShadow: isActive ? "var(--shadow-xs)" : "none",
              transition: "all 120ms ease",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {tab.label}
            <span
              aria-hidden
              style={{
                fontSize: 11,
                color: isActive ? "var(--ink-500)" : "var(--ink-400)",
                fontFamily: "var(--f-mono)",
              }}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
