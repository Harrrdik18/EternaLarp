import { Activity, ArrowDown, ArrowRight, Check, CircleHelp, Image, MessageSquareText, Sparkles, Target } from 'lucide-react'

type Props = {
  onStart: (mode: 'login' | 'signup') => void
  onFindMeme: () => void
}

const steps = [
  { number: '01', icon: MessageSquareText, title: 'Tell us what you’re posting', text: 'Describe the idea, audience, or message behind your content.' },
  { number: '02', icon: Target, title: 'Find a meme that fits', text: 'Get format recommendations with a clear reason each one fits.' },
  { number: '03', icon: Image, title: 'Make it your own', text: 'Adapt the copy for your voice, then shape it into a visual.' },
]

const useCases = [
  { label: 'YOUTUBE CREATOR', title: 'Turn a lesson into a laugh.', text: 'Make creator advice easier to recognize, remember, and share.', tag: 'Video idea → meme angle' },
  { label: 'SAAS COMPANY', title: 'Make product truths relatable.', text: 'Translate a familiar customer problem into a social post people get.', tag: 'Product insight → post' },
  { label: 'PERSONAL BRAND', title: 'Sound like yourself online.', text: 'Find a format that carries your point without losing your voice.', tag: 'Your perspective → visual' },
]

export default function LandingPage({ onStart, onFindMeme }: Props) {
  return <main className="landing-page">
    <nav className="landing-nav" aria-label="Main navigation">
      <a className="landing-brand" href="#top" aria-label="Signal home"><span className="mark-icon"><Activity size={17}/></span><b>signal<span>.</span></b></a>
      <div className="landing-nav-links"><a href="#workflow">How it works</a><a href="#use-cases">Who it’s for</a></div>
      <div className="landing-nav-actions"><button className="landing-login" onClick={()=>onStart('login')}>Sign in</button><button className="landing-cta small" onClick={()=>onStart('signup')}>Get started <ArrowRight size={14}/></button></div>
    </nav>
    <section className="landing-hero" id="top">
      <div className="landing-hero-copy">
        <div className="landing-eyebrow"><i/> MEME INTELLIGENCE FOR MARKETING</div>
        <h1>Find the meme.<br/><em>Make it yours.</em></h1>
        <p>Tell Signal what you're trying to say. Discover the right meme format, adapt it to your brand, and turn internet culture into content people relate to.</p>
        <div className="landing-hero-actions"><button className="landing-cta" onClick={onFindMeme}>Find your meme <ArrowRight size={16}/></button><a href="#workflow">See how it works <ArrowDown size={15}/></a></div>
        <div className="landing-note"><Check size={14}/> Start with a free workspace.</div>
      </div>
      <div className="landing-preview-wrap" aria-label="Illustrative contextual meme match preview">
        <div className="landing-preview-label"><span className="landing-pulse"/> A MATCH THAT GETS THE CONTEXT</div>
        <div className="match-preview">
          <div className="match-preview-top"><div className="preview-logo"><span className="mark-icon"><Activity size={13}/></span><b>signal<span>.</span></b></div><span className="illustrative-label">ILLUSTRATIVE EXAMPLE</span></div>
          <div className="match-context"><span className="match-step">YOUR CONTEXT</span><p>“I made a video about mistakes new YouTubers make.”</p><div className="context-meta"><span><CircleHelp size={12}/> Looking for a relatable format</span><span>Creator content</span></div></div>
          <div className="match-result-head"><span className="match-step">TOP FORMAT MATCH</span><span className="match-score">94<small> / 100</small></span></div>
          <div className="meme-result">
            <div className="meme-art" aria-hidden="true"><div className="meme-panel meme-reject"><span>✕</span><div className="meme-figure"><i/><b/></div><small>BUYING EXPENSIVE GEAR<br/>BEFORE UPLOADING</small></div><div className="meme-panel meme-approve"><span>✓</span><div className="meme-figure"><i/><b/></div><small>ACTUALLY PUBLISHING<br/>YOUR FIRST VIDEO</small></div></div>
            <div className="meme-result-caption"><strong>Drake Hotline Bling</strong><span>Two-panel reaction · Works for contrast</span></div>
          </div>
          <div className="match-why"><span className="why-icon"><Sparkles size={14}/></span><p>Works well for contrasting what new creators think matters with what actually helps them grow.</p></div>
          <div className="match-secondary"><span className="secondary-mark">↗</span><span><small>ANOTHER ANGLE</small><b>Expectation vs. reality</b></span><span className="secondary-fit">Strong fit</span></div>
          <div className="match-preview-foot"><span><i/> Context matched to a format</span><span>EXAMPLE PREVIEW</span></div>
        </div>
      </div>
    </section>
    <section className="landing-proofline"><span>FROM YOUR CONTEXT TO CONTENT THAT CONNECTS</span><div>Describe <b>·</b> Match <b>·</b> Understand <b>·</b> Create</div></section>
    <section className="landing-workflow" id="workflow"><div className="landing-section-intro"><span className="landing-eyebrow">A BETTER STARTING POINT FOR EVERY POST</span><h2>Bring the context.<br/><em>Find your format.</em></h2><p>Signal connects what you want to say with the meme formats people already understand.</p></div><div className="landing-steps">{steps.map(({number,icon:Icon,title,text})=><article key={number}><div className="step-icon"><Icon size={18}/><span>{number}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="landing-feature" id="use-cases"><div className="use-case-intro"><span className="landing-eyebrow">MADE FOR PEOPLE WITH SOMETHING TO SAY</span><h2>Different voices.<br/><em>Better-fit memes.</em></h2><p>Whether you’re building an audience, a company, or a point of view, start with what you want people to understand.</p><button className="landing-text-link" onClick={onFindMeme}>Find your meme <ArrowRight size={15}/></button></div><div className="use-case-list">{useCases.map((item,index)=><article className="use-case-card" key={item.label}><span className="use-case-number">0{index+1}</span><div><small>{item.label}</small><h3>{item.title}</h3><p>{item.text}</p><span className="use-case-tag">{item.tag}</span></div><ArrowRight size={15}/></article>)}</div></section>
    <section className="landing-bottom-cta"><span className="landing-eyebrow">START WITH WHAT YOU WANT TO SAY</span><h2>Find the meme.<br/><em>Make the message yours.</em></h2><button className="landing-cta" onClick={onFindMeme}>Find your meme <ArrowRight size={16}/></button><div className="landing-note"><Check size={14}/> Start with a free workspace.</div></section>
    <footer className="landing-footer"><a className="landing-brand" href="#top"><span className="mark-icon"><Activity size={15}/></span><b>signal<span>.</span></b></a><span>Meme intelligence for marketing.</span><button onClick={()=>onStart('login')}>Already have an account? Sign in <ArrowRight size={13}/></button></footer>
  </main>
}
