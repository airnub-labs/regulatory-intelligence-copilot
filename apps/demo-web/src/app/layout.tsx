import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'E2B RFC/OWASP Auditor',
  description: 'Audit your HTTP APIs for RFC compliance and OWASP Top 10 security issues',
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
