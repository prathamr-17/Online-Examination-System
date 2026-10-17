export type User = { id: number; name: string; email: string; role: 'STUDENT' | 'FACULTY' }
export type ExamType = 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'MIXED'
export type Exam = { id: number; title: string; subject: string; type: ExamType; minutes: number; startsAt: number; endsAt: number; questionCount: number; description: string; color: string }
export type Question = { id: number; prompt: string; type: Exclude<ExamType, 'MIXED'>; options: string[]; marks: number }
export type Attempt = { id: number; examId: number; title: string; deadline: number; serverNow: number; status: string; questions: Question[]; answers: Record<string, string>; warnings: number }
export type Result = { id: number; examId: number; title: string; subject: string; score: number; total: number; status: string; submittedAt: number; warnings: number; studentName?: string; studentEmail?: string }
export const typeLabels: Record<ExamType, string> = { MCQ: 'Multiple choice', TRUE_FALSE: 'True / False', SHORT_ANSWER: 'Short answer', MIXED: 'Mixed format' }
export const shortTypeLabels: Record<ExamType, string> = { MCQ: 'MCQ', TRUE_FALSE: 'True / False', SHORT_ANSWER: 'Descriptive', MIXED: 'Mixed' }
export const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Unable to load your workspace. Please try again.')
  return data
}
export async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(`/api/examly/${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Examly-Client': 'web' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Something went wrong. Please try again.')
  return data
}
export const dateLabel = (date: number) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
export const timeLabel = (date: number) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
export const isOpen = (exam: Exam) => exam.startsAt <= Date.now() && exam.endsAt > Date.now()
