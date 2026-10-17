'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bookmark, Check, ChevronLeft, ChevronRight, Clock3, Expand, GraduationCap, Loader2, Save, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Attempt, Result, api } from '@/lib/examly'
import { cn } from '@/lib/utils'

export function ExamRunner({ attempt, onComplete }: { attempt: Attempt; onComplete: (result: Result) => void }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState(attempt.answers)
  const [marked, setMarked] = useState<Set<number>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveState, setSaveState] = useState('All answers saved')
  const [warnings, setWarnings] = useState(attempt.warnings)
  const offset = useRef(Date.now() - attempt.serverNow)
  const [seconds, setSeconds] = useState(Math.max(0, Math.ceil((attempt.deadline - attempt.serverNow) / 1000)))
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const submitting = useRef(false)
  const finished = useRef(false)
  const question = attempt.questions[index]
  const answered = Object.values(answers).filter(a => a.trim()).length

  const submit = useCallback(async () => {
    if (submitting.current || finished.current) return
    submitting.current = true; setBusy(true)
    try {
      await queue.current.catch(() => {})
      const result = await api<Result>(`attempts/${attempt.id}/submit`, { answers })
      finished.current = true
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
      toast.success(result.status === 'PENDING_REVIEW' ? 'Exam submitted! Your faculty will review written answers.' : 'Exam submitted. Well done for showing up!')
      onComplete(result)
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false); submitting.current = false }
  }, [answers, attempt.id, onComplete])

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((attempt.deadline - Date.now() + offset.current) / 1000))
      setSeconds(remaining)
      if (remaining === 0) void submit()
    }, 1000)
    return () => clearInterval(interval)
  }, [attempt.deadline, submit])

  const report = useCallback((type: string) => {
    if (finished.current) return
    void api<{ warnings: number }>(`attempts/${attempt.id}/events`, { type }).then(data => {
      setWarnings(data.warnings)
      toast.warning('Activity noted for review. Please stay in your exam window.')
    }).catch(() => toast.error('Integrity event could not be sent. Check your connection.'))
  }, [attempt.id])

  useEffect(() => {
    let wasFullscreen = !!document.fullscreenElement
    const visibility = () => { if (document.hidden) report('TAB_HIDDEN') }
    const fullscreen = () => { if (wasFullscreen && !document.fullscreenElement) report('FULLSCREEN_EXIT'); wasFullscreen = !!document.fullscreenElement }
    const unload = (event: BeforeUnloadEvent) => { if (!finished.current) { event.preventDefault(); event.returnValue = '' } }
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('fullscreenchange', fullscreen)
    window.addEventListener('beforeunload', unload)
    return () => { document.removeEventListener('visibilitychange', visibility); document.removeEventListener('fullscreenchange', fullscreen); window.removeEventListener('beforeunload', unload) }
  }, [report])

  function save(id: number, value: string) {
    setAnswers(previous => ({ ...previous, [id]: value })); setSaveState('Saving…')
    queue.current = queue.current.catch(() => {}).then(() => api(`attempts/${attempt.id}/answers`, { questionId: id, answer: value }, 'PUT')).then(() => setSaveState('All answers saved')).catch((e: Error) => { setSaveState('Unsaved changes — retry saving'); toast.error(e.message) })
  }
  async function saveAll() {
    for (const [id, value] of Object.entries(answers)) save(Number(id), value)
  }
  async function focus() { try { await document.documentElement.requestFullscreen() } catch { toast.info('Fullscreen is unavailable in this preview. Open the app in its own browser tab to use focus mode.') } }

  return <main className="exam-workspace" onCopy={e => { e.preventDefault(); report('COPY_ATTEMPT') }} onPaste={e => { e.preventDefault(); report('PASTE_ATTEMPT') }}><header className="exam-topbar"><span className="brand"><span className="brand-mark"><GraduationCap /></span>examly<span className="brand-period">.</span></span><span className="hidden sm:flex items-center gap-2 text-sm text-primary"><ShieldCheck className="size-4" />Protected exam session</span><div className={cn('exam-timer', seconds < 60 && 'timer-low')} role="timer" aria-label="Time remaining"><Clock3 className="size-4" />{Math.floor(seconds / 60).toString().padStart(2, '0')}:{(seconds % 60).toString().padStart(2, '0')}</div></header><div className="exam-workspace-body"><div className="flex flex-col gap-6"><div><p className="eyebrow">STAY CURIOUS. STAY FOCUSED.</p><h1>{attempt.title}</h1><p className="text-sm text-muted-foreground mt-2">You&apos;ve got this. Take it one question at a time.</p></div><section className="question-panel"><div className="flex justify-between items-center gap-3"><span className="question-count">Question {index + 1} of {attempt.questions.length}</span><button className={cn('mark-button', marked.has(question.id) && 'is-marked')} onClick={() => setMarked(prev => { const next = new Set(prev); if (next.has(question.id)) next.delete(question.id); else next.add(question.id); return next })}><Bookmark className="size-4" />{marked.has(question.id) ? 'Marked for review' : 'Mark for review'}</button></div><h2>{question.prompt}</h2><p className="text-xs text-muted-foreground mb-6">{question.marks} {question.marks === 1 ? 'mark' : 'marks'} · {question.type === 'SHORT_ANSWER' ? 'Write your answer in your own words.' : 'Choose one answer.'}</p>{question.type === 'SHORT_ANSWER' ? <Textarea aria-label="Your written answer" rows={8} maxLength={4000} value={answers[question.id] || ''} onChange={e => { setAnswers(prev => ({ ...prev, [question.id]: e.target.value })); setSaveState('Unsaved changes') }} onBlur={e => save(question.id, e.target.value)} placeholder="Start your answer here…" /> : <fieldset className="flex flex-col gap-3"><legend className="sr-only">Answer options</legend>{question.options.map((option, optionIndex) => <label className={cn('answer-option', answers[question.id] === option && 'is-checked')} key={option}><input type="radio" name={`q-${question.id}`} value={option} checked={answers[question.id] === option} onChange={() => save(question.id, option)} /><span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option}</span>{answers[question.id] === option && <Check className="size-4 ml-auto" />}</label>)}</fieldset>}<div className="question-navigation"><Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft data-icon="inline-start" />Previous</Button><Button onClick={() => index < attempt.questions.length - 1 ? setIndex(index + 1) : setConfirm(true)}>{index < attempt.questions.length - 1 ? 'Next question' : 'Review & submit'}<ChevronRight data-icon="inline-end" /></Button></div></section><div className="flex flex-wrap gap-3 justify-between text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Save className="size-3.5" />{saveState}</span><button onClick={saveAll} className="text-primary font-medium">Save all answers</button></div></div><aside className="exam-question-sidebar"><section className="panel"><h3>Question navigator</h3><p className="text-xs text-muted-foreground mt-2">{answered} of {attempt.questions.length} answered</p><div className="question-numbers">{attempt.questions.map((q, i) => <button key={q.id} aria-label={`Go to question ${i + 1}`} className={cn(i === index && 'current', answers[q.id]?.trim() && 'answered', marked.has(q.id) && 'marked')} onClick={() => setIndex(i)}>{i + 1}</button>)}</div><div className="flex flex-col gap-2 text-xs text-muted-foreground"><span>Green: answered · Yellow: review</span><span>{warnings} activity {warnings === 1 ? 'event' : 'events'} noted</span></div><Button className="w-full mt-6" onClick={() => setConfirm(true)} disabled={busy}>Submit exam</Button><Button variant="outline" className="w-full mt-2" onClick={focus}><Expand data-icon="inline-start" />Enter focus mode</Button></section><p className="text-xs leading-relaxed text-muted-foreground p-4">The server keeps your time. If you disconnect, reopen this exam to resume. Your saved answers are submitted at the deadline.</p></aside></div><Dialog open={confirm} onOpenChange={setConfirm}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Ready to turn it in?</DialogTitle><DialogDescription>You answered {answered} of {attempt.questions.length} questions. {attempt.questions.length - answered > 0 ? 'Unanswered questions will receive zero marks.' : 'Great work! Take a breath and submit.'} You cannot change answers after submission.</DialogDescription></DialogHeader><Button onClick={submit} disabled={busy}>{busy && <Loader2 className="animate-spin" data-icon="inline-start" />}Confirm & submit</Button><Button variant="outline" onClick={() => setConfirm(false)}>Keep reviewing</Button></DialogContent></Dialog></main>
}
