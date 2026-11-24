import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

// The band website and Rigly talk server to server, both ways, signed with the same shared secret.
//   STORE_API_KEY       shared secret, the same value on both sides (Rigly and the website's Vercel projects)
//   STORE_WORKSPACE_ID  the one workspace the website sells for
//   STORE_SALE_HOLDER_ID who's holding online money in Finance (the person PhonePe pays out to)
//   STORE_WEBSITE_URL   where Rigly asks the website to ship or cancel an order, e.g. https://taranaband.in
// Server-only: never import this from client code.

export function storeConfig() {
  return {
    key: process.env.STORE_API_KEY || '',
    workspaceId: process.env.STORE_WORKSPACE_ID || '',
    holderId: process.env.STORE_SALE_HOLDER_ID || null,
    websiteUrl: (process.env.STORE_WEBSITE_URL || '').replace(/\/+$/, ''),
  }
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB)
}

/** Null when the request carries the shared secret and the store is set up; otherwise the response to send back. */
export function rejectUnlessStore(request: NextRequest): NextResponse | null {
  const { key, workspaceId } = storeConfig()
  if (!key || !workspaceId) return NextResponse.json({ error: 'The store link isn’t set up.' }, { status: 503 })
  const sent = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!sent || !safeEqual(sent, key)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return null
}

/** Asks the website to ship or cancel one of its orders; the website sends the customer email and tells Rigly back. */
export async function callWebsite(path: string, body: unknown): Promise<{ ok: true; data: Record<string, unknown> & { rigly?: { refund_in_finance?: boolean } } } | { ok: false; error: string }> {
  const { key, websiteUrl } = storeConfig()
  if (!key || !websiteUrl) return { ok: false, error: 'The website link isn’t set up.' }
  try {
    const res = await fetch(`${websiteUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: data?.error || `The website said no (${res.status}).` }
    return { ok: true, data }
  } catch {
    return { ok: false, error: 'Couldn’t reach the website. Try again in a minute.' }
  }
}
