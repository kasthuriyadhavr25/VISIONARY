import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowDownToLine, ArrowLeft, ArrowRight, BadgeCheck, Bell, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Copy, Eye, FileText, Fingerprint, Glasses, History, LayoutDashboard, MessageSquareText, Mic, MoreHorizontal, Plus, RotateCcw, Save, ScanFace, Search, Send, Settings2, ShieldCheck, Sparkles, UserRound, X } from 'lucide-react'
import CompositeSketch from './CompositeSketch'
import { apiUrl } from './api'
import FeatureThumbnail from './FeatureThumbnail'
import { ageRanges, fineTuneFields, fineTuneOptions, fineTuneTabs } from './fineTune'
import { photoToSketch } from './photoSketch'
import { matchReferenceFaces, referenceFaces } from './referenceFaces'
import AdobeEditor from './AdobeEditor'
import AiRefine from './AiRefine'
import AlignmentControls from './AlignmentControls'
import { interviewGuide, buildMasterPrompt } from './interviewGuide'
import { useVoiceInterview } from './useVoiceInterview'
import { useRecordedVoiceInterview } from './useRecordedVoiceInterview'
import VoiceSettings from './VoiceSettings'
import type { ReferenceEdits } from './ReferenceComposite'
import './composite.css'
import './preview.css'
import './referenceFaces.css'
import './referenceNote.css'
import './witnessFlow.css'
import './micPermission.css'

type Message = { role: 'assistant' | 'witness'; text: string; time: string }
type Attribute = { name: string; value: string; status: 'Reported' | 'Missing' | 'Uncertain' }
type Version = { id: number; time: string; attributes: Attribute[]; photo?: string; referenceId?: string; referenceEdits?: ReferenceEdits; imageOrigin?: string }
const initialAttributes: Attribute[] = [
  { name: 'Age', value: 'Not described', status: 'Missing' },
  { name: 'Face shape', value: 'Long', status: 'Reported' }, { name: 'Hair length', value: 'Short', status: 'Reported' },
  { name: 'Hair color', value: 'Black', status: 'Reported' }, { name: 'Hair texture', value: 'Straight', status: 'Reported' },
  { name: 'Mustache', value: 'Thick', status: 'Reported' }, { name: 'Beard', value: 'Not described', status: 'Missing' },
  { name: 'Eyebrows', value: 'Not described', status: 'Missing' }, { name: 'Eyes', value: 'Close together', status: 'Reported' },
  { name: 'Nose', value: 'Not described', status: 'Missing' }, { name: 'Glasses', value: 'Rectangular', status: 'Reported' },
  { name: 'Scarf', value: 'Not described', status: 'Missing' },
]
const initialMessages: Message[] = [
  { role: 'assistant', text: "Let's start with a general description. Please describe the person's appearance in your own words.", time: '10:21 AM' },
]
const blankAttributes = (): Attribute[] => initialAttributes.map(a => ({ ...a, value: 'Not described', status: 'Missing' }))
const restoreAttributes = (stored: Attribute[] = []): Attribute[] => blankAttributes().map(a => (Array.isArray(stored) ? stored : []).find(item => item.name === a.name) || a)
const now = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
function extract(text: string, current: Attribute[]) {
  const t = text.toLowerCase()
  const changes: Record<string, string> = {}
  const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const findFeature = (feature: string, values: string) => {
    const match = t.match(new RegExp(`\\b(${values})\\s+(?:\\w+\\s+){0,2}${feature}\\b|\\b${feature}\\s+(?:is\\s+|was\\s+|were\\s+|are\\s+)?(${values})\\b`))
    return match ? capitalise(match[1] || match[2]) : ''
  }
  const face = findFeature('face', 'round|oval|square|long|oblong|triangular|diamond|heart')
  const hairLength = findFeature('hair', 'bald|short|medium|long')
  const hairColor = findFeature('hair', 'black|brown|blonde|blond|grey|gray')
  const hairTexture = findFeature('hair', 'straight|wavy|curly')
  const eyeShape = findFeature('eyes?', 'round|almond|hooded|monolid|upturned|downturned')
  const noseShape = findFeature('nose', 'small|regular|long|straight|hooked|snub|pointed|broad|wide|narrow|curved')
  const browShape = findFeature('eyebrows', 'thin|thick|straight')
  if (face) changes['Face shape'] = face
  if (hairLength) changes['Hair length'] = hairLength
  if (hairColor) changes['Hair color'] = hairColor
  if (hairTexture) changes['Hair texture'] = hairTexture
  if (eyeShape) changes['Eyes'] = eyeShape
  if (noseShape) changes['Nose'] = noseShape
  if (browShape) changes['Eyebrows'] = browShape
  const ageNumber = t.match(/\b(?:aged?\s+|around\s+|about\s+)?(\d{1,2})\s*(?:years?\s*old|year[- ]old|y\/?o)\b/) || t.match(/\bage\s+(?:(?:is|was|around|about)\s+)*(\d{1,2})\b/)
  if (ageNumber) {
    const age = Number(ageNumber[1])
    const band = age < 5 ? '' : age < 13 ? '5–12' : age < 20 ? '13–19' : age < 30 ? '20–29' : age < 40 ? '30–39' : age < 50 ? '40–49' : age < 60 ? '50–59' : '60+'
    if (band) changes['Age'] = band
  } else if (/\b(?:senior|elderly|sixties|seventies)\b/.test(t)) changes['Age'] = '60+'
  else if (/\b(?:fifties|older adult)\b/.test(t)) changes['Age'] = '50–59'
  else if (/\b(?:forties|middle aged|middle-aged)\b/.test(t)) changes['Age'] = '40–49'
  else if (/\bthirties\b/.test(t)) changes['Age'] = '30–39'
  else if (/\b(?:twenties|young adult)\b/.test(t)) changes['Age'] = '20–29'
  else if (/\b(?:teenager|teen)\b/.test(t)) changes['Age'] = '13–19'
  else if (/\bchild\b/.test(t)) changes['Age'] = '5–12'
  const hairClause = t.match(/(?:(?:\b(?:bald|short|medium|long|black|brown|blonde?|gr[ae]y|white|straight|wavy|curly|and)\b)[\s,]+){0,5}\bhair\b(?:\s+(?:is|was|were|are))?(?:[\s,]+(?:and\s+)?(?:bald|short|medium|long|black|brown|blonde?|gr[ae]y|white|straight|wavy|curly)){0,4}/)?.[0]
  if (hairClause) {
    delete changes['Hair length']; delete changes['Hair color']; delete changes['Hair texture']
    const length = hairClause.match(/\b(bald|short|medium|long)\b/)
    const colour = hairClause.match(/\b(black|brown|blonde?|gr[ae]y|white)\b/)
    const texture = hairClause.match(/\b(straight|wavy|curly)\b/)
    if (length) changes['Hair length'] = capitalise(length[1])
    if (colour) changes['Hair color'] = capitalise(colour[1])
    if (texture) changes['Hair texture'] = capitalise(texture[1])
  }
  if (/long face/.test(t)) changes['Face shape'] = 'Long'
  if (/round face/.test(t)) changes['Face shape'] = 'Round'
  if (/thick mustache|thick moustache/.test(t)) changes['Mustache'] = 'Thick'
  if (/\b(?:no|without)\s+(?:a\s+)?(?:mustache|moustache)/.test(t)) changes['Mustache'] = 'None'
  else if (/\b(?:mustache|moustache)\b/.test(t) && !changes['Mustache']) changes['Mustache'] = /thin/.test(t) ? 'Thin' : /thick/.test(t) ? 'Thick' : 'Present'
  if (/\b(?:no|without)\s+(?:a\s+)?beard\b/.test(t)) changes['Beard'] = 'None'
  else if (/\bgoatee\b/.test(t)) changes['Beard'] = 'Goatee'
  else if (/\bstubble\b/.test(t)) changes['Beard'] = 'Stubble'
  else if (/\bbeard\b/.test(t)) changes['Beard'] = /\b(?:full|thick)\b/.test(t) ? 'Full' : /\b(?:short|trimmed)\b/.test(t) ? 'Short' : 'Present'
  if (/\b(?:no|without)\s+(?:a\s+)?(?:scarf|headscarf)\b/.test(t)) changes['Scarf'] = 'None'
  else if (/\b(?:headscarf|hijab)\b/.test(t)) changes['Scarf'] = 'Headscarf'
  else if (/\bscarf\b/.test(t)) changes['Scarf'] = /cover(?:ing|ed)? (?:the |their |his |her )?(?:face|mouth)/.test(t) ? 'Face covering' : /\bdraped\b/.test(t) ? 'Draped' : /\b(?:neck|wrapped)\b/.test(t) ? 'Neck wrap' : 'Present'
  if (/close together|close-set/.test(t)) changes['Eyes'] = 'Close together'
  if (/far apart|wide-set/.test(t)) changes['Eyes'] = 'Far apart'
  if (/rectangular glasses/.test(t)) changes['Glasses'] = 'Rectangular'
  if (/round glasses/.test(t)) changes['Glasses'] = 'Round'
  if (/\b(?:no|without)\s+glasses/.test(t)) changes['Glasses'] = 'None'
  else if (/\bglasses\b/.test(t) && !changes['Glasses']) changes['Glasses'] = 'Present'
  if (/\b(straight|broad|narrow|curved) nose/.test(t)) changes['Nose'] = (t.match(/\b(straight|broad|narrow|curved) nose/)?.[1] || '').replace(/^./, c => c.toUpperCase())
  return current.map(a => changes[a.name] ? { ...a, value: changes[a.name], status: 'Reported' as const } : a)
}

