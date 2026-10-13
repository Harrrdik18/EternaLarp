import { Pool } from 'pg'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { diagnoseMemes, matchMemesIntentFreshness, memeMetadataStatus, interpretBrief } from '../server/meme-matcher.js'
import { getAIConfig, interpretContext } from '../server/ai/service.js'

const connectionString = process.env.DATABASE_URL || (process.env.POSTGRES_PASSWORD ? `postgresql://signal:${process.env.POSTGRES_PASSWORD}@127.0.0.1:5432/signal_studio` : null)
if (!connectionString) throw new Error('Set DATABASE_URL or POSTGRES_PASSWORD in .env')
const pool = new Pool({ connectionString, max: 2 })
const cases = [
  ['creator','I keep making beginner mistakes while learning to edit videos','Creators','Promote content','Relatable','Instagram','Creator tools',['expectation-vs-reality','pov-creator-learning-curve']],
  ['creator','Celebrate reaching my first 100 subscribers','YouTube creators','Celebrate a win','Wholesome','YouTube','Creator tools',['pov-creator-learning-curve']],
  ['creator','A relatable struggle of recording a video five times','Aspiring creators','Share a relatable moment','Funny','TikTok','Entertainment',['pov-creator-learning-curve','expectation-vs-reality']],
  ['creator','Compare planning every shot with improvising a short','Video creators','Explain a change','Funny','Instagram','Creator tools',['drake-hotline-bling','two-buttons']],
  ['creator','Creator starter pack for people filming alone','Creators','Drive discussion','Funny','Instagram','Entertainment',['starter-pack','pov-creator-learning-curve']],
  ['creator','Unexpected editing problem ruins the planned timeline','Creators','Share a relatable moment','Chaotic','TikTok','Entertainment',['expectation-vs-reality']],
  ['saas','We replaced spreadsheets with one shared customer dashboard','Startup teams','Promote a product improvement','Relatable','LinkedIn','SaaS',['drake-hotline-bling']],
  ['saas','Launching a new feature after months of iteration','Product teams','Announce a launch','Funny','X','SaaS',['success-kid']],
  ['saas','The awkward gap between a launch plan and launch day','Startup founders','Share a relatable moment','Funny','LinkedIn','SaaS',['expectation-vs-reality']],
  ['saas','Choosing between building custom or using a managed tool','Product managers','Drive discussion','Relatable','LinkedIn','SaaS',['drake-hotline-bling']],
  ['saas','A small customer support workflow win','SaaS teams','Celebrate a win','Wholesome','LinkedIn','SaaS',['success-kid','drake-hotline-bling']],
  ['saas','An unexpected customer request changes the roadmap','Product teams','Explain a change','Chaotic','X','SaaS',['this-is-fine']],
  ['developer','Reduced deployment time from 20 minutes to 2 minutes','Software developers','Promote a product improvement','Relatable','LinkedIn','Developer tools',['drake-hotline-bling']],
  ['developer','The build finally passes after a long debugging session','Developers','Celebrate a win','Funny','X','Developer tools',['deploy-finally-worked','success-kid']],
  ['developer','Choosing readable code or a clever one-liner','Developers','Drive discussion','Sarcastic','Reddit','Developer tools',['two-buttons','distracted-boyfriend']],
  ['developer','A production incident is getting worse every minute','DevOps teams','Share a relatable moment','Chaotic','Reddit','Developer tools',['this-is-fine','among-us-emergency-meeting']],
  ['developer','Developer tools starter pack for a new project','Developers','Promote content','Funny','Reddit','Developer tools',['starter-pack','wojak']],
  ['developer','Replacing manual releases with automated pipelines','Engineering teams','Explain a change','Relatable','LinkedIn','Developer tools',['drake-hotline-bling']],
  ['gaming','The patch notes say small fix and the whole game changes','Gamers','Share a relatable moment','Chaotic','YouTube','Gaming',['among-us-emergency-meeting','expectation-vs-reality']],
  ['gaming','Finally defeating a boss after many attempts','Gamers','Celebrate a win','Funny','TikTok','Gaming',[]],
  ['gaming','Choosing stealth or charging into the mission','Gamers','Drive discussion','Funny','Reddit','Gaming',['two-buttons','distracted-boyfriend']],
  ['gaming','Unexpected matchmaking chaos with friends','Streamers','Share a relatable moment','Chaotic','Instagram','Gaming',['among-us-emergency-meeting','wojak']],
  ['gaming','A cozy game moment that made the whole week better','Gaming community','Promote content','Wholesome','Instagram','Gaming',['doge','success-kid']],
  ['gaming','The expectation of a smooth launch versus actual queue times','Players','Explain a change','Funny','X','Gaming',['this-is-fine']],
  ['personal','I keep putting off the project I care about most','Personal brand audience','Share a relatable moment','Relatable','Instagram','Education',['two-buttons','wojak']],
  ['personal','A small milestone after months of consistent practice','Followers','Celebrate a win','Wholesome','LinkedIn','Education',['success-kid']],
  ['personal','My morning routine expectation compared with reality','General audience','Promote content','Funny','Instagram','Lifestyle',['expectation-vs-reality','starter-pack']],
  ['personal','A playful opinion about keeping too many browser tabs open','Online community','Drive discussion','Sarcastic','X','Technology',['change-my-mind','wojak']],
  ['personal','The messy learning curve of starting a newsletter','New writers','Share a relatable moment','Relatable','LinkedIn','Education',['expectation-vs-reality']],
  ['marketing','Choosing a concise headline over a clever one','Marketing teams','Drive discussion','Funny','LinkedIn','Marketing',['drake-hotline-bling']],
  ['marketing','Campaign results surprised the team in a good way','Marketing teams','Celebrate a win','Wholesome','Instagram','Marketing',['success-kid','doge']],
  ['marketing','A harmless hot take about meeting-free afternoons','Professionals','Drive discussion','Sarcastic','Reddit','SaaS',['change-my-mind','starter-pack']],
  ['marketing','Replacing a long signup flow with a simpler one','Product marketers','Promote a product improvement','Relatable','LinkedIn','SaaS',['drake-hotline-bling']],
  ['marketing','The chaotic scramble before a campaign goes live','Marketing teams','Share a relatable moment','Chaotic','X','Marketing',['this-is-fine']],
  ['marketing','A familiar team habit everyone recognizes','General audience','Promote content','Funny','Instagram','Retail',['starter-pack','expectation-vs-reality']],
  ['general','A respectful memorial message after a colleague dies','Coworkers','Share a serious announcement','Professional','LinkedIn','General marketing',[]],
]

