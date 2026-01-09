"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { useTheme } from "next-themes"
import {
  IconLanguage,
  IconPalette,
  IconBell,
  IconClock,
  IconMoon,
  IconSun,
  IconDeviceDesktop,
  IconLock,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { useAdminView, useEffectiveUser } from "@/lib/contexts/admin-view-context"
import {
  locales,
  localeDisplayNames,
  localeTimezones,
  LOCALE_COOKIE_NAME,
  type Locale,
} from "@/i18n/request"

// Theme options
const themeOptions = [
  { value: "light", labelKey: "themeLight", icon: IconSun },
  { value: "dark", labelKey: "themeDark", icon: IconMoon },
  { value: "system", labelKey: "themeSystem", icon: IconDeviceDesktop },
] as const

export default function PreferencesSettingsPage() {
  const router = useRouter()
  const t = useTranslations("settings")
  const tCommon = useTranslations("common")
  const tAdminView = useTranslations("adminView")
  const currentLocale = useLocale() as Locale
  const { theme, setTheme } = useTheme()

  const { user: effectiveUser, isAdminView, canEdit } = useEffectiveUser()
  const { logAuditEvent } = useAdminView()

  // Get initial preferences from effective user or defaults
  const initialPreferences = effectiveUser?.preferences || {
    locale: currentLocale,
    theme: theme || "system",
    emailNotifications: true,
    systemAlerts: true,
    weeklyDigest: false,
  }

  const [selectedLocale, setSelectedLocale] = React.useState<Locale>(
    (initialPreferences.locale as Locale) || currentLocale
  )
  const [selectedTheme, setSelectedTheme] = React.useState<string>(
    initialPreferences.theme || theme || "system"
  )
  const [isSaving, setIsSaving] = React.useState(false)
  const [hasChanges, setHasChanges] = React.useState(false)

  // Notification preferences
  const [notifications, setNotifications] = React.useState({
    emailUpdates: initialPreferences.emailNotifications,
    systemAlerts: initialPreferences.systemAlerts,
    weeklyDigest: initialPreferences.weeklyDigest,
  })

  // Log preferences view for admin view
  React.useEffect(() => {
    if (isAdminView && effectiveUser) {
      logAuditEvent("view_preferences", "user_preferences", "success")
    }
  }, [isAdminView, effectiveUser, logAuditEvent])

  // Reset state when effective user changes
  React.useEffect(() => {
    if (effectiveUser?.preferences) {
      setSelectedLocale((effectiveUser.preferences.locale as Locale) || currentLocale)
      setSelectedTheme(effectiveUser.preferences.theme || "system")
      setNotifications({
        emailUpdates: effectiveUser.preferences.emailNotifications,
        systemAlerts: effectiveUser.preferences.systemAlerts,
        weeklyDigest: effectiveUser.preferences.weeklyDigest,
      })
    } else {
      setSelectedLocale(currentLocale)
      setSelectedTheme(theme || "system")
      setNotifications({
        emailUpdates: true,
        systemAlerts: true,
        weeklyDigest: false,
      })
    }
    setHasChanges(false)
  }, [effectiveUser, currentLocale, theme])

  const handleLocaleChange = (newLocale: string) => {
    if (!canEdit) return
    setSelectedLocale(newLocale as Locale)
    setHasChanges(true)
  }

  const handleThemeChange = (newTheme: string) => {
    if (!canEdit) return
    setSelectedTheme(newTheme)
    // For own settings, apply theme immediately
    if (!isAdminView) {
      setTheme(newTheme)
    }
    setHasChanges(true)
  }

  const handleNotificationChange = (key: keyof typeof notifications) => {
    if (!canEdit) return
    setNotifications((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!canEdit) return

    setIsSaving(true)
    try {
      // For own settings, save locale to cookie
      if (!isAdminView && selectedLocale !== currentLocale) {
        document.cookie = `${LOCALE_COOKIE_NAME}=${selectedLocale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
        router.refresh()
      }

      // TODO: Save preferences to backend (for both own and admin view)
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Log audit event for preferences update
      if (isAdminView) {
        const changes = []
        if (selectedLocale !== effectiveUser?.preferences?.locale) {
          changes.push({
            field: "locale",
            oldValue: effectiveUser?.preferences?.locale,
            newValue: selectedLocale,
          })
        }
        if (selectedTheme !== effectiveUser?.preferences?.theme) {
          changes.push({
            field: "theme",
            oldValue: effectiveUser?.preferences?.theme,
            newValue: selectedTheme,
          })
        }
        if (notifications.emailUpdates !== effectiveUser?.preferences?.emailNotifications) {
          changes.push({
            field: "emailNotifications",
            oldValue: effectiveUser?.preferences?.emailNotifications,
            newValue: notifications.emailUpdates,
          })
        }
        if (notifications.systemAlerts !== effectiveUser?.preferences?.systemAlerts) {
          changes.push({
            field: "systemAlerts",
            oldValue: effectiveUser?.preferences?.systemAlerts,
            newValue: notifications.systemAlerts,
          })
        }
        if (notifications.weeklyDigest !== effectiveUser?.preferences?.weeklyDigest) {
          changes.push({
            field: "weeklyDigest",
            oldValue: effectiveUser?.preferences?.weeklyDigest,
            newValue: notifications.weeklyDigest,
          })
        }
        await logAuditEvent("update_preferences", "user_preferences", "success", changes)
      }

      setHasChanges(false)
    } catch {
      if (isAdminView) {
        await logAuditEvent("update_preferences", "user_preferences", "failure")
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with user info when in admin view */}
      {isAdminView && effectiveUser && (
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {tAdminView("editingUserPreferences", { name: effectiveUser.displayName })}
              </CardTitle>
              {!canEdit && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <IconLock className="h-3 w-3" />
                  {tAdminView("readOnly")}
                </Badge>
              )}
            </div>
          </CardHeader>
        </Card>
      )}

      {/* Language & Region Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconLanguage className="h-5 w-5" aria-hidden="true" />
            {t("languageRegion")}
          </CardTitle>
          <CardDescription>{t("languageRegionDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="locale">{t("displayLanguage")}</Label>
            <Select
              value={selectedLocale}
              onValueChange={handleLocaleChange}
              disabled={!canEdit}
            >
              <SelectTrigger id="locale" className="w-full max-w-xs">
                <SelectValue placeholder={t("selectLanguage")} />
              </SelectTrigger>
              <SelectContent>
                {locales.map((locale) => (
                  <SelectItem key={locale} value={locale}>
                    {localeDisplayNames[locale]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t("languageHint")}
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <IconClock className="h-4 w-4" aria-hidden="true" />
              {t("timezone")}
            </Label>
            <p className="text-sm">
              {localeTimezones[selectedLocale]}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("timezoneHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Appearance Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconPalette className="h-5 w-5" aria-hidden="true" />
            {t("appearance")}
          </CardTitle>
          <CardDescription>{t("appearanceDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="theme">{t("colorTheme")}</Label>
            <Select
              value={selectedTheme}
              onValueChange={handleThemeChange}
              disabled={!canEdit}
            >
              <SelectTrigger id="theme" className="w-full max-w-xs">
                <SelectValue placeholder={t("selectTheme")} />
              </SelectTrigger>
              <SelectContent>
                {themeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center gap-2">
                      <option.icon className="h-4 w-4" aria-hidden="true" />
                      {t(option.labelKey)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {t("themeHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconBell className="h-5 w-5" aria-hidden="true" />
            {t("notifications")}
          </CardTitle>
          <CardDescription>{t("notificationsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="emailUpdates"
                className="text-sm font-medium cursor-pointer"
              >
                {t("emailUpdates")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("emailUpdatesHint")}
              </p>
            </div>
            <Checkbox
              id="emailUpdates"
              checked={notifications.emailUpdates}
              onCheckedChange={() => handleNotificationChange("emailUpdates")}
              disabled={!canEdit}
              aria-describedby="emailUpdates-description"
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="systemAlerts"
                className="text-sm font-medium cursor-pointer"
              >
                {t("systemAlerts")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("systemAlertsHint")}
              </p>
            </div>
            <Checkbox
              id="systemAlerts"
              checked={notifications.systemAlerts}
              onCheckedChange={() => handleNotificationChange("systemAlerts")}
              disabled={!canEdit}
              aria-describedby="systemAlerts-description"
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label
                htmlFor="weeklyDigest"
                className="text-sm font-medium cursor-pointer"
              >
                {t("weeklyDigest")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("weeklyDigestHint")}
              </p>
            </div>
            <Checkbox
              id="weeklyDigest"
              checked={notifications.weeklyDigest}
              onCheckedChange={() => handleNotificationChange("weeklyDigest")}
              disabled={!canEdit}
              aria-describedby="weeklyDigest-description"
            />
          </div>
        </CardContent>
      </Card>

      {/* Save button */}
      {hasChanges && canEdit && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? tCommon("loading") : tCommon("save")}
          </Button>
        </div>
      )}
    </div>
  )
}
