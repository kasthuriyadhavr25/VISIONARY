import { featureAsset } from './featureAssets'
import ReferenceComposite from './ReferenceComposite'
import AccessoryOverlays from './AccessoryOverlays'
import { referenceFaces } from './referenceFaces'
import type { ReferenceEdits } from './ReferenceComposite'
type Attribute = { name: string; value: string; status: string }

// An editable, local feature illustration rather than an identification tool.
export default function CompositeSketch({ attributes, photo, referenceId, referenceEdits }: { attributes: Attribute[]; photo?: string; referenceId?: string; referenceEdits?: ReferenceEdits }) {
  const reference = referenceFaces.find(face => face.id === referenceId)
  if (photo) return <ReferenceComposite face={reference || referenceFaces[0]} image={photo} edits={referenceEdits || {}} />
  if (reference) return <ReferenceComposite face={reference} edits={referenceEdits || {}} />
  const value = (name: string) => attributes.find(a => a.name === name && a.status === 'Reported')?.value.toLowerCase() || ''
  const shape = value('Face shape'), hair = value('Hair length'), texture = value('Hair texture'), color = value('Hair color')
  const glasses = value('Glasses'), moustache = value('Mustache'), beard = value('Beard'), scarf = value('Scarf'), eyes = value('Eyes'), nose = value('Nose'), brows = value('Eyebrows')
  const faceWidth = shape.includes('round') ? 76 : shape.includes('square') ? 73 : shape.includes('long') || shape.includes('oblong') ? 60 : 66
  const bottom = shape.includes('round') ? 244 : 258
  const hairDark = color.includes('blond') || color.includes('grey') || color.includes('gray') ? '#777' : color.includes('brown') ? '#484644' : '#292b2b'
  const longHair = hair.includes('long') || hair.includes('medium')
  const noHair = hair.includes('bald') || hair.includes('none')
  const eyeGap = eyes.includes('close') ? 26 : eyes.includes('far') ? 39 : 32
  const noseWidth = nose.includes('broad') || nose.includes('wide') ? 18 : nose.includes('narrow') ? 8 : 12
  const hasMoustache = moustache && !/none|no|not described/.test(moustache)
  const hairReference = featureAsset('Hair', longHair ? hair : texture.includes('curly') || texture.includes('wavy') ? texture : hair || texture)
  const eyeReference = featureAsset('Eyes', eyes)
  const noseReference = featureAsset('Nose', nose)
  return <svg className="composite-sketch" viewBox="0 0 300 330" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Feature-based illustrative facial composite">
    <defs><linearGradient id="paperFace" x1="0" x2="1"><stop stopColor="#c4c3bf"/><stop offset=".18" stopColor="#e9e7e1"/><stop offset=".5" stopColor="#f7f5ef"/><stop offset=".83" stopColor="#deddd7"/><stop offset="1" stopColor="#b8b8b4"/></linearGradient><linearGradient id="neck" x1="0" x2="1"><stop stopColor="#b2b1ac"/><stop offset=".5" stopColor="#f4f2ec"/><stop offset="1" stopColor="#b0afaa"/></linearGradient></defs>
    <path d="M37 330 Q42 298 93 287 L114 276 L116 240 L184 240 L186 276 L207 287 Q258 298 263 330" fill="#e5e4df" stroke="#666" strokeWidth="1.5"/><path d="M115 241 L114 276 Q150 300 186 276 L185 241" fill="url(#neck)" stroke="#777" strokeWidth="1"/>
    {longHair && !noHair && <path d="M83 118 Q73 49 150 48 Q227 49 217 118 L225 255 Q210 276 188 271 L110 271 Q87 276 75 255Z" fill={hairDark} stroke="#373737" strokeWidth="2"/>}
    <ellipse cx={150-faceWidth+1} cy="165" rx="12" ry="23" fill="#d2d1cb" stroke="#666"/><ellipse cx={150+faceWidth-1} cy="165" rx="12" ry="23" fill="#d2d1cb" stroke="#666"/>
    <path d={`M${150-faceWidth} 119 Q${150-faceWidth-6} 75 150 69 Q${150+faceWidth+6} 75 ${150+faceWidth} 119 L${150+faceWidth-3} 181 Q${150+faceWidth-8} ${bottom-12} 150 ${bottom} Q${150-faceWidth+8} ${bottom-12} ${150-faceWidth+3} 181Z`} fill="url(#paperFace)" stroke="#555" strokeWidth="1.5"/>
    {!noHair && (hairReference ? <image href={hairReference} x="70" y="42" width="160" height="174" preserveAspectRatio="none" opacity={color.includes('blond') || color.includes('grey') ? .58 : 1}/> : <path d={`M${150-faceWidth} 137 Q${150-faceWidth-13} 83 ${150-faceWidth+11} 62 Q150 28 ${150+faceWidth-11} 62 Q${150+faceWidth+13} 82 ${150+faceWidth} 137 L${150+faceWidth-9} 111 Q178 103 150 85 Q125 102 ${150-faceWidth+9} 109Z`} fill={hairDark} stroke="#353535" strokeWidth="2"/>)}
    {eyeReference && [150-eyeGap,150+eyeGap].map((x,i)=><image key={i} href={eyeReference} x={x-23} y="126" width="46" height="42" preserveAspectRatio="none" transform={i === 1 ? `translate(${2*x} 0) scale(-1 1)` : undefined}/>)}
    {brows.includes('thick') && <g stroke="#3e3e3d" fill="none" strokeLinecap="round"><path d={`M${150-eyeGap-18} 137 Q${150-eyeGap} 127 ${150-eyeGap+17} 137 M${150+eyeGap-17} 137 Q${150+eyeGap} 127 ${150+eyeGap+18} 137`} strokeWidth="2"/></g>}
    {noseReference ? <image href={noseReference} x={150-noseWidth-7} y="158" width={2*noseWidth+14} height="42" preserveAspectRatio="none"/> : <path d={`M146 158 Q${150-noseWidth} 189 ${150-noseWidth} 192 Q150 200 ${150+noseWidth} 192 Q${150+noseWidth-2} 188 154 158`} fill="none" stroke="#8b8984" strokeWidth="1.3"/>}
    <AccessoryOverlays cx={150} mouthY={225} beard={beard}/>
    {hasMoustache && <path d={`M117 212 Q128 ${moustache.includes('thin') ? 206 : 201} 145 208 L150 211 L155 208 Q172 ${moustache.includes('thin') ? 206 : 201} 183 212 Q170 217 155 215 L150 213 L145 215 Q130 217 117 212Z`} fill="#444441"/>}
    <path d="M126 225 Q139 220 150 223 Q161 220 174 225 Q150 235 126 225Z" fill="#9d9994" stroke="#696762" strokeWidth=".8"/><path d="M128 225 Q150 228 172 225" fill="none" stroke="#555" strokeWidth="1"/>
    {glasses && !/none|no|not described/.test(glasses) && <g fill="none" stroke="#333" strokeWidth="3">{glasses.includes('round') ? <><ellipse cx={150-eyeGap} cy="155" rx="24" ry="20"/><ellipse cx={150+eyeGap} cy="155" rx="24" ry="20"/></> : <><rect x={150-eyeGap-24} y="137" width="48" height="36" rx={glasses.includes('aviator') ? 15 : 6}/><rect x={150+eyeGap-24} y="137" width="48" height="36" rx={glasses.includes('aviator') ? 15 : 6}/></>}<path d={`M${150-eyeGap+24} 149 Q150 144 ${150+eyeGap-24} 149 M${150-eyeGap-24} 145 L${150-faceWidth-4} 141 M${150+eyeGap+24} 145 L${150+faceWidth+4} 141`}/></g>}
    <AccessoryOverlays cx={150} mouthY={225} scarf={scarf}/>
    <g stroke="#8d8c86" strokeWidth=".65" opacity=".5"><path d="M112 182 l-8 22 M117 186 l-8 27 M188 182 l8 22 M183 186 l8 27 M132 247 l-8 12 M168 247 l8 12"/><path d="M58 312 l39 -20 M65 317 l39 -20 M242 312 l-39 -20 M235 317 l-39 -20"/></g>
  </svg>
}
