export const ageRanges = [
  { label: '5–12', slug: 'child' }, { label: '13–19', slug: 'teen' }, { label: '20–29', slug: 'young-adult' },
  { label: '30–39', slug: 'adult' }, { label: '40–49', slug: 'middle-aged' }, { label: '50–59', slug: 'older' }, { label: '60+', slug: 'senior' },
]
export const fineTuneTabs = ['Age', 'Face shape', 'Hair', 'Hair texture', 'Nose', 'Mustache', 'Beard', 'Glasses', 'Scarf']
export const fineTuneOptions: Record<string, string[]> = {
  Age: ageRanges.map(a => a.label), 'Face shape': ['Round', 'Oval', 'Square', 'Oblong', 'Triangular', 'Diamond', 'Heart'],
  Hair: ['Bald', 'Short', 'Medium', 'Long'], 'Hair texture': ['Straight', 'Wavy', 'Curly'],
  Nose: ['Small', 'Regular', 'Long', 'Straight', 'Hooked', 'Snub', 'Pointed', 'Wide'],
  Mustache: ['None', 'Thin', 'Thick', 'Curved'], Beard: ['None', 'Stubble', 'Short', 'Full', 'Goatee'],
  Glasses: ['None', 'Round', 'Rectangular', 'Aviator'], Scarf: ['None', 'Neck wrap', 'Draped', 'Face covering', 'Headscarf'],
}
export const fineTuneFields: Record<string, string> = { Age: 'Age', 'Face shape': 'Face shape', Hair: 'Hair length', 'Hair texture': 'Hair texture', Nose: 'Nose', Mustache: 'Mustache', Beard: 'Beard', Glasses: 'Glasses', Scarf: 'Scarf' }
