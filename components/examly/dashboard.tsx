'use client'

import Image from 'next/image'
import { ArrowRight, ArrowUpRight, BookOpen, CheckCheck, ClipboardList, Lightbulb, ShieldCheck, Sparkles, Trophy, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Exam, Result, User, isOpen } from '@/lib/examly'
import { ExamCard } from './exam-card'
import { ExamCalendar } from './calendar'

export function Dashboard({ exams, results, user, onSelect, navigate, onGuide }: { exams: Exam[]; results: Result[]; user?: User | null; onSelect: (exam: Exam) => void; navigate: (page: string) => void; onGuide: () => void }) {
  const available = exams.filter(isOpen)
  const graded = results.filter(r => r.status === 'GRADED')
  const average = graded.length ? Math.round(graded.reduce((sum, r) => sum + r.score / r.total * 100, 0) / graded.length) : null
  const stats = [
    { label: 'Available exams', value: String(available.length).padStart(2, '0'), hint: 'Ready when you are', icon: ClipboardList, color: 'green' },
    { label: 'Your subjects', value: String(new Set(exams.map(e => e.subject)).size).padStart(2, '0'), hint: 'A world to discover', icon: BookOpen, color: 'lavender' },
    { label: 'Completed exams', value: String(results.length).padStart(2, '0'), hint: 'Every step counts', icon: CheckCheck, color: 'peach' },
    { label: 'Average score', value: average === null ? '—' : `${average}%`, hint: average === null ? 'Your story starts here' : 'Keep the momentum going', icon: Trophy, color: 'yellow' },
  ]
  return <>
    <div className="page-heading"><div><div className="greeting-kicker">YOUR LEARNING, YOUR PACE</div><h1>Let&apos;s make today count<span className="text-primary">.</span></h1><p>A little preparation today. A little more confidence tomorrow.</p></div><span className="semester-label"><span className="status-dot" />Semester 04</span></div>
    <section className="welcome-banner"><div className="welcome-copy"><span className="welcome-eyebrow"><Sparkles className="size-3.5" />YOU&apos;VE GOT THIS, {user ? user.name.split(' ')[0].toUpperCase() : 'SCHOLAR'}</span><h2>Big dreams.<br />One exam at a time.</h2><p>Your next chapter is waiting. Let&apos;s get you ready.</p><Button onClick={() => navigate('Examinations')} size="lg">Explore your exams<ArrowRight data-icon="inline-end" /></Button></div><div className="welcome-art"><Image src="/images/study-desk.png" alt="A playful mint laptop, books, and a golden star" width={600} height={400} priority /></div><span className="banner-spark sparkle-one">✦</span><span className="banner-spark sparkle-two">✦</span></section>
    <div className="stats-grid">{stats.map(({ label, value, hint, icon: Icon, color }) => <section key={label} className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon tone-${color}`}><Icon strokeWidth={1.8} /></span></div><div className="stat-value">{value}</div><p>{hint}</p></section>)}</div>
    <div className="dashboard-columns"><div className="flex min-w-0 flex-col gap-6"><section><div className="section-heading"><div><h2>On your exam radar <span className="count-pill">{exams.length}</span></h2><p>A fresh chance to show what you know.</p></div><button className="text-link" onClick={() => navigate('Examinations')}>View all<ArrowRight /></button></div><div className="exam-grid">{[...available, ...exams.filter(e => !isOpen(e))].slice(0, 4).map(exam => <ExamCard key={exam.id} exam={exam} onSelect={onSelect} />)}</div>{exams.length === 0 && <div className="empty-state"><BookOpen /><h3>Your classroom is taking shape</h3><p>Published exams will appear here when the Java server is connected.</p></div>}</section>
      <section className="study-tip"><div className="tip-icon"><Lightbulb /></div><div><strong>Small breaks. Big breakthroughs.</strong><p>Try 25 minutes of focused study, followed by a 5-minute break. Your brain will thank you.</p></div><span className="tip-tag">STUDY SMART</span></section>
      <section className="panel"><div className="section-heading"><div><h2>Your learning journey</h2><p>Progress is progress, no matter how small.</p></div><TrendingUp className="size-5 text-primary" /></div><div className="journey-line"><span>{results.length} exams completed</span><strong>{exams.length ? Math.round(results.length / exams.length * 100) : 0}%</strong></div><progress className="journey-progress" max={Math.max(exams.length, 1)} value={results.length} /><button className="text-link mt-4" onClick={() => navigate('My Results')}>See your results<ArrowUpRight /></button></section>
    </div><aside className="dashboard-aside"><ExamCalendar exams={exams} onSelect={onSelect} /><section className="integrity-panel"><div className="integrity-icon"><ShieldCheck /></div><h3>Fair exams. Real achievements.</h3><p>Your hard work deserves a level playing field. Examly helps keep every exam fair.</p><ul><li><CheckCheck />Randomized questions</li><li><CheckCheck />Timed, focused sessions</li><li><CheckCheck />Activity integrity checks</li></ul><button className="text-link" onClick={onGuide}>How it works<ArrowUpRight /></button></section><p className="aside-note">A little effort, every day.<br /><span>That&apos;s how great things begin.</span></p></aside></div>
  </>
}
