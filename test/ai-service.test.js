import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { generateGemini, generateGroq, generateOpenRouter, AIProviderError, providerAdapters } from '../server/ai/providers.js'
import { getAIConfig, interpretContext, generateConceptVariations, validateInterpretation, validateConcepts, resetAIStateForTests } from '../server/ai/service.js'
import { deterministicVariations } from '../server/ai/concept-fallback.js'
import { matchMemesIntentFreshness } from '../server/meme-matcher.js'

const validInterpretation = { topic:'beginner video mistakes', intent:'promote_content', communicationPatterns:['relatable_struggle','contrast'], audience:'', tone:'Funny', platform:'Instagram', industry:'' }
const response = body => new Response(JSON.stringify(body), { status:200, headers:{'content-type':'application/json'} })
const originalEnv = { ...process.env }
function configureAI({primary='gemini',fallback='groq,openrouter',openrouterModel='test:free'}={}) {
  clearAIEnv()
  process.env.AI_ENABLED='true';process.env.AI_PRIMARY_PROVIDER=primary;process.env.AI_FALLBACK_PROVIDERS=fallback
  process.env.AI_REQUEST_TIMEOUT_MS='100';process.env.AI_TOTAL_TIMEOUT_MS='500';process.env.AI_MAX_RETRIES='0';process.env.AI_CACHE_TTL_SECONDS='300';process.env.AI_ALLOW_PAID_MODELS='false'
  process.env.GEMINI_API_KEY='test-key';process.env.GEMINI_MODEL='gemini-test'
  process.env.GROQ_API_KEY='test-key';process.env.GROQ_MODEL='groq-test'
  process.env.OPENROUTER_API_KEY='test-key';process.env.OPENROUTER_MODEL=openrouterModel
}
function restoreEnv() { for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];Object.assign(process.env,originalEnv);resetAIStateForTests() }
function clearAIEnv() { for (const key of ['AI_ENABLED','AI_PRIMARY_PROVIDER','AI_FALLBACK_PROVIDERS','AI_REQUEST_TIMEOUT_MS','AI_TOTAL_TIMEOUT_MS','AI_MAX_RETRIES','AI_CACHE_TTL_SECONDS','AI_ALLOW_PAID_MODELS','AI_OPENROUTER_SITE_URL','GEMINI_API_KEY','GEMINI_KEY','GEMINI_MODEL','GROQ_API_KEY','GROQ_KEY','GROQ_MODEL','OPENROUTER_API_KEY','OPENROUTER_KEY','OPENROUTER_MODEL']) delete process.env[key] }
afterEach(restoreEnv)

test('Gemini adapter normalizes JSON response and uses native schema configuration', async()=>{
  let sent
  const result=await generateGemini({prompt:'brief',schema:{type:'object',additionalProperties:false,properties:{topic:{type:'string'}}},model:'configured-model',apiKey:'secret',maxOutputTokens:50,signal:new AbortController().signal,fetchImpl:async(url,init)=>{sent={url,init};return response({candidates:[{content:{parts:[{text:'{"topic":"creators"}'}]}}]})}})
  assert.deepEqual(result,{topic:'creators'});assert.match(sent.url,/configured-model/);assert.equal(sent.init.headers['x-goog-api-key'],'secret');assert.equal(JSON.parse(sent.init.body).generationConfig.responseMimeType,'application/json')
})

test('Groq JSON mode and OpenRouter schema mode normalize chat-completion content',async()=>{
  let groqBody,routerBody
  const fake=async(_,init)=>{const body=JSON.parse(init.body);if(init.headers.authorization==='Bearer groq')groqBody=body;else routerBody=body;return response({choices:[{message:{content:'```json\n{"ok":true}\n```'}}]})}
  assert.deepEqual(await generateGroq({prompt:'p',schema:{type:'object'},model:'g-model',apiKey:'groq',signal:new AbortController().signal,fetchImpl:fake}),{ok:true})
  assert.deepEqual(await generateOpenRouter({prompt:'p',schema:{type:'object'},model:'o-model:free',apiKey:'router',signal:new AbortController().signal,fetchImpl:fake}),{ok:true})
  assert.deepEqual(groqBody.response_format,{type:'json_object'});assert.equal(routerBody.response_format.type,'json_schema')
})

