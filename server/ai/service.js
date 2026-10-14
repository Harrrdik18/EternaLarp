import { createHash } from 'node:crypto'
import { providerAdapters, AIProviderError } from './providers.js'

const PROMPT_VERSION = 'signal-ai-v1'
const providers = ['gemini', 'groq', 'openrouter']
const cache = new Map()
const usage = new Map()
let active = 0
const MAX_CACHE_ENTRIES = 300
const MAX_CONCURRENT = 4

export const interpretationSchema = {
  type: 'object', additionalProperties: false,
  properties: { topic: { type: 'string' }, intent: { type: 'string' }, communicationPatterns: { type: 'array', items: { type: 'string' } }, audience: { type: 'string' }, tone: { type: 'string' }, platform: { type: 'string' }, industry: { type: 'string' } },
  required: ['topic', 'intent', 'communicationPatterns', 'audience', 'tone', 'platform', 'industry'],
}

export const conceptSchema = {
  type: 'object', additionalProperties: false,
  properties: { variations: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false, properties: { type: { type: 'string' }, title: { type: 'string' }, copy: { type: 'string' } }, required: ['type', 'title', 'copy'] } } },
  required: ['variations'],
}

const string = (value, max = 200) => typeof value === 'string' && value.trim().length <= max
const clean = value => typeof value === 'string' ? value.trim() : ''
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const safePatterns = new Set(['comparison', 'choice', 'contrast', 'expectation_vs_reality', 'frustration', 'surprise', 'achievement', 'failure', 'relatable_struggle', 'relatable_experience', 'product_comparison', 'educational_content', 'announcement', 'storytelling', 'reaction', 'before_after', 'escalation'])

export function validateInterpretation(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AIProviderError('invalid_output', { retryable: true })
  for (const key of ['topic', 'intent', 'audience', 'tone', 'platform', 'industry']) if (!string(raw[key], key === 'topic' ? 300 : 120)) throw new AIProviderError('invalid_output', { retryable: true })
  if (!Array.isArray(raw.communicationPatterns) || raw.communicationPatterns.length > 6 || raw.communicationPatterns.some(value => typeof value !== 'string' || value.length > 60)) throw new AIProviderError('invalid_output', { retryable: true })
  return { topic: clean(raw.topic), intent: clean(raw.intent), communicationPatterns: raw.communicationPatterns.map(value => value.toLowerCase().replace(/[^a-z0-9_ -]/g, '').trim().replace(/\s+/g, '_')).filter(value => safePatterns.has(value)).slice(0, 4), audience: clean(raw.audience), tone: clean(raw.tone), platform: clean(raw.platform), industry: clean(raw.industry) }
}

export function validateConcepts(raw) {
  const allowedTypes = new Set(['relatable', 'funny', 'promotional'])
  if (!raw || !Array.isArray(raw.variations) || raw.variations.length !== 3) throw new AIProviderError('invalid_output', { retryable: true })
  const variations = raw.variations.map(item => {
    if (!item || !allowedTypes.has(item.type) || !string(item.title, 120) || !item.title.trim() || !string(item.copy, 1200) || !item.copy.trim()) throw new AIProviderError('invalid_output', { retryable: true })
    return { type: item.type, title: item.title.trim(), copy: item.copy.trim() }
  })
  if (new Set(variations.map(item => item.type)).size !== 3 || new Set(variations.map(item => item.copy)).size < 2) throw new AIProviderError('invalid_output', { retryable: true })
  return variations
}

