import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  FileText,
  History,
  Mic,
  Settings,
  Sliders,
} from "lucide-react";
import { useSessionStatusStore } from "@/stores/sessionStatus-store";

const FLOW = [
  { to: "/upload", label: "上传与解析", Icon: FileText },
  { to: "/config", label: "面试配置", Icon: Sliders },
  { to: "/interview", label: "实时面试", Icon: Mic },
];

const DATA = [
  { to: "/history", label: "面试记录", Icon: History },
];

export function Sidebar(): JSX.Element {
  const unreadCount = useSessionStatusStore((s) => s.unreadReports.size);

  return (
    <aside
      style={{
        background: "var(--bg-warm)",
        borderRight: "1px solid var(--line)",
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      <Brand />

      <NavLabel>面试流程</NavLabel>
      {FLOW.map((n) => (
        <NavItem key={n.to} to={n.to} label={n.label} Icon={n.Icon} />
      ))}

      <NavLabel>我的数据</NavLabel>
      {DATA.map((n) => (
        <NavItem
          key={n.to}
          to={n.to}
          label={n.label}
          Icon={n.Icon}
          badge={n.to === "/history" ? unreadCount : 0}
        />
      ))}

      <SidebarFooter />
    </aside>
  );
}

function Brand(): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "6px 10px 18px",
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          background: "var(--brand)",
          display: "grid",
          placeItems: "center",
          color: "white",
          fontFamily: "var(--f-serif)",
          fontSize: 17,
          fontStyle: "italic",
          letterSpacing: "-0.02em",
        }}
      >
        e
      </div>
      <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>
        Eatit
      </div>
      <div
        style={{
          marginLeft: "auto",
          fontFamily: "var(--f-mono)",
          fontSize: 10,
          color: "var(--ink-400)",
          letterSpacing: "0.04em",
        }}
      >
        v3.2
      </div>
    </div>
  );
}

function NavLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 500,
        color: "var(--ink-400)",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        padding: "14px 10px 6px",
      }}
    >
      {children}
    </div>
  );
}

function NavItem({
  to,
  label,
  Icon,
  badge = 0,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  badge?: number;
}): JSX.Element {
  // Hover must be driven by state, not CSS :hover — the inline
  // `background: transparent` on inactive items would otherwise win over a
  // stylesheet :hover rule. Minimalist hover: neutral sunken tint, no shadow,
  // text nudged darker. Active (white card + shadow) takes precedence.
  const [hovered, setHovered] = useState(false);
  return (
    <NavLink
      to={to}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: "var(--r-sm)",
        color: isActive || hovered ? "var(--ink-900)" : "var(--ink-700)",
        fontSize: 13.5,
        fontWeight: isActive ? 500 : 450,
        background: isActive
          ? "var(--bg-elev)"
          : hovered
            ? "var(--line-strong)"
            : "transparent",
        boxShadow: isActive ? "var(--shadow-sm)" : undefined,
        textDecoration: "none",
        transition: "background 120ms ease, color 120ms ease",
      })}
    >
      {({ isActive: _isActive }) => (
        <>
          <Icon size={16} />
          <span style={{ flex: 1 }}>{label}</span>
          {badge > 0 ? (
            <span
              data-testid="nav-unread-badge"
              style={{
                minWidth: 16,
                height: 16,
                padding: "0 4px",
                borderRadius: "var(--r-pill)",
                background: "var(--brand)",
                color: "white",
                fontSize: 10,
                fontWeight: 600,
                lineHeight: "16px",
                textAlign: "center",
              }}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function SidebarFooter(): JSX.Element {
  return (
    <div
      style={{
        marginTop: "auto",
        padding: "12px 10px 4px",
        borderTop: "1px solid var(--line)",
      }}
    >
      <NavItem to="/settings" label="设置" Icon={Settings} />
      <div
        data-testid="sidebar-privacy-note"
        style={{
          margin: "12px 10px 4px",
          fontSize: 11.5,
          color: "var(--ink-400)",
          lineHeight: 1.5,
        }}
      >
        你的数据仅保留在本地
      </div>
    </div>
  );
}
