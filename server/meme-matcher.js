const weights = { context: .30, format: .20, audience: .15, tone: .10, platform: .10, brand: .10, freshness: .05 }
const terms = value => String(value || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []
const text = values => values.flat(Infinity).filter(Boolean).join(' ')
const overlap = (query, source) => {
  const q = new Set(terms(query)), s = new Set(terms(source))
  if (!q.size || !s.size) return null
  const hit = [...q].filter(word => s.has(word)).length
  return Math.min(100, Math.round(hit / Math.min(q.size, 5) * 100))
}
const contains = (list, value) => (list || []).some(x => String(value || '').toLowerCase().includes(String(x).toLowerCase()) || String(x).toLowerCase().includes(String(value || '').toLowerCase()))
export function interpretBrief(input) {
  const context = [input.context, input.topic, input.goal].filter(Boolean).join(' ')
  const lower = context.toLowerCase()
  const pattern = interpretedPattern(input.communicationPatterns) || (/\b(compare|versus|vs\.?|instead|replace|from .+ to)\b/.test(lower) ? 'comparison'
    : /\b(frustrat|annoy|struggle|mistake|fail|hard|difficult|bug)\w*/.test(lower) ? 'frustration'
    : /\b(surpris|unexpected|suddenly|didn't expect)\w*/.test(lower) ? 'surprise'
    : /\b(celebrat|milestone|achievement|win|success)\w*/.test(lower) ? 'achievement'
    : /\b(relatable|everyday|when you|experience|learning)\w*/.test(lower) ? 'relatable experience' : '')
  return { context, pattern, audience: input.audience || '', tone: input.tone || '', platform: input.platform || '', industry: input.industry || '' }
}

function interpretedPattern(patterns) {
  const values = Array.isArray(patterns) ? patterns.map(value => String(value).toLowerCase()) : []
  const map = [
    [/choice|alternative|choosing/, 'choice'],
    [/contrast|comparison|product_comparison|old.?way|before.?after/, 'comparison'],
    [/expectation|reality/, 'expectation'],
    [/frustrat|struggle|failure|fail/, 'frustration'],
    [/surpris|unexpected/, 'surprise'],
    [/celebrat|achievement|milestone/, 'achievement'],
    [/relatable|everyday/, 'relatable experience'],
    [/reaction/, 'reaction'],
    [/educational_content/, 'educational content'],
    [/announcement/, 'announcement'],
    [/storytelling/, 'storytelling'],
    [/escalation/, 'escalation'],
  ]
  for (const [matcher, pattern] of map) if (values.some(value => matcher.test(value))) return pattern
  return ''
}

function scoreCandidates(input, candidates, limit, diagnostics, options = {}) {
  const brief = interpretBrief(input)
  if (options.patternOverride) brief.pattern = options.patternOverride
  const ranked = []
  const excluded = []
  for (const meme of candidates) {
    const checks = { retrieved: true, status: meme.status || 'unknown', brandSafety: meme.brand_safe == null ? 'unknown' : meme.brand_safe ? 'pass' : 'fail', platform: (meme.platforms || []).length ? (brief.platform && !contains(meme.platforms, brief.platform) ? 'fail' : 'pass') : 'unknown', industry: (meme.industries_avoid || []).length && brief.industry && contains(meme.industries_avoid, brief.industry) ? 'fail' : (meme.industries_good || []).length ? 'pass' : 'unknown', avoidSituation: (meme.avoid_situations || []).length && brief.context && contains(meme.avoid_situations, brief.context) ? 'fail' : (meme.avoid_situations || []).length ? 'pass' : 'unknown' }
    const rejectionReasons = []
    if (meme.status === 'DEAD') rejectionReasons.push('dead_status')
    if (meme.brand_safe === false) rejectionReasons.push('brand_unsafe')
    if (brief.industry && contains(meme.industries_avoid, brief.industry)) rejectionReasons.push('industry_exclusion')
    if (brief.platform && (meme.platforms || []).length && !contains(meme.platforms, brief.platform)) rejectionReasons.push('unsupported_platform')
    if (brief.context && contains(meme.avoid_situations, brief.context)) rejectionReasons.push('avoid_situation')
    if (rejectionReasons.length) {
      if (diagnostics) excluded.push({ memeId: meme.id, slug: meme.slug, title: meme.title, checks, rejectionReasons, metadata: metadataStatus(meme) })
      continue
    }
    const fields = [meme.title, meme.format, meme.description, meme.keywords, meme.use_cases, meme.content_formats, meme.engagement_prompt]
    const corpus = text(fields)
    const context = overlap(brief.context, corpus)
    const format = brief.pattern ? (contains([meme.format, meme.content_formats], brief.pattern) ? 100 : overlap(brief.pattern, text([meme.format, meme.content_formats, meme.use_cases]))) : null
    const audience = brief.audience ? overlap(brief.audience, text([meme.audience, meme.communities])) : null
    const tone = brief.tone ? overlap(brief.tone, text([meme.tones, meme.emotions])) : null
    const platform = brief.platform ? ((meme.platforms || []).length ? 100 : null) : null
    const brand = brief.industry ? (contains(meme.industries_good, brief.industry) ? 100 : (meme.industries_good || []).length ? overlap(brief.industry, meme.industries_good) : null) : null
    const freshnessRaw = meme.status === 'HOT' || meme.status === 'RISING' ? Number(meme.momentum) || 0 : meme.status === 'PEAKING' ? Math.min(Number(meme.momentum) || 0, 60) : null
    const freshness = options.freshnessGate && (context ?? 0) < 40 ? null : freshnessRaw
    const parts = { context, format, audience, tone, platform, brand, freshness }
    let earned = 0, available = 0
    for (const [key, weight] of Object.entries(weights)) if (parts[key] != null) { earned += parts[key] * weight; available += weight }
    const score = available ? Math.round(earned / available) : 0
    const known = [context, format, audience, tone, platform, brand].filter(v => v != null).length
    const confidence = score >= 68 && known >= 3 ? 'high' : score >= 42 && known >= 2 ? 'medium' : 'low'
    const reasons = []
    if (context != null && context >= 25) reasons.push(`Its use cases connect with “${input.context.trim().slice(0, 100)}”.`)
    if (brief.pattern && format != null && format >= 40) reasons.push(`Its ${meme.format} structure supports a ${brief.pattern} message.`)
    if (audience != null && audience >= 20) reasons.push(`Its audience or community metadata overlaps with ${brief.audience}.`)
    if (platform != null) reasons.push((meme.platforms || []).length ? `The catalog lists ${brief.platform} as a compatible platform.` : `Platform compatibility is not documented for ${brief.platform}.`)
    if (!reasons.length) reasons.push('Catalog metadata provides only a limited match; treat this as an option to review.')
    const cautions = [...(meme.avoid_situations || []).filter(x => overlap(brief.context, x) >= 20), ...(meme.industries_avoid || []).filter(x => overlap(brief.industry, x) >= 20)]
    const components = Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, { value: value == null ? null : Math.round(value), baseWeight: weights[key], effectiveWeight: value == null || !available ? null : Math.round(weights[key] / available * 10000) / 10000, weightedContribution: value == null ? null : Math.round(value * weights[key] * 100) / 100, normalizedContribution: value == null || !available ? null : Math.round(value * weights[key] / available * 100) / 100, metadataPresent: value != null }]))
    ranked.push({ meme, score, confidence, reasons, cautions, suggestedUse: meme.example_caption || meme.engagement_prompt || `Adapt the ${meme.format} format to: ${input.context.trim()}`, dimensions: Object.fromEntries(Object.entries(parts).filter(([,v]) => v != null).map(([k,v]) => [k, Math.round(v)])), strengths: [meme.format, ...(meme.use_cases || []).slice(0, 2)], weaknesses: cautions, ...(diagnostics ? { diagnostics: { rank: 0, components, availableWeight: Math.round(available * 100) / 100, weightedScore: Math.round(earned * 100) / 100, finalScore: score, confidenceInputs: { knownFactors: known, scoredFactors: Object.values(parts).filter(v => v != null).length }, retrievalSignals: { catalogCandidate: true, titleOrFormat: Boolean(meme.title || meme.format), useCaseMetadata: Boolean(meme.use_cases?.length), keywordMetadata: Boolean(meme.keywords?.length) }, compatibility: checks, missingMetadata: metadataStatus(meme), appliedPenalties: [] } } : {}) })
  }
  ranked.sort((a,b) => b.score-a.score || String(a.meme.id).localeCompare(String(b.meme.id)))
  const recommendations = ranked.slice(0, limit)
  if (recommendations.length && recommendations[0].score < 30) recommendations[0].confidence = 'low'
  recommendations.forEach((item, index) => { if (item.diagnostics) item.diagnostics.rank = index + 1 })
  return diagnostics ? { recommendations, excluded } : recommendations
}

