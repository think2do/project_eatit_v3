import { Spinner } from "@/components/Spinner";
import { useSessionStatusStore } from "@/stores/sessionStatus-store";

export function AnalyzingHeroCard(): JSX.Element | null {
  const analyzingCount = useSessionStatusStore((s) => s.analyzing.size);
  if (analyzingCount === 0) return null;
  return (
    <section
      style={{
        margin: "32px auto",
        padding: "28px 32px",
        maxWidth: 560,
        background: "var(--bg-elev)",
        border: "1px solid var(--brand)",
        borderRadius: "var(--r-lg)",
        textAlign: "center",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <Spinner size={24} />
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
        上一场面试分析生成中
      </h2>
      <p style={{ fontSize: 14, color: "var(--ink-500)", marginTop: 8, lineHeight: 1.6 }}>
        AI 正在整理逐题复盘 + 五维评分,通常需要 30-60 秒。
        <br />
        完成后可在「面试记录」中查看,或开启新一场面试。
      </p>
    </section>
  );
}