test('provider errors normalize rate limits and malformed model responses',async()=>{
  await assert.rejects(generateGroq({prompt:'p',schema:{},model:'m',apiKey:'k',signal:new AbortController().signal,fetchImpl:async()=>new Response('{}',{status:429,headers:{'retry-after':'1'}})}),error=>error instanceof AIProviderError&&error.category==='rate_limit'&&error.retryAfterMs===1000)
  await assert.rejects(generateOpenRouter({prompt:'p',schema:{},model:'m',apiKey:'k',signal:new AbortController().signal,fetchImpl:async()=>response({choices:[{message:{content:'not JSON'}}]})}),error=>error.category==='invalid_response')
})

test('configuration works with one provider and blocks OpenRouter paid models by default',()=>{
  clearAIEnv();process.env.AI_ENABLED='true';process.env.AI_PRIMARY_PROVIDER='openrouter';process.env.OPENROUTER_API_KEY='key';process.env.OPENROUTER_MODEL='provider/model';
  const config=getAIConfig();assert.deepEqual(config.order,['openrouter']);assert.equal(config.allowPaidModels,false)
})

test('no configured providers yields deterministic fallback status without a network call',async()=>{
  clearAIEnv();process.env.AI_ENABLED='true'
  assert.equal((await interpretContext({context:'A sufficiently detailed test brief'})).status,'disabled')
})

test('provider fallback and invalid output validation preserve user supplied fields',async()=>{
  configureAI({primary:'gemini',fallback:'groq'})
  const gemini=providerAdapters.gemini,groq=providerAdapters.groq
  let groqCalls=0
  providerAdapters.gemini=async()=>{throw new AIProviderError('rate_limit',{status:429})}
  providerAdapters.groq=async()=>{groqCalls++;return {...validInterpretation,topic:'creator learning curve',audience:'invented audience',tone:'chaotic',platform:'TikTok',industry:'invented industry'}}
  try {
    const result=await interpretContext({context:'A beginner creator makes a mistake',audience:'My subscribers',tone:'Relatable',platform:'Instagram',industry:''},{userScope:'user-a'})
    assert.equal(result.used,true);assert.equal(result.interpretation.audience,'My subscribers');assert.equal(result.interpretation.tone,'Relatable');assert.equal(result.interpretation.platform,'Instagram');assert.equal(result.interpretation.industry,'');assert.equal(groqCalls,1);assert.equal(result.providerAttempts,2);assert.equal(result.providerErrors,1);assert.equal(result.errorCategory,'rate_limit')
  } finally { providerAdapters.gemini=gemini;providerAdapters.groq=groq }
})

test('transient provider failures retry only within the configured bound',async()=>{
  configureAI({fallback:''});process.env.AI_MAX_RETRIES='1'
  const original=providerAdapters.gemini;let calls=0
  providerAdapters.gemini=async()=>{calls++;if(calls===1)throw new AIProviderError('rate_limit',{retryable:true});return validInterpretation}
  try { const result=await interpretContext({context:'A creator shares a familiar beginner mistake'},{userScope:'retry-user'});assert.equal(result.used,true);assert.equal(result.retryCount,1);assert.equal(calls,2) } finally { providerAdapters.gemini=original }
})

