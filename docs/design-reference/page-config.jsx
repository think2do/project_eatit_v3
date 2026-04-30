// Page 2 — 面试配置

function ConfigPage({ goTo }) {
  const [style, setStyle] = React.useState('structured');
  const [focus, setFocus] = React.useState(new Set(['ai-insight', 'data-driven']));
  const [duration, setDuration] = React.useState(30);

  const toggleFocus = (k) => {
    const n = new Set(focus);
    n.has(k) ? n.delete(k) : n.add(k);
    setFocus(n);
  };

  return (
    <>
      <Topbar crumbs={['面试流程', '面试配置']} actions={
        <>
          <button className="btn btn-sm" onClick={() => goTo('upload')}>{I.arrowLeft} 返回</button>
          <button className="btn btn-brand btn-sm" onClick={() => goTo('live')}>
            开始面试 {I.arrowRight}
          </button>
        </>
      }/>

      <div className="page" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 40, maxWidth: 1200 }}>
        <div>
          <div className="eyebrow">第 2 步 · 共 3 步</div>
          <h1 className="h1">配置你的面试</h1>
          <p className="body muted" style={{ maxWidth: 560, marginBottom: 36 }}>
            三个核心参数会决定 AI 面试官的风格、提问方向与节奏。你可以随时调整，每个组合都会生成不同的面试体验。
          </p>

          {/* Section 1 — Style */}
          <Section
            num="01"
            title="面试风格"
            desc="选择 AI 面试官的人设。不同风格会影响问题的追问深度、节奏与反馈语气。"
          >
            <div className="tile-group">
              {[
                { k: 'structured', t: '结构化面试官', d: '按既定框架推进，节奏稳定，适合技术 / 产品岗位的系统性考察', tag: '推荐' },
                { k: 'pressure',   t: '高压追问型',  d: '连续深挖细节、不断质疑你的判断依据，模拟真实压力面试',     tag: null },
                { k: 'friendly',   t: '亲和启发型',  d: '引导你自述，追问偏协助式，适合练习自我表达与复盘',         tag: null },
                { k: 'expert',     t: '资深行业专家', d: '以业务视角切入，追问行业理解与案例迁移能力',               tag: 'Beta' },
              ].map(o => (
                <button key={o.k}
                  className={`tile ${style === o.k ? 'selected' : ''}`}
                  onClick={() => setStyle(o.k)}>
                  <div className="tile-radio"/>
                  <div style={{ flex: 1 }}>
                    <div className="row between">
                      <div className="tile-title">{o.t}</div>
                      {o.tag && <span className={`tag ${o.tag === '推荐' ? 'tag-green' : 'tag-line'}`}>{o.tag}</span>}
                    </div>
                    <div className="tile-desc">{o.d}</div>
                  </div>
                </button>
              ))}
            </div>
          </Section>

          {/* Section 2 — Focus */}
          <Section
            num="02"
            title="提问方向"
            desc="AI 将在这些方向上出题。可多选，顺序无关。系统已根据你的简历与 JD 预选两项。"
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[
                { k: 'ai-insight',   t: 'AI 场景洞察', d: '对大模型能力与边界的产品化判断', rec: true },
                { k: 'data-driven',  t: '数据驱动决策', d: '指标体系、AB 实验、反事实推理',   rec: true },
                { k: 'cross-func',   t: '跨职能协作',   d: '与研发、设计、运营的推进',         rec: false },
                { k: 'zero-to-one',  t: '从 0 到 1',    d: '新业务判断与路径选择',             rec: false },
                { k: 'user-research',t: '用户洞察',     d: '调研方法、用户访谈结构化输出',     rec: false },
                { k: 'strategy',     t: '产品战略',     d: '竞争分析、北极星指标、节奏选择',   rec: false },
              ].map(o => (
                <button key={o.k}
                  className={`tile ${focus.has(o.k) ? 'selected' : ''}`}
                  onClick={() => toggleFocus(o.k)}
                  style={{ padding: '13px 14px' }}>
                  <div style={{
                    width: 16, height: 16, flexShrink: 0, marginTop: 2,
                    borderRadius: 4,
                    border: '1.5px solid ' + (focus.has(o.k) ? 'var(--brand)' : 'var(--line-strong)'),
                    background: focus.has(o.k) ? 'var(--brand)' : 'transparent',
                    display: 'grid', placeItems: 'center', color: 'white',
                  }}>
                    {focus.has(o.k) && React.cloneElement(I.check, { size: 11 })}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="row between">
                      <div className="tile-title" style={{ fontSize: 13 }}>{o.t}</div>
                      {o.rec && <span className="mono" style={{ fontSize: 10, color: 'var(--brand)' }}>AI 推荐</span>}
                    </div>
                    <div className="tile-desc" style={{ fontSize: 12 }}>{o.d}</div>
                  </div>
                </button>
              ))}
            </div>
          </Section>

          {/* Section 3 — Duration */}
          <Section
            num="03"
            title="面试时长"
            desc="会影响问题数量与追问深度，可随时提前结束。"
            last
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { v: 15, t: '15 分钟', d: '精简 · 3~4 题' },
                { v: 30, t: '30 分钟', d: '标准 · 6~8 题' },
                { v: 45, t: '45 分钟', d: '完整 · 10~12 题' },
                { v: 60, t: '60 分钟', d: '深度 · 含 case' },
              ].map(o => (
                <button key={o.v}
                  className={`tile ${duration === o.v ? 'selected' : ''}`}
                  onClick={() => setDuration(o.v)}
                  style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '14px 16px' }}>
                  <div style={{ fontFamily: 'var(--f-serif)', fontSize: 24, lineHeight: 1, color: 'var(--ink-900)' }}>
                    {o.v}<span style={{ fontSize: 12, color: 'var(--ink-500)', marginLeft: 3 }}>分钟</span>
                  </div>
                  <div className="tile-desc" style={{ fontSize: 11.5, marginTop: 4 }}>{o.d}</div>
                </button>
              ))}
            </div>
          </Section>
        </div>

        {/* Right rail — summary */}
        <aside style={{ position: 'sticky', top: 84, height: 'fit-content' }}>
          <div className="card card-pad">
            <div className="eyebrow">面试预览</div>
            <h3 className="h3" style={{ marginTop: 6, marginBottom: 14 }}>将开始一场…</h3>

            <SummaryRow label="岗位"   value="Notion · 高级产品经理"/>
            <SummaryRow label="风格"   value={styleLabel(style)}/>
            <SummaryRow label="方向"   value={`${focus.size} 项`} chips={[...focus].map(focusLabel)}/>
            <SummaryRow label="时长"   value={`${duration} 分钟`}/>
            <SummaryRow label="预计"   value={`${Math.round(duration / 4)}~${Math.round(duration / 3)} 题`} last/>

            <div style={{
              padding: '12px 14px',
              background: 'var(--brand-softer)',
              borderRadius: 'var(--r-sm)',
              marginTop: 16,
              fontSize: 12.5,
              color: 'var(--brand-ink)',
              lineHeight: 1.55,
            }}>
              <div className="row" style={{ gap: 6, marginBottom: 4 }}>
                {React.cloneElement(I.bulb, { size: 13 })}
                <strong>小建议</strong>
              </div>
              找一个不会被打扰的环境，准备好麦克风。Eatit 会录制语音用于分析，但不会外传。
            </div>

            <button className="btn btn-brand btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
              onClick={() => goTo('live')}>
              {I.mic} 开始模拟面试
            </button>
            <div className="row between" style={{ marginTop: 10, fontSize: 11.5, color: 'var(--ink-500)' }}>
              <span>开始后会扣除 1 次额度</span>
              <span className="mono">剩余 8 次</span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function Section({ num, title, desc, children, last }) {
  return (
    <section style={{ paddingBottom: last ? 0 : 36, marginBottom: last ? 0 : 36, borderBottom: last ? 'none' : '1px solid var(--line)' }}>
      <div className="row" style={{ gap: 12, marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 11, color: 'var(--brand)', letterSpacing: '0.08em' }}>{num}</span>
        <h2 className="h2">{title}</h2>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 16px', maxWidth: 520 }}>{desc}</p>
      {children}
    </section>
  );
}

function SummaryRow({ label, value, chips, last }) {
  return (
    <div style={{
      padding: '10px 0',
      borderBottom: last ? 'none' : '1px dashed var(--line)',
    }}>
      <div className="row between">
        <span className="muted" style={{ fontSize: 12 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 500, textAlign: 'right', maxWidth: 180 }}>{value}</span>
      </div>
      {chips && (
        <div className="row wrap" style={{ gap: 4, marginTop: 6, justifyContent: 'flex-end' }}>
          {chips.map(c => <span key={c} className="tag" style={{ fontSize: 10.5, padding: '1px 7px' }}>{c}</span>)}
        </div>
      )}
    </div>
  );
}

function styleLabel(k) {
  return { structured: '结构化面试官', pressure: '高压追问型', friendly: '亲和启发型', expert: '资深行业专家' }[k];
}
function focusLabel(k) {
  return { 'ai-insight': 'AI 洞察', 'data-driven': '数据驱动', 'cross-func': '跨职能', 'zero-to-one': '0→1', 'user-research': '用户洞察', 'strategy': '战略' }[k];
}

window.ConfigPage = ConfigPage;
