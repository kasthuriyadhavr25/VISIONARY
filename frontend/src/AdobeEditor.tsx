import { useState } from 'react'
import { ArrowDownToLine, ExternalLink, X } from 'lucide-react'
import './adobeEditor.css'

type AdobeModule = { editImage: (doc: unknown, app: unknown, exports: unknown) => void }
declare global { interface Window { CCEverywhere?: { initialize: (info: { clientId: string; appName: string }) => Promise<{ module: AdobeModule }> } } }

export async function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Could not read the image')); r.readAsDataURL(blob) })
}
export async function previewBlob(): Promise<Blob> {
  const svg = document.querySelector<SVGSVGElement>('.canvas .composite-sketch')
  const image = document.querySelector<HTMLImageElement>('.canvas > img, .canvas .reference-preview img')
  let src = ''
  if (svg) {
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', '300'); clone.setAttribute('height', '330')
    await Promise.all(Array.from(clone.querySelectorAll('image')).map(async element => {
      const href = element.getAttribute('href') || element.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      if (href && !href.startsWith('data:')) { const response = await fetch(href); if (!response.ok) throw new Error('Could not load a sketch layer'); element.setAttribute('href', await dataUrl(await response.blob())) }
    }))
    src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }))
  } else if (image) src = image.src
  else throw new Error('Select a reference face or create a sketch first')
  try {
    const img = new Image(); img.src = src; await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 990
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not render the preview')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height)
    ctx.drawImage(img, (canvas.width - img.width * scale) / 2, (canvas.height - img.height * scale) / 2, img.width * scale, img.height * scale)
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not export the preview')), 'image/png'))
  } finally { if (svg && src.startsWith('blob:')) URL.revokeObjectURL(src) }
}
export async function compactResult(data: string): Promise<string> {
  const img = new Image(); img.src = data; await img.decode()
  const scale = Math.min(1, 900 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not save the edited image')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', .86)
}
export default function AdobeEditor({ onSave }: { onSave: (data: string) => void }) {
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState(() => localStorage.getItem('sketchsense-adobe-client') || '')
  const [appName, setAppName] = useState(() => localStorage.getItem('sketchsense-adobe-name') || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const download = async () => { try { setError(''); const blob = await previewBlob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'sketchsense-composite.png'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000) } catch (e) { setError(e instanceof Error ? e.message : 'Unable to export') } }
  const edit = async () => {
    if (!clientId.trim() || !appName.trim()) { setError('Enter your Adobe client ID and public app name.'); return }
    setBusy(true); setError('')
    try {
      const blob = await previewBlob()
      const sdkUrl = 'https://cc-embed.adobe.com/sdk/v4/CCEverywhere.js'
      await import(/* @vite-ignore */ sdkUrl)
      if (!window.CCEverywhere) throw new Error('Adobe Express SDK could not be loaded')
      localStorage.setItem('sketchsense-adobe-client', clientId.trim()); localStorage.setItem('sketchsense-adobe-name', appName.trim())
      const { module } = await window.CCEverywhere.initialize({ clientId: clientId.trim(), appName: appName.trim() })
      module.editImage({ asset: { name: 'VISIONARY composite', type: 'image', dataType: 'blob', data: blob } }, { appVersion: '2', callbacks: {
        onCancel: () => setBusy(false),
        onError: (err: unknown) => { setBusy(false); setError(`Adobe Express: ${String(err)}`) },
        onPublish: async (_intent: unknown, result: { asset?: { data?: string }[] }) => { try { const image = result.asset?.[0]?.data; if (!image) throw new Error('Adobe returned no image'); onSave(await compactResult(image)); setOpen(false) } catch (e) { setError(e instanceof Error ? e.message : 'Could not import the edited image') } finally { setBusy(false) } },
      } }, [{ id: 'save-modified-asset', label: 'Save image', action: { target: 'publish' }, style: { uiType: 'button' } }])
      setBusy(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Adobe Express could not be started'); setBusy(false) }
  }
  return <div className="adobe-editor"><div className="adobe-actions"><button className="button light small" onClick={download}><ArrowDownToLine size={14}/> Download PNG</button><button className="button light small" onClick={() => setOpen(!open)}><ExternalLink size={14}/> Edit in Adobe Express</button></div>{open && <div className="adobe-setup"><button className="adobe-close" aria-label="Close Adobe setup" onClick={() => setOpen(false)}><X size={14}/></button><strong>Connect Adobe Express</strong><p>Requires an Adobe Embed SDK client ID, a registered public app name and an approved site domain. Opening the editor sends the preview to Adobe; Adobe sign-in may be required.</p><label>Client ID<input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Adobe client ID"/></label><label>Public app name<input value={appName} onChange={e => setAppName(e.target.value)} placeholder="Name from Adobe Developer Console"/></label><button className="button primary small" onClick={edit} disabled={busy}>{busy ? 'Opening editor…' : 'Open Adobe editor'}</button><a href="https://developer.adobe.com/express/embed-sdk/" target="_blank" rel="noreferrer">Adobe SDK setup guide ↗</a></div>}{error && <p className="adobe-error" role="alert">{error}</p>}</div>
}