export function getAIConfig(env = process.env) {
  const enabled = env.AI_ENABLED === 'true'
  const configs = Object.fromEntries(providers.map(provider => {
    const prefix = provider === 'gemini' ? 'GEMINI' : provider.toUpperCase()
    const key = env[`${prefix}_API_KEY`] || env[`${prefix}_KEY`] || ''
    const model = env[`${prefix}_MODEL`] || ''
    return [provider, key && model ? { apiKey: key, model } : null]
  }))
  const primary = env.AI_PRIMARY_PROVIDER || 'gemini'
  const fallback = env.AI_FALLBACK_PROVIDERS === undefined ? providers.filter(provider => provider !== primary).join(',') : env.AI_FALLBACK_PROVIDERS
  const preferred = [primary, ...fallback.split(',').map(x => x.trim())]
  const order = [...new Set(preferred.filter(provider => providers.includes(provider)))].filter(provider => configs[provider])
  return { enabled, configs, order, timeoutMs: clamp(env.AI_REQUEST_TIMEOUT_MS, 5000, 1000, 20000), totalTimeoutMs: clamp(env.AI_TOTAL_TIMEOUT_MS, 12000, 2000, 30000), retries: clamp(env.AI_MAX_RETRIES, 1, 0, 2), cacheTtlMs: clamp(env.AI_CACHE_TTL_SECONDS, 300, 0, 3600) * 1000, maxOutputTokens: 700, maxRequestsPerWindow: clamp(env.AI_MAX_REQUESTS_PER_WINDOW, 20, 1, 100), allowPaidModels: env.AI_ALLOW_PAID_MODELS === 'true' }
}
function clamp(value, fallback, min, max) { const n = Number(value); return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback }

function logEvent(event) { console.info('signal-ai', JSON.stringify(event)) }
function getCached(key, ttl) {
  if (!ttl) return null
  const item = cache.get(key)
  if (!item || Date.now() - item.time > ttl) { if (item) cache.delete(key); return null }
  return item.value
}
function setCached(key, value, ttl) {
  if (!ttl) return
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value)
  cache.set(key, { time: Date.now(), value })
}
function withinUserLimit(userScope, maxRequests) {
  const now = Date.now(), bucket = usage.get(userScope)
  if (usage.size > 2000) for (const [key, item] of usage) if (now - item.startedAt >= 10 * 60_000) usage.delete(key)
  if (!bucket || now - bucket.startedAt >= 10 * 60_000) { usage.set(userScope, { startedAt: now, count: 1 }); return true }
  if (bucket.count >= maxRequests) return false
  bucket.count += 1
  return true
}
function acquire() {
  if (active >= MAX_CONCURRENT) return false
  active += 1
  return true
}
function release() { active = Math.max(0, active - 1) }

