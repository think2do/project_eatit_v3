import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import type {
  InterviewSessionStatus,
  SessionListResponse,
  SessionSummary,
  UserInsightCache,
} from "@eatit/shared-types";
import { getSessionList } from "@/api/sessions";
import { getUserInsights } from "@/api/usersInsights";
import { useAppStore } from "@/stores/app-store";
import { StatCard } from "@/pages/history/StatCard";
import { AICoachCard } from "@/pages/history/AICoachCard";
import {
  DEFAULT_FILTER_TAB_LABELS,
  FilterTabs,
  type FilterTab,
  type FilterTabKey,
} from "@/pages/history/FilterTabs";
import { SessionTable, type SessionTableRow } from "@/pages/history/SessionTable";
import {
  HistoryFooterCTA,
  pickLastReusableConfig,
} from "@/pages/history/HistoryFooterCTA";
import { useSessionStatusStore } from "@/stores/sessionStatus-store";

// V32.M3.1.4 — PRD §6.4 Dashboard rewrite (F-316 + F-318).
//
// Layout:
//   1. Hero strip (eyebrow + h1 + sub copy)
//   2. 4 StatCards row (累计场次 / 已就绪报告 / 平均时长 / 上次面试)
//   3. AICoachCard — user insights via Bridge → DatabaseService
//      — Hidden when insights == null OR status !== "ok"; falls back to
//        progress card "已完成 N/3 场,再完成 M 场解锁 AI 成长洞察".
//   4. FilterTabs (4 tabs)
//   5. SessionTable (6-col grid)

const COMPLETED_STATUSES: ReadonlySet<InterviewSessionStatus> = new Set<InterviewSessionStatus>([
  "ended",
  "exited_early",
  "report_ready",
]);

const STATUS_LABEL: Record<string, string> = {
  created: "已创建",
  session_started: "进行中",
  turn_recording: "作答中",
  turn_transcribing: "转写中",
  turn_evaluating: "评估中",
  turn_compressing: "压缩中",
  next_question_ready: "出题完成",
  paused: "暂停",
  ended: "已结束",
  exited_early: "提前结束",
  report_generating: "报告生成中",
  report_ready: "报告就绪",
  failed: "失败",
};

const STYLE_LABEL: Record<string, string> = {
  structured: "结构化",
  pressure: "高压追问",
  friendly: "友好引导",
  expert: "专家深度",
};

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDateRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function isCompleted(status: InterviewSessionStatus): boolean {
  return COMPLETED_STATUSES.has(status);
}

function buildJobAndStyle(snapshot: Record<string, unknown> | undefined): string {
  const role =
    (snapshot && typeof snapshot["job_title"] === "string"
      ? (snapshot["job_title"] as string)
      : null) ?? "未命名岗位";
  const styleRaw = snapshot && typeof snapshot["style"] === "string"
    ? (snapshot["style"] as string)
    : null;
  const styleLabel = styleRaw ? STYLE_LABEL[styleRaw] ?? styleRaw : "—";
  return `${role} · ${styleLabel}`;
}

function buildDuration(snapshot: Record<string, unknown> | undefined): string {
  const raw =
    snapshot && typeof snapshot["duration_minutes"] === "number"
      ? (snapshot["duration_minutes"] as number)
      : null;
  return raw == null ? "—" : `${raw} 分钟`;
}

function toTableRows(
  items: SessionSummary[],
  analyzing: Set<string>,
  unreadReports: Set<string>,
): SessionTableRow[] {
  return items.map((item) => ({
    id: item.id,
    jobAndStyle: buildJobAndStyle(item.config_snapshot),
    dateLabel: formatDateShort(item.created_at),
    durationLabel: buildDuration(item.config_snapshot),
    // V32.M1.1.X-followup — surfaced from the joined latest report.
    // `null` when the session never finished or the report Agent has
    // not yet produced a payload; SessionTable renders "—" in that
    // case, matching the design-reference placeholder semantics.
    overallScore: item.latest_overall_score ?? null,
    weaknesses: item.latest_weaknesses ?? [],
    statusLabel: STATUS_LABEL[item.status] ?? item.status,
    // "已标记" remains a placeholder — it's a pure-local feature
    // (no backend column) and the dedicated star toggle UI lands in
    // a follow-up node alongside `eatit:starred:<sessionId>`
    // localStorage plumbing.
    starred: false,
    // M9.4 — live status badges from sessionStatus-store
    generating: analyzing.has(item.id),
    unread: unreadReports.has(item.id),
  }));
}