try {
  const { rows } = await pool.query('SELECT * FROM memes ORDER BY id LIMIT 300')
  if (!rows.length) throw new Error('Meme catalog is empty; run npm run db:seed first.')
  const catalogVersion = createHash('sha256').update(JSON.stringify(rows.map(({id,slug,title,format,description,platforms,audience,keywords,use_cases,content_formats,communities,tones,emotions,industries_good,industries_avoid,avoid_situations,brand_safe,status,momentum}) => ({id,slug,title,format,description,platforms,audience,keywords,use_cases,content_formats,communities,tones,emotions,industries_good,industries_avoid,avoid_situations,brand_safe,status,momentum})))).digest('hex')
  const args = new Set(process.argv.slice(2))
  const reports = cases.map(([group,context,audience,goal,tone,platform,industry,expected], caseId) => {
    const brief = { context,audience,goal,tone,platform,industry }
    const { recommendations:allRanked, excluded } = diagnoseMemes(brief, rows, rows.length)
    const recommendations = allRanked.slice(0,5)
    const top3 = recommendations.slice(0,3)
    const hits = top3.filter(r => expected.includes(r.meme.slug)).length
    const expectedExcluded=excluded.filter(item=>expected.includes(item.slug))
    const catalogPresent = expected.filter(slug => rows.some(row => row.slug === slug && row.status !== 'DEAD'))
    const supported = catalogPresent.filter(slug=>allRanked.some(item=>item.meme.slug===slug))
    const compact = item => ({ meme:{id:item.meme.id,slug:item.meme.slug,title:item.meme.title,format:item.meme.format,description:item.meme.description,platforms:item.meme.platforms,audience:item.meme.audience,use_cases:item.meme.use_cases,content_formats:item.meme.content_formats,tones:item.meme.tones,emotions:item.meme.emotions,industries_good:item.meme.industries_good,industries_avoid:item.meme.industries_avoid,avoid_situations:item.meme.avoid_situations,brand_safe:item.meme.brand_safe,status:item.meme.status,momentum:item.meme.momentum},score:item.score,confidence:item.confidence,reasons:item.reasons,diagnostics:item.diagnostics})
    const expectedCandidateTrace=allRanked.filter(item=>expected.includes(item.meme.slug)).map(compact)
    const partialMatch=(list,value)=>(list||[]).some(item=>String(value||'').toLowerCase().includes(String(item).toLowerCase())||String(item).toLowerCase().includes(String(value||'').toLowerCase()))
    const independentlyIncompatible=rows.filter(row=>row.status==='DEAD'||row.brand_safe===false||(platform&&(row.platforms||[]).length&&!partialMatch(row.platforms,platform))||(industry&&partialMatch(row.industries_avoid,industry))||(context&&partialMatch(row.avoid_situations,context)))
    const recommendedIds=new Set(allRanked.map(item=>item.meme.id))
    const compatibilityErrors=independentlyIncompatible.filter(row=>recommendedIds.has(row.id)).map(row=>({memeId:row.id,slug:row.slug,reason:'independent safety/platform/industry/avoid rule matched but candidate was returned'}))
    const failureDiagnosis=expected.length===0?'catalog_has_no_labeled_suitable_candidate':expectedExcluded.length?'evaluation_label_conflicts_with_hard_compatibility':catalogPresent.length===0?'expected_label_not_found_in_catalog':!Boolean(top3[0]&&expected.includes(top3[0].meme.slug))?'ranking_failure':'top1_relevant_but_top3_has_unjudged_or_irrelevant_results'
    const interpretationGaps=expectedCandidateTrace.filter(item=>item.diagnostics.components.format.value==null || item.diagnostics.components.context.value<40).map(item=>({slug:item.meme.slug,formatScore:item.diagnostics.components.format.value,contextScore:item.diagnostics.components.context.value,missing:item.diagnostics.missingMetadata}))
    return { caseId:`brief-${String(caseId+1).padStart(2,'0')}`, group, brief, expectedSuitableSlugs:expected, expectedUnavailableSlugs:expected.filter(slug => !catalogPresent.includes(slug)), expectedRejectedByCompatibility:expectedExcluded.map(item=>({slug:item.slug,reasons:item.rejectionReasons})), expectedMissingFromTop5:expected.filter(slug => !recommendations.slice(0,5).some(row => row.meme.slug === slug)), relevantInTop3:hits, precisionAt3:hits/3, legacyPrecisionAt3:top3.length ? hits/top3.length : 0, top1Relevant:Boolean(top3[0] && expected.includes(top3[0].meme.slug)), covered:supported.length>0, noSuitableCatalogCandidate:supported.length===0, failureDiagnosis, interpretationGaps, recommendations:recommendations.map(compact), expectedCandidateTrace, candidateTrace:allRanked.map(item=>({memeId:item.meme.id,slug:item.meme.slug,title:item.meme.title,score:item.score,confidence:item.confidence,diagnostics:item.diagnostics})), excluded, compatibilityChecks:independentlyIncompatible.length, compatibilityErrors, missingMetadata:rows.map(row=>({memeId:row.id,slug:row.slug,missing:memeMetadataStatus(row)})).filter(row=>row.missing.length) }
  })
  const filtered = reports.filter(row => {
    const filter = [...args].find(arg => arg.startsWith('--industry='))?.slice(11)
    const audience = [...args].find(arg => arg.startsWith('--audience='))?.slice(11)
    return (!filter || row.brief.industry.toLowerCase().includes(filter.toLowerCase())) && (!audience || row.brief.audience.toLowerCase().includes(audience.toLowerCase())) && (!args.has('--failed-top1') || !row.top1Relevant) && (!args.has('--low-p3') || row.precisionAt3 < .34) && (!args.has('--missing-metadata') || row.missingMetadata.length>0) && (!args.has('--compatibility-errors') || row.compatibilityErrors.length>0)
  })
  const metric = list => { const checks=list.reduce((s,x)=>s+(x.compatibilityChecks||0),0), errors=list.reduce((s,x)=>s+(x.compatibilityErrors||[]).length,0); return { briefs:list.length, precisionAt3:list.length ? Number((list.reduce((s,x)=>s+x.precisionAt3,0)/list.length).toFixed(3)) : null, legacyPrecisionAt3:list.length ? Number((list.reduce((s,x)=>s+x.legacyPrecisionAt3,0)/list.length).toFixed(3)) : null, top1Relevance:list.length ? Number((list.filter(x=>x.top1Relevant).length/list.length).toFixed(3)) : null, coverage:list.length ? Number((list.filter(x=>x.covered).length/list.length).toFixed(3)) : null, exclusionCorrectness:checks ? Number(((checks-errors)/checks).toFixed(3)) : null, compatibilityChecks:checks } }
  const byAudience = Object.fromEntries([...new Set(filtered.map(x=>x.brief.audience))].map(key=>[key,metric(filtered.filter(x=>x.brief.audience===key))]))
  const byIndustry = Object.fromEntries([...new Set(filtered.map(x=>x.brief.industry))].map(key=>[key,metric(filtered.filter(x=>x.brief.industry===key))]))
  const experimentRows = (name, optionsFor, usesProductionProfile=false) => {
    const evaluated = cases.map(([group,context,audience,goal,tone,platform,industry,expected], index) => {
      const brief={context,audience,goal,tone,platform,industry}
      const opts=optionsFor(brief)
      const recommendations=usesProductionProfile?matchMemesIntentFreshness(brief,rows,5):diagnoseMemes(brief,rows,5,opts).recommendations
      const hits=recommendations.slice(0,3).filter(item=>expected.includes(item.meme.slug)).length
      const original=reports[index]
      return {caseId:original.caseId,group,brief,expected,precisionAt3:hits/3,legacyPrecisionAt3:recommendations.length?hits/Math.min(3,recommendations.length):0,top1Relevant:Boolean(recommendations[0]&&expected.includes(recommendations[0].meme.slug)),covered:original.covered,compatibilityChecks:original.compatibilityChecks,compatibilityErrors:original.compatibilityErrors,top3:recommendations.slice(0,3).map(item=>item.meme.slug)}
    }).filter(row=>filtered.some(item=>item.caseId===row.caseId))
    const baselineById=new Map(filtered.map(row=>[row.caseId,row]))
    const changed=evaluated.map(row=>({row,base:baselineById.get(row.caseId)})).filter(({row,base})=>row.top1Relevant!==base.top1Relevant||row.precisionAt3!==base.precisionAt3)
    return {name,metrics:metric(evaluated),perGroup:Object.fromEntries([...new Set(evaluated.map(x=>x.group))].map(key=>[key,metric(evaluated.filter(x=>x.group===key))])),improved:changed.filter(({row,base})=>row.precisionAt3>base.precisionAt3||row.top1Relevant&&!base.top1Relevant).map(({row})=>({caseId:row.caseId,brief:row.brief,top3:row.top3,precisionAt3:row.precisionAt3})),regressed:changed.filter(({row,base})=>row.precisionAt3<base.precisionAt3||!row.top1Relevant&&base.top1Relevant).map(({row})=>({caseId:row.caseId,brief:row.brief,top3:row.top3,precisionAt3:row.precisionAt3}))}
  }
  const choiceAlias = brief => /\b(choos(?:e|es|ing|en)|between|alternatives?)\b/i.test(`${brief.context} ${brief.goal}`) && !interpretBrief(brief).pattern ? {patternOverride:'choice'} : {}
  const experiments = [
    experimentRows('choice-intent-alias',choiceAlias),
    experimentRows('gate-freshness-when-context-overlap-is-below-40',()=>({freshnessGate:true})),
    experimentRows('choice-alias-plus-freshness-gate',brief=>({...choiceAlias(brief),freshnessGate:true}),true),
  ]
  let aiEvaluation = { status:'not_requested', reason:'Pass --with-ai to make live provider calls.' }
  if (args.has('--with-ai')) {
    const aiConfig = getAIConfig()
    if (!aiConfig.enabled || !aiConfig.order.length) aiEvaluation = { status:'unavailable', reason:'AI is enabled only when at least one provider key and model are configured; no deterministic-only results are presented as AI evaluation.' }
    else {
      if (!process.env.AI_MAX_REQUESTS_PER_WINDOW) process.env.AI_MAX_REQUESTS_PER_WINDOW='50'
      const aiCases=[]
      const partialMatchAI=(list,value)=>(list||[]).some(item=>String(value||'').toLowerCase().includes(String(item).toLowerCase())||String(item).toLowerCase().includes(String(value||'').toLowerCase()))
      for (let index=0;index<cases.length;index++) {
        const [group,context,audience,goal,tone,platform,industry,expected]=cases[index]
        const brief={context,audience,goal,tone,platform,industry}
        const started=Date.now()
        const result=await interpretContext(brief,{userScope:'explicit-evaluation-run'})
        const interpreted=result.interpretation?{...brief,...result.interpretation,audience:brief.audience||result.interpretation.audience,tone:brief.tone||result.interpretation.tone,platform:brief.platform||result.interpretation.platform,industry:brief.industry||result.interpretation.industry,goal:brief.goal||result.interpretation.intent}:brief
        const {recommendations:ranked,excluded}=diagnoseMemes(interpreted,rows,rows.length)
        const top3=ranked.slice(0,3), hits=top3.filter(item=>expected.includes(item.meme.slug)).length
        const catalogPresent=expected.filter(slug=>rows.some(row=>row.slug===slug&&row.status!=='DEAD'))
        const supported=catalogPresent.filter(slug=>ranked.some(item=>item.meme.slug===slug))
        const incompatible=rows.filter(row=>row.status==='DEAD'||row.brand_safe===false||(interpreted.platform&&(row.platforms||[]).length&&!partialMatchAI(row.platforms,interpreted.platform))||(interpreted.industry&&partialMatchAI(row.industries_avoid,interpreted.industry))||(interpreted.context&&partialMatchAI(row.avoid_situations,interpreted.context)))
        const returned=new Set(ranked.map(item=>item.meme.id))
        aiCases.push({caseId:`brief-${String(index+1).padStart(2,'0')}`,group,brief,expected,interpretation:result.interpretation,interpretationStatus:result.status,provider:result.provider||null,retryCount:result.retryCount||0,latencyMs:result.latencyMs??Date.now()-started,precisionAt3:hits/3,legacyPrecisionAt3:top3.length?hits/top3.length:0,top1Relevant:Boolean(top3[0]&&expected.includes(top3[0].meme.slug)),covered:supported.length>0,noSuitableCatalogCandidate:supported.length===0,compatibilityChecks:incompatible.length,compatibilityErrors:incompatible.filter(row=>returned.has(row.id)).map(row=>row.slug),top3:top3.map(item=>({slug:item.meme.slug,score:item.score}))})
      }
      const aiMetric=list=>({briefs:list.length,precisionAt3:list.length?Number((list.reduce((sum,row)=>sum+row.precisionAt3,0)/list.length).toFixed(3)):null,legacyPrecisionAt3:list.length?Number((list.reduce((sum,row)=>sum+row.legacyPrecisionAt3,0)/list.length).toFixed(3)):null,top1Relevance:list.length?Number((list.filter(row=>row.top1Relevant).length/list.length).toFixed(3)):null,coverage:list.length?Number((list.filter(row=>row.covered).length/list.length).toFixed(3)):null,exclusionCorrectness:(()=>{const checks=list.reduce((sum,row)=>sum+row.compatibilityChecks,0),errors=list.reduce((sum,row)=>sum+row.compatibilityErrors.length,0);return checks?Number(((checks-errors)/checks).toFixed(3)):null})()})
      const compare=(row,base)=>row.top1Relevant!==base.top1Relevant||row.precisionAt3!==base.precisionAt3
      const baselineById=new Map(reports.map(row=>[row.caseId,row]))
      const successfulLatency=aiCases.filter(row=>row.interpretationStatus==='used').map(row=>row.latencyMs).sort((a,b)=>a-b)
      const evaluated={configuration:'AI interpretation plus existing deterministic matcher',metrics:aiMetric(aiCases),perGroup:Object.fromEntries([...new Set(aiCases.map(row=>row.group))].map(group=>[group,aiMetric(aiCases.filter(row=>row.group===group))])),perAudience:Object.fromEntries([...new Set(aiCases.map(row=>row.brief.audience))].map(key=>[key,aiMetric(aiCases.filter(row=>row.brief.audience===key))])),perIndustry:Object.fromEntries([...new Set(aiCases.map(row=>row.brief.industry))].map(key=>[key,aiMetric(aiCases.filter(row=>row.brief.industry===key))])),interpretationFailureRate:Number((aiCases.filter(row=>row.interpretationStatus!=='used').length/aiCases.length).toFixed(3)),fallbackFrequency:Number((aiCases.filter(row=>row.interpretationStatus!=='used').length/aiCases.length).toFixed(3)),providerLatencyMs:{successfulRequests:successfulLatency.length,mean:successfulLatency.length?Math.round(successfulLatency.reduce((sum,value)=>sum+value,0)/successfulLatency.length):null,p95:successfulLatency.length?successfulLatency[Math.ceil(successfulLatency.length*.95)-1]:null},improved:aiCases.filter(row=>{const base=baselineById.get(row.caseId);return row.top1Relevant&&!base.top1Relevant||row.precisionAt3>base.precisionAt3}).map(row=>({caseId:row.caseId,brief:row.brief,top3:row.top3})),regressed:aiCases.filter(row=>{const base=baselineById.get(row.caseId);return !row.top1Relevant&&base.top1Relevant||row.precisionAt3<base.precisionAt3}).map(row=>({caseId:row.caseId,brief:row.brief,top3:row.top3})),noSuitableCatalogCandidates:aiCases.filter(row=>row.noSuitableCatalogCandidate).map(row=>row.caseId),cases:aiCases}
      aiEvaluation=successfulLatency.length?{status:'completed',...evaluated}:{status:'provider_unavailable',reason:'All configured provider calls failed; deterministic fallback cases are reported without attributing metrics to AI.',interpretationFailureRate:1,fallbackFrequency:1,cases:aiCases}
    }
  }
  const duplicateGroups = []
  const nearDuplicateCandidates = []
  const tokenSet = value => new Set(String(value||'').toLowerCase().match(/[a-z0-9]{3,}/g)||[])
  for (let i=0;i<rows.length;i++) for (let j=i+1;j<rows.length;j++) {
    const a=`${rows[i].title} ${rows[i].format}`.toLowerCase().replace(/[^a-z0-9]/g,'')
    const b=`${rows[j].title} ${rows[j].format}`.toLowerCase().replace(/[^a-z0-9]/g,'')
    if (a===b || rows[i].slug===rows[j].slug) duplicateGroups.push([rows[i].slug,rows[j].slug])
    else { const ta=tokenSet(`${rows[i].title} ${rows[i].format} ${(rows[i].use_cases||[]).join(' ')}`), tb=tokenSet(`${rows[j].title} ${rows[j].format} ${(rows[j].use_cases||[]).join(' ')}`); const shared=[...ta].filter(token=>tb.has(token)).length; const similarity=shared/(ta.size+tb.size-shared||1); if(similarity>=.45) nearDuplicateCandidates.push({slugs:[rows[i].slug,rows[j].slug],jaccard:Number(similarity.toFixed(2)),review:'Potentially overlapping title, structure, or use-case language; editorial review required.'}) }
  }
  const catalogAudit = { recordCount:rows.length, duplicateGroups, nearDuplicateCandidates, incomplete:rows.map(row=>({id:row.id,slug:row.slug,title:row.title,missing:memeMetadataStatus(row)})).filter(row=>row.missing.length), safetyRestrictionsNotDocumented:rows.filter(row=>!row.avoid_situations?.length && !row.industries_avoid?.length).map(row=>({slug:row.slug,brandSafe:row.brand_safe})), conflictingIndustryRules:rows.flatMap(row=>(row.industries_good||[]).filter(value=>(row.industries_avoid||[]).some(other=>other.toLowerCase()===value.toLowerCase())).map(value=>({slug:row.slug,industry:value}))), vague:rows.filter(row=>!row.description || row.description.length<25 || /\b(meme format|broad internet|relatable)\b/i.test(row.description)).map(row=>({slug:row.slug,description:row.description})) }
  const confidenceItems=filtered.flatMap(row=>row.recommendations.map(item=>({item,relevant:row.expectedSuitableSlugs.includes(item.meme.slug)})))
  const confidenceCalibration = Object.fromEntries(['high','medium','low'].map(level=>{ const items=confidenceItems.filter(row=>row.item.confidence===level); return [level,{recommendations:items.length,relevant:items.filter(row=>row.relevant).length,observedRelevance:items.length?Number((items.filter(row=>row.relevant).length/items.length).toFixed(3)):null}] }))
  const report = { generatedAt:new Date().toISOString(), catalogVersion, retrieval:{source:'PostgreSQL memes catalog',candidateLimit:300,returnedRows:rows.length,readOnly:true}, metricDefinitions:{ precisionAt3:'mean per-brief relevant recommendations in top 3 divided by fixed 3; short result lists contribute fewer than 3 relevant slots', legacyPrecisionAt3:'mean per-brief relevant recommendations divided by number actually returned in top 3 (previous implementation used all returned results)', top1Relevance:'fraction of briefs whose first result is in the manually labeled suitable slug set', coverage:'fraction with at least one manually labeled suitable, non-DEAD, compatibility-eligible slug present in the catalog', exclusionCorrectness:'independently checks every record with explicit incompatible status, safety, platform, industry, or avoid-situation metadata; reports blocked incompatible records divided by all incompatible checks' }, summary:metric(filtered), perAudience:byAudience, perIndustry:byIndustry, byBriefGroup:Object.fromEntries([...new Set(filtered.map(x=>x.group))].map(key=>[key,metric(filtered.filter(x=>x.group===key))])), confidenceCalibration, experiments, aiEvaluation, failureDiagnosisCounts:Object.fromEntries([...new Set(filtered.map(x=>x.failureDiagnosis))].map(key=>[key,filtered.filter(x=>x.failureDiagnosis===key).length])), noSuitableCatalogCandidates:filtered.filter(x=>x.noSuitableCatalogCandidate).map(x=>x.caseId), catalogAudit, cases:filtered }
  const outputArg = [...args].find(arg=>arg.startsWith('--json='))?.slice(7)
  const outputPath = path.resolve(outputArg || 'reports/meme-evaluation.json')
  await mkdir(path.dirname(outputPath),{recursive:true})
  await writeFile(outputPath,JSON.stringify(report,null,2),'utf8')
  console.log(`Meme evaluation · ${filtered.length}/${cases.length} briefs · catalog ${catalogVersion.slice(0,12)}`)
  console.log(`Precision@3 ${report.summary.precisionAt3} (fixed denominator) · legacy ${report.summary.legacyPrecisionAt3} · top-1 ${report.summary.top1Relevance} · coverage ${report.summary.coverage} · exclusion correctness ${report.summary.exclusionCorrectness}`)
  console.log(`Catalog audit: ${catalogAudit.recordCount} records · ${catalogAudit.incomplete.length} incomplete · ${catalogAudit.safetyRestrictionsNotDocumented.length} without explicit safety restrictions · ${catalogAudit.duplicateGroups.length} exact and ${catalogAudit.nearDuplicateCandidates.length} possible near duplicates · ${catalogAudit.vague.length} vague descriptions`)
  for (const [group,stats] of Object.entries(report.byBriefGroup)) console.log(`Group ${group}: P@3 ${stats.precisionAt3} · top-1 ${stats.top1Relevance}`)
  for (const experiment of experiments) console.log(`Experiment ${experiment.name}: P@3 ${experiment.metrics.precisionAt3} · top-1 ${experiment.metrics.top1Relevance} · improved ${experiment.improved.length} · regressed ${experiment.regressed.length}`)
  if (aiEvaluation.status==='completed') console.log(`AI interpretation: P@3 ${aiEvaluation.metrics.precisionAt3} · top-1 ${aiEvaluation.metrics.top1Relevance} · coverage ${aiEvaluation.metrics.coverage} · exclusion ${aiEvaluation.metrics.exclusionCorrectness} · failures/fallbacks ${aiEvaluation.interpretationFailureRate} · mean latency ${aiEvaluation.providerLatencyMs.mean}ms`)
  else if (args.has('--with-ai')) console.log(`AI interpretation evaluation unavailable: ${aiEvaluation.reason}`)
  for (const row of filtered.filter(x=>!x.top1Relevant || x.precisionAt3<.34 || x.compatibilityErrors.length)) console.log(`${row.caseId} [${row.group}] top1=${row.top1Relevant?'hit':'MISS'} p@3=${row.precisionAt3.toFixed(2)} expected=${row.expectedSuitableSlugs.join(',')} actual=${row.recommendations.slice(0,3).map(x=>`${x.meme.slug}:${x.score}`).join(',')}`)
  console.log(`Detailed report: ${outputPath}`)
} finally { await pool.end() }
