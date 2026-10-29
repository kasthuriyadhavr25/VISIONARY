import { apiUrl } from './api'
import { useEffect, useRef, useState } from 'react'

type Result = { reply: string; complete: boolean } | null
type Options = { apiKey: string; consent: boolean }
type Session = { recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; context?: AudioContext; frame?: number; timeout?: number }

export function useRecordedVoiceInterview(onTranscript: (text: string) => Result, options: Options) {
  const callback = useRef(onTranscript), config = useRef(options)
  callback.current = onTranscript; config.current = options
  const active = useRef(false), session = useRef<Session | null>(null), request = useRef<AbortController | null>(null)
  const timer = useRef<number | null>(null), begin = useRef<() => void>(() => {})
  const attempt = useRef(0)
  const [phase, setPhase] = useState<'off' | 'starting' | 'listening' | 'processing' | 'speaking'>('off')
  const [hint, setHint] = useState('Tap the mic to record an answer.')
  const cleanup = (s: Session) => {
    if (s.frame !== undefined) cancelAnimationFrame(s.frame)
    if (s.timeout !== undefined) window.clearTimeout(s.timeout)
    s.stream.getTracks().forEach(track => track.stop())
    if (s.context && s.context.state !== 'closed') void s.context.close().catch(() => {})
  }
  const stop = () => {
    active.current = false
    attempt.current += 1
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null; request.current?.abort(); request.current = null
    const s = session.current; session.current = null
    if (s) { try { if (s.recorder.state !== 'inactive') s.recorder.stop() } catch { /* Already stopped. */ }; cleanup(s) }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setPhase('off'); setHint('Voice interview paused. Tap the mic to resume.')
  }
  const finish = () => {
    const s = session.current
    if (s && s.recorder.state === 'recording') { setPhase('processing'); setHint('Transcribing your answer…'); s.recorder.stop() }
  }
  const speak = (reply: string, complete: boolean) => {
    if (!active.current) return
    let finished = false
    const done = () => {
      if (finished) return; finished = true
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      if (!active.current) return
      if (complete) { stop(); setHint('Interview complete. Review the summary and preview.'); return }
      setHint('Ready for your next answer…'); timer.current = window.setTimeout(() => begin.current(), 350)
    }
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') { done(); return }
    setPhase('speaking'); setHint('Asking the next question…')
    const utterance = new SpeechSynthesisUtterance(reply); utterance.lang = 'en-US'; utterance.onend = done; utterance.onerror = done
    window.speechSynthesis.cancel(); window.speechSynthesis.resume(); window.speechSynthesis.speak(utterance)
    timer.current = window.setTimeout(() => { window.speechSynthesis.cancel(); done() }, 18000)
  }
  begin.current = () => {
    if (!active.current) return
    const { apiKey, consent } = config.current
    if (!apiKey.trim() || !consent) { stop(); setHint('Add an API key and consent in Voice settings, or use browser speech.'); return }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { stop(); setHint('Audio recording is unavailable here. Open the site in a supported browser or type your answer.'); return }
    const currentAttempt = ++attempt.current
    setPhase('starting'); setHint('Allow microphone access in your browser’s permission prompt…')
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      if (!active.current || attempt.current !== currentAttempt) { stream.getTracks().forEach(t => t.stop()); return }
      const formats = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
      const mime = formats.find(type => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type))
      let recorder: MediaRecorder
      try { recorder = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 }) : new MediaRecorder(stream) }
      catch { stream.getTracks().forEach(t => t.stop()); stop(); setHint('This browser cannot record a supported audio format. Try browser speech or typing.'); return }
      const s: Session = { recorder, stream, chunks: [] }; session.current = s
      recorder.ondataavailable = event => { if (event.data.size) s.chunks.push(event.data) }
      recorder.onerror = () => { if (active.current && attempt.current === currentAttempt) { stop(); setHint('Audio recording stopped unexpectedly. Check your microphone and try again.') } }
      recorder.onstop = async () => {
        cleanup(s); if (session.current === s) session.current = null
        if (!active.current || attempt.current !== currentAttempt) return
        const blob = new Blob(s.chunks, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 300) { stop(); setHint('No audio was captured. Tap the mic and try again.'); return }
        try {
          const audio = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the recording.')); reader.readAsDataURL(blob) })
          if (!active.current || attempt.current !== currentAttempt) return
          request.current = new AbortController()
          const response = await fetch(apiUrl('/api/transcribe'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: apiKey.trim(), audio }), signal: request.current.signal })
          const data = await response.json().catch(() => ({})) as { text?: string; error?: string }
          request.current = null
          if (!response.ok || !data.text?.trim()) throw new Error(data.error || 'No speech was recognized.')
          if (!active.current || attempt.current !== currentAttempt) return
          const result = callback.current(data.text.trim())
          if (!result) throw new Error('No answer was captured.')
          speak(result.reply, result.complete)
        } catch (error) {
          if (!active.current || attempt.current !== currentAttempt) return
          stop(); setHint(error instanceof Error ? error.message : 'Could not transcribe the recording. Try again or type your answer.')
        }
      }
      try { recorder.start(); setPhase('listening'); setHint('Recording… speak, then pause or tap the mic to finish.') }
      catch { cleanup(s); session.current = null; stop(); setHint('Microphone could not start. Check permission and try again.'); return }
      s.timeout = window.setTimeout(finish, 40000)
      try {
        const Audio = window.AudioContext || (window as any).webkitAudioContext
        if (!Audio) return
        const context: AudioContext = new Audio(); s.context = context
        const analyser = context.createAnalyser(); analyser.fftSize = 1024; context.createMediaStreamSource(stream).connect(analyser)
        void context.resume().catch(() => {})
        const samples = new Uint8Array(analyser.fftSize); let heard = false, lastSound = Date.now(), started = Date.now()
        const check = () => {
          if (!active.current || session.current !== s || recorder.state !== 'recording') return
          analyser.getByteTimeDomainData(samples)
          let sum = 0; for (const value of samples) { const n = (value - 128) / 128; sum += n * n }
          if (Math.sqrt(sum / samples.length) > .015) { heard = true; lastSound = Date.now() }
          if (heard && Date.now() - lastSound > 1500 && Date.now() - started > 1000) { finish(); return }
          s.frame = requestAnimationFrame(check)
        }
        s.frame = requestAnimationFrame(check)
      } catch { setHint('Recording… tap the mic when you finish speaking.') }
    }).catch(error => {
      if (!active.current || attempt.current !== currentAttempt) return
      stop()
      const name = error instanceof Error ? error.name : ''
      setHint(name === 'NotAllowedError' || name === 'SecurityError' ? 'Microphone permission was denied or blocked by the preview. Open the site directly and allow microphone access.' : name === 'NotFoundError' ? 'No microphone was found. Check your device or type your answer.' : 'Could not access the microphone. Check browser permissions or type your answer.')
    })
  }
  const toggle = () => {
    if (active.current) { if (session.current?.recorder.state === 'recording') finish(); else stop(); return }
    if (!window.isSecureContext) { setHint('Microphone access requires HTTPS. Open the site directly or type your answer.'); return }
    if (!config.current.apiKey.trim() || !config.current.consent) {
      if (!navigator.mediaDevices?.getUserMedia) { setHint('Microphone access is unavailable here. Open the site directly or use a supported browser.'); return }
      active.current = true
      const currentAttempt = ++attempt.current
      setPhase('starting'); setHint('Allow microphone access in your browser’s permission prompt…')
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        stream.getTracks().forEach(track => track.stop())
        if (!active.current || attempt.current !== currentAttempt) return
        stop(); setHint('Microphone access granted. Add an API key and consent in Voice settings to transcribe, then tap the mic again.')
      }).catch(error => {
        if (!active.current || attempt.current !== currentAttempt) return
        const name = error instanceof Error ? error.name : ''
        stop(); setHint(name === 'NotAllowedError' || name === 'SecurityError' ? 'Microphone permission is blocked. Allow it in browser site settings or open the site directly.' : 'Could not access a microphone. Check your device and browser permissions.')
      })
      return
    }
    active.current = true; begin.current()
  }
  useEffect(() => () => { active.current = false; attempt.current += 1; if (timer.current !== null) window.clearTimeout(timer.current); request.current?.abort(); const s = session.current; if (s) { try { if (s.recorder.state !== 'inactive') s.recorder.stop() } catch { /* Already stopped. */ }; cleanup(s) }; if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])
  return { phase, hint, toggle, stop }
}
