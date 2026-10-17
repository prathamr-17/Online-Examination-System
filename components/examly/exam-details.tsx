'use client'

import { useState } from 'react'
import { Clock3, FileQuestion, Loader2, ShieldCheck, Shuffle, Eye, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { Exam, Attempt, User, api, dateLabel, timeLabel, isOpen, typeLabels } from '@/lib/examly'
import { SubjectIcon } from './exam-card'

export function ExamDetails({ exam, user, onClose, onLogin, onStart }: { exam: Exam | null; user?: User | null; onClose: () => void; onLogin: () => void; onStart: (attempt: Attempt) => void }) {
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  async function start() {
    if (!exam) return
    if (!user) { onLogin(); return }
    setBusy(true)
    try {
      const attempt = await api<Attempt>(`exams/${exam.id}/start`)
      onStart(attempt); onClose()
    } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return <Dialog open={!!exam} onOpenChange={open => { if (!open) { onClose(); setConsent(false) } }}><DialogContent className="sm:max-w-lg"><DialogHeader><div className={`subject-icon tone-${exam?.color || 'green'}`}><SubjectIcon subject={exam?.subject || ''} /></div><DialogTitle>{exam?.title}</DialogTitle><DialogDescription>{exam?.subject} · {exam && typeLabels[exam.type]}</DialogDescription></DialogHeader>{exam && <><p className="text-sm text-muted-foreground leading-relaxed">{exam.description}</p><div className="detail-facts"><span><Clock3 />{exam.minutes} minutes</span><span><FileQuestion />{exam.questionCount} questions</span></div><div className="exam-rules"><h3><ShieldCheck className="size-4" />Before you begin</h3><p><Shuffle />Questions and answer choices are randomized for each attempt.</p><p><Clock3 />The timer keeps running if you leave or refresh. Saved answers are submitted when time expires.</p><p><Eye />Tab changes and fullscreen exits are logged for faculty review. No camera or microphone is used.</p><p className="text-xs">Integrity signals are not proof of cheating. A faculty member makes the final decision.</p></div>{isOpen(exam) ? <><Field orientation="horizontal"><Checkbox id="exam-consent" checked={consent} onCheckedChange={value => setConsent(!!value)} /><FieldLabel htmlFor="exam-consent">I understand the rules and will complete this exam independently.</FieldLabel></Field><Button disabled={!consent || busy} size="lg" onClick={start}>{busy && <Loader2 className="animate-spin" data-icon="inline-start" />}{user ? 'Start / resume exam' : 'Sign in to begin'}<ArrowRight data-icon="inline-end" /></Button></> : <div className="availability-note">{exam.endsAt < Date.now() ? 'This examination has closed.' : `Opens ${dateLabel(exam.startsAt)} at ${timeLabel(exam.startsAt)}. Come back when your exam begins.`}</div>}</>}</DialogContent></Dialog>
}
