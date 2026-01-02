import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { SidebarLayout } from '@/components/layout/sidebar'

export const metadata: Metadata = {
  title: 'Regulatory Intelligence Copilot',
  description: 'Chat-first, graph-powered regulatory research copilot for complex regulatory compliance.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>
          <SidebarLayout>{children}</SidebarLayout>
        </Providers>
      </body>
    </html>
  )
}