async function generate(task, prompt, schema, validator, { userScope = 'anonymous', cacheInput, maxOutputTokens = 700 } = {}) {
  const startedAt = Date.now()
  const config = getAIConfig()
  const unavailable = { value: null, status: config.enabled && config.order.length ? 'unavailable' : 'disabled', used: false, cached: false, providerAttempts: 0, providerErrors: 0, errorCategory: null }
  if (!config.enabled || !config.order.length) return { ...unavailable, latencyMs: 0 }
  const cacheKey = hash({ version: PROMPT_VERSION, task, userScope, cacheInput, providers: config.order.map(name => [name, config.configs[name].model]) })
  const cached = getCached(cacheKey, config.cacheTtlMs)
  if (cached) { logEvent({ task, cacheHit: true, result: 'success' }); return { value: cached, status: 'used', used: true, cached: true, providerAttempts: 0, providerErrors: 0, errorCategory: null, latencyMs: 0 } }
  const withinLimit = withinUserLimit(userScope, config.maxRequestsPerWindow)
  const acquired = withinLimit && acquire()
  if (!acquired) {
    logEvent({ task, cacheHit: false, result: !withinLimit ? 'rate_limited_local' : 'concurrency_limited' })
    return { ...unavailable, status: 'limited', errorCategory: !withinLimit ? 'local_rate_limit' : 'local_concurrency_limit', latencyMs: Date.now() - startedAt }
  }
  try {
    let providerAttempts = 0
    let providerErrors = 0
    let errorCategory = null
    for (const provider of config.order) {
      if (Date.now() >= startedAt + config.totalTimeoutMs) break
      const credentials = config.configs[provider]
      if (provider === 'openrouter' && !config.allowPaidModels && !credentials.model.endsWith(':free')) {
        logEvent({ provider, model: credentials.model, task, latencyMs: 0, result: 'paid_model_blocked', retryCount: 0, cacheHit: false })
        continue
      }
      for (let retry = 0; retry <= config.retries; retry += 1) {
        const remainingMs = startedAt + config.totalTimeoutMs - Date.now()
        if (remainingMs <= 0) break
        const started = Date.now()
        providerAttempts += 1
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, remainingMs))
        try {
          const raw = await providerAdapters[provider]({ prompt, schema, model: credentials.model, apiKey: credentials.apiKey, maxOutputTokens, signal: controller.signal })
          const value = validator(raw)
          setCached(cacheKey, value, config.cacheTtlMs)
          logEvent({ provider, model: credentials.model, task, latencyMs: Date.now() - started, result: 'success', retryCount: retry, cacheHit: false })
          return { value, status: 'used', used: true, cached: false, provider, retryCount: retry, providerAttempts, providerErrors, errorCategory, providerLatencyMs: Date.now() - started, latencyMs: Date.now() - startedAt }
        } catch (error) {
          const normalized = error instanceof AIProviderError ? error : error?.name === 'AbortError' ? new AIProviderError('timeout', { retryable: true }) : new AIProviderError('network', { retryable: true })
          providerErrors += 1
          errorCategory = normalized.category
          logEvent({ provider, model: credentials.model, task, latencyMs: Date.now() - started, result: normalized.category, retryCount: retry, cacheHit: false })
          if (normalized.retryable && retry < config.retries) {
            if (normalized.retryAfterMs) await new Promise(resolve => setTimeout(resolve, normalized.retryAfterMs))
            continue
          }
          break
        } finally { clearTimeout(timer) }
      }
    }
    return { ...unavailable, providerAttempts, providerErrors, errorCategory, latencyMs: Date.now() - startedAt }
  } finally { release() }
}

function explicitWins(input, inferred, key) {
  // Structured user fields remain authoritative. Do not let a model fill an
  // empty audience/platform/industry/tone with a guess that changes matching.
  return clean(input[key])
}

export async function interpretContext(input, options = {}) {
  const text = [input.context, input.goal, input.audience, input.industry].filter(Boolean).join('\n')
  if (!string(text, 4000)) return { interpretation: null, status: 'invalid', used: false, latencyMs: 0 }
  const fields = ['audience', 'tone', 'platform', 'industry'].map(key => `${key}: ${input[key] || '(not supplied; leave blank unless directly stated)'}`).join('\n')
  const prompt = `Interpret the user's meme brief for a deterministic catalog matcher. Infer communication pattern from meaning, not keyword listing. Never invent specific audience, platform, or industry when absent. Return empty strings for unknown fields. Preserve the meaning of all explicit fields. Allowed pattern labels include comparison, choice, contrast, expectation_vs_reality, frustration, surprise, achievement, failure, relatable_struggle, relatable_experience, product_comparison, educational_content, announcement, storytelling, reaction, before_after, escalation.\nUser brief: ${text.slice(0, 4000)}\nExplicit structured fields:\n${fields}\nReturn topic, intent, communicationPatterns, audience, tone, platform, industry.`
  const result = await generate('interpretation', prompt, interpretationSchema, validateInterpretation, { ...options, cacheInput: { input, userScope: options.userScope }, maxOutputTokens: 350 })
  if (!result.value) return { interpretation: null, status: result.status, used: false, provider: result.provider, retryCount: result.retryCount || 0, cached: result.cached || false, providerAttempts: result.providerAttempts || 0, providerErrors: result.providerErrors || 0, errorCategory: result.errorCategory || null, providerLatencyMs: result.providerLatencyMs ?? null, latencyMs: result.latencyMs }
  const inferred = result.value
  return { interpretation: { ...inferred, audience: explicitWins(input, inferred, 'audience'), tone: explicitWins(input, inferred, 'tone'), platform: explicitWins(input, inferred, 'platform'), industry: explicitWins(input, inferred, 'industry') }, status: result.status, used: true, provider: result.provider, retryCount: result.retryCount || 0, cached: result.cached || false, providerAttempts: result.providerAttempts || 0, providerErrors: result.providerErrors || 0, errorCategory: result.errorCategory || null, providerLatencyMs: result.providerLatencyMs ?? null, latencyMs: result.latencyMs }
}

