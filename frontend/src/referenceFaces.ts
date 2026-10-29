import { ageRanges } from './fineTune'
export type FaceReference = { id: string; image: string; shape: string; category: 'Male' | 'Female' | 'Both'; title: string; group: string; description: string; visualDescription: string; traits: Record<string, string>; landmarks: { centerX: number; eyeY: number; noseY: number; mouthY: number; eyeGap: number } }
const shapes = ['Round', 'Oval', 'Square', 'Oblong', 'Triangular', 'Diamond', 'Heart']
const hairNotes: Record<string, string[]> = {
  Male: ['short curly dark hair', 'short wavy dark hair', 'short wavy dark hair', 'short straight dark hair', 'short curly dark hair', 'short curly dark hair', 'short wavy dark hair'],
  Female: ['dark hair pulled back', 'long straight dark hair', 'long straight dark hair', 'long straight dark hair', 'long straight dark hair', 'long straight dark hair', 'wavy dark hair pulled back'],
}
const positions: Record<string, Array<[number, number, number, number, number]>> = {
  Male: [[150,171,211,234,40],[148,159,204,232,39],[158,160,204,229,40],[150,159,204,228,39],[149,162,207,235,40],[143,157,203,230,40],[148,157,203,228,39]],
  Female: [[147,166,207,236,38],[150,159,201,231,38],[150,159,202,231,38],[150,159,202,232,38],[152,159,202,231,38],[148,159,201,231,38],[150,159,202,232,38]],
}
const faceShapes: FaceReference[] = (['Male', 'Female'] as const).flatMap(category => shapes.map((shape, index) => ({
  id: `${category.toLowerCase()}-${shape.toLowerCase()}`,
  image: `/faces/${category.toLowerCase()}-${shape.toLowerCase()}.jpg`,
  shape, category, title: shape, group: 'Face shape',
  description: `${shape} face · ${category} chart category`,
  visualDescription: `${shape} face, ${hairNotes[category][index]}`,
  traits: { 'Face shape': shape },
  landmarks: { centerX: positions[category][index][0], eyeY: positions[category][index][1], noseY: positions[category][index][2], mouthY: positions[category][index][3], eyeGap: positions[category][index][4] },
})))
type ChartSet = { prefix: string; group: string; category: 'Male' | 'Female' | 'Both'; entries: Array<[string, string, string, string]> }
const chartSets: ChartSet[] = [
  { prefix: 'hair-men', group: 'Hair length', category: 'Male', entries: [['bald','Bald','Hair length','Bald'],['buzz','Very short (buzz)','Hair length','Short'],['short','Short','Hair length','Short'],['medium','Medium','Hair length','Medium'],['long','Long','Hair length','Long'],['very-long','Very long','Hair length','Long']] },
  { prefix: 'hair-women', group: 'Hair length', category: 'Female', entries: [['very-short','Very short','Hair length','Short'],['short','Short','Hair length','Short'],['medium','Medium','Hair length','Medium'],['long','Long','Hair length','Long'],['very-long','Very long','Hair length','Long']] },
  { prefix: 'texture', group: 'Hair texture', category: 'Both', entries: [['straight','Straight','Hair texture','Straight'],['wavy','Wavy','Hair texture','Wavy'],['curly','Curly','Hair texture','Curly']] },
  { prefix: 'colour', group: 'Hair color', category: 'Both', entries: [['black','Black','Hair color','Black'],['dark-brown','Dark brown','Hair color','Brown'],['brown','Brown','Hair color','Brown'],['light-brown','Light brown','Hair color','Brown'],['reddish-brown','Reddish brown','Hair color','Brown'],['blonde','Blonde','Hair color','Blonde'],['grey','Grey','Hair color','Gray'],['white','White','Hair color','White']] },
  { prefix: 'facial-hair', group: 'Facial hair', category: 'Male', entries: [['none','None','Beard','None'],['mustache','Moustache','Mustache','Present'],['beard','Beard','Beard','Present'],['stubble','Stubble','Beard','Present'],['goatee','Goatee','Beard','Present']] },
]
const chartFaces: FaceReference[] = chartSets.flatMap(set => set.entries.map(([slug, title, key, value]) => ({
  id: `${set.prefix}-${slug}`, image: `/faces/${set.prefix}-${slug}.jpg`, shape: '', category: set.category,
  title, group: set.group, description: `${title} · ${set.group} chart`,
  visualDescription: `${title} ${set.group.toLowerCase()} (source chart label)`, traits: { [key]: value },
  landmarks: { centerX: 150, eyeY: 172, noseY: 215, mouthY: 245, eyeGap: 39 },
})))
const ageFaces: FaceReference[] = (['Male', 'Female'] as const).flatMap(category => ageRanges.map(age => ({
  id: `age-${category.toLowerCase()}-${age.slug}`, image: `/faces/age-${category.toLowerCase()}-${age.slug}.jpg`, shape: '', category,
  title: age.label, group: 'Age', description: `${age.label} · ${category} age chart`,
  visualDescription: `Age ${age.label}, ${category.toLowerCase()} age-chart illustration`, traits: { Age: age.label },
  landmarks: { centerX: 150, eyeY: 166, noseY: 209, mouthY: 234, eyeGap: 39 },
})))
export const referenceFaces: FaceReference[] = [...faceShapes, ...ageFaces, ...chartFaces]
type Attribute = { name: string; value: string; status: string }
export function matchReferenceFaces(attributes: Attribute[], transcript: string, notes: Record<string, string> = {}) {
  const shape = attributes.find(a => a.name === 'Face shape' && a.status === 'Reported')?.value.toLowerCase().replace(/^long$/, 'oblong')
  const male = /\b(man|male|boy|he|him|his)\b/i.test(transcript)
  const female = /\b(woman|female|girl|she|her|hers)\b/i.test(transcript)
  const category = male !== female ? (male ? 'Male' : 'Female') : undefined
  const terms = ['bald', 'short', 'medium', 'long', 'dark', 'brown', 'blonde', 'gray', 'straight', 'wavy', 'curly', 'round', 'almond', 'hooded', 'monolid', 'upturned', 'downturned', 'small', 'wide', 'broad', 'narrow', 'hooked', 'pointed', 'snub', 'thick', 'thin', 'mustache', 'beard', 'glasses']
  const words = (value: string) => new Set((value.toLowerCase().match(/[a-z]+/g) || []).map(w => w === 'moustache' ? 'mustache' : w === 'grey' ? 'gray' : w === 'black' ? 'dark' : w))
  const reported = attributes.filter(a => a.status === 'Reported')
  const witnessWords = words(reported.filter(a => a.name !== 'Face shape' && !/^(none|not described)$/i.test(a.value)).map(a => `${a.name} ${a.value}`).join(' '))
  const normalized = (value: string) => value.toLowerCase().replace('grey', 'gray').replace(/^blond$/, 'blonde')
  const results = referenceFaces.map(face => {
    const noteWords = words(notes[face.id] ?? face.visualDescription)
    const shared = terms.filter(term => witnessWords.has(term) && noteWords.has(term))
    const traits = reported.filter(a => {
      const actual = face.traits[a.name]
      if (!actual) return false
      const expected = normalized(a.value), candidate = normalized(actual)
      return expected === candidate || (a.name === 'Mustache' && candidate === 'present' && !/none|not described/.test(expected)) || (a.name === 'Face shape' && expected === 'long' && candidate === 'oblong')
    }).map(a => `${a.name}: ${a.value}`)
    const reasons = [category === face.category ? `${face.category} chart category` : '', ...traits, ...shared].filter(Boolean)
    return { face, reasons, score: traits.length * 3 + shared.length + (category === face.category ? 1 : 0) }
  }).filter(item => item.score > 0 && (!shape || !item.face.shape || item.face.shape.toLowerCase() === shape) && (!category || item.face.category === 'Both' || item.face.category === category))
  return results.sort((a, b) => b.score - a.score)
}
