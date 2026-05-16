import { Spinner } from "@/components/Spinner";
import { useSessionStatusStore } from "@/stores/sessionStatus-store";

export function AnalyzingHeroCard(): JSX.Element | null {
  const analyzingCount = useSessionStatusStore((s) => s.analyzing.size);
  if (analyzingCount === 0) return null;
  return (
    <section
      style={{
        // 2026-05-15 演示反馈:框要变大、放在 hero 下方。从 560 / 28 改到
        // 全宽自适应 / 56 padding,标题 28px,卡片高度增加约 2.5×。
        width: "100%",
        padding: "56px 48px",
        background: "var(--bg-elev)",
        border: "2px solid var(--brand)",
        borderRadius: "var(--r-lg)",
        textAlign: "center",
        boxShadow: "var(--shadow-md)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <Spinner size={40} />
      </div>
      <h2
        style={{
          fontSize: 28,
          fontWeight: 600,
          margin: 0,
          color: "var(--ink-900)",
          letterSpacing: "0.02em",
        }}
      >
        上一场面试分析生成中
      </h2>
      <p
        style={{
          fontSize: 15,
          color: "var(--ink-500)",
          marginTop: 14,
          lineHeight: 1.7,
          maxWidth: 520,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        AI 正在整理逐题复盘 + 五维评分,通常需要 30-60 秒。
        <br />
        完成后可在「面试记录」中查看,或开启新一场面试。
      </p>
    </section>
  );
}
