export const interviewGuide = [
  { id: 'Age', question: 'About how old did the person appear to be?' },
  { id: 'Face shape', question: 'How would you describe their face shape?' },
  { id: 'Hair length', question: 'What do you remember about the length of their hair?' },
  { id: 'Hair texture', question: 'Was their hair straight, wavy, or curly?' },
  { id: 'Hair color', question: 'What color was their hair?' },
  { id: 'Eyes', question: 'What did you notice about their eyes, such as their shape or spacing?' },
  { id: 'Eyebrows', question: 'Can you describe their eyebrows?' },
  { id: 'Nose', question: 'Can you describe the shape of their nose?' },
  { id: 'Mustache', question: 'Did they have a mustache? If so, what did it look like?' },
  { id: 'Beard', question: 'Did they have a beard or stubble?' },
  { id: 'Glasses', question: 'Were they wearing glasses? What shape were they?' },
  { id: 'Scarf', question: 'Were they wearing a scarf or head covering?' },
] as const

type Attribute = { name: string; value: string; status: string }
type Message = { role: string; text: string }
export function buildMasterPrompt(attributes: Attribute[], messages: Message[]) {
  const reported = attributes.filter(a => a.status === 'Reported').map(a => `${a.name.toLowerCase()}: ${a.value}`)
  const uncertain = attributes.filter(a => a.status === 'Uncertain').map(a => a.name.toLowerCase())
  const statements = messages.filter(m => m.role === 'witness').map(m => m.text.trim()).filter(Boolean)
  if (!statements.length && !reported.length) return ''
  return [
    'Create a neutral, front-facing illustrative pencil composite for review, based on the witness account. Do not invent missing or uncertain details.',
    reported.length ? `Reported details: ${reported.join('; ')}.` : 'No supported visual attributes have been confirmed yet.',
    uncertain.length ? `Uncertain or skipped: ${uncertain.join(', ')}.` : '',
    statements.length ? `Witness statements (review for context): ${statements.map(s => `“${s}”`).join(' ')}` : '',
    'Treat the illustration as an approximation, not an identification. Verify every detail with the witness.',
  ].filter(Boolean).join('\n\n')
}
