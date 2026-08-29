import { NextResponse } from 'next/server'
import { getFeed, type WarningsResponse } from '@/lib/rfs/fetch'
import { toWire } from '@/lib/domain/warning'

export const dynamic = 'force-dynamic'

/**
 * Takes no parameters by design. The browser decides which warnings are
 * relevant, so no user location or profile data ever reaches the server.
 * Always responds 200 so the client always has something to render.
 */
export async function GET() {
  const snapshot = await getFeed()

  const body: WarningsResponse = {
    warnings: snapshot.warnings.map(toWire),
    fetchedAt: snapshot.fetchedAt ? snapshot.fetchedAt.toISOString() : null,
    stale: snapshot.stale,
    dropped: snapshot.dropped,
  }

  return NextResponse.json(body, {
    headers: { 'cache-control': 'no-store' },
  })
}
