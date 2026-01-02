import Link from "next/link"
import { LogOut, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import { ThemeToggle } from "../theme/theme-toggle"
import { Badge } from "../ui/badge"
import { Button } from "../ui/button"

interface HeaderAction {
  label: string
  href: string
  variant?: "default" | "outline" | "secondary"
}

interface AppHeaderProps {
  subtitle?: string
  subtext?: string
  primaryAction?: HeaderAction
  secondaryAction?: HeaderAction
  userEmail?: string | null
  onSignOut?: () => void
  className?: string
}

export function AppHeader({
  subtitle = "Graph-powered research over tax, welfare, pensions, and EU rules using a live regulatory knowledge graph.",
  subtext = "Answers are grounded in a Memgraph regulatory graph, a timeline engine for law-in-time, and scenario-aware agents.",
  primaryAction,
  secondaryAction = { label: "Product docs", href: "https://github.com/saasbabs/regulatory-intelligence-copilot" },
  userEmail,
  onSignOut,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70",
        className,
      )}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/80 via-indigo-500 to-purple-500 text-white shadow-lg">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              Regulatory Intelligence Copilot
              <Badge variant="secondary" className="rounded-full">Preview</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
            <p className="text-xs text-muted-foreground">{subtext}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {secondaryAction && (
            <Button asChild variant="ghost" className="hidden sm:inline-flex" title="Open architecture, graph schema, and guardrail specs.">
              <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
            </Button>
          )}
          {primaryAction && (
            <Button asChild variant={primaryAction.variant ?? "default"} title="Open the graph UI for this conversation to inspect active nodes.">
              <Link href={primaryAction.href}>{primaryAction.label}</Link>
            </Button>
          )}
          {userEmail && (
            <div className="hidden items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground sm:flex">
              <span className="truncate">{userEmail}</span>
              {onSignOut && (
                <Button size="icon" variant="ghost" onClick={onSignOut} title="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