function calcAvgDuration(items: SessionSummary[]): number | null {
  const minutes = items
    .map((it) =>
      typeof it.config_snapshot?.["duration_minutes"] === "number"
        ? (it.config_snapshot["duration_minutes"] as number)
        : null,
    )
    .filter((v): v is number => v != null);
  if (minutes.length === 0) return null;
  const sum = minutes.reduce((a, b) => a + b, 0);
  return Math.round(sum / minutes.length);
}

export function HistoryPage(): JSX.Element {
  const navigate = useNavigate();
  const setInsights = useAppStore((s) => s.setInsights);
  const insights = useAppStore((s) => s.insights);
  const reuseLastConfig = useAppStore((s) => s.reuseLastConfig);

  const analyzing = useSessionStatusStore((s) => s.analyzing);
  const unreadReports = useSessionStatusStore((s) => s.unreadReports);

  const sessionsQuery = useQuery<SessionListResponse>({
    queryKey: ["sessions", "list"],
    queryFn: () => getSessionList({ page: 1, page_size: 50 }),
  });

  const insightsQuery = useQuery<UserInsightCache | null>({
    queryKey: ["users", "me", "insights"],
    queryFn: getUserInsights,
  });

  // Mirror the fetched insight into the Zustand store so other pages
  // (M3.2 ReportPage retry CTA) can read it without re-querying.
  useEffect(() => {
    if (insightsQuery.data !== undefined) {
      setInsights(insightsQuery.data);
    }
  }, [insightsQuery.data, setInsights]);

  const [activeTab, setActiveTab] = useState<FilterTabKey>("all");

  const allItems = useMemo(
    () => sessionsQuery.data?.items ?? [],
    [sessionsQuery.data],
  );
  const completedItems = useMemo(
    () => allItems.filter((it) => isCompleted(it.status)),
    [allItems],
  );
  const incompleteItems = useMemo(
    () => allItems.filter((it) => !isCompleted(it.status)),
    [allItems],
  );
  const readySessions = useMemo(
    () => allItems.filter((it) => it.status === "report_ready"),
    [allItems],
  );

  const lastSessionAt = useMemo(() => {
    if (allItems.length === 0) return null;
    return [...allItems].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      .created_at;
  }, [allItems]);

  const tabs: FilterTab[] = [
    { key: "all", label: DEFAULT_FILTER_TAB_LABELS.all, count: allItems.length },
    {
      key: "completed",
      label: DEFAULT_FILTER_TAB_LABELS.completed,
      count: completedItems.length,
    },
    {
      key: "incomplete",
      label: DEFAULT_FILTER_TAB_LABELS.incomplete,
      count: incompleteItems.length,
    },
    // Always-zero today; pin plumbing arrives in M4. The button itself
    // stays clickable so the design surface is complete.
    { key: "starred", label: DEFAULT_FILTER_TAB_LABELS.starred, count: 0 },
  ];

  const visibleItems = useMemo(() => {
    switch (activeTab) {
      case "completed":
        return completedItems;
      case "incomplete":
        return incompleteItems;
      case "starred":
        return [];
      case "all":
      default:
        return allItems;
    }
  }, [activeTab, allItems, completedItems, incompleteItems]);

  const tableRows = useMemo(
    () => toTableRows(visibleItems, analyzing, unreadReports),
    [visibleItems, analyzing, unreadReports],
  );

  const insightOk = insights?.status === "ok";
  const sessionsForCoach = insights?.based_on_session_count ?? completedItems.length;
  const remainingForCoach = Math.max(3 - completedItems.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div className="eyebrow">05 · 面试记录</div>
        <h1 className="h1">我的面试记录</h1>
        <p
          className="body muted"
          style={{ margin: 0, maxWidth: 620, fontSize: 14 }}
        >
          每一次完整或中断的面试都会在这里保留;Dashboard 会聚合最近场次,
          帮你看到趋势与下一步建议。
        </p>
      </div>

      <div
        data-testid="dashboard-stat-cards"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        <StatCard
          eyebrow="累计场次"
          value={allItems.length}
          sub={`已就绪 ${readySessions.length} 份报告`}
        />
        <StatCard
          eyebrow="已完成"
          value={completedItems.length}
          sub={`未完成 ${incompleteItems.length} 场`}
        />
        <StatCard
          eyebrow="平均时长"
          value={(() => {
            const avg = calcAvgDuration(allItems);
            return avg == null ? "—" : `${avg} 分`;
          })()}
          sub="按 config 时长估算"
        />
        <StatCard
          eyebrow="上次面试"
          value={formatDateRelative(lastSessionAt)}
          sub={lastSessionAt ? "点击下方进入复盘" : "尚未开始"}
        />
      </div>

      {insightOk && insights ? (
        <AICoachCard
          insight={insights}
          onViewWeaknesses={() => {
            const el = document.querySelector(
              '[data-testid="session-table"]',
            );
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          onStartTargeted={() => {
            // Routes to upload to start a fresh session; M3.1.5 will
            // plumb the "复用上次配置" jump-to-config path.
            navigate("/upload");
          }}
        />
      ) : (
        <div
          className="card card-pad col"
          data-testid="ai-coach-progress"
          style={{ gap: 8 }}
        >
          <div className="row" style={{ gap: 10 }}>
            <Sparkles size={16} color="var(--brand)" />
            <div className="eyebrow">AI 成长教练</div>
          </div>
          <div className="body" style={{ margin: 0 }}>
            {remainingForCoach > 0
              ? `已完成 ${completedItems.length}/3 场,再完成 ${remainingForCoach} 场解锁跨场次成长洞察。`
              : insights?.status === "running"
                ? "Coach 正在分析你的近三场表现,稍后刷新查看。"
                : insights?.status === "failed"
                  ? "本次成长洞察生成失败,稍后会自动重试;期间不影响报告查看。"
                  : "本次成长洞察暂无内容,完成下一场报告后将自动刷新。"}
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            基于近 {Math.min(sessionsForCoach, 5)} 场报告聚合。
          </div>
        </div>
      )}

      <FilterTabs
        tabs={tabs}
        activeKey={activeTab}
        onSelect={(k) => setActiveTab(k)}
      />

      {sessionsQuery.isLoading ? (
        <div
          className="card card-pad row"
          style={{ gap: 10, color: "var(--ink-500)", fontSize: 13.5 }}
        >
          <Loader2 size={14} className="spin" />
          加载中...
        </div>
      ) : sessionsQuery.isError ? (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: "var(--r-md)",
            background: "var(--warn-soft)",
            color: "var(--warn)",
            border: "1px solid var(--warn)",
            fontSize: 13,
          }}
        >
          加载失败:
          {sessionsQuery.error instanceof Error
            ? sessionsQuery.error.message
            : "请检查后端连接"}
        </div>
      ) : (
        <>
          {/* design-reference/page-history.jsx — small ordering hint
              just above the table so users have a referent for the
              filter selection above. */}
          {tableRows.length > 0 ? (
            <div
              className="muted"
              style={{
                fontSize: 12,
                margin: "-4px 4px 6px",
              }}
              data-testid="session-table-meta"
            >
              按时间倒序 · 共 {tableRows.length} 条
            </div>
          ) : null}
          <SessionTable
            rows={tableRows}
            onOpenRow={(id) => navigate(`/report/${id}`)}
            emptyMessage={
              activeTab === "starred"
                ? "尚未标记任何面试。在报告页点击星标后会出现在这里。"
                : activeTab === "incomplete"
                  ? "暂无未完成的面试,可以开始一场新面试。"
                  : "还没有面试记录。去「上传与解析」开始一场吧。"
            }
          />
        </>
      )}

      <HistoryFooterCTA
        lastConfig={pickLastReusableConfig(allItems)}
        onReuseLastConfig={(cfg) => {
          reuseLastConfig({
            style: cfg.style,
            directions: cfg.directions,
            durationMinutes: cfg.durationMinutes,
          });
          navigate("/upload");
        }}
        onNewInterview={() => navigate("/upload")}
      />

    </div>
  );
}
