"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import type { KeyboardEvent, ReactNode } from "react"
import {
  MessageSquare,
  Network,
  BarChart3,
  Layers,
  ChevronLeft,
  ChevronRight,
  Menu,
  Settings,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "../ui/button"

interface NavItem {
  label: string
  href: string
  icon: ReactNode
  description?: string
}

const navItems: NavItem[] = [
  {
    label: "Chat",
    href: "/",
    icon: <MessageSquare className="h-5 w-5" />,
    description: "Main chat interface",
  },
  {
    label: "Graph",
    href: "/graph",
    icon: <Network className="h-5 w-5" />,
    description: "Knowledge graph visualization",
  },
  {
    label: "Cost Analytics",
    href: "/analytics/costs",
    icon: <BarChart3 className="h-5 w-5" />,
    description: "Cost tracking dashboard",
  },
  {
    label: "Compaction",
    href: "/analytics/compaction",
    icon: <Layers className="h-5 w-5" />,
    description: "Compaction analytics",
  },
  {
    label: "Team",
    href: "/settings/team",
    icon: <Settings className="h-5 w-5" />,
    description: "Team settings",
  },
]

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed"

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false
    }

    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    return stored === "true"
  })
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  // Persist collapsed state
  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const newValue = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue))
      return newValue
    })
  }, [])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileOpen) {
        setIsMobileOpen(false)
      }
    },
    [isMobileOpen]
  )

  const handleNavSelection = useCallback(() => {
    if (isMobileOpen) {
      setIsMobileOpen(false)
    }
  }, [isMobileOpen])

  return (
    <>
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-4 top-4 z-50 md:hidden"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label={isMobileOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={isMobileOpen}
        aria-controls="sidebar-nav"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="sidebar-nav"
        role="navigation"
        aria-label="Main navigation"
        onKeyDown={handleKeyDown}
        className={cn(
          "fixed left-0 top-0 z-40 flex h-full flex-col border-r bg-background transition-all duration-300",
          isCollapsed ? "w-16" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b px-4">
          {!isCollapsed && (
            <span className="font-semibold text-sm truncate">Navigation</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            className={cn("hidden md:flex", isCollapsed && "mx-auto")}
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 overflow-y-auto p-2" role="menubar">
          <ul className="space-y-1" role="menu">
            {navItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <li key={item.href} role="none">
                  <Link
                    href={item.href}
                    role="menuitem"
                    aria-current={isActive ? "page" : undefined}
                    title={isCollapsed ? item.label : undefined}
                    onClick={handleNavSelection}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                      isCollapsed && "justify-center px-2"
                    )}
                  >
                    <span className="flex-shrink-0" aria-hidden="true">
                      {item.icon}
                    </span>
                    {!isCollapsed && (
                      <span className="truncate">{item.label}</span>
                    )}
                    {isCollapsed && (
                      <span className="sr-only">{item.label}</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer with collapse indicator */}
        <div className="border-t p-2">
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground",
              isCollapsed && "justify-center"
            )}
          >
            {!isCollapsed && (
              <span>Press ← to collapse</span>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}

interface SidebarLayoutProps {
  children: ReactNode
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Sync with sidebar collapsed state
  useEffect(() => {
    const checkCollapsed = () => {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      setIsCollapsed(stored === "true")
    }

    checkCollapsed()

    // Listen for storage changes
    window.addEventListener("storage", checkCollapsed)

    // Also check on interval for same-tab changes
    const interval = setInterval(checkCollapsed, 100)

    return () => {
      window.removeEventListener("storage", checkCollapsed)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className={cn(
          "flex-1 transition-all duration-300",
          "md:ml-64",
          isCollapsed && "md:ml-16"
        )}
      >
        {children}
      </main>
    </div>
  )
}
