'use client'

import { useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Exam, dateLabel, timeLabel } from '@/lib/examly'
import { cn } from '@/lib/utils'

export function ExamCalendar({ exams, onSelect, expanded = false }: { exams: Exam[]; onSelect: (exam: Exam) => void; expanded?: boolean }) {
  const today = new Date()
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState<number | null>(null)
  const firstDay = (month.getDay() + 6) % 7
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const inMonth = exams.filter(exam => { const d = new Date(exam.startsAt); return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear() })
  const listed = selected ? inMonth.filter(e => new Date(e.startsAt).getDate() === selected) : inMonth.filter(e => e.startsAt >= Date.now()).slice(0, expanded ? 10 : 2)
  function move(direction: number) { setMonth(new Date(month.getFullYear(), month.getMonth() + direction, 1)); setSelected(null) }
  return <section className={cn('panel calendar-panel', expanded && 'calendar-expanded')} aria-label="Exam calendar">
    <div className="panel-heading"><h3>Your calendar</h3><CalendarDays className="size-4 text-muted-foreground" /></div>
    <div className="calendar-month"><strong>{month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong><div className="flex gap-1"><Button variant="ghost" size="icon-xs" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft /></Button><Button variant="ghost" size="icon-xs" aria-label="Next month" onClick={() => move(1)}><ChevronRight /></Button></div></div>
    <div className="calendar-grid">
      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <span key={`weekday-${index}`} className="calendar-weekday">{day}</span>)}
      {Array.from({ length: firstDay }, (_, i) => <span key={`blank-${i}`} />)}
      {Array.from({ length: days }, (_, i) => i + 1).map(day => {
        const hasExam = inMonth.some(e => new Date(e.startsAt).getDate() === day)
        const isToday = day === today.getDate() && month.getMonth() === today.getMonth() && month.getFullYear() === today.getFullYear()
        return <button key={day} onClick={() => setSelected(selected === day ? null : day)} aria-pressed={selected === day} aria-label={`${month.toLocaleDateString('en-US', { month: 'long' })} ${day}${hasExam ? ', exam scheduled' : ''}`} className={cn('calendar-day', isToday && 'is-today', selected === day && 'is-selected', hasExam && 'has-exam')}>{day}</button>
      })}
    </div>
    <div className="calendar-legend"><span><i className="today-dot" />Today</span><span><i className="exam-dot" />Exam scheduled</span></div>
    <div className="calendar-events"><p className="eyebrow">{selected ? `${month.toLocaleDateString('en-US', { month: 'short' })} ${selected}` : 'Coming up next'}</p>{listed.length === 0 ? <p className="text-xs text-muted-foreground leading-relaxed">No exams scheduled{selected ? ' on this day' : ' this month'}. A little room to prepare.</p> : listed.map(exam => <button className="calendar-event" key={exam.id} onClick={() => onSelect(exam)}><span className={cn('event-marker', `tone-${exam.color}`)} /><span><strong>{exam.title}</strong><small>{dateLabel(exam.startsAt)} · {timeLabel(exam.startsAt)}</small></span><ArrowUpRight className="size-4" /></button>)}</div>
  </section>
}
