import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Pool } from 'pg'

const port = Number(process.env.API_PORT || 3001)
const password = process.env.POSTGRES_PASSWORD
const connectionString = process.env.DATABASE_URL || (password
  ? `postgresql://signal:${password}@127.0.0.1:5432/signal_studio`
  : null)
if (!connectionString) throw new Error('Set DATABASE_URL or POSTGRES_PASSWORD in .env')

const pool = new Pool({ connectionString, max: process.env.VERCEL === '1' ? 1 : 5, connectionTimeoutMillis: 4000 })
const scrypt = promisify(scryptCallback)
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30
const sessionCookie = process.env.VERCEL === '1' ? '__Host-signal_session' : 'signal_session'
const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')
if (process.env.VERCEL !== '1') await mkdir(uploadDir, { recursive: true })
const columns = new Set([
  'title','slug','format','category','description','origin','source_url','platforms','audience','keywords',
  'engagement_prompt','example_caption','industries_good','industries_avoid','emotions','tones','use_cases','avoid_situations','content_formats','communities','brand_safe','status','popularity',
  'momentum','estimated_lifespan_hours','starts_at','expires_at','reference_image_url','notes',
])
const arrayFields = new Set(['platforms','keywords','industries_good','industries_avoid','emotions','tones','use_cases','avoid_situations','content_formats','communities'])
const requiredText = new Set(['title','slug','format','category','description','origin','source_url','audience','engagement_prompt','example_caption','reference_image_url','notes','starts_at','expires_at'])

