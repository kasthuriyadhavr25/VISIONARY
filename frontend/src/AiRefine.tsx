import { apiUrl } from './api'
import { useState } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { compactResult, dataUrl, previewBlob } from './AdobeEditor'
import type { FaceReference } from './referenceFaces'
import type { ReferenceEdits } from './ReferenceComposite'
import './aiRefine.css'
type Attribute = { name: string; value: string; status: string }
export default function AiRefine({ reference, image, attributes, edits, onApply }: { reference?: FaceReference; image: string; attributes: Attribute[]; edits: ReferenceEdits; onApply: (image: string) => void }) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [candidate, setCandidate] = useState('')
  const [consent, setConsent] = useState(false)
  const [previous, setPrevious] = useState('')
  const choices = attributes.filter(a => a.status === 'Reported' && a.value && a.value !== 'Not described').map(a => `${a.name}: ${a.value}`)
  const stageEdits = Object.keys(edits).filter(k => !k.startsWith('@')).length
  const generate = async () => {
    if (!reference && !image && !attributes.some(a => a.status === 'Reported' && a.value && a.value !== 'Not described')) {
      setError('Describe at least one feature or select a reference before generating.')
      return
    }
    if (!key.trim()) { setError('Enter an OpenAI API key.'); return }
    if (!consent) { setError('Confirm that you may send the attribute specification to OpenAI.'); return }
    setBusy(true); setError(''); setCandidate('')
    try {
      // Preserve a snapshot for comparison, but generate a fresh image from the
      // witness-verified attribute specification rather than repeatedly editing
      // the same reference/dummy image.
      const stage = await previewBlob()
      const staged = await dataUrl(stage)
      setPrevious(staged)
      const response = await fetch(apiUrl('/api/refine'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: key.trim(),
          attributes: attributes.map(a => ({ name: a.name, value: a.value, status: a.status })),
          features: choices,
          edits,
          variation: `new candidate ${new Date().toISOString()}`
        })
      })
      const body = await response.json().catch(() => ({})) as { image?: string; error?: string }
      if (!response.ok || !body.image) throw new Error(body.error || 'The AI service did not return an image.')
      setCandidate(await compactResult(body.image))
      setKey('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not generate an image.') }
    finally { setBusy(false) }
  }
  return <div className="ai-refine"><button className="button primary ai-refine-trigger" onClick={() => setOpen(!open)}><Sparkles size={15}/> Refine with AI</button><span>Generate a fresh sketch from reported attributes.</span>{open && <div className="ai-refine-panel"><button className="ai-refine-close" aria-label="Close AI refinement" onClick={() => setOpen(false)}><X size={14}/></button><strong>AI-generated composite</strong><p>First select a reference and fine-tune the features. OpenAI receives the structured attribute specification and manual feature selections. The generation request does not send the current/reference face as an image input. Review results carefully: AI can change or invent details and is not an identification tool.</p><div className="ai-refine-summary"><span>REFERENCE</span><b>{image ? 'Current image' : reference?.description || 'Select a face below'}</b><span>FEATURES</span><b>{choices.length ? choices.join(' · ') : 'No reported features selected'}</b><small>{stageEdits} staged feature overlay{stageEdits === 1 ? '' : 's'}</small></div><label className="ai-refine-key">OpenAI API key<input type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder="Your OpenAI API key"/></label><label className="ai-refine-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>I am authorized to send these witness attributes to OpenAI. API usage may incur charges. The key is sent to this site's server for this request and is not saved.</span></label><button className="button primary small" disabled={busy} onClick={generate}><Sparkles size={14}/>{busy ? 'Generating… this may take a minute' : 'Generate new sketch'}</button>{error && <p className="ai-refine-error" role="alert">{error}</p>}{candidate && <div className="ai-candidate"><div className="ai-candidate-head"><strong>Review before applying</strong><span>AI-generated · verify every detail</span></div><div className="ai-candidate-images"><div><img src={previous} alt="Staged composite before refinement"/><span>Before</span></div><div><img src={candidate} alt="AI-refined composite suggestion"/><span>AI suggestion</span></div></div><div className="ai-candidate-actions"><button className="button light small" onClick={() => setCandidate('')}>Discard</button><button className="button primary small" onClick={() => { onApply(candidate); setCandidate(''); setOpen(false) }}><Check size={14}/> Apply to preview</button></div></div>}</div>}</div>
}