test('timeout and all-provider failures return to deterministic matching',async()=>{
  configureAI()
  const adapters={...providerAdapters};for(const name of Object.keys(providerAdapters))providerAdapters[name]=async()=>{throw Object.assign(new Error('aborted'),{name:'AbortError'})}
  try {
    const result=await interpretContext({context:'A sufficiently detailed brief'},{userScope:'timeout-user'})
    assert.equal(result.interpretation,null);assert.equal(result.status,'unavailable')
    const matches=matchMemesIntentFreshness({context:'A sufficiently detailed brief'},[{id:'x',title:'Match',format:'reaction',status:'EVERGREEN',brand_safe:true,platforms:[]}])
    assert.equal(matches.length,1)
  } finally { Object.assign(providerAdapters,adapters) }
})

test('structured interpretation rejects malformed fields and keeps only known patterns',()=>{
  assert.throws(()=>validateInterpretation({topic:4}),AIProviderError)
  assert.deepEqual(validateInterpretation({...validInterpretation,communicationPatterns:['choice','invented pattern']}).communicationPatterns,['choice'])
})

test('concept output validation and deterministic fallback follow selected meme structure',async()=>{
  assert.throws(()=>validateConcepts({variations:[]}),AIProviderError)
  const meme={id:'m1',title:'Expectation vs Reality',format:'Expectation vs reality',content_formats:['expectation','reality'],platforms:['Instagram'],brand_safe:true}
  const fallback=deterministicVariations(meme,'My first launch plan changed overnight','Studio')
  assert.equal(fallback.variations.length,3);assert.match(fallback.variations[0].copy,/EXPECTATION[\s\S]*REALITY/)
  configureAI()
  const original=providerAdapters.gemini
  providerAdapters.gemini=async()=>({variations:[{type:'relatable',title:'One',copy:'EXPECTATION\nPlan\nREALITY\nPeople change it.'},{type:'funny',title:'Two',copy:'EXPECTATION\nPlan\nREALITY\nChaos.'},{type:'promotional',title:'Three',copy:'EXPECTATION\nPlan\nREALITY\nA verified detail.'}]})
  try { const output=await generateConceptVariations({meme,context:'Plan changes',brand:'Studio',industry:'SaaS',platform:'Instagram',tone:'Funny'},{userScope:'concept-user'});assert.equal(output.variations.length,3);assert.match(output.variations[0].copy,/REALITY/) } finally { providerAdapters.gemini=original }
})

test('interpretation cache separates tenants and includes structured context',async()=>{
  configureAI()
  const original=providerAdapters.gemini;let count=0
  providerAdapters.gemini=async()=>{count++;return validInterpretation}
  try {
    const brief={context:'Same private brief',audience:'',tone:'',platform:'',industry:''}
    await interpretContext(brief,{userScope:'tenant-a'});const cached=await interpretContext(brief,{userScope:'tenant-a'});await interpretContext(brief,{userScope:'tenant-b'});await interpretContext({...brief,platform:'LinkedIn'},{userScope:'tenant-a'})
    assert.equal(cached.cached,true);assert.equal(cached.providerAttempts,0)
    assert.equal(count,3)
  } finally { providerAdapters.gemini=original }
})

test('missing structured constraints are not invented from model output',async()=>{
  configureAI({fallback:''})
  const original=providerAdapters.gemini
  providerAdapters.gemini=async()=>({...validInterpretation,audience:'guessed audience',tone:'guessed tone',platform:'TikTok',industry:'guessed industry'})
  try {
    const result=await interpretContext({context:'A brief without audience or platform details'},{userScope:'blank-fields'})
    assert.deepEqual({audience:result.interpretation.audience,tone:result.interpretation.tone,platform:result.interpretation.platform,industry:result.interpretation.industry},{audience:'',tone:'',platform:'',industry:''})
  } finally { providerAdapters.gemini=original }
})

