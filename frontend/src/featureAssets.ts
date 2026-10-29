export function featureAsset(feature: string, value: string): string | undefined {
  const v = value.toLowerCase()
  if (feature === 'Hair') {
    if (v.includes('curly')) return '/features/hair-curly.png'
    if (v.includes('wavy')) return '/features/hair-wavy.png'
    if (v.includes('straight')) return '/features/hair-straight.png'
    if (v.includes('long')) return '/features/hair-long.png'
    if (v.includes('medium')) return '/features/hair-medium.png'
    if (v.includes('short')) return '/features/hair-short.png'
  }
  if (feature === 'Eyes') {
    const eye = ['round', 'almond', 'hooded', 'monolid', 'upturned', 'downturned'].find(x => v.includes(x))
    return `/features/eye-${eye || 'almond'}.png`
  }
  if (feature === 'Nose') {
    const nose = v.includes('broad') ? 'wide' : v.includes('narrow') ? 'pointed' : v.includes('curved') ? 'hooked' : ['small', 'regular', 'long', 'straight', 'hooked', 'snub', 'pointed', 'wide'].find(x => v.includes(x))
    return `/features/nose-${nose || 'regular'}.png`
  }
}
