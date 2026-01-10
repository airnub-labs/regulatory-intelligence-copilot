import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { z } from "zod"

// Schema for updating user profile
const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  avatarUrl: z.string().url().optional().nullable(),
})

// Schema for updating user preferences
const updatePreferencesSchema = z.object({
  locale: z.string().optional(),
  timezone: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
})

// Schema for updating tenant membership
const updateMembershipSchema = z.object({
  tenantId: z.string().uuid(),
  role: z.enum(["owner", "admin", "member", "viewer"]).optional(),
  status: z.enum(["active", "pending", "suspended", "removed"]).optional(),
})

// Combined update schema
const updateUserSchema = z.object({
  profile: updateProfileSchema.optional(),
  preferences: updatePreferencesSchema.optional(),
  membership: updateMembershipSchema.optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const supabase = createAdminClient()

    // Get user from auth
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId)

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "User not found", details: userError?.message },
        { status: 404 }
      )
    }

    const user = userData.user

    // Get tenant memberships
    const { data: memberships, error: membershipError } = await supabase
      .schema("copilot_core")
      .from("tenant_memberships")
      .select(`
        id,
        tenant_id,
        role,
        status,
        invited_by,
        invited_at,
        joined_at,
        created_at,
        updated_at
      `)
      .eq("user_id", userId)
      .in("status", ["active", "pending"])

    if (membershipError) {
      console.error("Error fetching memberships:", membershipError)
    }

    // Get tenants for these memberships
    const tenantIds = memberships?.map((m) => m.tenant_id) ?? []
    const { data: tenants, error: tenantsError } = await supabase
      .schema("copilot_core")
      .from("tenants")
      .select(`
        id,
        name,
        slug,
        type,
        owner_id,
        plan,
        created_at
      `)
      .in("id", tenantIds.length > 0 ? tenantIds : ["00000000-0000-0000-0000-000000000000"])
      .is("deleted_at", null)

    if (tenantsError) {
      console.error("Error fetching tenants:", tenantsError)
    }

    // Get user preferences
    const { data: prefs, error: prefsError } = await supabase
      .schema("copilot_core")
      .from("user_preferences")
      .select(`
        user_id,
        current_tenant_id,
        preferences,
        created_at,
        updated_at
      `)
      .eq("user_id", userId)
      .single()

    if (prefsError && prefsError.code !== "PGRST116") {
      console.error("Error fetching preferences:", prefsError)
    }

    // Create tenant map
    const tenantMap = new Map(tenants?.map((t) => [t.id, t]) ?? [])

    // Map tenant roles
    const tenantRoles = (memberships ?? []).map((m) => {
      const tenant = tenantMap.get(m.tenant_id)
      const isPrimary = prefs?.current_tenant_id === m.tenant_id

      return {
        tenantId: m.tenant_id,
        tenantName: tenant?.name ?? "Unknown Tenant",
        tenantSlug: tenant?.slug,
        tenantType: tenant?.type,
        tenantPlan: tenant?.plan,
        role: m.role,
        status: m.status,
        isPrimary,
        joinedAt: m.joined_at,
        invitedAt: m.invited_at,
      }
    })

    // Get preferences
    const userPreferences = prefs?.preferences ?? {}

    const response = {
      id: user.id,
      email: user.email ?? "",
      displayName:
        (user.user_metadata?.full_name as string) ||
        (user.user_metadata?.name as string) ||
        user.email?.split("@")[0] ||
        "Unknown",
      avatarUrl: user.user_metadata?.avatar_url as string | undefined,
      status: user.email_confirmed_at ? "active" : "pending",
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLogin: user.last_sign_in_at,
      emailConfirmedAt: user.email_confirmed_at,
      tenantRoles,
      preferences: {
        locale: (userPreferences as Record<string, unknown>).locale ?? "en-IE",
        timezone: (userPreferences as Record<string, unknown>).timezone ?? "Europe/Dublin",
        theme: (userPreferences as Record<string, unknown>).theme ?? "system",
      },
    }

    return NextResponse.json({ user: response })
  } catch (error) {
    console.error("Error in GET user:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const body = await request.json()

    // Validate request body
    const validation = updateUserSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: validation.error.issues },
        { status: 400 }
      )
    }

    const { profile, preferences, membership } = validation.data
    const supabase = createAdminClient()

    // Update profile (user_metadata in auth.users)
    if (profile) {
      const updateData: Record<string, unknown> = {}

      if (profile.displayName !== undefined) {
        updateData.full_name = profile.displayName
      }
      if (profile.avatarUrl !== undefined) {
        updateData.avatar_url = profile.avatarUrl
      }

      if (Object.keys(updateData).length > 0) {
        const { error: authError } = await supabase.auth.admin.updateUserById(
          userId,
          { user_metadata: updateData }
        )

        if (authError) {
          console.error("Error updating user profile:", authError)
          return NextResponse.json(
            { error: "Failed to update profile", details: authError.message },
            { status: 500 }
          )
        }
      }
    }

    // Update preferences
    if (preferences) {
      // First, get existing preferences
      const { data: existingPrefs } = await supabase
        .schema("copilot_core")
        .from("user_preferences")
        .select("preferences")
        .eq("user_id", userId)
        .single()

      const currentPrefs = existingPrefs?.preferences ?? {}
      const newPrefs = {
        ...(currentPrefs as Record<string, unknown>),
        ...preferences,
      }

      // Upsert preferences
      const { error: prefsError } = await supabase
        .schema("copilot_core")
        .from("user_preferences")
        .upsert(
          {
            user_id: userId,
            preferences: newPrefs,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id",
          }
        )

      if (prefsError) {
        console.error("Error updating preferences:", prefsError)
        return NextResponse.json(
          { error: "Failed to update preferences", details: prefsError.message },
          { status: 500 }
        )
      }
    }

    // Update membership
    if (membership) {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      }

      if (membership.role !== undefined) {
        updateData.role = membership.role
      }
      if (membership.status !== undefined) {
        updateData.status = membership.status
      }

      const { error: membershipError } = await supabase
        .schema("copilot_core")
        .from("tenant_memberships")
        .update(updateData)
        .eq("user_id", userId)
        .eq("tenant_id", membership.tenantId)

      if (membershipError) {
        console.error("Error updating membership:", membershipError)
        return NextResponse.json(
          { error: "Failed to update membership", details: membershipError.message },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in PATCH user:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
