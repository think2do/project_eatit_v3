// F-305 V32.M2.2.3 — header strip "由 Eatit AI · 于 N 秒前生成 + 重新解析".
// Parent owns the parsedAt timestamp and the re-parse callback; this
// component is purely presentational so M2.2.4 can drop it into the
// rebuilt ParsedPanel without rewiring.
import { formatRelativeTime } from "@/lib/relativeTime";

interface Props {
  parsedAt: Date | string | number;
  onReparse: () => void;
  disabled?: boolean;
}

export function ParsedMetaBar({ parsedAt, onReparse, disabled = false }: Props): JSX.Element {
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
