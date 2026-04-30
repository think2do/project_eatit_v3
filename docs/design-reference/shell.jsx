// Shell: sidebar + topbar + page wrapper

function Sidebar({ page, setPage }) {
  const nav = [
    { key: 'upload',   label: '上传与解析',   icon: I.upload },
    { key: 'config',   label: '面试配置',     icon: I.settings },
    { key: 'live',     label: '实时面试',     icon: I.mic },
  ];
  const nav2 = [
    { key: 'history',  label: '面试记录',     icon: I.history, count: 12 },
    { key: 'report',   label: '评估报告',     icon: I.report },
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">e</div>
        <div className="brand-name">Eatit</div>
        <div className="brand-sub">v3.2</div>
      </div>

      <div className="nav-label">面试流程</div>
      {nav.map(n => (
        <button key={n.key} className={`nav-item ${page === n.key ? 'active' : ''}`} onClick={() => setPage(n.key)}>
          {React.cloneElement(n.icon, { size: 16 })}
          <span>{n.label}</span>
        </button>
      ))}

      <div className="nav-label">我的数据</div>
      {nav2.map(n => (
        <button key={n.key} className={`nav-item ${page === n.key ? 'active' : ''}`} onClick={() => setPage(n.key)}>
          {React.cloneElement(n.icon, { size: 16 })}
          <span>{n.label}</span>
          {n.count && <span className="count">{n.count}</span>}
        </button>
      ))}

      <div className="nav-footer">
        <div style={{
          background: 'var(--bg-elev)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-md)',
          padding: '12px 14px',
          marginBottom: 10,
        }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-900)', marginBottom: 4 }}>
            本月剩余额度
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--f-serif)', fontSize: 22, lineHeight: 1 }}>8</span>
            <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>/ 20 场</span>
          </div>
          <div className="bar"><i style={{ width: '40%' }}/></div>
        </div>
        <div className="nav-user">
          <div className="avatar">W</div>
          <div>
            <div className="nav-user-name">Wei Chen</div>
            <div className="nav-user-plan">Pro · 包年</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ crumbs, actions }) {
  return (
    <header className="topbar">
      <div className="crumb">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? 'cur' : ''}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}

Object.assign(window, { Sidebar, Topbar });