test('concept requests carry platform and tone while deterministic structures stay format-specific',async()=>{
  const formats=[
    [{title:'Choice',format:'Choice between alternatives',content_formats:['choice']},/✖[\s\S]*✔/],
    [{title:'Expectation',format:'Expectation vs reality',content_formats:['expectation','reality']},/EXPECTATION[\s\S]*REALITY/],
    [{title:'Starter pack',format:'Starter pack',content_formats:['starter pack']},/STARTER PACK[\s\S]*•[\s\S]*•/],
    [{title:'Reaction',format:'Reaction',content_formats:['reaction']},/WHEN[\s\S]*\n\n/],
  ]
  for(const [meme,pattern] of formats){
    const fallback=deterministicVariations(meme,'A familiar workflow moment', 'Studio')
    assert.equal(fallback.variations.length,3);assert.match(fallback.variations[0].copy,pattern)
  }
  configureAI({fallback:''})
  const original=providerAdapters.gemini;let prompt=''
  try {
    providerAdapters.gemini=async request=>{prompt=request.prompt;return {variations:[{type:'relatable',title:'One',copy:'WHEN the upload fails.\n\nThat familiar creator reaction.'},{type:'funny',title:'Two',copy:'WHEN the upload fails again.\n\nThe familiar retry.'},{type:'promotional',title:'Three',copy:'WHEN the upload fails.\n\nMention a verified tool detail here.'}]}}
    const result=await generateConceptVariations({meme:{title:'Reaction',format:'Reaction',content_formats:['reaction']},context:'Creator reacts to a failed upload',platform:'Instagram',tone:'Wholesome',audience:'Creators'}, {userScope:'format-prompt'})
    assert.equal(result.variations.length,3)
    assert.match(prompt,/Platform: Instagram/);assert.match(prompt,/desired tone: Wholesome/);assert.match(prompt,/Do not invent claims/)
  } finally {providerAdapters.gemini=original}
})

test('concept output with unsupported numeric claims is rejected for deterministic fallback',async()=>{
  configureAI({fallback:''})
  const original=providerAdapters.gemini
  providerAdapters.gemini=async()=>({variations:[{type:'relatable',title:'One',copy:'We saved 10 hours.'},{type:'funny',title:'Two',copy:'We saved 10 hours again.'},{type:'promotional',title:'Three',copy:'We saved 10 hours every week.'}]})
  try {
    const result=await generateConceptVariations({meme:{title:'Two choices',format:'Choice',content_formats:['choice']},context:'We reduced the wait from 20 minutes to 2 minutes',platform:'LinkedIn',tone:'Relatable'},{userScope:'unsupported-claim'})
    assert.equal(result.variations,null);assert.equal(result.status,'unavailable')
    const safeFallback=deterministicVariations({title:'Two choices',format:'Choice',content_formats:['choice']},'We reduced the wait from 20 minutes to 2 minutes')
    assert.equal(safeFallback.variations.length,3);assert.doesNotMatch(safeFallback.variations[0].copy,/10 hours/)
  } finally {providerAdapters.gemini=original}
})

test('concept cache keys include platform, brand, and selected meme metadata',async()=>{
  configureAI()
  const original=providerAdapters.gemini;let count=0
  providerAdapters.gemini=async()=>{count++;return {variations:[{type:'relatable',title:'One',copy:'Old way\n\nNew way, relatable.'},{type:'funny',title:'Two',copy:'Old way\n\nNew way, funny.'},{type:'promotional',title:'Three',copy:'Old way\n\nNew way, verified benefit.'}]}}
  try {
    const input={meme:{id:'meme-a',title:'Two Choices',format:'Choice',content_formats:['choice']},context:'A private brief',brand:'Northstar',industry:'Developer tools',audience:'Developers',platform:'LinkedIn',tone:'Relatable',brandTone:'Technical'}
    await generateConceptVariations(input,{userScope:'tenant-a'});await generateConceptVariations(input,{userScope:'tenant-a'});await generateConceptVariations({...input,platform:'Instagram'},{userScope:'tenant-a'});await generateConceptVariations({...input,brand:'Different brand'},{userScope:'tenant-a'});await generateConceptVariations({...input,meme:{...input.meme,title:'Another choice meme'}},{userScope:'tenant-a'})
    assert.equal(count,4)
  } finally { providerAdapters.gemini=original }
})

