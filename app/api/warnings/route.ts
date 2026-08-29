import { NextResponse } from 'next/server'
import { getFeed, type WarningsResponse } from '@/lib/rfs/fetch'
import { FEED_SOURCE } from '@/lib/rfs/normalize'
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
    duplicates: snapshot.duplicates,
    failure: snapshot.failure,
    feedLastModified: snapshot.feedLastModified
      ? snapshot.feedLastModified.toISOString()
      : null,
    source: {
      name: FEED_SOURCE.sourceName,
      url: FEED_SOURCE.feedUrl,
      copyright: FEED_SOURCE.copyright,
    },
  }

  return NextResponse.json(body, {
    headers: { 'cache-control': 'no-store' },
  })
}
