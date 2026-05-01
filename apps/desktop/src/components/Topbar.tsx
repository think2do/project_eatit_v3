import { useLocation } from "react-router-dom";
import {
  useConnectivityStore,
  type ConnectivityState,
} from "@/stores/connectivity-store";

// V32.M1.1.X-followup — fixed DOM id of the actions slot inside Topbar.
// Pages mount per-page topbar buttons here via React's createPortal,
// so the global Topbar stays decoupled from any single page's chrome.
export const TOPBAR_ACTIONS_SLOT_ID = "eatit-topbar-actions-slot";

const ROUTE_CRUMBS: Record<string, string[]> = {
  "/": ["首页"],
  "/upload": ["面试流程", "上传与解析"],
  "/config": ["面试流程", "面试配置"],
  "/interview": ["面试流程", "实时面试"],
  "/history": ["我的数据", "面试记录"],
  "/report": ["我的数据", "评估报告"],
  "/settings": ["设置"],
};

function resolveCrumbs(pathname: string): string[] {
  // match longest prefix so /interview/:id maps to "实时面试"
  let best: string[] = ["首页"];
  let bestLen = 0;
  for (const [prefix, crumbs] of Object.entries(ROUTE_CRUMBS)) {
    if (prefix === "/") continue;
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (prefix.length > bestLen) {
        bestLen = prefix.length;
        best = crumbs;
      }
    }
  }
  if (pathname === "/") return ["首页"];
  return best;
}

export function Topbar(): JSX.Element {
  const { pathname } = useLocation();
  const crumbs = resolveCrumbs(pathname);
  const connectivityState = useConnectivityStore((s) => s.state);
  const connectivityDetail = useConnectivityStore((s) => s.detail);

  return (
    <header
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        padding: "0 28px",
        borderBottom: "1px solid var(--line)",
        gap: 16,
        background: "var(--bg)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: "var(--ink-500)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flex: 1,
          minWidth: 0,
        }}
      >
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {i > 0 && <span style={{ color: "var(--ink-300)" }}>/</span>}
            <span
              style={{
                color: i === crumbs.length - 1 ? "var(--ink-900)" : "var(--ink-500)",
                fontWeight: i === crumbs.length - 1 ? 500 : 400,
              }}
            >
              {c}
            </span>
          </span>
        ))}
      </div>
      {/* V32.M1.1.X-followup — page-level actions slot. Pages render
          their topbar buttons (e.g. live page's REC + 暂停 + 结束面试)
          into this slot via React's createPortal so the global Topbar
          stays a presentation component without tight coupling. */}
      <div
        id={TOPBAR_ACTIONS_SLOT_ID}
        data-testid="topbar-actions-slot"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      />
      <ConnectivityDot state={connectivityState} detail={connectivityDetail} />
    </header>
  );
}

function ConnectivityDot({
  state,
  detail,
}: {
  state: ConnectivityState;
  detail: string | null;
}): JSX.Element {
  const palette =
    state === "online"
      ? { color: "var(--brand)", label: "在线" }
      : state === "reconnecting"
        ? { color: "var(--warn)", label: "重连中" }
        : { color: "var(--warn)", label: "离线" };

  return (
    <span
      title={detail ?? palette.label}
      aria-label={`连接状态:${palette.label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        color: "var(--ink-500)",
      }}
    >
      <span
        className={state === "reconnecting" ? "pulse-dot" : ""}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: palette.color,
          display: "inline-block",
        }}
      />
      {palette.label}
    </span>
  );
}
