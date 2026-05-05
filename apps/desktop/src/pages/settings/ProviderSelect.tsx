import { PROVIDERS, type ProviderPreset } from "@/lib/llm/providers";
import type { LLMProvider } from "@/lib/llm/config";

interface Props {
  value: LLMProvider;
  onChange: (next: ProviderPreset) => void;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--line)",
  background: "var(--bg-elev)",
  color: "var(--ink-900)",
  fontSize: 13.5,
  fontFamily: "var(--f-sans)",
};

export function ProviderSelect({ value, onChange }: Props): JSX.Element {
  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = PROVIDERS.find((p) => p.id === event.target.value);
    if (next) onChange(next);
  };

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-700)" }}>
        Provider
      </span>
      <select value={value} onChange={handleChange} style={fieldStyle} className="select">
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}
