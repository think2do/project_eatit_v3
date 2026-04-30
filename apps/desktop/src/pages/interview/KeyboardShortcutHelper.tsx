/**
 * Right-aside footer reminder of the three InterviewPage shortcuts.
 * Small (.muted 11.5px) and quiet — the keys themselves use the shared
 * .kbd class (M0.1d) so they pick up the design-system kbd styling.
 */
export function KeyboardShortcutHelper(): JSX.Element {
  return (
    <div
      className="muted"
      style={{ fontSize: 11.5, padding: "4px 2px", lineHeight: 1.5 }}
    >
      <kbd className="kbd">Space</kbd> 完成回答 ·{" "}
      <kbd className="kbd">R</kbd> 重听
      <br />
      <kbd className="kbd">Esc</kbd> 结束面试
    </div>
  );
}
