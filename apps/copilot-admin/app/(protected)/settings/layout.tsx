"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import {
  IconArrowLeft,
  IconSettings,
  IconUser,
  IconUserCog,
  IconUsers,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface SettingsNavItem {
  titleKey: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  descriptionKey: string
}

const settingsNavItems: SettingsNavItem[] = [
  {
    titleKey: "profile",
    href: "/settings/profile",
    icon: IconUser,
    descriptionKey: "profileDescription",
  },
  {
    titleKey: "preferences",
    href: "/settings/preferences",
    icon: IconUserCog,
    descriptionKey: "preferencesDescription",
  }
]

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const t = useTranslations("settings")

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Settings header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href="/" aria-label={t("backToHome")}>
            <IconArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <IconSettings
            className="h-5 w-5 text-muted-foreground"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h1>
        </div>
      </div>

      <Separator />

      {/* Settings content area */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Settings sidebar navigation */}
        <nav
          className="flex flex-row gap-2 overflow-x-auto lg:w-64 lg:flex-col lg:gap-1"
          aria-label={t("navigation")}
        >
          {settingsNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive
                    ? "bg-muted text-foreground font-medium"
                    : "text-muted-foreground"
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <item.icon
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="whitespace-nowrap">{t(item.titleKey)}</span>
              </Link>
            )
          })}
        </nav>

        {/* Settings content */}
        <main
          id="settings-content"
          className="min-w-0 flex-1"
          role="main"
          aria-label={t("contentArea")}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
