import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Regulatory Intelligence Copilot',
  description: 'AI-powered regulatory compliance intelligence for tax, welfare, pensions, and financial regulations',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
