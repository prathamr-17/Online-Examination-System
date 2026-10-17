'use client'

import { useState, type FormEvent } from 'react'
import { GraduationCap, Loader2, ShieldCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldGroup, FieldDescription } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { api, User } from '@/lib/examly'

export function AuthDialog({ open, onOpenChange, onSuccess, faculty = false }: { open: boolean; onOpenChange: (open: boolean) => void; onSuccess: (user: User) => void; faculty?: boolean }) {
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setBusy(true)
    const form = new FormData(event.currentTarget)
    try {
      const data = await api<{ user: User }>(`auth/${register ? 'register' : 'login'}`, Object.fromEntries(form))
      onSuccess(data.user); onOpenChange(false)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-md"><DialogHeader><div className="auth-mark"><GraduationCap /></div><DialogTitle>{register ? 'Your next chapter starts here.' : 'Welcome back to Examly.'}</DialogTitle><DialogDescription>{register ? 'Create your student account. Your progress deserves a home.' : faculty ? 'Sign in with your faculty account to manage exams.' : 'Sign in to take exams and keep track of your progress.'}</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="flex flex-col gap-5"><FieldGroup>
      {register && <Field><FieldLabel htmlFor="auth-name">Full name</FieldLabel><Input id="auth-name" name="name" placeholder="Your name" autoComplete="name" required minLength={2} maxLength={80} /></Field>}
      <Field><FieldLabel htmlFor="auth-email">Email address</FieldLabel><Input id="auth-email" name="email" type="email" placeholder="you@college.edu" autoComplete="email" required maxLength={180} /></Field>
      <Field><FieldLabel htmlFor="auth-password">Password</FieldLabel><Input id="auth-password" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 10 : 1} maxLength={72} />{register && <FieldDescription>At least 10 characters. Use a unique password.</FieldDescription>}</Field>
    </FieldGroup>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <Button type="submit" size="lg" disabled={busy}>{busy && <Loader2 className="animate-spin" data-icon="inline-start" />}{register ? 'Create student account' : 'Sign in'}</Button>
    {!faculty && <p className="text-center text-sm text-muted-foreground">{register ? 'Already part of the class? ' : 'New around here? '}<button className="text-primary font-semibold" type="button" onClick={() => { setRegister(!register); setError('') }}>{register ? 'Sign in' : 'Create an account'}</button></p>}
    {faculty && <p className="text-xs text-muted-foreground leading-relaxed">Faculty accounts are provisioned by your college administrator. Students cannot register as faculty.</p>}
    <p className="flex justify-center items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />Encrypted passwords. Private progress.</p>
    </form></DialogContent></Dialog>
}
