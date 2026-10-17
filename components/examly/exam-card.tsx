'use client'

import { ArrowUpRight, Braces, CalendarDays, Clock3, Cpu, Database, FileQuestion, Network, Pi, ShieldCheck, Coffee } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Exam, dateLabel, isOpen, shortTypeLabels } from '@/lib/examly'
import { cn } from '@/lib/utils'

export function SubjectIcon({ subject, className }: { subject: string; className?: string }) {
  const Icon = subject.includes('Data Structures') ? Braces : subject.includes('Database') ? Database : subject.includes('Operating') ? Cpu : subject.includes('Network') ? Network : subject.includes('Mathematics') ? Pi : Coffee
  return <Icon className={className} strokeWidth={1.7} aria-hidden="true" />
}

export function ExamCard({ exam, onSelect }: { exam: Exam; onSelect: (exam: Exam) => void }) {
  const available = isOpen(exam)
  return <article className="exam-card">
    <div className="flex items-center justify-between gap-2">
      <div className={cn('subject-icon', `tone-${exam.color}`)}><SubjectIcon subject={exam.subject} /></div>
      <Badge variant={available ? 'secondary' : 'outline'}>{available && <span className="status-dot" />}{available ? 'Available now' : exam.endsAt <= Date.now() ? 'Closed' : 'Upcoming'}</Badge>
    </div>
    <div className="flex flex-col gap-1.5"><p className="eyebrow">{exam.subject}</p><h3>{exam.title}</h3></div>
    <div className="exam-meta"><span><Clock3 />{exam.minutes} min</span><span><FileQuestion />{exam.questionCount} questions</span><Badge variant="outline">{shortTypeLabels[exam.type]}</Badge></div>
    <div className="exam-card-footer"><span><CalendarDays />{available ? `Until ${dateLabel(exam.endsAt)}` : dateLabel(exam.startsAt)}</span><Button variant={available ? 'default' : 'outline'} size="sm" onClick={() => onSelect(exam)}>{available ? 'View exam' : 'View details'}<ArrowUpRight data-icon="inline-end" /></Button></div>
    <div className="exam-integrity"><ShieldCheck /> Integrity checks enabled</div>
  </article>
}
