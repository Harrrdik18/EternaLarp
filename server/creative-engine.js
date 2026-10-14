// Curated, evergreen strategy library. Scores order candidates; they are not probabilities.
export const creativeFormats = [
  { id:'before-after', name:'Before / after', description:'Show a verified change or contrast across two states.', platforms:['Instagram','TikTok','LinkedIn','YouTube'], tones:['Relatable','Professional','Funny'], cues:['before','after','change','improved','reduced','faster','old','new'], cautions:['Only show a real, supportable change.'] },
  { id:'pov', name:'POV / relatable situation', description:'Stage a recognizable moment from the audience’s point of view.', platforms:['Instagram','TikTok','X','LinkedIn'], tones:['Relatable','Funny','Wholesome','Professional'], cues:['when','pov','struggle','frustrat','everyday','moment','problem'], cautions:['Keep the scenario respectful and relevant to the audience.'] },
  { id:'myth-fact', name:'Myth vs. fact', description:'State a misconception, then clarify it with a verifiable fact.', platforms:['LinkedIn','Instagram','YouTube','TikTok'], tones:['Professional','Educational','Relatable'], cues:['myth','misconception','fact','wrong','believe','explain'], cautions:['The correction needs a source or approved product fact.'] },
  { id:'problem-solution', name:'Problem / solution', description:'Name a specific problem and show how the offer addresses it.', platforms:['LinkedIn','Instagram','TikTok','YouTube'], tones:['Professional','Relatable','Educational'], cues:['problem','solution','pain','challenge','help','fix','address'], cautions:['Do not imply the product solves outcomes beyond supplied evidence.'] },
  { id:'comparison', name:'Comparison', description:'Compare options using criteria that matter to the audience.', platforms:['LinkedIn','Instagram','X','YouTube'], tones:['Professional','Educational','Funny'], cues:['compare','comparison','versus','vs','choice','alternative'], cautions:['Use fair, verifiable comparison criteria.'] },
  { id:'demonstration', name:'How-to / demonstration', description:'Show the steps or product in use, with clear on-screen actions.', platforms:['TikTok','Instagram','YouTube','LinkedIn'], tones:['Educational','Professional','Relatable'], cues:['how','demo','demonstrat','show','walkthrough','steps','use'], cautions:['Demonstrate only features confirmed in the brief.'] },
  { id:'objection', name:'Objection handling', description:'Address a stated concern directly, without making guarantees.', platforms:['LinkedIn','Instagram','YouTube','X'], tones:['Professional','Educational','Relatable'], cues:['concern','objection','hesitat','worry','risk','expensive','trust'], cautions:['Answer only with approved details; leave unknowns open.'] },
  { id:'story', name:'Storytelling', description:'Use a supported founder, customer, or product moment with a clear arc.', platforms:['LinkedIn','Instagram','TikTok','YouTube'], tones:['Relatable','Professional','Wholesome'], cues:['story','founder','customer','journey','experience','launch'], cautions:['Use real supplied facts; never invent a customer story.'] },
]

export const adAngles = [
  { id:'pain-point', name:'Pain point', insight:'The audience recognizes a specific friction in their current situation.', cues:['problem','pain','struggle','frustrat','challenge','waste','hard'], format:'POV / relatable situation' },
  { id:'desired-outcome', name:'Desired outcome', insight:'Lead with what the audience wants to accomplish, without promising it.', cues:['goal','want','outcome','achieve','grow','save','better'], format:'Before / after' },
  { id:'demonstration', name:'Product demonstration', insight:'A concrete demonstration can make a supplied product detail easier to understand.', cues:['show','demo','how','feature','product','use'], format:'How-to / demonstration' },
  { id:'objection', name:'Objection handling', insight:'Address a stated concern clearly and leave unsupported answers as questions.', cues:['concern','objection','worry','risk','trust','price','expensive'], format:'Objection handling' },
  { id:'comparison', name:'Comparison', insight:'A fair comparison can clarify how the offer differs across relevant criteria.', cues:['compare','versus','vs','alternative','choice'], format:'Comparison' },
  { id:'social-proof', name:'Social proof', insight:'Supplied proof points can support a credible customer or evidence-led message.', cues:['proof','review','testimonial','customer','case study','result'], format:'Storytelling', requiresProof:true },
  { id:'offer-led', name:'Offer-led', insight:'Make the stated offer and its terms easy to understand.', cues:['offer','discount','free','trial','launch','price','sale'], format:'Problem / solution' },
  { id:'myth-correction', name:'Myth correction', insight:'Clarify a stated misconception with a supplied, verifiable fact.', cues:['myth','fact','misconception','believe','wrong'], format:'Myth vs. fact' },
  { id:'founder-story', name:'Founder / customer story', insight:'A real supplied experience can make the product context personal.', cues:['founder','customer','story','journey','experience'], format:'Storytelling', requiresStory:true },
]

