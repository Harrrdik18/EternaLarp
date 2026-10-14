import { useEffect, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays,
  ChevronDown, Compass, Image, Layers3,
  LayoutDashboard, Menu, Settings, Sparkles,
  WandSparkles, X,
} from 'lucide-react'

type DemoTrend = {
  id: number; title: string; category: string; source: string; platforms: string[]
  audience: string; status: string; pop: number; momentum: number; hours: number
  why: string; emoji: string; color: string; score: number; examples: string[]
}
type DemoPost = {
  id: number; title: string; platform: string; date: string; time: string
  status: string; impressions: number; engagement: number
}

const navigation = [
  ['Dashboard', LayoutDashboard], ['Trending', Compass],
  ['Creative Format Finder', Sparkles], ['Ad Creative Generator', WandSparkles],
  ['Find a meme', Sparkles], ['Create content', WandSparkles],
  ['Visual studio', Image], ['Calendar', CalendarDays],
  ['Content library', Layers3], ['Analytics', Activity],
] as const

export default function DemoDashboard({ onSignIn, trends, posts }: {
  onSignIn: () => void; trends: DemoTrend[]; posts: DemoPost[]
}) {
  const [catalogCount, setCatalogCount] = useState<number | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const top = trends.slice(0, 3)
  const published = posts.filter(post => post.status === 'Published')
  const scheduled = posts.filter(post => post.status === 'Scheduled' || post.status === 'Approved')
  const recommendation = top[0]
  const averageFit = trends.length
    ? Math.round(trends.reduce((sum, trend) => sum + trend.score, 0) / trends.length)
    : 0

  useEffect(() => {
    let active = true
    fetch('/api/demo/catalog')
      .then(response => response.json())
      .then(data => { if (active && Array.isArray(data.formats)) setCatalogCount(data.formats.length) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const date = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).toUpperCase()

  return <div className="demo-dashboard demo-legacy-dashboard">
    <div className="demo-shell-layout">
      <aside className="demo-sidebar" aria-label="Demo workspace navigation">
        <div className="demo-sidebar-brand">
          <span className="demo-brand-icon"><Activity size={19}/></span>
          <b>signal<span>.</span></b>
        </div>

        <button className="demo-sidebar-workspace" type="button" onClick={onSignIn} aria-label="Sign in to switch workspaces">
          <span className="demo-workspace-avatar">D</span>
          <span className="demo-workspace-copy"><b>Demo workspace</b><small>Free workspace</small></span>
          <ChevronDown size={16}/>
        </button>

        <button className="demo-mobile-nav-toggle" type="button" aria-expanded={mobileNavOpen}
          aria-controls="demo-workspace-navigation" onClick={() => setMobileNavOpen(open => !open)}>
          {mobileNavOpen ? <X size={17}/> : <Menu size={17}/>}<span>Workspace menu</span>
        </button>

        <nav id="demo-workspace-navigation" className={`demo-navigation ${mobileNavOpen ? 'is-open' : ''}`} aria-label="Workspace">
          <span className="demo-sidebar-label">WORKSPACE</span>
          {navigation.map(([label, Icon], index) => <button key={label} type="button"
            aria-current={index === 0 ? 'page' : undefined}
            className={`demo-nav-item ${index === 0 ? 'active' : ''}`}
            onClick={() => { setMobileNavOpen(false); onSignIn() }}>
            <Icon size={17}/><span>{label}</span>
          </button>)}
        </nav>

        <div className="demo-setup-nav">
          <span className="demo-sidebar-label">SETUP</span>
          <button className="demo-nav-item" type="button" onClick={onSignIn}><Settings size={17}/><span>Brand profile</span></button>
        </div>

        <div className="demo-sidebar-account">
          <span className="demo-account-avatar">P</span>
          <span><b>Demo visitor</b><small>Preview account</small></span>
          <button type="button" onClick={onSignIn}>Sign in</button>
        </div>
      </aside>

      <div className="demo-main-shell">
        <header className="demo-topbar">
          <div className="demo-breadcrumb"><span>Workspace</span><i>/</i><b>Dashboard</b></div>
          <div className="demo-top-actions">
            <span className="demo-sample-pill"><span/> DEMO · SAMPLE DATA</span>
            <button className="button button-primary" type="button" onClick={onSignIn}>Sign in <ArrowRight size={14}/></button>
          </div>
        </header>

        <main className="demo-content">
          <button className="back-link demo-back-link" type="button" onClick={onSignIn}><ArrowLeft size={15}/> Back to sign in</button>
          <div className="demo-sample-banner"><b>Demo preview</b><span>Signals, scores, posts, and performance figures below are sample content.</span></div>

          <div className="welcome-strip demo-welcome-strip">
            <div>
              <span className="eyebrow demo-date"><i/> {date}<span className="demo-date-sep">·</span> YOUR DAILY SIGNAL</span>
              <h1>Good morning, Preview <span>✳</span></h1>
              <p>Here’s what your Signal Studio workspace can look like.</p>
            </div>
            <button className="button button-primary" type="button" onClick={onSignIn}><WandSparkles size={16}/> Create content</button>
          </div>

          <section className="recommendation-banner demo-recommendation">
            <div className="rec-orbit"><Sparkles size={19}/></div>
            <div className="rec-copy">
              <span className="rec-kicker">DEMO · YOUR NEXT BEST MOVE</span>
              <h2>{recommendation?.title || 'Your next post starts with a signal.'}</h2>
              <p>{recommendation ? `${recommendation.why} Illustrative fit score: ${recommendation.score}/100.` : 'The demo catalog has no signals to display.'}</p>
            </div>
            <button type="button" onClick={onSignIn}>Explore the workspace <ArrowRight size={15}/></button>
            <div className="rec-watermark" aria-hidden="true">✳</div>
          </section>

          <div className="dashboard-grid demo-dashboard-grid">
            <section className="dash-main demo-signals" aria-labelledby="demo-signals-heading">
              <div className="block-heading">
                <div><div className="eyebrow">SAMPLE SIGNALS</div><h2 id="demo-signals-heading">Trending for you <span className="live-count">DEMO</span></h2></div>
                <button className="text-link" type="button" onClick={onSignIn}>All signals <ArrowRight size={14}/></button>
              </div>
              <div className="trend-stack">
                {top.map((trend, index) => <article className="trend-row demo-trend-row" key={trend.id}>
                  <span className="trend-rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="trend-visual" style={{ '--trend-color': trend.color } as React.CSSProperties}><span>{trend.emoji}</span></span>
                  <div className="trend-info">
                    <div className="trend-title-line"><h3>{trend.title}</h3><span className="trend-badge">{trend.status}</span></div>
                    <div className="trend-meta">{trend.category} · {trend.audience} · {trend.platforms.join(', ')} · {trend.source}</div>
                  </div>
                  <div className="trend-momentum"><span>ILLUSTRATIVE VELOCITY</span><b>{trend.momentum}</b><div className="meter"><i style={{ width: `${trend.momentum}%` }}/></div></div>
                  <div className="trend-fit"><div className="score-ring" style={{ '--score': `${trend.score * 3.6}deg` } as React.CSSProperties}><div><b>{trend.score}</b><small>fit</small></div></div></div>
                  <span className="trend-lifespan">{trend.hours}h</span>
                  <button className="demo-row-action" type="button" aria-label={`Explore ${trend.title}`} onClick={onSignIn}><ArrowUpRight size={16}/></button>
                </article>)}
                {!top.length && <div className="empty-state">No demo signals are configured.</div>}
              </div>

              <div className="block-heading opportunity-heading">
                <div><div className="eyebrow">SAMPLE CONTENT IDEAS</div><h2>Content opportunities</h2></div>
                <button className="text-link" type="button" onClick={onSignIn}>Explore creative tools <ArrowRight size={14}/></button>
              </div>
              <div className="opportunity-list">{top.map((trend, index) => <article className="opportunity-row" key={trend.id}>
                <span className="op-number">0{index + 1}</span><div className="op-body"><b>{['Caption this', 'Tag your teammate', 'Finish the sentence'][index]}</b><span>{trend.examples[0] || trend.why}</span></div>
                <span className="op-platform">{trend.platforms[0]}</span><button className="op-create" type="button" aria-label="Explore this content idea" onClick={onSignIn}><ArrowUpRight size={15}/></button>
              </article>)}</div>
            </section>

            <aside className="dash-aside demo-overview" aria-labelledby="demo-overview-heading">
              <div className="aside-card signal-summary">
                <div className="aside-title"><div><span className="eyebrow">SIGNAL PULSE · DEMO</span><h3 id="demo-overview-heading">Today at a glance</h3></div><Activity size={18}/></div>
                <div className="pulse-stats">
                  <div><span>Active signals</span><b>{trends.length}</b><em>Illustrative sample</em></div>
                  <div><span>Average brand fit</span><b>{averageFit}<small>/100</small></b><em>Illustrative score</em></div>
                </div>
                <div className="demo-chart">
                  <div className="chart-legend"><span><i/> Illustrative signal activity</span><span>7 day sample</span></div>
                  <svg className="sparkline" viewBox="0 0 350 88" preserveAspectRatio="none" role="img" aria-label="Illustrative sample signal activity over seven days">
                    <defs><linearGradient id="demo-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#df7048" stopOpacity=".2"/><stop offset="100%" stopColor="#df7048" stopOpacity="0"/></linearGradient></defs>
                    <path d="M0 70 C34 62 48 53 78 59 S120 62 150 42 S192 48 220 31 S267 43 294 23 S327 26 350 10 L350 88 L0 88 Z" fill="url(#demo-chart-fill)"/>
                    <path d="M0 70 C34 62 48 53 78 59 S120 62 150 42 S192 48 220 31 S267 43 294 23 S327 26 350 10" fill="none" stroke="#df7048" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
                  </svg>
                </div>
                <button className="aside-footer-link" type="button" onClick={onSignIn}>Open your real workspace <ArrowRight size={14}/></button>
              </div>

              <div className="aside-card upcoming-card">
                <div className="aside-title"><div><span className="eyebrow">SAMPLE CONTENT</span><h3>Calendar preview</h3></div><CalendarDays size={17}/></div>
                {scheduled.slice(0, 3).map(post => <div className="upcoming-item" key={post.id}>
                  <div className="upcoming-date"><b>{new Date(`${post.date}T12:00:00`).getDate()}</b><span>{new Date(`${post.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}</span></div>
                  <div className="upcoming-content"><b>{post.title}</b><span>{post.platform} · {post.time}</span></div><span className="status-dot status-scheduled"/>
                </div>)}
                {!scheduled.length && <div className="empty-inline">No sample calendar items.</div>}
              </div>
              <div className="published-note"><div className="note-icon"><Image size={16}/></div><div><b>Sample publishing summary</b><span>{published.length ? `${published.length} sample posts · ${published.reduce((sum, post) => sum + post.impressions, 0).toLocaleString()} sample impressions` : 'No sample posts'}</span></div></div>
            </aside>
          </div>

          <section className="demo-catalog"><div className="block-heading"><div><span className="eyebrow">ACTUAL WORKSPACE CATALOG</span><h2>Curated formats</h2></div><span className="demo-source">Database count: {catalogCount ?? 'Loading…'}</span></div><p>Catalog records are real. Dashboard signals and account activity above are illustrative.</p></section>
          <footer className="demo-footnote">Demo account preview. Sample activity and performance data do not represent real trends or results.</footer>
        </main>
      </div>
    </div>
  </div>
}
