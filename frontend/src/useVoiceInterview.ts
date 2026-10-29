import { useEffect, useRef, useState } from 'react'

type Result = { reply: string; complete: boolean } | null
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onstart: (() => void) | null; onresult: ((event: any) => void) | null; onerror: ((event: any) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void }

export function useVoiceInterview(onTranscript: (text: string) => Result, onInterim: (text: string) => void) {
  const callback = useRef(onTranscript), interim = useRef(onInterim)
  callback.current = onTranscript; interim.current = onInterim
  const recognition = useRef<Recognition | null>(null), active = useRef(false)
  const timer = useRef<number | null>(null), startNext = useRef<() => void>(() => {})
  const attempt = useRef(0)
  const [phase, setPhase] = useState<'off' | 'starting' | 'listening' | 'speaking'>('off')
  const [hint, setHint] = useState('Tap the mic, then allow microphone access when your browser asks.')

  const stop = () => {
    active.current = false
    attempt.current += 1
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    try { recognition.current?.abort() } catch { /* Recognition may already be stopped. */ }
    recognition.current = null
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setPhase('off')
    setHint('Tap the mic to start or resume a voice interview.')
  }

  const speak = (reply: string, complete: boolean) => {
    if (!active.current) return
    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = null
      if (!active.current) return
      if (complete) { stop(); setHint('Interview complete. Review the summary and preview.'); return }
      setHint('Ready for your next answer…')
      timer.current = window.setTimeout(() => startNext.current(), 350)
    }
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') { setHint('Read the next question above. Listening will resume.'); done(); return }
    setPhase('speaking'); setHint('Asking the next question…')
    const utterance = new SpeechSynthesisUtterance(reply)
    utterance.lang = 'en-US'; utterance.rate = 1
    utterance.onend = done; utterance.onerror = done
    window.speechSynthesis.cancel(); window.speechSynthesis.resume(); window.speechSynthesis.speak(utterance)
    timer.current = window.setTimeout(() => { window.speechSynthesis.cancel(); done() }, 18000)
  }

  startNext.current = () => {
    if (!active.current) return
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Speech) { stop(); setHint('Microphone access is available, but this browser has no speech recognition. Choose recorded audio in Voice settings or type your answer.'); return }
    let finalText = '', partial = ''
    const finalized: string[] = []
    let instance: Recognition
    try { instance = new Speech() as Recognition } catch { stop(); setHint('Voice input could not start. You can type your answers instead.'); return }
    recognition.current = instance
    instance.lang = 'en-US'; instance.continuous = false; instance.interimResults = true
    instance.onstart = () => { if (active.current && recognition.current === instance) { setPhase('listening'); setHint('Listening… speak naturally, then pause.') } }
    instance.onresult = (event: any) => {
      if (!active.current || recognition.current !== instance) return
      let interimText = ''
      for (let i = event.resultIndex || 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) finalized[i] = result[0].transcript
        else interimText += result[0].transcript
      }
      finalText = finalized.filter(Boolean).join(' ')
      partial = `${finalText} ${interimText}`.trim()
      if (partial) interim.current(partial)
    }
    instance.onerror = (event: any) => {
      if (!active.current || recognition.current !== instance || event.error === 'aborted') return
      const errors: Record<string, string> = {
        'not-allowed': 'Microphone or speech permission was denied. Allow it in browser site settings; if this is a preview, open the site directly.',
        'service-not-allowed': 'Speech recognition is blocked by the browser or embedded preview. Open the site directly or type your answer.',
        'audio-capture': 'No microphone was found. Check your device or type your answer.',
        'network': 'Speech recognition needs a network connection. Check it or type your answer.',
        'no-speech': 'No speech was heard. Tap the mic to try again, or type your answer.',
      }
      stop(); setHint(errors[event.error] || 'Voice input stopped. Check microphone permissions or type your answer.')
    }
    instance.onend = () => {
      if (recognition.current !== instance) return
      recognition.current = null
      if (!active.current) return
      const answer = (finalText || partial).trim()
      if (!answer) { stop(); setHint('No speech was heard. Tap the mic to try again, or type your answer.'); return }
      const result = callback.current(answer)
      if (!result) { stop(); setHint('No answer was captured. Try again or type your answer.'); return }
      speak(result.reply, result.complete)
    }
    try { setPhase('starting'); setHint('Starting microphone…'); instance.start() }
    catch { stop(); setHint('Microphone could not start. Check browser permissions or type your answer.') }
  }

  const toggle = () => {
    if (active.current) {
      if (phase === 'listening' && recognition.current) { try { recognition.current.stop(); setPhase('starting'); setHint('Finishing your answer…') } catch { stop(); setHint('Voice interview paused. Tap the mic to continue.') }; return }
      stop(); setHint('Voice interview paused. Tap the mic to continue.'); return
    }
    if (!window.isSecureContext) { setHint('Voice input needs a secure HTTPS connection. Open the site directly or type your answer.'); return }
    active.current = true
    const currentAttempt = ++attempt.current
    if (!navigator.mediaDevices?.getUserMedia) {
      if ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) { startNext.current(); return }
      stop(); setHint('This browser cannot request microphone access here. Open the site directly in a supported browser.'); return
    }
    setPhase('starting'); setHint('Allow microphone access in your browser’s permission prompt…')
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      stream.getTracks().forEach(track => track.stop())
      if (!active.current || attempt.current !== currentAttempt) return
      startNext.current()
    }).catch(error => {
      if (!active.current || attempt.current !== currentAttempt) return
      const name = error instanceof Error ? error.name : ''
      stop()
      setHint(name === 'NotAllowedError' || name === 'SecurityError' ? 'Microphone permission is blocked. Allow it in browser site settings; if this is a preview, open the site directly.' : name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'No microphone was found. Connect a microphone and try again.' : name === 'NotReadableError' || name === 'TrackStartError' ? 'The microphone is unavailable or in use by another app. Close that app and try again.' : 'Could not access the microphone. Check browser site permissions and try again.')
    })
  }
  useEffect(() => () => { active.current = false; attempt.current += 1; if (timer.current !== null) window.clearTimeout(timer.current); try { recognition.current?.abort() } catch { /* Already stopped. */ }; if ('speechSynthesis' in window) window.speechSynthesis.cancel() }, [])
  return { phase, hint, toggle, stop }
}
