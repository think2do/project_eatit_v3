// Page 1 — 上传与综合解析

function UploadPage({ goTo }) {
  const [resumeState, setResumeState] = React.useState('done'); // none | parsing | done
  const [jdState, setJdState] = React.useState('done');
  const parsed = resumeState === 'done' && jdState === 'done';

  return (
    <>
      <Topbar crumbs={['面试流程', '上传与解析']} actions={
        <>
          <button className="btn btn-ghost btn-sm">清除全部</button>
          <button className={`btn btn-brand btn-sm ${parsed ? '' : 'btn'}`}
            disabled={!parsed}
            style={parsed ? {} : { opacity: 0.5, pointerEvents: 'none' }}
            onClick={() => goTo('config')}>
            下一步：配置面试 {I.arrowRight}
          </button>
        </>
      }/>
      <div className="page">
        <div className="eyebrow">第 1 步 · 共 3 步</div>
        <h1 className="h1">上传简历与岗位 JD</h1>
        <p className="body muted" style={{ maxWidth: 640, marginBottom: 36 }}>
          AI 会自动提取你的背景与岗位要求，识别两者之间的匹配点与潜在差距，生成你的面试画像。上传后将立即开始解析。
        </p>

        {/* Upload row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
          <UploadCard
            kind="resume"
            state={resumeState}
            setState={setResumeState}
          />
          <UploadCard
            kind="jd"
            state={jdState}
            setState={setJdState}
          />
        </div>

        {/* Parsed result */}
        {parsed && <ParsedPanel goTo={goTo} />}
      </div>
    </>
  );
}

function UploadCard({ kind, state, setState }) {
  const meta = kind === 'resume'
    ? {
        title: '我的简历',
        sub: '支持 PDF / Word / Markdown',
        fileName: 'Wei_Chen_Resume_2026.pdf',
        fileMeta: '·  428 KB  ·  4 页',
        icon: I.file,
        chips: ['产品经理 · 4 年经验', '字节跳动 / 小红书', 'B 端 SaaS · 数据产品'],
      }
    : {
        title: '岗位 JD',
        sub: '粘贴文本或上传文件',
        fileName: 'ProductManager_Notion.txt',
        fileMeta: '·  2.1 KB  ·  1,240 字',
        icon: I.briefcase,
        chips: ['Notion · 高级产品经理', 'AI 方向', '上海 / 远程'],
      };

  if (state === 'none') {
    return (
      <button className="card" style={{
        padding: '36px 24px',
        border: '1.5px dashed var(--line-strong)',
        background: 'var(--bg-warm)',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 120ms',
      }} onClick={() => { setState('parsing'); setTimeout(() => setState('done'), 1400); }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--bg-elev)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
          {React.cloneElement(meta.icon, { size: 18 })}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{meta.title}</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>拖放文件到此处，或点击选择</div>
        <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>{meta.sub}</div>
      </button>
    );
  }

  return (
    <div className="card card-pad">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-sunken)', display: 'grid', placeItems: 'center' }}>
            {React.cloneElement(meta.icon, { size: 16 })}
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>{meta.fileName}</div>
            <div className="muted mono" style={{ fontSize: 11 }}>{meta.fileMeta}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm">替换</button>
      </div>

      {state === 'parsing' ? (
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <div className="shimmer" style={{ width: 18, height: 18, borderRadius: '50%' }}/>
            <span className="body muted" style={{ fontSize: 12.5 }}>正在解析结构化字段…</span>
          </div>
          <div className="shimmer" style={{ height: 10, width: '90%', marginBottom: 6 }}/>
          <div className="shimmer" style={{ height: 10, width: '70%', marginBottom: 6 }}/>
          <div className="shimmer" style={{ height: 10, width: '80%' }}/>
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {meta.chips.map(c => <span key={c} className="tag">{c}</span>)}
          </div>
          <div className="row" style={{ gap: 6, color: 'var(--brand)', fontSize: 12.5, fontWeight: 500 }}>
            {React.cloneElement(I.check, { size: 14 })}
            <span>解析完成</span>
          </div>
        </>
      )}
    </div>
  );
}

