import { useId } from 'react'
import { featureAsset } from './featureAssets'
import AccessoryOverlays from './AccessoryOverlays'
import type { FaceReference } from './referenceFaces'
export type ReferenceEdits = Record<string, string>

export default function ReferenceComposite({ face, edits, image }: { face: FaceReference; edits: ReferenceEdits; image?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const { centerX: cx, eyeY, noseY, mouthY, eyeGap: defaultGap } = face.landmarks
  const preferredHair = edits['@hairSource'] === 'Hair length' ? edits['Hair length'] : edits['Hair texture'] || edits['Hair length']
  const hair = featureAsset('Hair', preferredHair || '')
  const eyeValue = edits.Eyes || ''
  const eyes = eyeValue ? featureAsset('Eyes', eyeValue) : undefined
  const nose = edits.Nose ? featureAsset('Nose', edits.Nose) : undefined
  const glasses = (edits.Glasses || '').toLowerCase()
  const moustache = (edits.Mustache || '').toLowerCase()
  const eyeGap = /close/.test(eyeValue.toLowerCase()) ? defaultGap - 5 : /far/.test(eyeValue.toLowerCase()) ? defaultGap + 5 : defaultGap
  const adjustment = (group: string, x: number, y: number) => {
    const dx = Number(edits[`@${group}X`] || 0), dy = Number(edits[`@${group}Y`] || 0), scale = Number(edits[`@${group}Scale`] || 100) / 100
    return `translate(${dx} ${dy}) translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`
  }
  return <svg className="composite-sketch" viewBox="0 0 300 330" role="img" aria-label={image ? 'Editable image with non-destructive feature overlays' : `Editable reference illustration: ${face.description}`}>
    <defs>
      <radialGradient id={`eyeBlend${id}`}><stop offset="0" stopColor="#e8e6e2" stopOpacity=".96"/><stop offset=".65" stopColor="#e8e6e2" stopOpacity=".82"/><stop offset="1" stopColor="#e8e6e2" stopOpacity="0"/></radialGradient>
      <radialGradient id={`noseBlend${id}`}><stop offset="0" stopColor="#e8e6e2" stopOpacity=".92"/><stop offset=".6" stopColor="#e8e6e2" stopOpacity=".78"/><stop offset="1" stopColor="#e8e6e2" stopOpacity="0"/></radialGradient>
      <clipPath id={`hairClip${id}`}><rect x={cx-110} y="0" width="220" height={eyeY-35}/></clipPath>
    </defs>
    <image href={image || face.image} x={image ? 0 : 40} y={image ? 0 : 0} width={image ? 300 : 220} height="330" preserveAspectRatio="xMidYMid meet"/>
    {hair && <g transform={adjustment('Hair', cx, 55)} clipPath={`url(#hairClip${id})`}><image href={hair} x={cx-104} y="0" width="208" height="240" preserveAspectRatio="none"/></g>}
    {eyes && <g transform={adjustment('Eyes', cx, eyeY)}>{[cx-eyeGap, cx+eyeGap].map((x, i) => <g key={i}><ellipse cx={x} cy={eyeY} rx="30" ry="21" fill={`url(#eyeBlend${id})`}/><image href={eyes} x={x-23} y={eyeY-26} width="46" height="40" preserveAspectRatio="none" transform={i ? `translate(${2*x} 0) scale(-1 1)` : undefined}/></g>)}</g>}
    {nose && <g transform={adjustment('Nose', cx, noseY)}><ellipse cx={cx} cy={noseY-9} rx="22" ry="31" fill={`url(#noseBlend${id})`}/><image href={nose} x={cx-18} y={noseY-38} width="36" height="44" preserveAspectRatio="none"/></g>}
    <AccessoryOverlays cx={cx} mouthY={mouthY} beard={edits.Beard} adjustment={adjustment}/>
    {moustache && !/none|no/.test(moustache) && <g transform={adjustment('Mustache', cx, mouthY-13)}><path d={`M${cx-31} ${mouthY-11} Q${cx-18} ${mouthY-(moustache.includes('thin') ? 17 : 23)} ${cx-4} ${mouthY-16} L${cx} ${mouthY-13} L${cx+4} ${mouthY-16} Q${cx+18} ${mouthY-(moustache.includes('thin') ? 17 : 23)} ${cx+31} ${mouthY-11} Q${cx+19} ${mouthY-8} ${cx+5} ${mouthY-9} L${cx} ${mouthY-11} L${cx-5} ${mouthY-9} Q${cx-19} ${mouthY-8} ${cx-31} ${mouthY-11}Z`} fill="#343434"/></g>}
    {glasses && !/none|no/.test(glasses) && <g transform={adjustment('Glasses', cx, eyeY)} stroke="#292929" strokeWidth="3" fill="none">{glasses.includes('round') ? <><ellipse cx={cx-defaultGap} cy={eyeY} rx="25" ry="20"/><ellipse cx={cx+defaultGap} cy={eyeY} rx="25" ry="20"/></> : <><rect x={cx-defaultGap-25} y={eyeY-19} width="50" height="38" rx={glasses.includes('aviator') ? 15 : 6}/><rect x={cx+defaultGap-25} y={eyeY-19} width="50" height="38" rx={glasses.includes('aviator') ? 15 : 6}/></>}<path d={`M${cx-defaultGap+25} ${eyeY-7} Q${cx} ${eyeY-13} ${cx+defaultGap-25} ${eyeY-7} M${cx-defaultGap-25} ${eyeY-10} l-13 -5 M${cx+defaultGap+25} ${eyeY-10} l13 -5`}/></g>}
    <AccessoryOverlays cx={cx} mouthY={mouthY} scarf={edits.Scarf} adjustment={adjustment}/>
  </svg>
}
