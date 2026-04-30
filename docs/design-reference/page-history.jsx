// Page 4 — 面试记录

function HistoryPage({ goTo }) {
  const [filter, setFilter] = React.useState('all');

  return (
    <>
      <Topbar crumbs={['我的数据', '面试记录']} actions={
        <>
          <button className="btn btn-sm">{I.download} 导出</button>
          <button className="btn btn-brand btn-sm" onClick={() => goTo('upload')}>
            {I.plus} 开启新面试
          </button>
        </>
      }/>
      <div className="page">
        <div className="row between" style={{ alignItems: 'flex-end', marginBottom: 28 }}>
          <div>
            <div className="eyebrow">面试记录</div>
            <h1 className="h1">你的练习轨迹</h1>
            <p className="body muted" style={{ maxWidth: 520, margin: 0 }}>
              每一次面试都会保留完整记录。从这里可以继续上次的练习方向，或针对弱项发起专项训练。
            </p>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 6, padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', background: 'var(--bg-elev)' }}>
              {React.cloneElement(I.search, { size: 13 })}
              <input className="input" placeholder="搜索岗位 / 公司 / 关键词"
                style={{ border: 0, padding: '2px 0', fontSize: 13, background: 'transparent', width: 220 }}/>
            </div>
            <button className="btn btn-sm">{I.filter} 筛选</button>
          </div>
        </div>

        {/* Overview strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
          <StatCard label="总面试数" value="12" sub="过去 30 天 +5"/>
          <StatCard label="平均评分" value="78" sub="较上周 +4" tone="good"/>
          <StatCard label="累计时长" value="6h 42m"/>
          <StatCard label="高频薄弱方向" value="AI 落地经验" tone="warn" sub="在 4 场中被提及"/>
        </div>

        {/* Continue practice callout */}
        <div className="card" style={{
          padding: '20px 24px', marginBottom: 22,
          background: 'linear-gradient(0deg, var(--brand-softer) 0%, var(--bg-elev) 100%)',
          borderColor: 'var(--brand-soft)',
        }}>
          <div className="row between">
            <div className="row" style={{ gap: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: 'var(--brand-soft)',
                display: 'grid', placeItems: 'center', color: 'var(--brand)',
              }}>
                {React.cloneElement(I.sparkle, { size: 18 })}
              </div>
              <div>
                <div className="eyebrow" style={{ color: 'var(--brand)' }}>基于最近 3 场分析</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>建议继续练习：AI 场景洞察 · 深度追问</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  你在这一方向的平均得分是 62，而岗位期望在 80 以上。用相同岗位再试一次，重点强化这部分。
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn">查看弱项清单</button>
              <button className="btn btn-brand">{I.flash} 发起专项训练</button>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="row between" style={{ marginBottom: 14 }}>
          <div className="row" style={{ gap: 4, padding: 4, background: 'var(--bg-sunken)', borderRadius: var_r('sm') }}>
            {[
              { k: 'all', t: '全部', n: 12 },
              { k: 'completed', t: '已完成', n: 10 },
              { k: 'interrupted', t: '未完成', n: 2 },
              { k: 'saved', t: '已标记', n: 3 },
            ].map(x => (
              <button key={x.k}
                onClick={() => setFilter(x.k)}
                style={{
                  padding: '5px 12px', fontSize: 12.5, fontWeight: 500,
                  borderRadius: 6,
                  background: filter === x.k ? 'var(--bg-elev)' : 'transparent',
                  color: filter === x.k ? 'var(--ink-900)' : 'var(--ink-500)',
                  boxShadow: filter === x.k ? 'var(--shadow-sm)' : 'none',
                }}>
                {x.t} <span className="mono" style={{ marginLeft: 4, fontSize: 11, opacity: 0.6 }}>{x.n}</span>
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>按时间倒序 · 共 {historyList.length} 条</div>
        </div>

        {/* Table-ish list */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 1fr 1fr 1.4fr 120px',
            padding: '11px 22px',
            background: 'var(--bg-warm)', borderBottom: '1px solid var(--line)',
            fontSize: 11, color: 'var(--ink-500)', letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            <div>岗位 · 风格</div>
            <div>面试日期</div>
            <div>时长</div>
            <div>评分</div>
            <div>弱项方向</div>
            <div style={{ textAlign: 'right' }}>操作</div>
          </div>
          {historyList.map((h, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '2.2fr 1.2fr 1fr 1fr 1.4fr 120px',
              padding: '16px 22px', borderBottom: i < historyList.length - 1 ? '1px solid var(--line)' : 'none',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{h.role}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {h.company} · {h.style}
                  {h.status === 'interrupted' && <span className="tag tag-warn" style={{ marginLeft: 8, fontSize: 10.5 }}>中断</span>}
                  {h.saved && <span className="tag tag-line" style={{ marginLeft: 8, fontSize: 10.5 }}>已标记</span>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13 }}>{h.date}</div>
                <div className="muted mono" style={{ fontSize: 11, marginTop: 1 }}>{h.ago}</div>
              </div>
              <div className="mono" style={{ fontSize: 13 }}>{h.duration}</div>
              <div>
                {h.score != null ? (
                  <div className="row" style={{ gap: 10 }}>
                    <span style={{
                      fontFamily: 'var(--f-serif)', fontSize: 22, lineHeight: 1,
                      color: h.score >= 75 ? 'var(--brand)' : h.score >= 60 ? 'var(--ink-900)' : 'var(--warn)',
                    }}>{h.score}</span>
                    <div style={{ width: 40 }}>
                      <div className="bar"><i style={{
                        width: `${h.score}%`,
                        background: h.score >= 75 ? 'var(--brand)' : h.score >= 60 ? 'var(--ink-700)' : 'var(--warn)',
                      }}/></div>
                    </div>
                  </div>
                ) : <span className="muted" style={{ fontSize: 12 }}>—</span>}
              </div>
              <div className="row wrap" style={{ gap: 4 }}>
                {h.weak.map(w => <span key={w} className="tag tag-warn" style={{ fontSize: 10.5 }}>{w}</span>)}
              </div>
              <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                <button className="btn btn-sm" onClick={() => goTo('report')}>查看</button>
                <button className="btn btn-ghost btn-sm" title="再次面试" onClick={() => goTo('config')}>{I.redo}</button>
                <button className="btn btn-ghost btn-sm">{I.more}</button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div className="row between" style={{ marginTop: 28, padding: '18px 24px', background: 'var(--bg-warm)', borderRadius: 'var(--r-lg)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>准备好下一场了吗？</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              可以复用已有的简历和 JD，在配置页直接修改参数后开始。
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn" onClick={() => goTo('config')}>复用上次配置</button>
            <button className="btn btn-brand" onClick={() => goTo('upload')}>
              {I.plus} 全新面试
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, sub, tone }) {
  const color = tone === 'good' ? 'var(--brand)' : tone === 'warn' ? 'var(--warn)' : 'var(--ink-900)';
  return (
    <div className="card card-pad">
      <div className="eyebrow">{label}</div>
      <div style={{ fontFamily: 'var(--f-serif)', fontSize: 30, lineHeight: 1.1, color, marginTop: 8, letterSpacing: '-0.015em' }}>
        {value}
      </div>
      {sub && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function var_r(k) { return `var(--r-${k})`; }

const historyList = [
  { role: 'Notion · 高级产品经理', company: 'Notion', style: '结构化面试官',
    date: '2026-04-19 14:20', ago: '昨天', duration: '28:14', score: 78,
    weak: ['AI 落地', '竞品分析'], status: 'done', saved: true },
  { role: 'Figma · 产品经理 (AI)', company: 'Figma', style: '高压追问型',
    date: '2026-04-17 10:02', ago: '3 天前', duration: '41:58', score: 72,
    weak: ['数据指标', '节奏'], status: 'done' },
  { role: '字节跳动 · 资深产品经理', company: '字节跳动', style: '亲和启发型',
    date: '2026-04-14 19:45', ago: '6 天前', duration: '15:23', score: null,
    weak: [], status: 'interrupted' },
  { role: 'Notion · 高级产品经理', company: 'Notion', style: '结构化面试官',
    date: '2026-04-12 09:30', ago: '8 天前', duration: '30:00', score: 74,
    weak: ['AI 落地'], status: 'done', saved: true },
  { role: '小红书 · 数据产品经理', company: '小红书', style: '资深行业专家',
    date: '2026-04-09 16:12', ago: '11 天前', duration: '45:05', score: 81,
    weak: ['战略视角'], status: 'done' },
  { role: 'OpenAI · PM, Consumer', company: 'OpenAI', style: '高压追问型',
    date: '2026-04-05 20:30', ago: '15 天前', duration: '52:40', score: 66,
    weak: ['AI 落地', '英语表达', '行业节奏'], status: 'done' },
  { role: 'Linear · Product Engineer', company: 'Linear', style: '结构化面试官',
    date: '2026-04-02 11:08', ago: '18 天前', duration: '30:22', score: 76,
    weak: ['技术判断'], status: 'done' },
];

window.HistoryPage = HistoryPage;
