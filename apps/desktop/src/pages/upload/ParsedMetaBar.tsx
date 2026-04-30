// F-305 V32.M2.2.3 — header strip "由 Eatit AI · 于 N 秒前生成 + 重新解析".
// Parent owns the parsedAt timestamp and the re-parse callback; this
// component is purely presentational so M2.2.4 can drop it into the
// rebuilt ParsedPanel without rewiring.
//
// V32.M2.2.X audit fix — was static after first paint, so a user who
// opened ParsedPanel and stayed on the page kept seeing "刚刚" forever.
// We now self-tick once a minute (cheap, single setInterval) so the
// relative-time string drifts in sync with the wall clock.
import { useEffect, useState } from "react";

import { formatRelativeTime } from "@/lib/relativeTime";

interface Props {
  parsedAt: Date | string | number;
  onReparse: () => void;
  disabled?: boolean;
}

const REFRESH_INTERVAL_MS = 60_000;

export function ParsedMetaBar({ parsedAt, onReparse, disabled = false }: Props): JSX.Element {
  // We don't read this value — bumping it forces a rerender so
  // formatRelativeTime() recomputes against the new wall clock.
  const [, setTick] = useState(0);

  useEffect(() => {
    const handle = window.setInterval(() => setTick((n) => n + 1), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(handle);
  }, []);

  return (
    <div className="row between" style={{ alignItems: "center" }}>
      <span
        className="mono muted"
        style={{ fontSize: 12 }}
        data-testid="parsed-meta-when"
      >
        由 Eatit AI · 于 {formatRelativeTime(parsedAt)}生成
      </span>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={onReparse}
        disabled={disabled}
        data-testid="parsed-meta-reparse"
      >
        重新解析
      </button>
    </div>
  );
}