export async function generateConceptVariations(input, options = {}) {
  const meme = input.meme
  const metadata = Object.fromEntries(['title', 'format', 'description', 'keywords', 'content_formats', 'use_cases', 'example_caption', 'engagement_prompt', 'audience', 'communities', 'platforms', 'tones', 'emotions', 'industries_good', 'industries_avoid', 'brand_safe', 'avoid_situations'].map(key => [key, meme[key] ?? null]))
  const format = `${meme.format || ''} ${(meme.content_formats || []).join(' ')}`.toLowerCase()
  const validateForFormat = raw => {
    const variations = validateConcepts(raw)
    const briefNumbers = new Set(input.context.match(/\b\d+(?:[.,]\d+)?%?\b/g) || [])
    if (variations.some(item => (item.copy.match(/\b\d+(?:[.,]\d+)?%?\b/g) || []).some(number => !briefNumbers.has(number)))) throw new AIProviderError('invalid_output', { retryable: true })
    const followsStructure = variations.every(item => {
      if (/expectation|reality/.test(format)) return /expectation/i.test(item.copy) && /reality/i.test(item.copy)
      if (/starter pack/.test(format)) return (item.copy.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)])/g) || []).length >= 2
      if (/choice|comparison|before and after/.test(format)) return /(?:✖|❌|reject|instead|old way|before)[\s\S]*(?:✔|✅|approve|choose|new way|after)/i.test(item.copy) || item.copy.split(/\n\s*\n/).length >= 2
      if (/reaction|frustration|fail/.test(format)) return item.copy.split(/\n\s*\n/).filter(part => part.trim()).length >= 2
      return true
    })
    if (!followsStructure) throw new AIProviderError('invalid_output', { retryable: true })
    return variations
  }
  const prompt = `Create exactly three editable meme copy variations for the supplied catalog format. Types must be relatable, funny, promotional. Follow the template structure stated by format: expectation/reality must label both parts; choice/comparison must show both alternatives; starter pack must use a list; reaction/frustration must have a setup paragraph and a distinct response paragraph. Do not force a two-part layout unless the format uses one. Platform: ${input.platform || '(unspecified)'}; audience: ${input.audience || '(unspecified)'}; desired tone: ${input.tone || '(unspecified)'}; brand tone: ${input.brandTone || '(unspecified)'}; brand context: ${input.brand || '(none)'}; industry: ${input.industry || '(unspecified)'}. User context: ${input.context.slice(0, 4000)}. Selected catalog meme metadata: ${JSON.stringify(metadata)}. Do not invent claims, numbers, product capabilities, audiences, or live-trend facts. Keep copy concise and suitable for the platform. Respect avoid_situations and safety metadata. Return variations [{type,title,copy}].`
  const result = await generate('concept', prompt, conceptSchema, validateForFormat, { ...options, cacheInput: { meme: metadata, context: input.context, platform: input.platform || '', audience: input.audience || '', tone: input.tone || '', brandTone: input.brandTone || '', brand: input.brand || '', industry: input.industry || '', userScope: options.userScope }, maxOutputTokens: 900 })
  return { variations: result.value, status: result.status, used: result.used || false }
}

export function resetAIStateForTests() { cache.clear(); usage.clear(); active = 0 }
