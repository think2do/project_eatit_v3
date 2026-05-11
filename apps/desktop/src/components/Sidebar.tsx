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
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderRadius: "var(--r-sm)",
        color: isActive ? "var(--ink-900)" : "var(--ink-700)",
        fontSize: 13.5,
        fontWeight: isActive ? 500 : 450,
        background: isActive ? "var(--bg-elev)" : "transparent",
        boxShadow: isActive ? "var(--shadow-sm)" : undefined,
        textDecoration: "none",
        transition: "background 120ms ease",
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
      <NavLink
        to="/settings"
        style={({ isActive }) => ({
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 10px",
          borderRadius: "var(--r-sm)",
          color: isActive ? "var(--ink-900)" : "var(--ink-700)",
          fontSize: 13.5,
          fontWeight: isActive ? 500 : 450,
          background: isActive ? "var(--bg-elev)" : "transparent",
          boxShadow: isActive ? "var(--shadow-sm)" : undefined,
          textDecoration: "none",
        })}
      >
        <Settings size={16} />
        <span>设置</span>
      </NavLink>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          margin: "10px 6px 2px",
          padding: "3px 9px",
          fontSize: 11,
          fontWeight: 500,
          borderRadius: "var(--r-pill)",
          background: "var(--brand-soft)",
          color: "var(--brand-ink)",
        }}
      >
        BYOK · 本地
      </div>
      <SidebarUserCard />
    </div>
  );
}

// Mirrors `.nav-user` block in design-reference/shell.jsx. The desktop
// app is single-user BYOK with no auth backend, so name + plan are
// placeholders until a real userProfile store slice lands.
function SidebarUserCard(): JSX.Element {
  return (
    <div className="nav-user" data-testid="sidebar-user-card">
      <div className="avatar" aria-hidden="true">
        Y
      </div>
      <div>
        <div className="nav-user-name">你</div>
        <div className="nav-user-plan">本地 · 免费</div>
      </div>
    </div>
  );
}
