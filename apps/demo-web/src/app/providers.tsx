"use client"

import { SessionProvider } from "next-auth/react"

import { ThemeProvider } from "@/components/theme/theme-provider"
import { useSessionSync } from "@/hooks/useSessionSync"
import { MembershipNotification } from "@/components/MembershipNotification"

function SessionSyncMonitor() {
  useSessionSync()
  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionSyncMonitor />
      <MembershipNotification />
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  )
}
