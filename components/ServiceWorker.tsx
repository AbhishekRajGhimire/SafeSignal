'use client'

import { useEffect } from 'react'

export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Registration failing is not worth surfacing: the app works without it.
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  return null
}
