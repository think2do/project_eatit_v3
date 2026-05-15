import { Loader2 } from "lucide-react";

export function Spinner({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <Loader2
      size={size}
      style={{ animation: "eatit-spin 0.9s linear infinite", color: "var(--brand)" }}
      aria-label="loading"
    />
  );
}
