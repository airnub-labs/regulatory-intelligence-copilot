"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { IconLanguage } from "@tabler/icons-react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  localeDisplayNames,
  LOCALE_COOKIE_NAME,
  type Locale,
} from "@/i18n/request"

// Group locales by base language for better UX
const localeGroups: { label: string; locales: Locale[] }[] = [
  {
    label: "English",
    locales: ["en-IE", "en-GB", "en-US"],
  },
  {
    label: "Gaeilge",
    locales: ["ga-IE"],
  },
  {
    label: "Espa\u00f1ol",
    locales: ["es-ES"],
  },
  {
    label: "Fran\u00e7ais",
    locales: ["fr-FR", "fr-CA"],
  },
  {
    label: "Deutsch",
    locales: ["de-DE"],
  },
  {
    label: "Portugu\u00eas",
    locales: ["pt-PT", "pt-BR"],
  },
]

/**
 * Set locale cookie - extracted to avoid ESLint immutability warnings
 */
function setLocaleCookie(locale: string): void {
  const maxAge = 60 * 60 * 24 * 365 // 1 year
  window.document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export function LanguageSelector() {
  const router = useRouter()
  const currentLocale = useLocale() as Locale
  const t = useTranslations("common")

  const handleLocaleChange = React.useCallback(
    (newLocale: Locale) => {
      // Set the cookie for the new locale
      setLocaleCookie(newLocale)
      // Refresh the page to load new translations
      router.refresh()
    },
    [router]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t("changeLanguage")}
        >
          <IconLanguage className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{t("changeLanguage")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t("selectLanguage")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {localeGroups.map((group, groupIndex) => (
          <React.Fragment key={group.label}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
              {group.label}
            </DropdownMenuLabel>
            {group.locales.map((locale) => (
              <DropdownMenuItem
                key={locale}
                onClick={() => handleLocaleChange(locale)}
                className="flex items-center justify-between"
                aria-current={locale === currentLocale ? "true" : undefined}
              >
                <span>{localeDisplayNames[locale]}</span>
                {locale === currentLocale && (
                  <span
                    className="h-2 w-2 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
