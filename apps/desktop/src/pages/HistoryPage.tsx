import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Loader2, Sparkles } from "lucide-react";
import type {
  InterviewSessionStatus,
  SessionListResponse,
  SessionSummary,
  UserInsightCache,
} from "@eatit/shared-types";
import { getSessionList } from "@/api/sessions";
import { triggerMetaReport } from "@/api/metaReports";
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

// V32.M3.1.4 — PRD §6.4 Dashboard rewrite (F-316 + F-318).
//
// Layout:
//   1. Hero strip (eyebrow + h1 + sub copy)
//   2. 4 StatCards row (累计场次 / 已就绪报告 / 平均时长 / 上次面试)
//   3. AICoachCard ← /api/v1/users/me/insights (M3.1.3)
//      — Hidden when insights == null OR status !== "ok"; falls back to
//        progress card "已完成 N/3 场,再完成 M 场解锁 AI 成长洞察".
//   4. FilterTabs (4 tabs) + 综合分析 trigger button
//   5. SessionTable (6-col grid)
//   6. MetaReport modal (preserved from v3.1)

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

function toTableRows(items: SessionSummary[]): SessionTableRow[] {
  return items.map((item) => ({
    id: item.id,
    jobAndStyle: buildJobAndStyle(item.config_snapshot),
    dateLabel: formatDateShort(item.created_at),
    durationLabel: buildDuration(item.config_snapshot),
    // M4 will plumb /reports → overall_score here. Until then the
    // column shows "—" so users get a structurally complete row.
    overallScore: null,
    // M4 will plumb /reports → improvements[]. Same rationale.
    weaknesses: [],
    statusLabel: STATUS_LABEL[item.status] ?? item.status,
    // "已标记" data lives in M4. Treat all rows as unstarred for now;
    // the FilterTabs "starred" tab correctly yields 0 results.
    starred: false,
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
  const [modalOpen, setModalOpen] = useState(false);

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

  const tableRows = useMemo(() => toTableRows(visibleItems), [visibleItems]);

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

      <div className="row between">
        <FilterTabs
          tabs={tabs}
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k)}
        />
        <button
          type="button"
          className="btn btn-brand"
          onClick={() => setModalOpen(true)}
          disabled={readySessions.length === 0}
          data-testid="open-meta-report-modal"
        >
          <Sparkles size={14} />
          生成综合分析 ({readySessions.length} 场)
        </button>
      </div>

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

      {modalOpen ? (
        <MetaReportModal
          readySessions={readySessions}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MetaReportModal({
  readySessions,
  onClose,
}: {
  readySessions: SessionSummary[];
  onClose: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(readySessions.map((s) => s.id)),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trigger = useMutation({
    mutationFn: (sessionIds: string[]) =>
      triggerMetaReport({ session_ids: sessionIds }),
    onSuccess: (response) => {
      navigate(`/meta-report/${response.id}`);
    },
    onError: (err) => {
      if (axios.isAxiosError(err)) {
        setErrorMessage(err.response?.data?.detail ?? err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("请求失败");
      }
    },
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    setErrorMessage(null);
    const ids = Array.from(selected);
    if (ids.length === 0) {
      setErrorMessage("至少选择 1 场");
      return;
    }
    trigger.mutate(ids);
  };

  const singleSession = selected.size === 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="生成综合分析"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17, 24, 20, 0.35)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card card-pad-lg col"
        style={{
          width: 520,
          maxWidth: "90vw",
          maxHeight: "80vh",
          gap: 14,
        }}
      >
        <div>
          <h2
            className="h-serif"
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 400,
              color: "var(--ink-900)",
            }}
          >
            生成综合分析
          </h2>
          <p
            className="muted"
            style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}
          >
            选择希望纳入分析的面试。只选 1 场时生成单场复盘,不会凭空凑出趋势。
          </p>
        </div>

        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            overflowY: "auto",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-sm)",
            maxHeight: 280,
          }}
        >
          {readySessions.map((session) => {
            const checked = selected.has(session.id);
            return (
              <li key={session.id}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(session.id)}
                    style={{ cursor: "pointer" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--ink-900)",
                      }}
                    >
                      {formatDateShort(session.created_at)}
                    </div>
                    <div
                      className="muted"
                      style={{ fontSize: 11.5, marginTop: 2 }}
                    >
                      <span className="mono">{session.id.slice(0, 8)}</span>
                      <span style={{ margin: "0 6px", color: "var(--ink-300)" }}>
                        ·
                      </span>
                      {session.turn_count} 轮
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>

        {singleSession ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--info)",
              background: "var(--info-soft)",
              padding: "8px 12px",
              borderRadius: "var(--r-sm)",
            }}
          >
            只选 1 场时生成单场复盘
          </div>
        ) : null}

        {errorMessage ? (
          <div
            style={{
              fontSize: 12,
              color: "var(--warn)",
              background: "var(--warn-soft)",
              padding: "8px 12px",
              borderRadius: "var(--r-sm)",
            }}
          >
            {errorMessage}
          </div>
        ) : null}

        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={trigger.isPending}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-brand"
            onClick={handleConfirm}
            disabled={trigger.isPending || selected.size === 0}
          >
            {trigger.isPending ? <Loader2 size={14} className="spin" /> : null}
            生成 ({selected.size} 场)
          </button>
        </div>
      </div>
    </div>
  );
}
