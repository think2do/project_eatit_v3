import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { ToastRail } from "@/components/Toast";
import { Topbar } from "@/components/Topbar";

/*
 * The `app-shell__*` classes are the stable hooks that print stylesheets
 * (see src/pages/report/print.css) use to hide chrome during PDF export.
 * The inline `@media print` block below keeps the rule co-located with
 * the markup it applies to; pages that opt-in additional print logic
 * (e.g. ReportPage) import their own print.css on top.
 */
export function AppShell(): JSX.Element {
  return (
    <>
      <style>
        {`@media print {
          .app-shell__sidebar,
          .app-shell__topbar {
            display: none !important;
          }
          .app-shell {
            grid-template-columns: 1fr !important;
          }
        }`}
      </style>
      <div
        className="app-shell"
        style={{
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          minHeight: "100vh",
        }}
      >
        <div className="app-shell__sidebar" style={{ minWidth: 0 }}>
          <Sidebar />
        </div>
        <main
          className="app-shell__main"
          style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
        >
          <div className="app-shell__topbar">
            <Topbar />
          </div>
          <div
            className="app-shell__content"
            style={{
              padding: "32px 40px 80px",
              maxWidth: 1280,
              width: "100%",
              margin: "0 auto",
            }}
          >
            <Outlet />
          </div>
        </main>
      </div>
      <ToastRail />
    </>
  );
}
