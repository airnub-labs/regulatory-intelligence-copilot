"use client"

import { SessionProvider } from "next-auth/react"

import { ThemeProvider } from "@/components/theme/theme-provider"
import { useSessionSync } from "@/hooks/useSessionSync"

function SessionSyncMonitor() {
  useSessionSync()
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionSyncMonitor />
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  )
}
