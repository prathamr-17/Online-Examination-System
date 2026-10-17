'use client'

import { Download, Trophy, ArrowRight, Clock3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Result, dateLabel } from '@/lib/examly'

export function Results({ results, onExplore, faculty = false, onReview }: { results: Result[]; onExplore: () => void; faculty?: boolean; onReview?: (result: Result) => void }) {
  function download() {
    const safe = (value: unknown) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
    const csv = [['Exam', 'Subject', 'Score', 'Total', 'Status', 'Submitted'], ...results.map(r => [r.title, r.subject, r.score, r.total, r.status, dateLabel(r.submittedAt)])].map(row => row.map(safe).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a'); a.href = url; a.download = 'examly-results.csv'; a.click(); URL.revokeObjectURL(url)
  }
  return <section className="panel results-panel"><div className="section-heading"><div><h2>{faculty ? 'Student submissions' : 'Every effort is a step forward.'}</h2><p>{faculty ? 'Review written answers and activity flags.' : 'Your results, all in one happy place.'}</p></div>{results.length > 0 && <Button variant="outline" onClick={download}><Download data-icon="inline-start" />Export</Button>}</div>{results.length === 0 ? <div className="empty-state"><Trophy /><h3>Your first achievement is waiting</h3><p>{faculty ? 'Student submissions will appear here once exams are completed.' : 'Complete an exam to see your scores and progress here.'}</p><Button onClick={onExplore}>Explore exams<ArrowRight data-icon="inline-end" /></Button></div> : <div className="overflow-x-auto"><table className="results-table"><thead><tr><th>{faculty ? 'Student / Exam' : 'Examination'}</th><th>Date</th><th>Score</th><th>Status</th>{faculty && <th>Review</th>}</tr></thead><tbody>{results.map(result => <tr key={result.id}><td><strong>{result.title}</strong><small>{faculty ? result.studentName : result.subject}</small></td><td>{dateLabel(result.submittedAt)}</td><td><strong>{result.status === 'PENDING_REVIEW' ? '—' : `${result.score} / ${result.total}`}</strong></td><td><Badge variant={result.status === 'PENDING_REVIEW' ? 'outline' : 'secondary'}>{result.status === 'PENDING_REVIEW' ? <><Clock3 data-icon="inline-start" />In review</> : 'Graded'}</Badge></td>{faculty && <td><Button size="sm" variant="outline" onClick={() => onReview?.(result)}>Review{result.warnings > 0 ? ` (${result.warnings} flags)` : ''}</Button></td>}</tr>)}</tbody></table></div>}</section>
}