const norm = value => String(value || '').toLowerCase()
const matches = (text, cues) => cues.filter(cue => norm(text).includes(cue)).length
export function canAccessCreativeStrategy(user) { return Boolean(user?.id && ['owner','admin','viewer'].includes(user.role)) }
export function rankCreativeFormats(brief, memes = []) {
  const text = `${brief.message || brief.context || ''} ${brief.product || ''} ${brief.goal || ''}`
  const formats = creativeFormats.map(format => {
    const cueHits = matches(text, format.cues)
    const platformFit = !brief.platform || format.platforms.includes(brief.platform)
    const toneFit = !brief.tone || format.tones.includes(brief.tone) || brief.tone === 'Other'
    const score = cueHits * 12 + Number(platformFit) * 5 + Number(toneFit) * 3
    return { id:format.id, name:format.name, type:'content-format', score, explanation:cueHits ? `The brief mentions ${format.cues.filter(c=>norm(text).includes(c)).slice(0,2).join(' and ')}, which fits this structure. ${format.description}` : `${format.description} This is a broad structural option for the brief.`, cautions:format.cautions, platforms:format.platforms, example:`${format.name}: ${brief.message || brief.context || 'Introduce the topic'}${brief.product ? ` — show where ${brief.product} fits using verified details.` : '.'}` }
  }).filter(item => (!brief.platform || item.platforms.includes(brief.platform)))
  const memeCandidates = memes.filter(meme => meme.status !== 'DEAD' && meme.brand_safe !== false).map(meme => {
    const score = matches(text, [...(meme.keywords || []), ...(meme.use_cases || []), ...(meme.content_formats || [])]) * 10 + ((!brief.platform || !(meme.platforms || []).length || meme.platforms.includes(brief.platform)) ? 5 : -50)
    return { id:meme.id, name:meme.title, type:'meme-format', score, explanation:`Catalog format: ${meme.format}. ${meme.description || ''}`.trim(), cautions:[...(meme.avoid_situations || []), ...(meme.industries_avoid || []).map(x=>`Avoid for ${x}`)], platforms:meme.platforms || [], meme }
  }).filter(item => item.score >= 5)
  return [...formats, ...memeCandidates].sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name)).slice(0,10)
}

export function generateAdIdeas(brief) {
  const context = `${brief.product || ''} ${brief.offer || ''} ${brief.objective || ''} ${brief.audience || ''} ${(brief.storyFacts || '')} ${(Array.isArray(brief.proofPoints)?brief.proofPoints:[]).join(' ')}`
  const supplied = [...(Array.isArray(brief.proofPoints) ? brief.proofPoints : []), ...(Array.isArray(brief.approvedClaims) ? brief.approvedClaims : [])].map(x=>String(x).trim()).filter(Boolean).slice(0,12)
  const candidates = adAngles.filter(angle => (!angle.requiresProof || supplied.length) && (!angle.requiresStory || Boolean(brief.storyFacts?.trim()))).map(angle => ({ angle, score:matches(context, angle.cues) + (angle.requiresProof && supplied.length ? 3 : 0) + (angle.requiresStory && brief.storyFacts?.trim() ? 3 : 0) }))
  const platformFormats = { 'Before / after':['Instagram','TikTok','LinkedIn','YouTube'], 'POV / relatable situation':['Instagram','TikTok','X','LinkedIn'], 'Myth vs. fact':['LinkedIn','Instagram','YouTube','TikTok'], 'Problem / solution':['LinkedIn','Instagram','TikTok','YouTube'], Comparison:['LinkedIn','Instagram','X','YouTube'], 'How-to / demonstration':['TikTok','Instagram','YouTube','LinkedIn'], 'Objection handling':['LinkedIn','Instagram','YouTube','X'], Storytelling:['LinkedIn','Instagram','TikTok','YouTube'] }
  const selected = candidates.filter(({angle})=>!brief.platform || (platformFormats[angle.format] || []).includes(brief.platform)).sort((a,b)=>b.score-a.score || a.angle.id.localeCompare(b.angle.id)).slice(0,6)
  return selected.map(({angle}) => {
    const product = brief.product || 'the offer'
    const facts = angle.id === 'social-proof' ? supplied : supplied.slice(0,2)
    const headline = angle.id === 'pain-point' ? `A clearer way to approach ${brief.objective || 'the task'}` : angle.id === 'offer-led' ? (brief.offer || `Explore ${product}`) : angle.id === 'myth-correction' ? `A closer look at what’s true about ${product}` : angle.id === 'founder-story' ? `Why we started building ${product}` : `${product}: see how it fits your workflow`
    const copy = `${brief.audience ? `For ${brief.audience}, ` : ''}${angle.insight} ${facts.length ? `Brief-supplied detail: ${facts.join('; ')}.` : 'Add an approved product detail or proof point here before publishing.'}${brief.tone === 'Funny' ? ' Keep the humor on the situation, not the audience.' : ''}`
    const verifiedLine=facts.length?`Brief-supplied detail: ${facts.join('; ')}.`:'Add an approved product detail or proof point here before publishing.'
    const variants=[
      {headline,copy},
      {headline:`${brief.audience ? `${brief.audience}: ` : ''}${product} in focus`,copy:`${angle.insight} ${verifiedLine}`},
      {headline:`A practical look at ${product}`,copy:`${brief.objective ? `For the objective “${brief.objective}”: ` : ''}${angle.insight} ${verifiedLine}`},
    ]
    const claimsToVerify = facts.length ? facts.map(fact=>`Verify approved wording and evidence for: ${fact}`) : ['No product claims were supplied. Verify all product details before publishing.']
    if (angle.id === 'founder-story' && brief.storyFacts) claimsToVerify.push(`Confirm supplied story details: ${brief.storyFacts}`)
    return { angleId:angle.id, angle:angle.name, audienceInsight:`For ${brief.audience || 'the stated audience'}, ${angle.insight.toLowerCase()}`, rationale:angle.insight, headline, copy, variants, visualFormat:angle.format, cta:brief.offer ? `Explore the offer: ${brief.offer}` : 'Learn more', supportingFacts:facts, restrictions:Array.isArray(brief.restrictions)?brief.restrictions.map(value=>String(value).trim()).filter(Boolean):[], claimsToVerify }
  })
}
