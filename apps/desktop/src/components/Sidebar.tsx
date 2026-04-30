import { NavLink } from "react-router-dom";
import {
  FileText,
  History,
  Mic,
  Settings,
  Sliders,
  TrendingUp,
} from "lucide-react";

import { SidebarQuotaCard } from "@/components/SidebarQuotaCard";

const FLOW = [
  { to: "/upload", label: "上传与解析", Icon: FileText },
  { to: "/config", label: "面试配置", Icon: Sliders },
  { to: "/interview", label: "实时面试", Icon: Mic },
];

const DATA = [
  { to: "/history", label: "面试记录", Icon: History },
  { to: "/report", label: "评估报告", Icon: FileText },
  { to: "/meta-reports", label: "综合分析", Icon: TrendingUp },
];

export function Sidebar(): JSX.Element {
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
        <NavItem key={n.to} to={n.to} label={n.label} Icon={n.Icon} />
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
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
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
      {({ isActive }) => (
        <>
          <Icon
            size={16}
            // lucide icons are styled via CSS currentColor/stroke
          />
          <span>{label}</span>
          {isActive ? null : null}
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
      <SidebarQuotaCard />
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
    </div>
  );
}
