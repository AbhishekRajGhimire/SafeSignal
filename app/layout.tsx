import type { Metadata, Viewport } from 'next'
import { ProfileProvider } from '@/components/ProfileProvider'
import { WarningProvider } from '@/components/WarningProvider'
import { ServiceWorker } from '@/components/ServiceWorker'
import './globals.css'

export const metadata: Metadata = {
  title: 'SafeSignal',
  description: 'Official NSW bushfire warnings, made understandable.',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#c8102e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-text-size="normal">
      <body>
        <ProfileProvider>
          <ServiceWorker />
          <WarningProvider>{children}</WarningProvider>
        </ProfileProvider>
      </body>
    </html>
  )
}
