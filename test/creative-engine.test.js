import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessCreativeStrategy, generateAdIdeas, rankCreativeFormats } from '../server/creative-engine.js'

test('creative API access requires a signed-in workspace role',()=>{
  assert.equal(canAccessCreativeStrategy(null),false)
  assert.equal(canAccessCreativeStrategy({id:'viewer-1',role:'viewer'}),true)
  assert.equal(canAccessCreativeStrategy({id:'owner-1',role:'owner'}),true)
  assert.equal(canAccessCreativeStrategy({id:'other',role:'unknown'}),false)
})

test('format finder ranks relevant evergreen structures and respects platform compatibility',()=>{
  const ranked=rankCreativeFormats({message:'Show a before and after for the product improvement',platform:'LinkedIn',tone:'Professional'})
  assert.equal(ranked[0].id,'before-after')
  assert.ok(ranked.every(item=>!item.platforms.length||item.platforms.includes('LinkedIn')))
  assert.match(ranked[0].explanation,/before and after/i)
})

test('ad generator creates distinct angles and keeps unsupported proof out of copy',()=>{
  const ideas=generateAdIdeas({product:'Ledger app',audience:'freelancers',objective:'reduce admin friction',platform:'LinkedIn',tone:'Professional'})
  assert.ok(ideas.length>=3)
  assert.ok(new Set(ideas.map(idea=>idea.angle)).size===ideas.length)
  assert.ok(ideas.every(idea=>idea.supportingFacts.length===0))
  assert.ok(ideas.every(idea=>idea.claimsToVerify.length>0))
  assert.ok(ideas.every(idea=>!/(\d+%|guarantee|testimonial|customers achieved)/i.test(`${idea.headline} ${idea.copy}`)))
})

test('social proof and personal stories require user-supplied evidence',()=>{
  const empty=generateAdIdeas({product:'Tool',platform:'Instagram'})
  assert.ok(!empty.some(idea=>idea.angle==='Social proof'||idea.angle==='Founder / customer story'))
  const supplied=generateAdIdeas({product:'Tool',platform:'Instagram',proofPoints:['12 verified interviews completed'],storyFacts:'Founder built first prototype in 2024'})
  const social=supplied.find(idea=>idea.angle==='Social proof')
  const story=supplied.find(idea=>idea.angle==='Founder / customer story')
  assert.ok(social?.copy.includes('12 verified interviews completed'))
  assert.ok(story?.claimsToVerify.some(value=>value.includes('2024')))
})

test('explicit audience, platform, tone and restrictions remain available to the strategy draft',()=>{
  const ideas=generateAdIdeas({product:'Calendar',audience:'remote teams',platform:'LinkedIn',tone:'Funny',restrictions:['No guarantees']})
  assert.ok(ideas.length>0)
  assert.ok(ideas.every(idea=>idea.audienceInsight.includes('remote teams')))
  assert.ok(ideas.every(idea=>idea.copy.includes('humor on the situation')))
  assert.ok(ideas.every(idea=>idea.restrictions.includes('No guarantees')))
  assert.ok(ideas.every(idea=>!['TikTok','YouTube'].includes(idea.visualFormat)))
})
