// Shared mm:ss formatter used by SessionPaceCard + the page-level
// turn-stat row. Kept in a local file to avoid pulling the InterviewPage
// helper into the right-rail bundle.
export function formatMmSs(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
