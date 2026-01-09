"use client"

import * as React from "react"
import { useSession } from "next-auth/react"
import { useTranslations, useFormatter } from "next-intl"
import { IconUser, IconMail, IconCalendar, IconShield } from "@tabler/icons-react"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminRole } from "@/lib/types/admin"

// Validation schema for profile updates
const profileSchema = z.object({
  displayName: z.string().min(1).max(100),
  email: z.string().email().max(255),
})

type ProfileFormData = z.infer<typeof profileSchema>

export default function ProfileSettingsPage() {
  const { data: session, status } = useSession()
  const t = useTranslations("settings")
  const tCommon = useTranslations("common")
  const tValidation = useTranslations("validation")
  const tAdminView = useTranslations("adminView")
  const format = useFormatter()

  const [isEditing, setIsEditing] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [formData, setFormData] = React.useState<ProfileFormData>({
    displayName: "",
    email: "",
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  // Initialize form data from session
  React.useEffect(() => {
    if (session?.user) {
      setFormData({
        displayName: session.user.name || "",
        email: session.user.email || "",
      })
    }
  }, [session])

  const getInitials = (name: string | null | undefined): string => {
    if (!name) return "U"
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }))
    }
  }

  const handleSave = async () => {
    // Validate form data
    const result = profileSchema.safeParse(formData)
    if (!result.success) {
      const fieldErrors: Record<string, string> = {}
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = tValidation(
            err.code === "too_small" ? "required" : "email"
          )
        }
      })
      setErrors(fieldErrors)
      return
    }

    setIsSaving(true)
    try {
      // TODO: Implement API call to update profile
      // For now, simulate a delay
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setIsEditing(false)
    } catch {
      setErrors({ submit: tCommon("error") })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    // Reset form data
    if (session?.user) {
      setFormData({
        displayName: session.user.name || "",
        email: session.user.email || "",
      })
    }
    setErrors({})
    setIsEditing(false)
  }

  // Current user data
  const currentUser = {
    id: session?.user?.id,
    displayName: session?.user?.name,
    email: session?.user?.email,
    avatarUrl: session?.user?.image,
    role: AdminRole.SUPER_ADMIN, // TODO: Get from session
    createdAt: new Date().toISOString(), // TODO: Get from user data
  }

  const roleTranslationKey = `role_${currentUser.role}` as const

  if (status === "loading") {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Profile Information Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <IconUser className="h-5 w-5" aria-hidden="true" />
                {t("profileTitle")}
              </CardTitle>
              <CardDescription>{t("profileDescription")}</CardDescription>
            </div>
            {!isEditing && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                {tCommon("edit")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Avatar and basic info */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage
                src={currentUser.avatarUrl || undefined}
                alt={currentUser.displayName || t("userAvatar")}
              />
              <AvatarFallback className="text-lg">
                {getInitials(currentUser.displayName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-medium">{currentUser.displayName}</p>
              <p className="text-sm text-muted-foreground">
                {currentUser.email}
              </p>
            </div>
          </div>

          <Separator />

          {/* Editable fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">{t("displayName")}</Label>
              <Input
                id="displayName"
                name="displayName"
                value={formData.displayName}
                onChange={handleInputChange}
                disabled={!isEditing}
                aria-invalid={!!errors.displayName}
                aria-describedby={
                  errors.displayName ? "displayName-error" : undefined
                }
              />
              {errors.displayName && (
                <p
                  id="displayName-error"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errors.displayName}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t("emailAddress")}</Label>
              <div className="relative">
                <IconMail
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={!isEditing}
                  className="pl-10"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
              </div>
              {errors.email && (
                <p
                  id="email-error"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errors.email}
                </p>
              )}
            </div>
          </div>

          {/* Action buttons when editing */}
          {isEditing && (
            <div className="flex gap-2 pt-4">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? tCommon("loading") : tCommon("save")}
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
              >
                {tCommon("cancel")}
              </Button>
            </div>
          )}

          {errors.submit && (
            <p className="text-sm text-destructive" role="alert">
              {errors.submit}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Account Information Card (Read-only) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconShield className="h-5 w-5" aria-hidden="true" />
            {t("accountInfo")}
          </CardTitle>
          <CardDescription>{t("accountInfoDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="space-y-4">
            <div className="flex items-center justify-between py-2">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconUser className="h-4 w-4" aria-hidden="true" />
                {t("userId")}
              </dt>
              <dd className="text-sm font-mono">
                {currentUser.id || "—"}
              </dd>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconShield className="h-4 w-4" aria-hidden="true" />
                {t("role")}
              </dt>
              <dd>
                <Badge variant="secondary">
                  {tAdminView(roleTranslationKey)}
                </Badge>
              </dd>
            </div>
            <Separator />
            <div className="flex items-center justify-between py-2">
              <dt className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconCalendar className="h-4 w-4" aria-hidden="true" />
                {t("accountCreated")}
              </dt>
              <dd className="text-sm">
                {currentUser.createdAt
                  ? format.dateTime(new Date(currentUser.createdAt), {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
