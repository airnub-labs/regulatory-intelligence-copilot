"use client"

import * as React from "react"
import { useSession } from "next-auth/react"
import { useTranslations, useFormatter, useNow } from "next-intl"
import { toast } from "sonner"
import {
  IconDeviceDesktop,
  IconDeviceMobile,
  IconHistory,
  IconLogout,
  IconRefresh,
  IconShield,
  IconWorld,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

// Session interface matching the API response
interface UserSession {
  id: string
  userId: string
  createdAt: string
  updatedAt: string
  factorId: string | null
  aal: string | null
  notAfter: string | null
  refreshedAt: string | null
  userAgent: string | null
  ip: string | null
  tag: string | null
  isActive: boolean
}

// Parse user agent to get device info
function parseUserAgent(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: "Unknown", browser: "Unknown" }

  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua)
  const device = isMobile ? "Mobile" : "Desktop"

  let browser = "Unknown"
  if (ua.includes("Chrome") && !ua.includes("Edge")) browser = "Chrome"
  else if (ua.includes("Firefox")) browser = "Firefox"
  else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari"
  else if (ua.includes("Edge")) browser = "Edge"

  return { device, browser }
}

export default function SessionsSettingsPage() {
  const { data: authSession, status } = useSession()
  const t = useTranslations("settings")
  const tSessions = useTranslations("userManagement.sessions")
  const tCommon = useTranslations("common")
  const format = useFormatter()
  // Update relative times every 30 seconds
  const now = useNow({ updateInterval: 1000 * 30 })

  const [sessions, setSessions] = React.useState<UserSession[]>([])
  const [historicalSessions, setHistoricalSessions] = React.useState<UserSession[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isRevoking, setIsRevoking] = React.useState<string | null>(null)
  const [showHistorical, setShowHistorical] = React.useState(false)

  // Get current session ID from auth session
  const currentSessionId = (authSession as { sessionId?: string })?.sessionId

  // Load sessions from API
  const loadSessions = React.useCallback(async () => {
    if (!authSession?.user?.id) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/users/${authSession.user.id}/sessions`)
      if (response.ok) {
        const data = await response.json()
        setSessions(data.sessions || [])
        setHistoricalSessions(data.historicalSessions || [])
      }
    } catch (error) {
      console.error("Error loading sessions:", error)
      toast.error(tCommon("error"))
    } finally {
      setIsLoading(false)
    }
  }, [authSession?.user?.id, tCommon])

  // Load sessions on mount
  React.useEffect(() => {
    if (status === "authenticated") {
      loadSessions()
    }
  }, [status, loadSessions])

  // Revoke a single session
  const handleRevokeSession = async (sessionId: string) => {
    if (!authSession?.user?.id) return

    // Prevent revoking current session
    if (sessionId === currentSessionId) {
      toast.error(tSessions("cannotRevokeCurrent"), {
        description: tSessions("cannotRevokeCurrentDescription"),
      })
      return
    }

    setIsRevoking(sessionId)
    try {
      const response = await fetch(
        `/api/users/${authSession.user.id}/sessions/${sessionId}`,
        { method: "DELETE" }
      )

      if (response.ok) {
        toast.success(tSessions("sessionRevoked"))
        await loadSessions()
      } else {
        const data = await response.json().catch(() => ({}))
        toast.error(tSessions("revokeError"), {
          description: data.message || data.error,
        })
      }
    } catch (error) {
      console.error("Error revoking session:", error)
      toast.error(tSessions("revokeError"))
    } finally {
      setIsRevoking(null)
    }
  }

  // Revoke all other sessions
  const handleRevokeAllOther = async () => {
    if (!authSession?.user?.id) return

    setIsRevoking("all")
    try {
      // Use excludeCurrent=true to preserve current session
      const response = await fetch(
        `/api/users/${authSession.user.id}/sessions?excludeCurrent=true`,
        { method: "DELETE" }
      )

      if (response.ok) {
        toast.success(tSessions("otherSessionsRevoked"))
        await loadSessions()
      } else {
        const data = await response.json().catch(() => ({}))
        toast.error(tSessions("revokeAllError"), {
          description: data.message || data.error,
        })
      }
    } catch (error) {
      console.error("Error revoking all sessions:", error)
      toast.error(tSessions("revokeAllError"))
    } finally {
      setIsRevoking(null)
    }
  }

  // Check if a session is the current one
  const isCurrentSession = (sessionId: string) => sessionId === currentSessionId

  if (status === "loading" || isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Active Sessions Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconShield className="h-5 w-5" aria-hidden="true" />
                {t("sessionsTitle")}
              </CardTitle>
              <CardDescription>{t("sessionsDescription")}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={loadSessions}
                      disabled={isLoading}
                    >
                      <IconRefresh
                        className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
                        aria-hidden="true"
                      />
                      <span className="sr-only">{tCommon("refresh")}</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{tCommon("refresh")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {sessions.length > 1 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRevokeAllOther}
                  disabled={isRevoking !== null}
                >
                  <IconLogout className="h-4 w-4 mr-2" aria-hidden="true" />
                  {tSessions("revokeAllOther")}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {tSessions("noActiveSessions")}
            </p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const { device, browser } = parseUserAgent(session.userAgent)
                const DeviceIcon = device === "Mobile" ? IconDeviceMobile : IconDeviceDesktop
                const isCurrent = isCurrentSession(session.id)

                return (
                  <div
                    key={session.id}
                    className={`flex items-center justify-between rounded-lg border p-4 ${
                      isCurrent ? "border-primary/50 bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <DeviceIcon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {browser} on {device}
                          </p>
                          {isCurrent && (
                            <Badge variant="secondary" className="text-xs">
                              {tSessions("currentSession")}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {session.ip && (
                            <>
                              <IconWorld className="h-3 w-3" aria-hidden="true" />
                              <span>{session.ip}</span>
                              <span>•</span>
                            </>
                          )}
                          <span>
                            {tSessions("lastActive")}:{" "}
                            {session.refreshedAt
                              ? format.relativeTime(new Date(session.refreshedAt), now)
                              : format.relativeTime(new Date(session.createdAt), now)}
                          </span>
                        </div>
                      </div>
                    </div>
                    {!isCurrent && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleRevokeSession(session.id)}
                              disabled={isRevoking !== null}
                            >
                              <IconLogout className="h-4 w-4" aria-hidden="true" />
                              <span className="sr-only">{tSessions("revokeSession")}</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{tSessions("revokeSession")}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Security Note */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              <strong>{tSessions("securityNote")}:</strong> {tSessions("securityNoteText")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Historical Sessions Card */}
      {historicalSessions.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <IconHistory className="h-5 w-5" aria-hidden="true" />
                  {tSessions("pastSessions")}
                </CardTitle>
                <CardDescription>
                  {tSessions("pastSessionsDescription")}
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-historical"
                  checked={showHistorical}
                  onCheckedChange={setShowHistorical}
                />
                <Label htmlFor="show-historical" className="text-sm">
                  {tCommon("show")}
                </Label>
              </div>
            </div>
          </CardHeader>
          {showHistorical && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tSessions("device")}</TableHead>
                    <TableHead>{tSessions("ipAddress")}</TableHead>
                    <TableHead>{tSessions("createdAt")}</TableHead>
                    <TableHead>{tSessions("expiredAt")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historicalSessions.map((session) => {
                    const { device, browser } = parseUserAgent(session.userAgent)
                    return (
                      <TableRow key={session.id} className="text-muted-foreground">
                        <TableCell>
                          <span>{browser} on {device}</span>
                        </TableCell>
                        <TableCell>{session.ip || "—"}</TableCell>
                        <TableCell>
                          {format.dateTime(new Date(session.createdAt), {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell>
                          {session.notAfter
                            ? format.dateTime(new Date(session.notAfter), {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}
