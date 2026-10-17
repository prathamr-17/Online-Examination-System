import { NextRequest, NextResponse } from 'next/server'

const backend = process.env.JAVA_API_URL || 'http://127.0.0.1:8080'
const cookieName = 'examly_session'

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params
  if (!path.every(segment => /^[a-zA-Z0-9_-]+$/.test(segment))) return NextResponse.json({ message: 'Invalid path.' }, { status: 400 })
  if (request.method !== 'GET' && request.headers.get('X-Examly-Client') !== 'web') {
    return NextResponse.json({ message: 'Invalid request origin.' }, { status: 403 })
  }
  try {
    const token = request.cookies.get(cookieName)?.value
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const body = request.method === 'GET' ? undefined : await request.text()
    if (body && body.length > 150_000) return NextResponse.json({ message: 'Request is too large.' }, { status: 413 })
    const response = await fetch(`${backend}/api/${path.join('/')}${request.nextUrl.search}`, {
      method: request.method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(12000),
    })
    const data = await response.json()
    const session = data.token
    delete data.token
    const result = NextResponse.json(data, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
    if (session) result.cookies.set(cookieName, session, { httpOnly: true, secure: request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https', sameSite: 'lax', path: '/', maxAge: 28800 })
    if (path.join('/') === 'auth/logout' && response.ok) result.cookies.delete(cookieName)
    return result
  } catch {
    return NextResponse.json({ message: 'The Java exam server is not available. Start the included Spring Boot backend or connect its deployed URL to JAVA_API_URL.' }, { status: 503 })
  }
}
export { proxy as GET, proxy as POST, proxy as PUT }
