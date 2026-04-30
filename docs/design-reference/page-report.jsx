// Page 5 — 评估报告

function ReportPage({ goTo }) {
  return (
    <>
      <Topbar crumbs={['我的数据', '面试记录', '评估报告']} actions={
        <>
          <button className="btn btn-sm">{I.share} 分享</button>
          <button className="btn btn-sm">{I.print} 打印 / 导出 PDF</button>
          <button className="btn btn-brand btn-sm" onClick={() => goTo('config')}>
            {I.redo} 重新面试
          </button>
        </>
      }/>
      <div className="page" style={{ maxWidth: 1180 }}>
        {/* Report hero */}
        <div className="row between" style={{ marginBottom: 28 }}>
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <span className="eyebrow">评估报告 · #R-2026-0419-14</span>
              <span className="tag tag-green tag-dot">已生成</span>
            </div>
            <h1 className="h1" style={{ marginBottom: 4 }}>Notion · 高级产品经理</h1>
            <div className="muted" style={{ fontSize: 13 }}>
              2026-04-19 14:20 · 结构化面试官 Sarah · 28 分 14 秒 · 8 题全部完成
            </div>
          </div>
          <div className="row" style={{ gap: 16 }}>
            <HeroScore label="总分" value="78" delta="+4 vs. 上一场" tone="good"/>
            <HeroScore label="通过可能性" value="中上" desc="基于岗位 JD 的匹配度评估"/>
          </div>
        </div>

        {/* Two-col layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
          <div>
            {/* Verdict */}
            <div className="card" style={{ padding: '24px 28px', marginBottom: 20 }}>
              <div className="eyebrow">AI 面试官总评</div>
              <p style={{
                fontFamily: 'var(--f-serif)', fontSize: 22, lineHeight: 1.45,
                margin: '8px 0 16px', letterSpacing: '-0.005em',
              }}>
                "一次结构清晰、表达稳定的面试。候选人在数据产品领域展现出扎实的案例积累与方法论，但对 AI 产品化的判断仍停留在概念层面，
                <em style={{ color: 'var(--warn)' }}>缺少可落地的判断框架</em>。建议在下次模拟中重点练习「可行性 × 价值」类决策题。"
              </p>
              <div className="row between" style={{ paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <div className="row" style={{ gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8, background: 'var(--ink-900)', color: 'white',
                    display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 600,
                  }}>AI</div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>面试官 Sarah</div>
                    <div className="muted mono" style={{ fontSize: 10.5 }}>STRUCTURED · 结构化面试官</div>
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 11.5 }}>评分由多维度加权 · <a style={{ color: 'var(--brand)', textDecoration: 'underline' }}>了解算法</a></div>
              </div>
            </div>

            {/* Dimension breakdown */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h2 className="h2">维度分析</h2>
                <span className="muted" style={{ fontSize: 12 }}>五个维度 · 满分 100</span>
              </div>
              <div style={{ padding: '20px 24px' }}>
                {dimensions.map((d, i) => (
                  <DimensionRow key={i} {...d}/>
                ))}
              </div>
            </div>

            {/* Question by question */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h2 className="h2">逐题复盘</h2>
                <div className="row" style={{ gap: 8 }}>
                  <span className="tag tag-green">{strengthCount(qs)} 题表现良好</span>
                  <span className="tag tag-warn">{weakCount(qs)} 题待提升</span>
                </div>
              </div>
              <div>
                {qs.map((q, i) => <QuestionReview key={i} {...q} idx={i + 1}/>)}
              </div>
            </div>
          </div>

          {/* RIGHT rail */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="eyebrow" style={{ color: 'var(--brand)' }}>核心优势</div>
              <div className="col" style={{ gap: 10, marginTop: 10 }}>
                {[
                  { t: '数据产品方法论扎实', d: '第 2、5 题给出了完整的指标体系' },
                  { t: '结构化表达清晰',     d: '大部分回答采用 STAR / 因果三段式' },
                  { t: '跨职能协作案例丰富', d: '能具体讲出推动机制与关键数字' },
                ].map((x, i) => (
                  <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--brand)', marginTop: 2 }}>{React.cloneElement(I.check, { size: 14 })}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{x.t}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>{x.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: '18px 20px', borderColor: 'var(--warn-soft)' }}>
              <div className="eyebrow" style={{ color: 'var(--warn)' }}>待提升</div>
              <div className="col" style={{ gap: 10, marginTop: 10 }}>
                {[
                  { t: 'AI 落地判断框架', d: '第 4、7 题对模型能力边界判断模糊' },
                  { t: '举例细节偏弱', d: '第 2、6 题用抽象概念替代了具体案例' },
                  { t: '节奏偏慢', d: '平均单题用时超出建议 22%' },
                ].map((x, i) => (
                  <div key={i} className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--warn)', marginTop: 2 }}>{React.cloneElement(I.alert, { size: 14 })}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{x.t}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>{x.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="eyebrow">元数据</div>
              <div style={{ marginTop: 10, fontSize: 12.5 }}>
                {[
                  ['岗位', 'Notion · 高级产品经理'],
                  ['风格', '结构化 · Sarah'],
                  ['方向', 'AI 洞察 + 数据驱动 + 跨职能'],
                  ['时长', '28:14 / 30:00'],
                  ['题数', '8 题 · 全部完成'],
                  ['填充词', '14 次 · 低于平均'],
                  ['语速', '165 字/分 · 适中'],
                ].map(([k, v]) => (
                  <div key={k} className="row between" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
                    <span className="muted">{k}</span>
                    <span style={{ fontWeight: 500, textAlign: 'right' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Big action — re-interview */}
            <div className="card" style={{ padding: '20px 20px', background: 'var(--ink-900)', color: 'white', borderColor: 'var(--ink-900)' }}>
              <div className="mono" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em' }}>下一步</div>
              <div style={{ fontFamily: 'var(--f-serif)', fontSize: 22, lineHeight: 1.3, margin: '6px 0 10px' }}>
                针对薄弱点再来一场
              </div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginBottom: 16, lineHeight: 1.5 }}>
                我们已为你预设了下一场的参数：保留岗位 JD，聚焦 AI 场景洞察，改为高压追问型。
              </div>
              <button className="btn btn-brand" style={{ width: '100%', justifyContent: 'center' }} onClick={() => goTo('config')}>
                {I.redo} 重新面试 · 专项训练
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 6, color: 'rgba(255,255,255,0.75)' }}
                onClick={() => goTo('config')}>
                修改配置后再开始
              </button>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

function HeroScore({ label, value, desc, delta, tone }) {
  return (
    <div style={{
      minWidth: 180, padding: '14px 20px', background: 'var(--bg-elev)',
      borderRadius: 'var(--r-lg)', border: '1px solid var(--line)',
    }}>
      <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
      <div className="row" style={{ gap: 8, alignItems: 'baseline', marginTop: 4 }}>
        <span style={{ fontFamily: 'var(--f-serif)', fontSize: 40, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</span>
        {delta && <span className="mono" style={{ fontSize: 11, color: tone === 'good' ? 'var(--brand)' : 'var(--ink-500)' }}>{delta}</span>}
      </div>
      {desc && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{desc}</div>}
    </div>
  );
}

function DimensionRow({ name, score, desc, items }) {
  const tone = score >= 80 ? 'brand' : score >= 65 ? 'neutral' : 'warn';
  const color = tone === 'brand' ? 'var(--brand)' : tone === 'warn' ? 'var(--warn)' : 'var(--ink-700)';
  return (
    <div style={{ padding: '14px 0', borderBottom: '1px dashed var(--line)' }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{desc}</div>
        </div>
        <div className="row" style={{ gap: 10, minWidth: 220, justifyContent: 'flex-end' }}>
          <div className="bar" style={{ width: 140 }}>
            <i style={{ width: `${score}%`, background: color }}/>
          </div>
          <span className="mono" style={{ fontSize: 14, fontWeight: 600, color, minWidth: 26, textAlign: 'right' }}>{score}</span>
        </div>
      </div>
      <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
        {items.map((x, i) => (
          <span key={i} className={`tag ${x.good ? 'tag-green' : 'tag-warn'}`} style={{ fontSize: 10.5 }}>
            {x.good ? '+' : '−'} {x.t}
          </span>
        ))}
      </div>
    </div>
  );
}

function QuestionReview({ idx, q, tag, score, answer, feedback, tone }) {
  const [expanded, setExpanded] = React.useState(idx === 1);
  const color = score >= 80 ? 'var(--brand)' : score >= 65 ? 'var(--ink-700)' : 'var(--warn)';
  return (
    <div style={{ borderBottom: '1px solid var(--line)' }}>
      <button className="row between" onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', padding: '16px 24px', cursor: 'pointer' }}>
        <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: 2 }}>Q{idx}</span>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--ink-900)' }}>{q}</div>
            <div className="row" style={{ gap: 6, marginTop: 4 }}>
              <span className="tag tag-line" style={{ fontSize: 10.5 }}>{tag}</span>
              <span className={`tag ${tone === 'good' ? 'tag-green' : tone === 'warn' ? 'tag-warn' : ''}`} style={{ fontSize: 10.5 }}>
                {tone === 'good' ? '表现良好' : tone === 'warn' ? '待提升' : '中性'}
              </span>
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 14 }}>
          <span style={{ fontFamily: 'var(--f-serif)', fontSize: 22, color, minWidth: 34, textAlign: 'right' }}>{score}</span>
          <span className="muted">{expanded ? I.chevUp : I.chevDown}</span>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '0 24px 20px 58px' }}>
          <div style={{ background: 'var(--bg-warm)', borderRadius: 'var(--r-md)', padding: '14px 16px', marginBottom: 12 }}>
            <div className="eyebrow" style={{ marginBottom: 6 }}>你的回答 · 摘要</div>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--ink-700)' }}>{answer}</div>
          </div>
          <div style={{
            background: tone === 'warn' ? 'var(--warn-softer)' : 'var(--brand-softer)',
            borderRadius: 'var(--r-md)', padding: '14px 16px',
          }}>
            <div className="eyebrow" style={{ color: tone === 'warn' ? 'var(--warn)' : 'var(--brand)', marginBottom: 6 }}>
              AI 反馈
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--ink-900)' }}>{feedback}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function strengthCount(list) { return list.filter(q => q.tone === 'good').length; }
function weakCount(list) { return list.filter(q => q.tone === 'warn').length; }

const dimensions = [
  { name: '专业深度', score: 76, desc: '对核心领域的知识掌握与案例调用', items: [
    { t: '数据指标体系', good: true }, { t: '用户洞察方法', good: true }, { t: 'AI 产品判断', good: false },
  ]},
  { name: '结构化表达', score: 84, desc: '回答的逻辑层次与表述清晰度', items: [
    { t: '总分总结构', good: true }, { t: '因果链路', good: true }, { t: '举例丰富度', good: false },
  ]},
  { name: '批判性思考', score: 68, desc: '面对追问时的判断与反事实思考', items: [
    { t: '多视角切换', good: true }, { t: '判断依据', good: false }, { t: '假设挑战', good: false },
  ]},
  { name: '业务直觉', score: 72, desc: '对用户、商业与节奏的敏感度', items: [
    { t: '用户场景', good: true }, { t: '商业模型', good: false },
  ]},
  { name: '沟通节奏', score: 81, desc: '语速、停顿、填充词与整体表达节奏', items: [
    { t: '语速适中', good: true }, { t: '填充词少', good: true }, { t: '节奏偏慢', good: false },
  ]},
];

const qs = [
  { q: '请简单介绍一下你最有代表性的一个项目。', tag: '背景开场', score: 82, tone: 'good',
    answer: '介绍了在小红书做的商家数据看板，覆盖从 0 到 1 的过程与关键数据。',
    feedback: '结构清晰，STAR 框架运用到位。建议在 Result 环节加一句对业务的长期影响。' },
  { q: '在做数据产品时，如何判断一个指标是否值得作为北极星？', tag: '数据驱动', score: 74, tone: 'ok',
    answer: '提到可解释性、可归因性、团队对齐三个维度。',
    feedback: '维度选择合理，但缺少一个被你否决过的反例——能让判断更有说服力。' },
  { q: '你如何看待「AI 原生」和「AI 辅助」产品的区别？', tag: 'AI 洞察', score: 78, tone: 'good',
    answer: '从交互入口、模型依赖、失败容忍度三方面对比 Cursor 与 Notion。',
    feedback: '对比维度有深度。如能加入商业模型差异会更完整。' },
  { q: '假设在 Notion 接入 AI，文档和数据库两类工作流如何选优先级？', tag: 'AI 洞察', score: 62, tone: 'warn',
    answer: '区分了两类用户意图，但优先级判断只提到「日活分布」。',
    feedback: '缺少可行性维度。推荐使用「价值（频次×痛点）× 可行性（模型能力边界）」二维框架。' },
  { q: '在一次跨团队推进中，你最大的挑战和解决方法？', tag: '跨职能', score: 86, tone: 'good',
    answer: '讲述了推动算法团队调整排序策略的过程，包含具体的数字与节奏。',
    feedback: '是本场最好的一道题。数字支撑与推动机制都非常清晰。' },
  { q: '如果一个功能上线后数据不及预期，你的第一反应是什么？', tag: '数据驱动', score: 72, tone: 'ok',
    answer: '提到先看分层数据、再看行为路径、最后与业务假设对齐。',
    feedback: '流程正确，但举例偏抽象。建议准备 1-2 个具体项目作为口袋案例。' },
  { q: '你如何理解大模型能力的边界？举一个你决定不用 LLM 的场景。', tag: 'AI 洞察', score: 58, tone: 'warn',
    answer: '回答较简短，只提到了成本和幻觉。',
    feedback: '本题是关键判分点。缺少一个真实的取舍决策。准备 1 个你说服团队不上 AI 的案例会大幅加分。' },
  { q: '如果明天入职，你前 30 天会做什么？', tag: '节奏感', score: 80, tone: 'good',
    answer: '分为了解 × 对齐 × 诊断三段，各段有明确产出。',
    feedback: '框架清晰，可加入一个与 Notion 业务相关的假设性判断。' },
];

window.ReportPage = ReportPage;