function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data))
}
async function readBody(req, limit = 1_000_000) {
  if (req.body !== undefined) return req.body
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > limit) throw Object.assign(new Error('Request body is too large'), { status: 413 })
  }
  try { return JSON.parse(body || '{}') } catch { throw Object.assign(new Error('Request body must be valid JSON'), { status: 400 }) }
}
function slugify(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
function normalize(input, { partial = false } = {}) {
  const output = {}
  for (const [key, value] of Object.entries(input)) {
    if (!columns.has(key)) continue
    if (arrayFields.has(key)) {
      if (Array.isArray(value)) output[key] = value.map(String).map(v => v.trim()).filter(Boolean)
      else if (typeof value === 'string') output[key] = value.split(',').map(v => v.trim()).filter(Boolean)
      continue
    }
    if (requiredText.has(key)) output[key] = value === '' || value == null ? null : String(value).trim()
    else if (key === 'brand_safe') output[key] = value === true || value === 'true'
    else if (['popularity','momentum','estimated_lifespan_hours'].includes(key)) {
      if (value !== '' && value != null) output[key] = Number(value)
    } else if (key === 'status') output[key] = String(value).toUpperCase()
  }
  if (!partial) {
    output.title ||= ''
    output.slug ||= slugify(output.title)
    output.format ||= ''
    output.category ||= 'Meme'
    output.description ??= ''
    output.platforms ??= []
    output.audience ??= ''
    output.keywords ??= []
    output.engagement_prompt ??= ''
    output.industries_good ??= []
    output.industries_avoid ??= []
    output.brand_safe ??= true
    output.status ??= 'RISING'
    output.popularity ??= 0
    output.momentum ??= 0
    output.notes ??= ''
  }
  if (output.status && !['HOT','RISING','PEAKING','COOLING','DEAD'].includes(output.status)) throw Object.assign(new Error('Choose a valid trend status'), { status: 400 })
  for (const key of ['popularity','momentum']) if (output[key] != null && (!Number.isInteger(output[key]) || output[key] < 0 || output[key] > 100)) throw Object.assign(new Error(`${key} must be an integer from 0 to 100`), { status: 400 })
  if (output.estimated_lifespan_hours != null && (!Number.isInteger(output.estimated_lifespan_hours) || output.estimated_lifespan_hours < 0)) throw Object.assign(new Error('Lifespan must be a non-negative integer'), { status: 400 })
  if (!partial && (!output.title || !output.slug || !output.format)) throw Object.assign(new Error('Title, slug, and format are required'), { status: 400 })
  return output
}
function valuesFor(row) {
  const keys = Object.keys(row)
  return { keys, values: keys.map(key => row[key]) }
}
function routeMatch(path) {
  const match = path.match(/^\/api\/memes\/([0-9a-f-]{36})$/i)
  return match?.[1] || null
}
function parseCookies(req) {
  return Object.fromEntries(String(req.headers?.cookie || '').split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=')
    try { return [part.slice(0,index), decodeURIComponent(part.slice(index+1))] } catch { return ['', ''] }
  }).filter(([key]) => key))
}
function hashToken(token) { return createHash('sha256').update(token).digest('hex') }
function setSessionCookie(res, token, maxAge = SESSION_TTL_SECONDS) {
  const secure = process.env.VERCEL === '1' ? '; Secure' : ''
  res.setHeader('set-cookie', `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`)
}
async function issueSession(userId, res) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
  await pool.query('DELETE FROM auth_sessions WHERE expires_at < now()')
  await pool.query('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [hashToken(token), userId, expiresAt])
  setSessionCookie(res, token)
}
async function authenticatedUser(req) {
  const token = parseCookies(req)[sessionCookie]
  if (!token) return null
  const { rows } = await pool.query(`SELECT u.id,u.email,u.display_name,u.role,s.token_hash FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, [hashToken(token)])
  return rows[0] || null
}
async function passwordHash(password) {
  const salt = randomBytes(16).toString('base64url')
  const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `scrypt$${salt}$${Buffer.from(hash).toString('base64url')}`
}
async function passwordMatches(password, stored) {
  if (!stored) return false
  const [algorithm,salt,encoded] = stored.split('$')
  if (algorithm !== 'scrypt' || !salt || !encoded) return false
  const expected = Buffer.from(encoded, 'base64url')
  const actual = Buffer.from(await scrypt(password, salt, expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
function publicUser(user) { return { id:user.id, email:user.email, display_name:user.display_name, role:user.role || 'viewer' } }

export async function handleApiRequest(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1')
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      await pool.query('SELECT 1')
      return send(res, 200, { ok: true, database: 'connected' })
    }
    if (req.method === 'GET' && url.pathname === '/api/auth/session') {
      const user = await authenticatedUser(req)
      return send(res, 200, { user: user ? publicUser(user) : null })
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
      const input = await readBody(req)
      const displayName = String(input.displayName || '').trim()
      const email = String(input.email || '').trim().toLowerCase()
      const password = String(input.password || '')
      if (displayName.length < 2 || displayName.length > 100) return send(res, 400, { error:'Enter a name between 2 and 100 characters.' })
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error:'Enter a valid email address.' })
      if (password.length < 10 || password.length > 128) return send(res, 400, { error:'Password must be between 10 and 128 characters.' })
      const hash = await passwordHash(password)
      const client = await pool.connect()
      let user
      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(824661981)')
        const { rows:existing } = await client.query("SELECT EXISTS(SELECT 1 FROM users WHERE role IN ('owner','admin')) AS has_owner")
        const role = existing[0].has_owner ? 'viewer' : 'owner'
        const { rows } = await client.query('INSERT INTO users(email,display_name,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email,display_name,role', [email, displayName, hash, role])
        user = rows[0]
        await client.query('COMMIT')
      } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
      await issueSession(user.id, res)
      return send(res, 201, { user:publicUser(user) })
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const input = await readBody(req)
      const email = String(input.email || '').trim().toLowerCase()
      const password = String(input.password || '')
      const { rows } = await pool.query('SELECT id,email,display_name,password_hash,role FROM users WHERE email=$1', [email])
      if (!rows[0] || !(await passwordMatches(password, rows[0].password_hash))) return send(res, 401, { error:'Email or password is incorrect.' })
      await issueSession(rows[0].id, res)
      return send(res, 200, { user:publicUser(rows[0]) })
    }
    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const token = parseCookies(req)[sessionCookie]
      if (token) await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hashToken(token)])
      setSessionCookie(res, '', 0)
      return send(res, 200, { ok:true })
    }
    const publicAuthRoute = url.pathname.startsWith('/api/auth/')
    if (!publicAuthRoute && url.pathname !== '/api/health') {
      const user = await authenticatedUser(req)
      if (!user) return send(res, 401, { error:'Sign in to continue.' })
      req.authUser = publicUser(user)
    }
    if (req.method === 'POST' && url.pathname === '/api/uploads') {
      const { filename, mimeType, data } = await readBody(req, 12_000_000)
      const extensions = { 'image/jpeg':'.jpg', 'image/png':'.png', 'image/webp':'.webp', 'image/gif':'.gif' }
      const extension = extensions[mimeType]
      if (!extension || typeof data !== 'string') return send(res, 400, { error: 'Upload a PNG, JPEG, WebP, or GIF image.' })
      const bytes = Buffer.from(data, 'base64')
      if (!bytes.length || bytes.length > 8_000_000) return send(res, 413, { error: 'Images must be smaller than 8 MB.' })
      const name = `${randomUUID()}${extension}`
      await writeFile(path.join(uploadDir, name), bytes, { flag: 'wx' })
      return send(res, 201, { url:`/api/uploads/${name}`, filename:String(filename || 'reference image').slice(0,160) })
    }
    const uploadedFile = url.pathname.match(/^\/api\/uploads\/([0-9a-f-]{36}\.(?:jpg|png|webp|gif))$/i)?.[1]
    if (req.method === 'GET' && uploadedFile) {
      try {
        const bytes = await readFile(path.join(uploadDir, uploadedFile))
        const mimeType = uploadedFile.endsWith('.jpg') ? 'image/jpeg' : uploadedFile.endsWith('.png') ? 'image/png' : uploadedFile.endsWith('.webp') ? 'image/webp' : 'image/gif'
        res.writeHead(200, { 'content-type':mimeType, 'cache-control':'public, max-age=31536000, immutable', 'x-content-type-options':'nosniff' })
        return res.end(bytes)
      } catch { return send(res, 404, { error:'Image not found' }) }
    }
    if (req.method === 'GET' && url.pathname === '/api/memes') {
      const query = url.searchParams.get('q')?.trim() || null
      const status = url.searchParams.get('status') || null
      const platform = url.searchParams.get('platform') || null
      const { rows } = await pool.query(`
        SELECT * FROM memes
        WHERE ($1::text IS NULL OR title ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%' OR $1 = ANY(keywords))
          AND ($2::text IS NULL OR status = $2)
          AND ($3::text IS NULL OR $3 = ANY(platforms))
        ORDER BY momentum DESC, updated_at DESC, title ASC`, [query, status, platform])
      return send(res, 200, rows)
    }
    if (req.method === 'POST' && url.pathname === '/api/memes/match') {
      const input = await readBody(req)
      if (typeof input.context !== 'string' || input.context.trim().length < 8) return send(res, 400, { error: 'Describe what you are trying to communicate (at least 8 characters).' })
      const { rows } = await pool.query("SELECT * FROM memes WHERE status <> 'DEAD' ORDER BY updated_at DESC")
      const words = text => new Set(String(text || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])
      const contextWords = words([input.context,input.audience,input.goal,input.tone,input.industry].join(' '))
      const ranked = rows.map(meme => {
        const metadata = words([meme.title,meme.description,meme.category,meme.format,meme.audience,meme.keywords,meme.use_cases,meme.content_formats,meme.communities,meme.industries_good].join(' '))
        const overlap = [...contextWords].filter(w => metadata.has(w)).length
        const contextFit = Math.min(98, 48 + overlap * 8)
        const audienceFit = input.audience && `${meme.audience} ${meme.communities}`.toLowerCase().includes(String(input.audience).toLowerCase()) ? 96 : input.audience ? 72 : 82
        const toneFit = input.tone && (meme.tones || []).some(t => t.toLowerCase() === String(input.tone).toLowerCase()) ? 96 : 80
        const formatFit = overlap ? Math.min(96, 68 + overlap * 5) : 70
        const platformFit = input.platform ? (meme.platforms || []).some(p => p.toLowerCase() === String(input.platform).toLowerCase()) ? 96 : 62 : 82
        const industryFit = input.industry ? (meme.industries_good || []).some(i => i.toLowerCase().includes(String(input.industry).toLowerCase())) ? 96 : (meme.industries_avoid || []).some(i => String(input.industry).toLowerCase().includes(i.toLowerCase())) ? 35 : 76 : 82
        const relevance = (contextFit * .34 + audienceFit * .13 + toneFit * .12 + formatFit * .18 + platformFit * .1 + industryFit * .13)
        const momentumBoost = meme.status === 'DEAD' || relevance < 70 ? 0 : Math.min(4, Number(meme.momentum || 0) / 25)
        const score = Math.round(Math.min(98, relevance + momentumBoost))
        const reasons = []
        if (overlap) reasons.push(`Its ${meme.format.toLowerCase()} format connects with details in your context.`)
        if (input.audience) reasons.push(`It can speak to ${input.audience} through ${meme.audience || 'a broad audience'}.`)
        if (input.platform && (meme.platforms || []).includes(input.platform)) reasons.push(`It is a natural fit for ${input.platform}.`)
        if (meme.industries_avoid?.some(i => input.industry && input.industry.toLowerCase().includes(i.toLowerCase()))) reasons.push(`Use care: ${input.industry} is listed as an industry to avoid.`)
        if (!reasons.length) reasons.push('This format is broadly adaptable; tailor the setup to your specific situation.')
        return { meme, score, dimensions: { context:Math.round(contextFit), audience:Math.round(audienceFit), tone:Math.round(toneFit), format:Math.round(formatFit), platform:Math.round(platformFit), brand:Math.round(industryFit), trend:Math.round(meme.momentum || 0) }, reasons, strengths: [meme.format, ...(meme.content_formats || []).slice(0,2), ...(meme.use_cases || []).slice(0,2)], weaknesses: meme.industries_avoid || [], suggestedUse: meme.example_caption || meme.engagement_prompt || `Use ${meme.format.toLowerCase()} to make your point about ${input.context.trim().replace(/[.!?]$/,'')}.` }
      }).filter(r => r.score >= 50).sort((a,b) => b.score-a.score).slice(0,6)
      return send(res, 200, { recommendations: ranked })
    }
    if (req.method === 'POST' && url.pathname === '/api/memes/concept') {
      const { meme, context, brand } = await readBody(req)
      if (!meme || typeof context !== 'string') return send(res, 400, { error: 'Meme and context are required.' })
      const topic = context.trim().replace(/[.!?]$/,'')
      const fmt = `${meme.format || ''} ${(meme.content_formats || []).join(' ')}`.toLowerCase()
      const durations = topic.match(/\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|days?|seconds?|secs?|s|m|h)\b/gi) || []
      const isImprovement = /reduc|cut|faster|from .+ to|automati|finally|shipped|launch/i.test(topic)
      let copy
      if (durations.length >= 2 && isImprovement) copy = `❌ Before: Waiting ${durations[0]} for a deployment.\n\n✅ After: Watching it finish in ${durations[1]}.`
      else if (fmt.includes('expectation') || fmt.includes('reality')) copy = `EXPECTATION\n${topic}\n\nREALITY\nThe messy, relatable part nobody puts in the tutorial.`
      else if (fmt.includes('comparison') || fmt.includes('choice') || fmt.includes('before and after')) copy = `❌ The old way: ${topic}\n\n✅ The better way: The outcome you were trying to reach.`
      else if (fmt.includes('achievement') || fmt.includes('success')) copy = `WHEN ${topic}\n\nThat tiny victory deserves a very unreasonable celebration.`
      else if (fmt.includes('reaction')) copy = `WHEN ${topic.toUpperCase()}\n\nThat moment when it finally clicks.`
      else copy = `SETUP\n${topic}\n\nPUNCHLINE\nThe painfully relatable detail everyone recognizes.`
      return send(res, 200, { title: `${meme.title} · ${brand || 'Your brand'}`, copy, format: meme.format })
    }
    if (req.method === 'POST' && url.pathname === '/api/memes') {
      if (!['owner','admin'].includes(req.authUser?.role)) return send(res, 403, { error:'An owner or admin account is required to edit the meme catalog.' })
      const row = normalize(await readBody(req))
      const { keys, values } = valuesFor(row)
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
      const { rows } = await pool.query(`INSERT INTO memes (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`, values)
      return send(res, 201, rows[0])
    }
    const id = routeMatch(url.pathname)
    if (id && req.method === 'GET') {
      const { rows } = await pool.query('SELECT * FROM memes WHERE id = $1', [id])
      return rows[0] ? send(res, 200, rows[0]) : send(res, 404, { error: 'Meme not found' })
    }
    if (id && req.method === 'PATCH') {
      if (!['owner','admin'].includes(req.authUser?.role)) return send(res, 403, { error:'An owner or admin account is required to edit the meme catalog.' })
      const row = normalize(await readBody(req), { partial: true })
      const { keys, values } = valuesFor(row)
      if (!keys.length) return send(res, 400, { error: 'No editable fields were supplied' })
      const assignments = keys.map((key, i) => `${key} = $${i + 1}`).concat('updated_at = now()').join(', ')
      const { rows } = await pool.query(`UPDATE memes SET ${assignments} WHERE id = $${keys.length + 1} RETURNING *`, [...values, id])
      return rows[0] ? send(res, 200, rows[0]) : send(res, 404, { error: 'Meme not found' })
    }
    if (id && req.method === 'DELETE') {
      if (!['owner','admin'].includes(req.authUser?.role)) return send(res, 403, { error:'An owner or admin account is required to edit the meme catalog.' })
      const { rowCount } = await pool.query('DELETE FROM memes WHERE id = $1', [id])
      return rowCount ? send(res, 200, { deleted: true }) : send(res, 404, { error: 'Meme not found' })
    }
    send(res, 404, { error: 'Route not found' })
  } catch (error) {
    console.error('Signal API request failed', { path:url.pathname, code:error.code || 'UNKNOWN', message:String(error.message || 'Unknown error').slice(0,300) })
    if (error.code === '23505' && url.pathname === '/api/auth/signup') return send(res, 409, { error:'An account with that email already exists. Sign in instead.' })
    if (error.code === '23505') return send(res, 409, { error: 'That slug is already in use. Change it or use a distinct title.' })
    if (error.code === '23514' || error.code === '22P02') return send(res, 400, { error: 'One or more fields are invalid.' })
    send(res, error.status || 500, { error: error.status ? error.message : 'Database request failed. Check that PostgreSQL is running.' })
  }
}

if (process.env.VERCEL !== '1') {
  const server = createServer(handleApiRequest)
  server.listen(port, '127.0.0.1', () => console.log(`Signal meme API listening on http://127.0.0.1:${port}`))
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { server.close(); pool.end() })
}
