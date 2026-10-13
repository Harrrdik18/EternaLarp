const transientStatus = status => status === 408 || status === 429 || status >= 500

export class AIProviderError extends Error {
  constructor(category, { status = 0, retryAfterMs = 0, retryable = false } = {}) {
    super(category)
    this.name = 'AIProviderError'
    this.category = category
    this.status = status
    this.retryAfterMs = retryAfterMs
    this.retryable = retryable
  }
}

function parseRetryAfter(value) {
  if (!value) return 0
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, 3000))
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 3000)) : 0
}

async function responseJson(response) {
  if (!response.ok) {
    throw new AIProviderError(response.status === 401 || response.status === 403 ? 'authentication' : response.status === 429 ? 'rate_limit' : response.status === 400 || response.status === 404 ? 'configuration' : response.status >= 500 ? 'temporary' : 'provider_error', {
      status: response.status,
      retryAfterMs: parseRetryAfter(response.headers?.get?.('retry-after')),
      retryable: transientStatus(response.status),
    })
  }
  try { return await response.json() } catch { throw new AIProviderError('invalid_response') }
}

function parseContent(content) {
  if (typeof content !== 'string') throw new AIProviderError('invalid_response')
  const clean = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try { return JSON.parse(clean) } catch { throw new AIProviderError('invalid_response', { retryable: true }) }
}

function headersWithAuth(key, extra = {}) { return { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...extra } }

export async function generateGemini({ prompt, schema, model, apiKey, maxOutputTokens, signal, fetchImpl = fetch }) {
  const geminiSchema = JSON.parse(JSON.stringify(schema, (key, value) => ['additionalProperties', 'minItems', 'maxItems'].includes(key) ? undefined : value))
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema, maxOutputTokens } }),
  })
  const data = await responseJson(response)
  return parseContent(data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join(''))
}

async function generateOpenAICompatible({ endpoint, headers = {}, prompt, schema, model, apiKey, maxOutputTokens, signal, fetchImpl = fetch, structuredOutput = true }) {
  const response = await fetchImpl(endpoint, {
    method: 'POST', signal, headers: headersWithAuth(apiKey, headers),
    body: JSON.stringify({ model, messages: [{ role: 'system', content: `Return a JSON object only, conforming to this JSON Schema. Do not add fields: ${JSON.stringify(schema)}` }, { role: 'user', content: prompt }], response_format: structuredOutput ? { type: 'json_schema', json_schema: { name: 'signal_studio_result', strict: true, schema } } : { type: 'json_object' }, max_tokens: maxOutputTokens, temperature: 0.7 }),
  })
  const data = await responseJson(response)
  return parseContent(data.choices?.[0]?.message?.content)
}

export function generateGroq(options) {
  return generateOpenAICompatible({ ...options, structuredOutput: false, endpoint: 'https://api.groq.com/openai/v1/chat/completions' })
}

export function generateOpenRouter(options) {
  return generateOpenAICompatible({ ...options, endpoint: 'https://openrouter.ai/api/v1/chat/completions', headers: { 'HTTP-Referer': process.env.AI_OPENROUTER_SITE_URL || 'https://signal-studio.local', 'X-Title': 'Signal Studio' } })
}

export const providerAdapters = { gemini: generateGemini, groq: generateGroq, openrouter: generateOpenRouter }