function metadataStatus(meme) {
  const fields = { use_cases: meme.use_cases, communication_formats: meme.content_formats, audience: meme.audience, tone_or_emotion: [...(meme.tones || []), ...(meme.emotions || [])], platforms: meme.platforms, safety_constraints: [...(meme.avoid_situations || []), ...(meme.industries_avoid || [])] }
  return Object.entries(fields).filter(([, value]) => !value || (Array.isArray(value) ? !value.length : !String(value).trim())).map(([field]) => field)
}

export function matchMemes(input, candidates, limit = 5) { return scoreCandidates(input, candidates, limit, false) }
export function diagnoseMemes(input, candidates, limit = 5, options = {}) { return scoreCandidates(input, candidates, limit, true, options) }
export function matchMemesIntentFreshness(input, candidates, limit = 5) {
  const interpreted = interpretBrief(input)
  const choiceAlias = /\b(choos(?:e|es|ing|en)|between|alternatives?)\b/i.test(`${input.context || ''} ${input.goal || ''}`) && !interpreted.pattern
  return scoreCandidates(input,candidates,limit,false,{patternOverride:choiceAlias?'choice':null,freshnessGate:true})
}
export function memeMetadataStatus(meme) { return metadataStatus(meme) }

export function generateConcept(meme, context, brand = '') {
  const topic = context.trim().replace(/[.!?]$/, '')
  const format = `${meme.format || ''} ${(meme.content_formats || []).join(' ')}`.toLowerCase()
  const times = topic.match(/\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|days?|seconds?|secs?|s|m|h)\b/gi) || []
  let copy
  if ((format.includes('comparison') || format.includes('choice')) && times.length >= 2) copy = `✖ Before: Waiting ${times[0]} for the outcome.\n\n✔ After: Getting there in ${times[1]}.`
  else if (/expectation|reality/.test(format)) copy = `EXPECTATION\n${topic}\n\nREALITY\nThe part of the process people recognize.`
  else if (/comparison|choice|before and after/.test(format)) copy = `✖ The old way: ${topic}\n\n✔ The better way: The outcome you were trying to reach.`
  else if (/achievement|success/.test(format)) copy = `WHEN ${topic}\n\nThat small win deserves a celebration.`
  else if (/reaction|frustration/.test(format)) copy = `WHEN ${topic.toUpperCase()}\n\nThat moment everyone in the situation recognizes.`
  else if (/starter pack|relatable/.test(format)) copy = `THE ${brand ? brand.toUpperCase() + ' ' : ''}STARTER PACK\n• ${topic}\n• The workaround you know too well\n• One small win that keeps you going`
  else copy = `SETUP\n${topic}\n\nPUNCHLINE\nThe familiar detail that makes the situation click.`
  return { title: `${meme.title} · ${brand || 'Your brand'}`, copy, format: meme.format }
}
