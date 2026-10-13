import { generateConcept } from '../meme-matcher.js'

export function deterministicVariations(meme, context, brand = '') {
  const base = generateConcept(meme, context, brand)
  const topic = context.trim().replace(/[.!?]$/, '')
  const format = `${meme.format || ''} ${(meme.content_formats || []).join(' ')}`.toLowerCase()
  let copies
  if (/expectation|reality/.test(format)) copies = [
    `EXPECTATION\n${topic}\n\nREALITY\nThe familiar part of the process people recognize.`,
    `EXPECTATION\n${topic}\n\nREALITY\nThe version that happens when the plan meets real life.`,
    `EXPECTATION\n${topic}\n\nREALITY\nAdd a specific, verified benefit from ${brand || 'your product'} here.`,
  ]
  else if (/choice|comparison|before and after/.test(format)) {
    const times = topic.match(/\b\d+(?:\.\d+)?\s*(?:minutes?|mins?|hours?|days?|seconds?|secs?|s|m|h)\b/gi) || []
    copies = [
      `✖ ${times[0] ? `Waiting ${times[0]} for the outcome` : `The old way: ${topic}`}\n\n✔ ${times[1] ? `Getting there in ${times[1]}` : 'The change you want to make'}`,
      `✖ The familiar workaround\n\n✔ ${topic}`,
      `✖ ${times[0] ? `Waiting ${times[0]}` : 'The current workflow'}\n\n✔ ${times[1] ? `Getting there in ${times[1]}` : 'A specific improvement you can verify'}`,
    ]
  } else if (/reaction|frustration|fail/.test(format)) copies = [
    `WHEN ${topic}\n\nThat moment everyone in this situation recognizes.`,
    `WHEN ${topic.toUpperCase()}\n\nThe reaction before you try one more time.`,
    `WHEN ${topic}\n\nIntroduce ${brand || 'your product'} as a relevant option, without adding an unverified claim.`,
  ]
  else if (/starter pack|relatable/.test(format)) copies = [
    `THE ${brand ? brand.toUpperCase() + ' ' : ''}STARTER PACK\n• ${topic}\n• The familiar workaround\n• One small win`,
    `THE ${brand ? brand.toUpperCase() + ' ' : ''}STARTER PACK\n• ${topic}\n• “I'll fix it later”\n• Somehow, it works out`,
    `THE ${brand ? brand.toUpperCase() + ' ' : ''}STARTER PACK\n• ${topic}\n• The problem your product addresses\n• One verified benefit`,
  ]
  else copies = [base.copy, `WHEN ${topic}\n\nThe part of this situation people will recognize.`, `SETUP\n${topic}\n\nPUNCHLINE\nThe small detail that makes the moment click.`]
  return { ...base, variations: copies.map((copy, i) => ({ type: ['relatable', 'funny', 'promotional'][i], title: `${base.title} · ${['Relatable', 'Funny', 'Natural promotion'][i]}`, copy })) }
}
