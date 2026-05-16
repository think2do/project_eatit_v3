import { Link } from "react-router-dom";
import { AnalyzingHeroCard } from "@/pages/home/AnalyzingHeroCard";

export function HomePage(): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div className="eyebrow">01 · 首页</div>
        <h1
          className="h-serif"
          style={{
            fontSize: 42,
            lineHeight: 1.1,
            fontWeight: 400,
            margin: "10px 0 6px",
            color: "var(--ink-900)",
          }}
        >
          开始一场 AI 模拟面试。
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--ink-500)",
            maxWidth: 620,
            lineHeight: 1.6,
          }}
        >
          上传你的简历和 JD,选择岗位级别与面试风格,Eatit 会用 6
          个专用 agent 编排一场结构化的中文模拟面试,并在结束后给出带证据的评估报告。
        </p>
      </div>

      <div
        className="ds-card"
        style={{
          padding: "22px 24px",
          display: "flex",
          gap: 24,
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 260 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              marginBottom: 4,
              color: "var(--ink-900)",
            }}
          >
            最近一次面试
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-500)" }}>
            还没有面试记录。完成一次面试后这里会展示你的最近 session。
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            to="/upload"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "11px 18px",
              borderRadius: "var(--r-md)",
              fontSize: 13.5,
              fontWeight: 500,
              background: "var(--brand)",
              color: "white",
              textDecoration: "none",
            }}
          >
            开始新的面试
          </Link>
          <Link
            to="/history"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "11px 18px",
              borderRadius: "var(--r-md)",
              fontSize: 13.5,
              fontWeight: 500,
              background: "var(--bg-elev)",
              border: "1px solid var(--line)",
              color: "var(--ink-900)",
              textDecoration: "none",
            }}
          >
            查看历史
          </Link>
        </div>
      </div>

      {/* 2026-05-15 演示反馈:面试结束态卡片放在主 hero 下方,框变大更显眼 */}
      <AnalyzingHeroCard />
    </div>
  );
}