function ParsedPanel({ goTo }) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="row" style={{ gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: 'var(--brand-soft)',
            display: 'grid', placeItems: 'center', color: 'var(--brand)'
          }}>
            {React.cloneElement(I.sparkle, { size: 14 })}
          </div>
          <h2 className="h2">综合解析结果</h2>
          <span className="tag tag-green tag-dot">已生成</span>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <span className="mono muted" style={{ fontSize: 11 }}>由 Eatit AI · 于 2 秒前生成</span>
          <button className="btn btn-ghost btn-sm">{I.refresh} 重新解析</button>
        </div>
      </div>

      {/* Match score + profile summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 0 }}>
        <div style={{ padding: '28px 28px', borderRight: '1px solid var(--line)' }}>
          <div className="eyebrow">整体匹配度</div>
          <MatchDial value={78} />
          <div className="muted" style={{ fontSize: 12.5, marginTop: 14, textAlign: 'center', textWrap: 'balance' }}>
            你的背景与岗位要求高度契合，主要差距集中在
            <span style={{ color: 'var(--warn)', fontWeight: 500 }}> AI 产品落地经验</span>。
          </div>
        </div>

        <div style={{ padding: '28px 32px' }}>
          <div className="eyebrow">AI 画像摘要</div>
          <p style={{ fontFamily: 'var(--f-serif)', fontSize: 19, lineHeight: 1.55, margin: '8px 0 20px', letterSpacing: '-0.005em', color: 'var(--ink-900)' }}>
            一位面向 B 端 SaaS 的产品经理，擅长数据产品与从 0 到 1 构建，在跨职能协作中偏向结构化沟通。
            目标岗位强调 <em>AI 原生的产品思维</em> 和对大模型能力边界的判断。
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <StrengthGapList
              title="匹配优势"
              tint="green"
              icon={I.check}
              items={[
                { label: '数据产品经验',  score: '强匹配' },
                { label: '跨团队协作',    score: '强匹配' },
                { label: '用户调研方法',  score: '匹配' },
                { label: '从 0 到 1 能力', score: '匹配' },
              ]}
            />
            <StrengthGapList
              title="潜在差距"
              tint="warn"
              icon={I.alert}
              items={[
                { label: 'AI 产品落地经验', score: '需补充' },
                { label: '国际化产品视野', score: '需补充' },
                { label: '大模型 Prompt 设计', score: '待评估' },
              ]}
            />
          </div>
        </div>
      </div>

      <hr className="divider"/>

      {/* Focus suggestions */}
      <div style={{ padding: '22px 28px' }}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <div>
            <h3 className="h3">建议面试侧重</h3>
            <p className="muted" style={{ fontSize: 12.5, margin: '3px 0 0' }}>
              根据解析结果推荐的提问方向，你可以在下一步调整
            </p>
          </div>
          <span className="tag tag-line">可编辑</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { t: 'AI 场景洞察', d: '考察你对大模型产品化与边界的判断', w: 'high' },
            { t: '数据驱动决策', d: '基于已有经验的深度案例追问', w: 'mid' },
            { t: '跨职能协作', d: '复杂项目中的沟通与推动力', w: 'mid' },
          ].map((x, i) => (
            <div key={i} style={{ padding: '14px 16px', background: 'var(--bg-warm)', borderRadius: 'var(--r-md)', border: '1px solid var(--line)' }}>
              <div className="row between" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{x.t}</span>
                <span className={`tag ${x.w === 'high' ? 'tag-warn' : 'tag-line'}`} style={{ fontSize: 10.5 }}>
                  {x.w === 'high' ? '高优先级' : '中优先级'}
                </span>
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>{x.d}</div>
            </div>
          ))}
        </div>

        <div className="row between" style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid var(--line)' }}>
          <div className="muted" style={{ fontSize: 12.5 }}>
            解析结果仅作为 AI 面试官出题参考，不会影响你的真实简历。
          </div>
          <button className="btn btn-brand btn-lg" onClick={() => goTo('config')}>
            进入面试配置 {I.arrowRight}
          </button>
        </div>
      </div>
    </div>
  );
}

function MatchDial({ value }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const off = C * (1 - value / 100);
  return (
    <div style={{ position: 'relative', width: 160, height: 160, margin: '12px auto 4px' }}>
      <svg width="160" height="160" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={R} stroke="var(--line)" strokeWidth="8" fill="none"/>
        <circle cx="70" cy="70" r={R} stroke="var(--brand)" strokeWidth="8" fill="none"
          strokeDasharray={C} strokeDashoffset={off} strokeLinecap="round"
          transform="rotate(-90 70 70)"/>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: 42, lineHeight: 1, color: 'var(--ink-900)' }}>
            {value}
            <span style={{ fontSize: 16, color: 'var(--ink-500)' }}> / 100</span>
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--brand)', marginTop: 8, letterSpacing: '0.08em' }}>
            MATCH · HIGH
          </div>
        </div>
      </div>
    </div>
  );
}

function StrengthGapList({ title, tint, icon, items }) {
  return (
    <div>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <span style={{ color: tint === 'green' ? 'var(--brand)' : 'var(--warn)' }}>
          {React.cloneElement(icon, { size: 14 })}
        </span>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((it, i) => (
          <div key={i} className="row between" style={{
            padding: '9px 12px',
            borderRadius: 8,
            background: tint === 'green' ? 'var(--brand-softer)' : 'var(--warn-softer)',
            marginBottom: 4,
          }}>
            <span style={{ fontSize: 13, color: 'var(--ink-900)' }}>{it.label}</span>
            <span className="mono" style={{ fontSize: 11, color: tint === 'green' ? 'var(--brand-ink)' : 'var(--warn)' }}>
              {it.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

window.UploadPage = UploadPage;