function extractAnswer(text: string, question: string, current: Attribute[]) {
  if (/\b(?:not sure|unsure|don.t (?:know|remember)|can.t remember|skip|no idea)\b/i.test(text)) return current
  const step = interviewGuide.find(item => question.includes(item.question))?.id
  const trimmed = text.trim().replace(/^(?:it(?:'|’)s|it was|they were|they had|i think(?: it was)?|about)\s+/i, '')
  const negative = /^(?:no|none|nope|not at all|without)(?:[.!\s]|$)/i.test(trimmed)
  if (step === 'Age') { const number = trimmed.match(/\b\d{1,2}\b/); return extract(number ? `age was ${number[0]}` : text, current) }
  if (step === 'Face shape' && !/\bface\b/i.test(text)) return extract(`face was ${trimmed}`, current)
  if ((step === 'Hair length' || step === 'Hair texture' || step === 'Hair color') && !/\bhair\b/i.test(text)) return extract(`hair was ${trimmed}`, current)
  if (step === 'Eyes' && !/\beyes?\b/i.test(text)) return extract(`eyes were ${trimmed}`, current)
  if (step === 'Eyebrows' && !/\beyebrows?\b/i.test(text)) return extract(`eyebrows were ${trimmed}`, current)
  if (step === 'Nose' && !/\bnose\b/i.test(text)) return extract(`nose was ${trimmed}`, current)
  if (step === 'Mustache' && !/\b(?:mustache|moustache)\b/i.test(text)) return extract(negative ? 'no mustache' : `${trimmed} mustache`, current)
  if (step === 'Beard' && !/\b(?:beard|stubble|goatee)\b/i.test(text)) return extract(negative ? 'no beard' : `${trimmed} beard`, current)
  if (step === 'Glasses' && !/\bglasses\b/i.test(text)) return extract(negative ? 'no glasses' : `${trimmed} glasses`, current)
  if (step === 'Scarf' && !/\b(?:scarf|headscarf|hijab)\b/i.test(text)) return extract(negative ? 'no scarf' : `${trimmed} scarf`, current)
  return extract(text, current)
}

export default function Workspace() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('sketchsense-workspace') || '{}') } catch { return {} } })()
  const [messages, setMessages] = useState<Message[]>(saved.messages || initialMessages)
  const [attributes, setAttributes] = useState<Attribute[]>(restoreAttributes(saved.attributes))
  const [versions, setVersions] = useState<Version[]>(saved.versions || [])
  const [input, setInput] = useState('')
  const [tab, setTab] = useState('Age')
  const [activeVersion, setActiveVersion] = useState<number>(saved.activeVersion ?? 0)
  const [view, setView] = useState('Workspace')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [notice, setNotice] = useState('')
  const [compare, setCompare] = useState(false)
  const [caseName, setCaseName] = useState(saved.caseName || 'SS-2026-001')
  const [caseId, setCaseId] = useState<string>(saved.caseId || saved.caseName || 'SS-2026-001')
  const [asked, setAsked] = useState<string[]>(Array.isArray(saved.asked) ? saved.asked : [])
  const [pendingQuestion, setPendingQuestion] = useState<string>(typeof saved.pendingQuestion === 'string' ? saved.pendingQuestion : 'general')
  const [interviewComplete, setInterviewComplete] = useState<boolean>(saved.interviewComplete === true)
  const [voiceMethod, setVoiceMethod] = useState<'browser' | 'recorded'>('browser')
  const [voiceApiKey, setVoiceApiKey] = useState('')
  const [voiceConsent, setVoiceConsent] = useState(false)
  const [photo, setPhoto] = useState<string>(saved.photo || '')
  const [imageOrigin, setImageOrigin] = useState<string>(saved.imageOrigin || '')
  const [referenceId, setReferenceId] = useState<string>(saved.referenceId || '')
  const [referenceEdits, setReferenceEdits] = useState<ReferenceEdits>(saved.referenceEdits || {})
  const [referenceNotes, setReferenceNotes] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem('sketchsense-reference-notes') || '{}') } catch { return {} } })
  const [showAllReferences, setShowAllReferences] = useState(false)
  const [caseDialog, setCaseDialog] = useState(false)
  const [newCaseName, setNewCaseName] = useState('')
  const [persistenceStatus, setPersistenceStatus] = useState<'connecting' | 'saved' | 'local' | 'error'>('connecting')
  const [databaseReady, setDatabaseReady] = useState(false)
  const [databaseCases, setDatabaseCases] = useState<Array<{ caseId: string; caseName?: string; status?: string; updatedAt?: string }>>([])
  const [caseListLoading, setCaseListLoading] = useState(false)
  const [caseListError, setCaseListError] = useState('')
  const databaseHydrated = useRef(false)
  const chatEnd = useRef<HTMLDivElement>(null)
  const refreshCaseList = async () => {
    setCaseListLoading(true)
    setCaseListError('')
    try {
      const response = await fetch(apiUrl('/api/cases'))
      const payload = await response.json().catch(() => ({})) as { cases?: Array<{ caseId: string; caseName?: string; status?: string; updatedAt?: string }>; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Could not load saved cases.')
      setDatabaseCases(Array.isArray(payload.cases) ? payload.cases : [])
    } catch (error) {
      setCaseListError(error instanceof Error ? error.message : 'Database is unavailable.')
    } finally { setCaseListLoading(false) }
  }
  const openStoredCase = async (id: string) => {
    try {
      setCaseListError('')
      const response = await fetch(apiUrl(`/api/cases/${encodeURIComponent(id)}`))
      const payload = await response.json().catch(() => ({})) as { case?: Record<string, unknown>; error?: string }
      if (!response.ok || !payload.case) throw new Error(payload.error || 'Could not open this case.')
      const record = payload.case
      if (Array.isArray(record.messages)) setMessages(record.messages as Message[])
      if (Array.isArray(record.attributes)) setAttributes(restoreAttributes(record.attributes as Attribute[]))
      if (Array.isArray(record.versions)) setVersions(record.versions as Version[])
      if (typeof record.activeVersion === 'number') setActiveVersion(record.activeVersion)
      setCaseId(id)
      if (typeof record.caseName === 'string') setCaseName(record.caseName)
      else setCaseName(id)
      if (typeof record.photo === 'string') setPhoto(record.photo)
      if (typeof record.imageOrigin === 'string') setImageOrigin(record.imageOrigin)
      if (typeof record.referenceId === 'string') setReferenceId(record.referenceId)
      if (record.referenceEdits && typeof record.referenceEdits === 'object') setReferenceEdits(record.referenceEdits as ReferenceEdits)
      if (Array.isArray(record.asked)) setAsked(record.asked as string[])
      if (typeof record.pendingQuestion === 'string') setPendingQuestion(record.pendingQuestion)
      if (typeof record.interviewComplete === 'boolean') setInterviewComplete(record.interviewComplete)
      databaseHydrated.current = true
      setDatabaseReady(true)
      setPersistenceStatus('saved')
      setView('Workspace')
      flash(`Opened case ${id}`)
    } catch (error) {
      setCaseListError(error instanceof Error ? error.message : 'Could not open this case.')
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (view === 'Case history' || view === 'Dashboard') void refreshCaseList() }, [view])
  useEffect(() => {
    let cancelled = false
    const loadCase = async () => {
      try {
        const response = await fetch(apiUrl(`/api/cases/${encodeURIComponent(caseId)}`))
        if (response.ok) {
          const payload = await response.json() as { case?: Record<string, unknown> }
          const record = payload.case
          if (record && !cancelled) {
            if (Array.isArray(record.messages)) setMessages(record.messages as Message[])
            if (Array.isArray(record.attributes)) setAttributes(restoreAttributes(record.attributes as Attribute[]))
            if (Array.isArray(record.versions)) setVersions(record.versions as Version[])
            if (typeof record.activeVersion === 'number') setActiveVersion(record.activeVersion)
            if (typeof record.caseId === 'string') setCaseId(record.caseId)
            if (typeof record.caseName === 'string') setCaseName(record.caseName)
            if (typeof record.photo === 'string') setPhoto(record.photo)
            if (typeof record.imageOrigin === 'string') setImageOrigin(record.imageOrigin)
            if (typeof record.referenceId === 'string') setReferenceId(record.referenceId)
            if (record.referenceEdits && typeof record.referenceEdits === 'object') setReferenceEdits(record.referenceEdits as ReferenceEdits)
            if (Array.isArray(record.asked)) setAsked(record.asked as string[])
            if (typeof record.pendingQuestion === 'string') setPendingQuestion(record.pendingQuestion)
            if (typeof record.interviewComplete === 'boolean') setInterviewComplete(record.interviewComplete)
            setPersistenceStatus('saved')
          } else if (!cancelled) setPersistenceStatus('saved')
        } else if (response.status === 404) {
          if (!cancelled) setPersistenceStatus('saved')
        } else if (!cancelled) setPersistenceStatus('local')
      } catch { if (!cancelled) setPersistenceStatus('local') }
      if (!cancelled) { databaseHydrated.current = true; setDatabaseReady(true) }
    }
    databaseHydrated.current = false
    void loadCase()
    return () => { cancelled = true }
  // Load the selected case once at mount. Case changes are saved by the effect below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const snapshot = { messages, attributes, versions, activeVersion, caseId, caseName, photo, referenceId, referenceEdits, imageOrigin, asked, pendingQuestion, interviewComplete }
    try { localStorage.setItem('sketchsense-workspace', JSON.stringify(snapshot)) } catch { setNotice('Browser storage is full; changes may not be saved') }
    if (!databaseHydrated.current || !databaseReady) return
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(apiUrl(`/api/cases/${encodeURIComponent(caseId)}`), {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot)
        })
        if (!response.ok) {
          const body = await response.json().catch(() => ({})) as { error?: string }
          setPersistenceStatus('local')
          if (response.status === 413) setNotice(body.error || 'Case is too large to save to the database')
          return
        }
        setPersistenceStatus('saved')
      } catch { setPersistenceStatus('local') }
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [messages, attributes, versions, activeVersion, caseId, caseName, photo, referenceId, referenceEdits, imageOrigin, asked, pendingQuestion, interviewComplete, databaseReady])
  useEffect(() => { try { localStorage.setItem('sketchsense-reference-notes', JSON.stringify(referenceNotes)) } catch { setNotice('Browser storage is full; reference descriptions may not be saved') } }, [referenceNotes])
  const flash = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 3000) }
  const makeOverview = (details: Attribute[]) => {
    if (!details.some(a => a.status === 'Reported')) { flash('Add at least one described feature to create an overview'); return false }
    if (photo || referenceId) {
      const id = Math.max(0, ...versions.map(v => v.id)) + 1
      setVersions([...versions, { id, time: now(), attributes: attributes.map(a => ({ ...a })), photo, referenceId, referenceEdits: { ...referenceEdits }, imageOrigin }]); setActiveVersion(id)
    }
    setPhoto(''); setImageOrigin(''); setReferenceId(''); setReferenceEdits({})
    return true
  }
  const send = (value = input): { reply: string; complete: boolean } | null => {
    const text = value.trim(); if (!text) return null
    const question = pendingQuestion === 'general' ? (messages[messages.length - 1]?.text || '') : (interviewGuide.find(q => q.id === pendingQuestion)?.question || '')
    let updated = extractAnswer(text, question, attributes)
    const uncertain = /\b(?:not sure|unsure|don.t (?:know|remember)|can.t remember|skip|no idea)\b/i.test(text)
    const unresolved = pendingQuestion !== 'general' && pendingQuestion !== 'complete' && updated.find(a => a.name === pendingQuestion)?.status === 'Missing'
    if ((uncertain || unresolved) && pendingQuestion !== 'general') updated = updated.map(a => a.name === pendingQuestion && a.status !== 'Reported' ? { ...a, value: uncertain ? 'Not sure' : 'Not confirmed', status: 'Uncertain' } : a)
    const completedQuestions = pendingQuestion !== 'general' && !asked.includes(pendingQuestion) ? [...asked, pendingQuestion] : asked
    const next = interviewComplete ? undefined : interviewGuide.find(item => !completedQuestions.includes(item.id) && updated.find(a => a.name === item.id)?.status === 'Missing')
    const done = interviewComplete || !next
    const acknowledged = uncertain || unresolved ? "That's completely fine; we can leave that uncertain." : 'Thank you, that helps.'
    const hasDetails = updated.some(a => a.status === 'Reported')
    const reply = interviewComplete ? `${acknowledged} I've updated the details and summary for you to review.` : done ? hasDetails ? `${acknowledged} We've covered the basics. I've prepared a simple overview and a summary for you to review.` : `${acknowledged} We've covered the basics. There isn't enough detail for a sketch yet, but you can add anything you remember.` : `${acknowledged} ${next.question}`
    setMessages([...messages, { role: 'witness', text, time: now() }, { role: 'assistant', text: reply, time: now() }])
    setAttributes(updated); setAsked(completedQuestions); setPendingQuestion(next?.id || 'complete'); setInput('')
    if (done && !interviewComplete) { setInterviewComplete(true); if (hasDetails) makeOverview(updated) }
    window.setTimeout(() => chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
    return { reply, complete: done }
  }
  const browserVoice = useVoiceInterview(text => send(text), setInput)
  const recordedVoice = useRecordedVoiceInterview(text => send(text), { apiKey: voiceApiKey, consent: voiceConsent })
  const voiceInterview = voiceMethod === 'recorded' ? recordedVoice : browserVoice
  const submitTyped = (value = input) => { if (voiceInterview.phase !== 'off') voiceInterview.stop(); send(value) }
  const updateAttribute = (name: string, value: string) => {
    setAttributes(prev => prev.map(a => a.name === name ? { ...a, value: value || 'Not described', status: value ? 'Reported' : 'Missing' } : a))
    if ((name === 'Age' || name === 'Face shape') && value) {
      if (photo) { flash(`${name} saved for AI refinement; the current image is preserved`); return }
      const current = referenceFaces.find(face => face.id === referenceId)
      const category = current?.category === 'Female' ? 'female' : 'male'
      const id = name === 'Age' ? `age-${category}-${ageRanges.find(age => age.label === value)?.slug}` : `${category}-${value.toLowerCase()}`
      if (referenceFaces.some(face => face.id === id)) {
        if (!referenceId) setReferenceEdits(Object.fromEntries(attributes.filter(a => a.status === 'Reported' && ['Hair length', 'Hair texture', 'Nose', 'Mustache', 'Beard', 'Glasses', 'Scarf'].includes(a.name)).map(a => [a.name, a.value])))
        setReferenceId(id); flash('Representative reference illustration selected')
      }
      return
    }
    if (referenceId || photo) setReferenceEdits(prev => ({ ...prev, [name]: value, ...((name === 'Hair length' || name === 'Hair texture') ? { '@hairSource': name } : {}) }))
  }
  const applyInterview = async () => {
    const answers = messages.filter(m => m.role === 'witness')
    if (!answers.length) { flash('Send a witness description first'); return }
    // Prefer schema-validated LLM extraction when the backend has OPENAI_API_KEY.
    // Fall back to the existing deterministic parser so the MVP still works offline.
    let extracted = blankAttributes()
    let usedLlm = false
    let llmFollowUp: string | null = null
    try {
      const response = await fetch(apiUrl('/api/extract-attributes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: answers })
      })
      if (response.ok) {
        const body = await response.json() as { attributes?: Array<{ name: string; value: string; status: Attribute['status']; evidence?: string }>; followUpQuestion?: string | null }
        if (Array.isArray(body.attributes)) {
          llmFollowUp = body.followUpQuestion || null
          extracted = extracted.map(base => {
            const found = body.attributes?.find(a => a.name === base.name)
            if (!found || found.status === 'Missing') return base
            return { ...base, value: found.value || 'Not confirmed', status: found.status }
          })
          usedLlm = true
        }
      }
    } catch {
      // Backend unavailable: use local extraction below.
    }
    if (!usedLlm) {
      messages.forEach((message, i) => {
        if (message.role === 'witness') extracted = extractAnswer(message.text, messages[i - 1]?.text || '', extracted)
      })
    }
    const recognized = extracted.filter(a => a.status === 'Reported' || a.status === 'Uncertain')
    if (!recognized.length) { flash('No supported features found. Try describing hair, eyes or nose.'); return }
    const merged = attributes.map(a => recognized.find(found => found.name === a.name) || a)
    setAttributes(merged)
    const candidates = matchReferenceFaces(merged, answers.map(a => a.text).join(' '), referenceNotes)
    if (!referenceId && !photo && candidates.length) { setReferenceId(candidates[0].face.id); setReferenceEdits({}) }
    setShowAllReferences(false)
    if (usedLlm && llmFollowUp) {
      setMessages(prev => [...prev, { role: 'assistant', text: llmFollowUp as string, time: now() }])
      setPendingQuestion('general')
    }
    flash(usedLlm ? 'AI-extracted attributes applied. Review every value before generating a composite.' : 'Rule-based details saved. Configure backend OPENAI_API_KEY for LLM extraction; review all values.')
  }
  const saveVersion = () => { const id = Math.max(0, ...versions.map(v => v.id)) + 1; setVersions([...versions, { id, time: now(), attributes: attributes.map(a => ({ ...a })), photo, referenceId, referenceEdits: { ...referenceEdits }, imageOrigin }]); setActiveVersion(id); flash(`Version ${id} saved`) }
  const applyRefined = (image: string) => {
    const id = Math.max(0, ...versions.map(v => v.id)) + 1
    const snapshot = attributes.map(a => ({ ...a }))
    setVersions([...versions, { id, time: now(), attributes: snapshot, photo, referenceId, referenceEdits: { ...referenceEdits }, imageOrigin }, { id: id + 1, time: now(), attributes: snapshot.map(a => ({ ...a })), photo: image, referenceId, referenceEdits: {}, imageOrigin: 'ai' }])
    setActiveVersion(id + 1); setPhoto(image); setImageOrigin('ai'); setReferenceEdits({}); flash('AI suggestion applied; the previous version was saved')
  }
  const newCase = () => { setNewCaseName(`SS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`); setCaseDialog(true) }
  const createCase = () => { if (!newCaseName.trim()) return; browserVoice.stop(); recordedVoice.stop(); setMessages([{ role: 'assistant', text: "Let's start with a general description. Please describe the person's appearance in your own words.", time: now() }]); setAttributes(blankAttributes()); setAsked([]); setPendingQuestion('general'); setInterviewComplete(false); setVersions([]); setActiveVersion(0); setCaseName(newCaseName.trim()); setCaseId(newCaseName.trim()); setPhoto(''); setImageOrigin(''); setReferenceId(''); setReferenceEdits({}); setInput(''); setCompare(false); setCaseDialog(false); setView('Workspace'); flash('New case created') }
  const reported = attributes.filter(a => a.status === 'Reported').length
  const covered = interviewGuide.filter(item => asked.includes(item.id) || attributes.find(a => a.name === item.id)?.status !== 'Missing').length
  const masterPrompt = buildMasterPrompt(attributes, messages)
  const awaitingDescription = !photo && !referenceId && reported === 0
  const matches = matchReferenceFaces(attributes, messages.filter(m => m.role === 'witness').map(m => m.text).join(' '), referenceNotes)
  const displayedReferences = matches.length && !showAllReferences ? matches.map(m => m.face) : referenceFaces
  return <div className="app-shell">
    <header className="app-navbar">
      <a className="brand" href="#visionary-home" onClick={(e) => { e.preventDefault(); setView('Workspace') }} aria-label="VISIONARY home">
        <span className="brand-icon"><Fingerprint size={25}/></span>
        <span className="brand-copy"><strong>VISIONARY<span> AI</span></strong><small>COMPOSITE STUDIO</small></span>
      </a>
      <nav className="primary-nav" aria-label="Main navigation">
        {[["Dashboard", LayoutDashboard], ["Workspace", ScanFace], ["Case history", History], ["Reports", FileText], ["Settings", Settings2]].map(([label, Icon]) => <button key={label as string} className={view === label ? 'active' : ''} onClick={() => setView(label as string)}><Icon size={16}/><span>{label as string}</span></button>)}
      </nav>
      <div className="navbar-right">
        <span className={`navbar-sync ${persistenceStatus === 'saved' ? 'is-saved' : ''}`}><i/>{persistenceStatus === 'saved' ? 'Synced' : persistenceStatus === 'connecting' ? 'Syncing' : 'Local mode'}</span>
        <span className="navbar-divider"/>
        <div className="navbar-profile"><span className="avatar">JD</span><span><strong>Jamie Davis</strong><small>Investigator</small></span></div>
      </div>
    </header>
    <main className="main">
      <header className="topbar"><div className="top-left"><span>Cases</span><ChevronRight size={15}/><strong>{caseName}</strong><span className="case-status"><span/> In progress</span></div><div className="top-right"><span className="secure-text"><ShieldCheck size={15}/> Secure workspace</span><button className="icon-btn" aria-label="Help" onClick={() => flash('Tip: describe features in the interview or edit them directly.')}><CircleHelp size={19}/></button><button className="icon-btn notification" aria-label="Notifications" onClick={() => flash('You’re all caught up')}><Bell size={19}/><i/></button><div className="avatar top-avatar">JD</div></div></header>
      {view === 'Workspace' ? <div className="content">
        <div className="page-heading"><div><div className="eyebrow"><span/> ACTIVE CASE WORKSPACE</div><h1>Composite workspace <span>✳</span></h1><p>From a witness account to a clearer picture.</p></div><div className="heading-actions"><button className="button light" onClick={newCase}><Plus size={16}/> New case</button><button className="button dark" onClick={() => window.print()}><ArrowDownToLine size={16}/> Export report</button></div></div>
        <div className="workflow"><div className="workflow-intro"><span className="workflow-icon"><Activity size={18}/></span><div><strong>Your workflow</strong><small>CASE PROGRESS</small></div></div>{[['01','Witness input',interviewComplete ? 'Complete' : messages.some(m => m.role === 'witness') ? 'In progress' : 'Awaiting input'],['02','Extract attributes',`${reported} identified`],['03','Build composite',interviewComplete && reported ? 'Overview ready' : reported ? 'In progress' : 'Awaiting details'],['04','Review & export','Up next']].map(([n,title,sub], i) => <div className={`workflow-step ${i === (interviewComplete && reported ? 2 : 0) ? 'current' : ''}`} key={n}><span className="step-num">{(i === 0 && interviewComplete) || (i === 1 && interviewComplete && reported > 0) ? <Check size={14}/> : n}</span><div><strong>{title}</strong><small>{sub}</small></div>{i < 3 && <ChevronRight className="step-arrow" size={15}/>}</div>)}</div>
        <div className="workspace-grid">
          <section className="panel interview-panel"><div className="panel-head"><div className="panel-title"><span className="title-icon blue"><MessageSquareText size={18}/></span><div><h2>Witness interview</h2><p>Capture the details, naturally.</p></div></div><button className="dots" onClick={() => { navigator.clipboard?.writeText(messages.map(m => `${m.role}: ${m.text}`).join('\n')); flash('Transcript copied') }} aria-label="Copy transcript"><MoreHorizontal size={20}/></button></div>
            <div className="live-line"><span><i/> {interviewComplete ? 'INTERVIEW COMPLETE' : 'GUIDED SESSION'}</span><span>{covered} / {interviewGuide.length} topics covered</span></div>
            <div className="chat-scroll">{messages.map((m,i) => <div className={`message ${m.role}`} key={i}><div className={`message-avatar ${m.role === 'assistant' ? 'bot' : 'person'}`}>{m.role === 'assistant' ? <Sparkles size={15}/> : <UserRound size={16}/>}</div><div className="message-content"><div className="message-meta"><strong>{m.role === 'assistant' ? 'VISIONARY AI' : 'Witness'}</strong><span>{m.time}</span></div><div className="bubble">{m.text}</div></div></div>)}<div ref={chatEnd}/></div>
            <div className="chat-bottom"><div className="suggestions"><span>QUICK REPLIES</span><div><button onClick={() => submitTyped('I am not sure.')}>Not sure</button><button onClick={() => submitTyped('Skip this question.')}>Skip question</button></div></div><div className="input-wrap"><button className={voiceInterview.phase !== 'off' ? 'voice-active' : ''} onClick={voiceInterview.toggle} aria-label={voiceInterview.phase === 'listening' ? 'Finish voice answer' : voiceInterview.phase !== 'off' ? 'Stop voice interview' : 'Start voice interview'} aria-pressed={voiceInterview.phase !== 'off'}><Mic size={18}/></button><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitTyped() }} placeholder="Type or speak your response..."/><button className="send" onClick={() => submitTyped()} aria-label="Send message"><Send size={17}/></button></div><div className={`voice-status ${voiceInterview.phase !== 'off' ? 'active' : ''}`} role="status" aria-live="polite"><span className="voice-dot"/>{voiceInterview.hint}</div>{voiceInterview.phase !== 'off' && <button className="voice-stop" onClick={voiceInterview.stop}>Stop voice interview</button>}<VoiceSettings method={voiceMethod} onMethod={method => { browserVoice.stop(); recordedVoice.stop(); setVoiceMethod(method) }} apiKey={voiceApiKey} onApiKey={setVoiceApiKey} consent={voiceConsent} onConsent={setVoiceConsent} disabled={voiceInterview.phase !== 'off'}/><p className="privacy-note"><ShieldCheck size={12}/> Text is saved locally; speech is processed by the selected provider.</p></div>
            {masterPrompt && <div className="master-prompt"><div className="master-prompt-head"><strong>Master prompt</strong><span>{interviewComplete ? 'READY TO REVIEW' : 'BUILDING FROM INTERVIEW'}</span></div><textarea readOnly aria-label="Master prompt" value={masterPrompt}/><div className="master-prompt-actions"><button onClick={async () => { try { await navigator.clipboard.writeText(masterPrompt); flash('Master prompt copied') } catch { flash('Select the prompt text to copy it') } }}><Copy size={13}/> Copy prompt</button><button onClick={() => { if (makeOverview(attributes)) flash('Basic overview created; review every feature') }}><ScanFace size={13}/> Create basic overview</button></div><p>Generated from recognized details and the transcript. Unreported features in the overview are illustrative placeholders.</p></div>}
          </section>
          <section className="panel composite-panel"><div className="panel-head"><div className="panel-title"><span className="title-icon teal"><ScanFace size={19}/></span><div><h2>Composite builder</h2><p>Refine the picture, feature by feature.</p></div></div><span className="preview-tag"><span/> PREVIEW</span></div>
            <div className="canvas"><div className="canvas-top"><span><span className="canvas-dot"/> {awaitingDescription ? 'REFERENCE ATLAS' : photo && imageOrigin === 'ai' ? 'AI-GENERATED PREVIEW' : photo ? 'IMAGE PREVIEW' : referenceId ? 'REFERENCE COMPOSITE' : 'FEATURE COMPOSITE'}</span></div>{awaitingDescription ? <a className="reference-preview" href="/features/reference-atlas.jpg" target="_blank" rel="noreferrer" title="Open the full reference atlas"><img src="/features/reference-atlas.jpg" alt="Uploaded facial feature reference atlas"/></a> : <CompositeSketch attributes={attributes} photo={photo} referenceId={referenceId} referenceEdits={referenceEdits}/>}<div className="canvas-foot"><span>{awaitingDescription ? 'AWAITING WITNESS DETAILS' : 'ILLUSTRATIVE PREVIEW'}</span><span>{awaitingDescription ? 'CLICK TO ENLARGE' : 'FRONT VIEW  /  01'}</span></div></div>
            <div className="apply-interview"><button className="button primary" onClick={applyInterview}><Sparkles size={15}/> Update from interview</button><span>Finds reference suggestions without changing existing edits.</span></div>
            <AiRefine reference={referenceFaces.find(face => face.id === referenceId)} image={photo} attributes={attributes} edits={referenceEdits} onApply={applyRefined}/>
            <AdobeEditor onSave={image => { setPhoto(image); setImageOrigin('adobe'); setReferenceEdits({}); flash('Edited image returned from Adobe Express') }}/>
            <div className="reference-library"><h3>{matches.length && !showAllReferences ? 'Suggested reference faces' : 'Reference face library'}</h3><p>{matches.length && !showAllReferences ? 'Suggestions use chart labels and matching words in reference descriptions; review each face.' : 'Browse the original chart illustrations; descriptions are stored for matching.'}</p>{matches.length > 0 && <button className="reference-clear" onClick={() => setShowAllReferences(!showAllReferences)}>{showAllReferences ? 'Show suggestions' : `Show all ${referenceFaces.length} reference faces`}</button>}<div className="reference-cards">{displayedReferences.map(face => <button key={face.id} className={`reference-card ${face.id === referenceId ? 'selected' : ''}`} onClick={() => { setReferenceId(face.id); if (!photo) setReferenceEdits({}); flash(photo ? 'Reference selected for alignment; image preserved' : `${face.description} selected`) }}><img src={face.image} alt=""/><strong>{face.title}</strong><small>{face.group}</small></button>)}</div><div className="reference-note">{referenceId ? `${referenceFaces.find(face => face.id === referenceId)?.description} · Base illustration, not an identification.` : 'Reference descriptions are chart labels and visual estimates, not verified identity or evidence.'}</div>{referenceId && <><label className="reference-description">Editable reference description<textarea value={referenceNotes[referenceId] ?? referenceFaces.find(face => face.id === referenceId)?.visualDescription ?? ''} onChange={e => setReferenceNotes(prev => ({ ...prev, [referenceId]: e.target.value }))} placeholder="Add visual notes, e.g. short wavy hair" rows={2}/><span>Chart labels and visual estimates; edits are saved in this browser for matching.</span></label><button className="reference-clear" onClick={() => { setReferenceId(''); if (!photo) setReferenceEdits({}) }}>Use feature-only composite instead</button></>}</div>
            <div className="builder"><div className="builder-title"><div><strong>Fine-tune features</strong><span>Select a feature to make adjustments</span></div><Settings2 size={17}/></div><div className="tabs">{fineTuneTabs.map(t => <button className={tab === t ? 'selected' : ''} onClick={() => setTab(t)} key={t}>{t}</button>)}</div><div className="option-heading"><strong>{tab}</strong><span>SELECT A STYLE</span></div><div className="option-grid">{fineTuneOptions[tab].map(option => <button key={option} className={attributes.find(a => a.name === fineTuneFields[tab])?.value === option ? 'selected' : ''} onClick={() => updateAttribute(fineTuneFields[tab], option)}><span className="option-symbol"><FeatureThumbnail tab={tab} option={option}/></span><span>{option}</span></button>)}</div>{(tab === 'Age' || tab === 'Face shape') && <p className="preview-disclaimer">{photo ? 'Selection is saved for AI refinement; your current image stays unchanged.' : 'Selection switches to a representative chart face, not an age or identity prediction.'}</p>}<div className="photo-actions"><label>Upload photo for sketch<input type="file" accept="image/*" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { setPhoto(await photoToSketch(file)); setImageOrigin('photo'); setReferenceEdits({}); flash('Photo sketch created locally') } catch { flash('Could not process this image') } e.target.value = '' }}/></label>{photo && <button onClick={() => { setPhoto(''); setImageOrigin('') }}>Return to feature composite</button>}</div><div className="builder-actions"><button className="button outline" onClick={() => { setPhoto(''); setImageOrigin(''); setReferenceId(''); setReferenceEdits({}); setAttributes(blankAttributes()); flash('Features cleared; update from interview to restore them') }}><RotateCcw size={15}/> Reset</button><button className="button primary" onClick={saveVersion}><Save size={15}/> Save version</button></div><p className="preview-disclaimer">{photo && imageOrigin === 'ai' ? 'AI-generated suggestion; review all details. Feature edits remain separate overlays.' : photo ? 'Feature edits are separate overlays; the underlying image remains unchanged. Adobe edits are processed by Adobe.' : referenceId ? 'Edits are illustrative overlays. Some features cannot be removed from the source face; verify all details.' : 'Atlas-based illustrations respond to recognized features. Verify the result; it is not an identification.'}</p></div>
            {(referenceId || photo) && tab !== 'Age' && tab !== 'Face shape' && <AlignmentControls feature={tab} edits={referenceEdits} onChange={setReferenceEdits}/>}
          </section>
          <section className="panel attributes-panel"><div className="panel-head"><div className="panel-title"><span className="title-icon mint"><Sparkles size={18}/></span><div><h2>Extracted attributes</h2><p>Details identified from the interview.</p></div></div></div><div className="attributes-summary"><div><span className="small-label">CASE DETAILS</span><strong>{reported} <small>/ {attributes.length} identified</small></strong></div><div className="progress-ring" style={{ background: `conic-gradient(#168679 ${reported / attributes.length * 360}deg, #e8f0ed 0deg)` }}><span>{Math.round(reported / attributes.length * 100)}%</span></div></div><div className="table-head"><span>FEATURE</span><span>VALUE</span><span>STATUS</span></div><div className="attribute-list">{attributes.map(a => <div className="attribute-row" key={a.name}><span className="attribute-name"><span className="attribute-icon">{a.name === 'Glasses' ? <Glasses size={15}/> : a.name === 'Eyes' ? <Eye size={15}/> : a.name === 'Face shape' ? <ScanFace size={15}/> : <span>✧</span>}</span>{a.name}</span><span className="attribute-value" onClick={() => { setEditing(a.name); setEditValue(a.status === 'Missing' ? '' : a.value) }} title="Click to edit">{editing === a.name ? <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => { updateAttribute(a.name, editValue); setEditing(null) }} onKeyDown={e => { if(e.key === 'Enter') { updateAttribute(a.name, editValue); setEditing(null) } }} /> : a.value}</span><span className={`status ${a.status.toLowerCase()}`}><i/>{a.status}</span></div>)}</div><div className="attribute-tip"><CircleHelp size={16}/><span>Missing or uncertain details remain editable and are never assumed.</span></div><button className="text-button" onClick={() => { setEditing('Nose'); setEditValue(''); flash('Select any value to edit it') }}>Edit attributes <ArrowRight size={15}/></button></section>
        </div>
        <div className="bottom-row"><section className="panel history-panel"><div className="bottom-head"><div><h2>Version history <span>{versions.length}</span></h2><p>Review changes made to this composite.</p></div><button className="button light small" onClick={() => setCompare(!compare)}><Copy size={14}/> {compare ? 'Close comparison' : 'Compare versions'}</button></div><div className="version-list">{versions.length === 0 ? <p className="empty">No versions yet. Save a version to see it here.</p> : versions.map(v => <button className={`version ${activeVersion === v.id ? 'selected' : ''}`} key={v.id} onClick={() => { setActiveVersion(v.id); setAttributes(restoreAttributes(v.attributes)); setPhoto(v.photo || ''); setImageOrigin(v.imageOrigin || ''); setReferenceId(v.referenceId || ''); setReferenceEdits(v.referenceEdits || {}); flash(`Version ${v.id} loaded`) }}><CompositeSketch attributes={v.attributes} photo={v.photo} referenceId={v.referenceId} referenceEdits={v.referenceEdits}/><div><strong>Version {String(v.id).padStart(2,'0')} {activeVersion === v.id && <span>ACTIVE</span>}</strong><small><Clock3 size={12}/> {v.time}{v.imageOrigin === 'ai' ? ' · AI' : ''}</small></div><ChevronRight size={16}/></button>)}</div>{compare && <div className="comparison">{versions.length < 2 ? 'Save another version to compare changes.' : `Version ${versions[versions.length - 2].id} → Version ${versions[versions.length - 1].id}: ${versions[versions.length - 1].attributes.filter(a => a.value !== versions[versions.length - 2].attributes.find(old => old.name === a.name)?.value).map(a => `${a.name}: ${a.value}`).join(', ') || 'No attribute changes.'}`}</div>}</section><section className="panel report-panel"><div className="report-icon"><FileText size={20}/></div><div><h2>Ready to share your findings?</h2><p>Export a case summary with the composite and reported attributes.</p><button onClick={() => window.print()}>Export case report <ArrowRight size={15}/></button></div><div className="report-decoration"><Fingerprint size={90}/></div></section></div>
        <footer><span>VISIONARY AI &nbsp; • &nbsp; Forensic composite workspace</span><span><span className="footer-dot"/> {persistenceStatus === 'saved' ? 'Database synced' : persistenceStatus === 'connecting' ? 'Connecting…' : 'Local cache only — database not synced'}</span></footer>
      </div> : <div className="content alternate"><button className="back-link" onClick={() => setView('Workspace')}><ArrowLeft size={16}/> Back to workspace</button><div className="eyebrow"><span/> VISIONARY AI</div><h1>{view}</h1><p>{view === 'Dashboard' ? 'Live overview of the cases stored in your database.' : view === 'Case history' ? 'Open a saved case from MongoDB, or refresh the list to see the latest records.' : view === 'Reports' ? 'Prepare and export your current case findings.' : 'Your workspace preferences and privacy.'}</p>{view === 'Case history' || view === 'Dashboard' ? <><div className="case-history-toolbar"><div><strong>{databaseCases.length} saved case{databaseCases.length === 1 ? '' : 's'}</strong><span>Source: backend API → MongoDB</span></div><button className="button light" onClick={() => void refreshCaseList()} disabled={caseListLoading}>{caseListLoading ? 'Refreshing…' : 'Refresh records'}</button></div>{caseListError && <div className="database-error"><strong>Could not read saved cases</strong><span>{caseListError}</span><small>Check that the backend is running and /api/health reports database: true.</small></div>}{caseListLoading && databaseCases.length === 0 ? <div className="panel alternate-card">Loading database records…</div> : databaseCases.length === 0 ? <div className="panel alternate-card"><FileText size={28}/><h2>No saved cases found</h2><p>Cases appear here after the backend successfully saves them to MongoDB. Local browser drafts are not automatically database records until synced.</p><button className="button primary" onClick={() => setView('Workspace')}>Go to workspace</button></div> : <div className="case-record-grid">{databaseCases.map(item => <article className="panel case-record" key={item.caseId}><div className="case-record-icon"><FileText size={20}/></div><div className="case-record-main"><h2>{item.caseName || item.caseId}</h2><p>Case ID: {item.caseId}</p><span className="case-record-meta">Updated {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : 'date unavailable'}</span></div><span className="case-record-status">{item.status || 'In progress'}</span><button className="button primary" onClick={() => void openStoredCase(item.caseId)}>Open case <ArrowRight size={15}/></button></article>)}</div>}</> : <div className="panel alternate-card">{view === 'Settings' ? <><ShieldCheck size={26}/><h2>Privacy & storage</h2><p>Case details sync to MongoDB when configured, with a browser cache as fallback. The database stores interview messages, facial attributes, sketch versions, image data, and case metadata. Review consent and access controls before using real sensitive records.</p><p><strong>Database status:</strong> {persistenceStatus === 'saved' ? 'Connected and synced' : persistenceStatus === 'connecting' ? 'Checking connection' : 'Not currently synced'}</p><button className="button light" onClick={newCase}>Create a new case</button></> : <><span className="title-icon teal"><FileText size={20}/></span><h2>{caseName}</h2><p>{reported} attributes identified · {versions.length} saved versions · In progress</p><div className="alternate-actions"><button className="button primary" onClick={() => setView('Workspace')}>Open workspace <ArrowRight size={15}/></button><button className="button light" onClick={() => window.print()}>Export report</button></div></>}</div>}</div>}
    </main>{notice && <div className="toast"><CheckCircle2 size={17}/>{notice}<button onClick={() => setNotice('')}><X size={15}/></button></div>}
    {caseDialog && <div className="case-modal-backdrop" onClick={() => setCaseDialog(false)}><form className="case-modal" onClick={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); createCase() }}><h2>Create a new case</h2><p>This starts a fresh interview and replaces the current case stored in this browser. Export your current report first if you need to keep it.</p><label htmlFor="new-case-name">Case ID</label><input id="new-case-name" autoFocus required value={newCaseName} onChange={e => setNewCaseName(e.target.value)} /><div className="case-modal-actions"><button type="button" className="button light" onClick={() => setCaseDialog(false)}>Cancel</button><button type="submit" className="button primary">Create case</button></div></form></div>}
    <div className="print-report"><div className="print-brand"><Fingerprint size={28}/> VISIONARY AI</div><h1>Composite case report</h1><p>Case ID: {caseName} &nbsp; | &nbsp; Generated: {new Date().toLocaleDateString()}</p><h2>Illustrative composite</h2><CompositeSketch attributes={attributes} photo={photo} referenceId={referenceId} referenceEdits={referenceEdits}/><p>{photo && imageOrigin === 'ai' ? 'AI-generated suggestion; verify all details. ' : ''}Illustrative sketch only; not a photorealistic identification.</p><h2>Reported attributes</h2><table><tbody>{attributes.map(a => <tr key={a.name}><td>{a.name}</td><td>{a.value}</td><td>{a.status}</td></tr>)}</tbody></table><h2>Interview transcript</h2>{messages.map((m,i) => <p key={i}><strong>{m.role === 'assistant' ? 'VISIONARY AI' : 'Witness'}:</strong> {m.text}</p>)}</div>
  </div>
}
