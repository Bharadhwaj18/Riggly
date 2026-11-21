import type { Metadata, Viewport } from 'next'
import { Manrope, Fraunces, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/ui/Toaster'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'
import { THEME_INIT_SCRIPT } from '@/lib/theme'
import { headers } from 'next/headers'
import { IOS_VIEWPORT_SCRIPT, isIOS } from '@/lib/ios-viewport'
import { APP_NAME, APP_TAGLINE } from '@/lib/brand'

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'] })
const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
  manifest: '/manifest.json',
}

// The keyboard resizes the page instead of sliding it under (Chrome; Safari ignores it and is handled by h-dvh).
// iPhone/iPad Safari zooms into any field under 16px when it's tapped; maximum-scale=1 stops that, and iOS still
// allows pinch-zoom. Sent from the server so nothing on the page can undo it. Android doesn't get it, since there
// it would block pinch-zoom.
export async function generateViewport(): Promise<Viewport> {
  const ua = (await headers()).get('user-agent') ?? ''
  return {
    width: 'device-width',
    initialScale: 1,
    interactiveWidget: 'resizes-content',
    ...(isIOS(ua) ? { maximumScale: 1 } : {}),
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} ${fraunces.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: IOS_VIEWPORT_SCRIPT }} />
      </head>
      <body className="h-full bg-brand-50 text-gray-900">
        <ServiceWorkerRegistration />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
