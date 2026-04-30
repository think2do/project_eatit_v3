// Page 3 — 实时面试

function LivePage({ goTo }) {
  const [elapsed, setElapsed] = React.useState(14 * 60 + 23); // seconds
  const [qIdx] = React.useState(4);
  const total = 8;
  const [showRef, setShowRef] = React.useState(false);
  const [transcript, setTranscript] = React.useState(sampleTranscript);
  const [listening, setListening] = React.useState(true);

  React.useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <>
      <Topbar crumbs={['面试流程', '实时面试', '进行中']} actions={
        <>
          <span className="tag tag-dot" style={{ color: 'var(--warn)', background: 'var(--warn-softer)' }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, background: 'var(--warn)', borderRadius: '50%', animation: 'pulse 1.4s infinite' }}/>
            REC  {mm}:{ss}
          </span>
          <button className="btn btn-sm">{I.clock} 暂停</button>
          <button className="btn btn-danger-soft btn-sm" onClick={() => goTo('report')}>{I.stop} 结束面试</button>
        </>
      }/>

      <div className="page" style={{
        padding: '28px 40px 40px',
        maxWidth: 1240,
        display: 'grid',
        gridTemplateColumns: '1fr 340px',
        gap: 28,
        minHeight: 'calc(100vh - 52px)',
      }}>
        {/* LEFT — current question + transcript */}
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Session meta strip */}
          <div className="row between" style={{ marginBottom: 18 }}>
            <div className="row" style={{ gap: 16 }}>
              <div>
                <div className="eyebrow">当前岗位</div>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2 }}>Notion · 高级产品经理</div>
              </div>
              <div className="divider-v" style={{ height: 28 }}/>
              <div>
                <div className="eyebrow">面试官风格</div>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginTop: 2 }}>结构化面试官 · Sarah</div>
              </div>
              <div className="divider-v" style={{ height: 28 }}/>
              <div>
                <div className="eyebrow">进度</div>
                <div className="row" style={{ gap: 8, marginTop: 2 }}>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 500 }}>{qIdx} / {total}</span>
                  <div className="bar" style={{ width: 80 }}><i style={{ width: `${qIdx / total * 100}%` }}/></div>
                </div>
              </div>
            </div>
          </div>

          {/* Current question card */}
          <div className="card" style={{ padding: '28px 32px', marginBottom: 18, background: 'var(--bg-elev)' }}>
            <div className="row between" style={{ marginBottom: 14 }}>
              <div className="row" style={{ gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, background: 'var(--ink-900)', color: 'white',
                  display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600,
                }}>
                  AI
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>面试官 Sarah</div>
                  <div className="muted mono" style={{ fontSize: 10.5 }}>刚刚 · 问题 {qIdx} · AI 场景洞察</div>
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <span className="tag tag-line">AI 场景洞察</span>
                <button className="btn btn-ghost btn-sm" title="重听">{I.volume}</button>
                <button className="btn btn-ghost btn-sm" title="跳过">下一题 →</button>
              </div>
            </div>

            <p style={{
              fontFamily: 'var(--f-serif)', fontSize: 26, lineHeight: 1.35, letterSpacing: '-0.01em',
              color: 'var(--ink-900)', margin: '8px 0 20px', textWrap: 'pretty',
            }}>
              假设我们要在 Notion 里接入一个 AI 助手，它应该在「文档工作流」和「数据库工作流」里分别扮演什么角色？
              你会如何判断哪一条路径是优先级更高的落地方向？
            </p>

            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="tag tag-info" style={{ fontSize: 11 }}>追问线索 · 指标体系</span>
              <span className="tag tag-info" style={{ fontSize: 11 }}>追问线索 · 用户行为差异</span>
              <span className="tag tag-info" style={{ fontSize: 11 }}>追问线索 · 成本与价值</span>
            </div>

            {/* Reference answer — collapsed */}
            <div style={{
              marginTop: 22, padding: showRef ? '14px 16px' : '10px 14px',
              background: 'var(--bg-warm)', border: '1px solid var(--line)',
              borderRadius: 'var(--r-md)', transition: 'padding 120ms',
            }}>
              <button className="row between"
                onClick={() => setShowRef(!showRef)}
                style={{ width: '100%', cursor: 'pointer' }}>
                <div className="row" style={{ gap: 8 }}>
                  {React.cloneElement(I.lock, { size: 13 })}
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>AI 参考回答</span>
                  <span className="muted" style={{ fontSize: 11.5 }}>
                    {showRef ? '仅作为回答后的参考框架，不建议照读' : '默认折叠 · 回答后再查看效果更好'}
                  </span>
                </div>
                <span className="muted">{showRef ? I.chevUp : I.chevDown}</span>
              </button>
              {showRef && (
                <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.65, color: 'var(--ink-700)' }}>
                  <strong style={{ color: 'var(--ink-900)' }}>参考框架（三步）：</strong>
                  <ol style={{ paddingLeft: 18, margin: '6px 0 0' }}>
                    <li>区分两类工作流的用户意图：文档偏「创造 &amp; 沟通」，数据库偏「结构化操作 &amp; 查询」。</li>
                    <li>在两种场景下分别列举 AI 可接管的任务类型，并用频次 × 痛点强度做价值矩阵。</li>
                    <li>综合技术可行性（模型能力边界）与产品一致性（Notion 的 block 体系），给出优先级判断。</li>
                  </ol>
                </div>
              )}
            </div>
          </div>

          {/* Your response — live transcript */}
          <div className="card" style={{ padding: '20px 24px', marginBottom: 18 }}>
            <div className="row between" style={{ marginBottom: 14 }}>
              <div className="row" style={{ gap: 10 }}>
                <div className="avatar" style={{ background: 'var(--brand-soft)', color: 'var(--brand-ink)' }}>W</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>我的回答</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    {listening ? '正在录音 · 实时转写中' : '已暂停'}
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <WaveBars active={listening}/>
                <button className="btn btn-sm" onClick={() => setListening(!listening)}>
                  {listening ? I.pause : I.mic} {listening ? '暂停录音' : '继续录音'}
                </button>
              </div>
            </div>

            <div style={{ fontSize: 14.5, lineHeight: 1.75, color: 'var(--ink-900)', minHeight: 96 }}>
              {transcript.map((t, i) => (
                <span key={i} style={{ opacity: t.final ? 1 : 0.55 }}>
                  {t.text}{' '}
                </span>
              ))}
              {listening && <span style={{
                display: 'inline-block', width: 2, height: 16, background: 'var(--brand)',
                verticalAlign: -3, animation: 'blink 1s infinite',
              }}/>}
            </div>

            <div className="row between" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--line)' }}>
              <div className="row" style={{ gap: 14, fontSize: 11.5, color: 'var(--ink-500)' }}>
                <span>⏱ 本题用时 <span className="mono">1:42</span></span>
                <span>语速 <span className="mono" style={{ color: 'var(--brand)' }}>适中</span></span>
                <span>填充词 <span className="mono">3</span></span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-sm">请再说一遍</button>
                <button className="btn btn-primary btn-sm">完成回答 {I.arrowRight}</button>
              </div>
            </div>
          </div>

          {/* Recent rounds summary */}
          <div>
            <div className="row between" style={{ marginBottom: 10 }}>
              <span className="eyebrow">近几轮问答摘要</span>
              <span className="muted" style={{ fontSize: 11.5 }}>仅展示最近 3 轮 · 完整记录在报告中查看</span>
            </div>
            <div className="col" style={{ gap: 10 }}>
              {recentRounds.map(r => (
                <div key={r.idx} style={{
                  border: '1px solid var(--line)', borderRadius: 'var(--r-md)',
                  background: 'var(--bg-elev)', padding: '12px 16px',
                }}>
                  <div className="row between" style={{ marginBottom: 4 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--ink-400)' }}>Q{r.idx}</span>
                      <span style={{ fontSize: 13, color: 'var(--ink-900)', fontWeight: 500 }}>{r.q}</span>
                    </div>
                    <span className={`tag ${r.tone === 'good' ? 'tag-green' : r.tone === 'risk' ? 'tag-warn' : 'tag-line'}`}>{r.hint}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginLeft: 26 }}>{r.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT rail */}
        <aside style={{ position: 'sticky', top: 84, height: 'fit-content', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div className="eyebrow">本场节奏</div>
            <div className="row between" style={{ marginTop: 10, marginBottom: 10 }}>
              <span className="mono" style={{ fontSize: 26, fontFamily: 'var(--f-serif)', color: 'var(--ink-900)' }}>
                {mm}:{ss}
              </span>
              <span className="muted" style={{ fontSize: 12 }}>/ 30:00</span>
            </div>
            <div className="bar"><i style={{ width: `${elapsed / (30 * 60) * 100}%` }}/></div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <Metric label="当前节奏" value="偏慢" tone="warn"/>
              <Metric label="已答题数" value="3 / 8" tone="muted"/>
            </div>
          </div>

          <div className="card" style={{ padding: '18px 20px' }}>
            <div className="row between" style={{ marginBottom: 12 }}>
              <span className="eyebrow">提问方向进度</span>
              <span className="muted" style={{ fontSize: 11 }}>实时</span>
            </div>
            {[
              { k: 'AI 场景洞察', done: 1, total: 3, active: true },
              { k: '数据驱动决策', done: 2, total: 3 },
              { k: '跨职能协作',   done: 0, total: 2 },
            ].map(x => (
              <div key={x.k} style={{ marginBottom: 10 }}>
                <div className="row between" style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, fontWeight: x.active ? 600 : 400, color: x.active ? 'var(--ink-900)' : 'var(--ink-700)' }}>
                    {x.active && <span style={{ color: 'var(--brand)', marginRight: 4 }}>●</span>}
                    {x.k}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--ink-500)' }}>{x.done}/{x.total}</span>
                </div>
                <div className="bar"><i style={{ width: `${x.done / x.total * 100}%` }}/></div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: '16px 20px', background: 'var(--brand-softer)', borderColor: 'var(--brand-soft)' }}>
            <div className="row" style={{ gap: 8, marginBottom: 6, color: 'var(--brand-ink)' }}>
              {React.cloneElement(I.sparkle, { size: 14 })}
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>AI 实时观察</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-700)', lineHeight: 1.6 }}>
              你的结构清晰，但对「优先级判断依据」一带而过。建议补充一个具体的判断维度，比如<span style={{ color: 'var(--brand-ink)', fontWeight: 500 }}>渗透率 × ARPU 的二维矩阵</span>。
            </div>
          </div>

          <div className="muted" style={{ fontSize: 11.5, padding: '4px 2px', lineHeight: 1.5 }}>
            <kbd className="kbd">Space</kbd> 完成回答  ·  <kbd className="kbd">R</kbd> 重听
            <br/><kbd className="kbd">Esc</kbd> 结束面试
          </div>
        </aside>
      </div>

      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes pulse { 50% { opacity: 0.35; } }
      `}</style>
    </>
  );
}

function WaveBars({ active }) {
  return (
    <div className="row" style={{ gap: 2, alignItems: 'flex-end', height: 20 }}>
      {[6, 14, 10, 18, 8, 16, 11, 13].map((h, i) => (
        <span key={i} style={{
          width: 2.5,
          height: active ? h : 4,
          background: active ? 'var(--brand)' : 'var(--ink-300)',
          borderRadius: 2,
          animation: active ? `wave 0.9s ${i * 0.08}s infinite ease-in-out` : 'none',
          transformOrigin: 'bottom',
        }}/>
      ))}
      <style>{`@keyframes wave { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }`}</style>
    </div>
  );
}

function Metric({ label, value, tone }) {
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'good' ? 'var(--brand)' : 'var(--ink-700)';
  return (
    <div style={{ padding: '10px 12px', background: 'var(--bg-warm)', borderRadius: 'var(--r-sm)' }}>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

const sampleTranscript = [
  { text: '我觉得这两类工作流的核心差异在于用户意图——', final: true },
  { text: '文档工作流更偏向「创造和表达」，', final: true },
  { text: '而数据库工作流更偏「查询和结构化操作」。', final: true },
  { text: '所以 AI 助手在里面应该扮演不同的角色：在文档里更像一个协作者，在数据库里更像一个执行者…', final: true },
  { text: '至于优先级，我觉得可以从用户日活的分布来看', final: false },
];

const recentRounds = [
  { idx: 3, q: '你如何看待「AI 原生」产品和「AI 辅助」产品的区别？',
    a: '从交互入口、模型依赖程度、失败容忍度三方面回答，举了 Cursor 和 Notion 的例子对比。',
    tone: 'good', hint: '结构清晰' },
  { idx: 2, q: '在做数据产品时，如何判断一个指标是否值得作为北极星？',
    a: '提到了可解释性、可归因性和团队对齐三个维度，但 ARPU 类指标的局限举例不够具体。',
    tone: 'risk', hint: '举例偏弱' },
  { idx: 1, q: '请简单介绍一下你最有代表性的一个项目。',
    a: '介绍了在小红书做的一个商家数据看板，覆盖从 0 到 1 的完整过程和关键数据。',
    tone: 'ok', hint: '正常' },
];

window.LivePage = LivePage;
