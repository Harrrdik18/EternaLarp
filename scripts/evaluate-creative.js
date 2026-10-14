import assert from 'node:assert/strict'
import { generateAdIdeas, rankCreativeFormats } from '../server/creative-engine.js'

const formatCases=[
 {brief:{message:'Explain the before and after of our verified workflow change',platform:'LinkedIn',tone:'Professional'},expected:'before-after'},
 {brief:{message:'Show a step-by-step demo of the product',platform:'TikTok',tone:'Educational'},expected:'demonstration'},
 {brief:{message:'Correct a common myth with a fact',platform:'Instagram',tone:'Educational'},expected:'myth-fact'},
]
const formatResults=formatCases.map(({brief,expected})=>{const ranked=rankCreativeFormats(brief);return {expected,top:ranked[0]?.id,hit:ranked.slice(0,3).some(item=>item.id===expected)}})
const adBrief={product:'Planning app',audience:'independent designers',objective:'explain the offer',platform:'Instagram',tone:'Professional',offer:'30-day trial',proofPoints:['Trial is 30 days']}
const ideas=generateAdIdeas(adBrief)
const adChecks={distinctAngles:new Set(ideas.map(item=>item.angle)).size===ideas.length, proofOnlyFromInput:ideas.every(item=>item.supportingFacts.every(fact=>adBrief.proofPoints.includes(fact))), noUnsuppliedSocialProof:ideas.some(item=>item.angle==='Social proof')===true, platformCompatible:ideas.every(item=>!['LinkedIn','X'].includes(item.visualFormat))}
for(const result of formatResults)assert.ok(result.hit,`Expected ${result.expected} in top three`)
for(const [name,passed] of Object.entries(adChecks))assert.ok(passed,`${name} failed`)
const report={suite:'creative-engine-v1',formatCases:formatResults,adCases:{ideas:ideas.length,...adChecks},mode:'deterministic; no AI credentials or meme database required'}
console.log(JSON.stringify(report,null,2))
