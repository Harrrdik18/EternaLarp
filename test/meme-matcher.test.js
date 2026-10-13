import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnoseMemes, matchMemes, matchMemesIntentFreshness, generateConcept } from '../server/meme-matcher.js'

const meme = (overrides = {}) => ({ id:'b', title:'Two Buttons', format:'Choice', description:'Choose between alternatives', keywords:['tradeoff'], use_cases:['Choosing between tools'], content_formats:['choice'], audience:'Developers', communities:['DevOps'], tones:['Relatable'], emotions:['Frustration'], platforms:['LinkedIn'], industries_good:['Developer tools'], industries_avoid:[], avoid_situations:[], brand_safe:true, status:'COOLING', momentum:5, ...overrides })
const brief = { context:'Comparing two deployment workflows and choosing a tool', audience:'Developers', goal:'Explain a change', tone:'Relatable', platform:'LinkedIn', industry:'Developer tools' }

test('ranks contextually fitting candidates and explains grounded matches', () => {
  const [top] = matchMemes(brief, [meme(), meme({ id:'z', title:'Unrelated', format:'Reaction', use_cases:['Celebrating a birthday'], keywords:[], content_formats:[], audience:'Pet owners', communities:[], tones:['Wholesome'], platforms:['Instagram'], industries_good:['Retail'] })])
  assert.equal(top.meme.id, 'b')
  assert.equal(top.confidence, 'high')
  assert.ok(top.reasons.length)
})

test('filters safety, exclusions, platform mismatch, and dead formats', () => {
  const result = matchMemes(brief, [meme({id:'unsafe',brand_safe:false}), meme({id:'industry',industries_avoid:['Developer tools']}), meme({id:'avoid',avoid_situations:['deployment workflow']}), meme({id:'platform',platforms:['TikTok']}), meme({id:'dead',status:'DEAD'})])
  assert.deepEqual(result, [])
})

test('unknown metadata receives no compatibility points and remains low confidence', () => {
  const [result] = matchMemes({context:'Something new and unusual', audience:'People', platform:'Reddit', tone:'Funny', industry:'Robotics'}, [meme({title:'Blank',format:'Unknown',description:'',keywords:[],use_cases:[],content_formats:[],audience:'',communities:[],tones:[],emotions:[],platforms:[],industries_good:[],status:'EVERGREEN'})])
  assert.equal(result.confidence, 'low')
  assert.equal(result.dimensions.platform, undefined)
})

test('tie breaking is stable by database id', () => {
  const items = [meme({id:'z'}), meme({id:'a'})]
  assert.deepEqual(matchMemes(brief, items).map(x=>x.meme.id), ['a','z'])
})

test('comparison concept follows the selected format and preserves supplied details', () => {
  const result = generateConcept(meme(), 'Reduced builds from 20 minutes to 2 minutes', 'Acme')
  assert.match(result.copy, /20 minutes/)
  assert.match(result.copy, /2 minutes/)
  assert.match(result.copy, /Before/)
})

test('debug diagnostics expose weighted factors, missing metadata, compatibility decisions and rank separately', () => {
  const [normal] = matchMemes(brief,[meme()])
  const {recommendations,excluded} = diagnoseMemes(brief,[meme(),meme({id:'x',slug:'blocked',platforms:['TikTok']})])
  assert.equal(normal.diagnostics,undefined)
  assert.equal(recommendations[0].diagnostics.rank,1)
  assert.equal(recommendations[0].diagnostics.components.context.baseWeight,.3)
  assert.equal(recommendations[0].diagnostics.compatibility.platform,'pass')
  assert.ok(excluded.some(item=>item.slug==='blocked'&&item.rejectionReasons.includes('unsupported_platform')))
})

test('measured intent/freshness profile recognizes choosing language without changing weights', () => {
  const brief={context:'Choosing between two project management tools',audience:'Developers',goal:'Drive discussion',tone:'Relatable',platform:'LinkedIn',industry:'Developer tools'}
  const choice=meme({id:'choice',slug:'choice',title:'Two Buttons',format:'Choice',content_formats:['choice'],use_cases:['Difficult choices','Tradeoffs']})
  const reaction=meme({id:'reaction',slug:'reaction',title:'General reaction',format:'Reaction',content_formats:['reaction'],use_cases:['Debugging failures']})
  const baseline=matchMemes(brief,[reaction,choice])
  const experiment=matchMemesIntentFreshness(brief,[reaction,choice])
  assert.equal(baseline[0].meme.slug,'choice')
  assert.equal(experiment[0].meme.slug,'choice')
  assert.ok(experiment[0].score>baseline.find(row=>row.meme.slug==='choice').score)
})

test('AI interpreted patterns only enrich the brief and never bypass compatibility filters',()=>{
  const interpreted={...brief,context:'Discussing two development approaches',communicationPatterns:['choice','comparison']}
  const compatible=meme({id:'compatible',content_formats:['choice']})
  const incompatible=meme({id:'unsafe-ai-choice',brand_safe:false,content_formats:['choice']})
  const results=matchMemesIntentFreshness(interpreted,[compatible,incompatible])
  assert.deepEqual(results.map(result=>result.meme.id),['compatible'])
})
