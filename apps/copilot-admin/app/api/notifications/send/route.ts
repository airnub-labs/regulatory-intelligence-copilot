import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { getNotificationHub } from "@/lib/server/admin-event-hubs"
import {
  NotificationPriority,
  notificationTypes,
  type NotificationTypeValue,
} from "@/lib/types/notification"
import { AdminRole, adminRoles, type AdminRoleType } from "@/lib/types/admin"

/**
 * Target types for notification delivery
 */
const TargetType = {
  /** Send to all platform users */
  ALL_USERS: "all_users",
  /** Send to users with specific platform roles */
  PLATFORM_ROLES: "platform_roles",
  /** Send to users with specific roles within a tenant */
  TENANT_ROLES: "tenant_roles",
  /** Send to specific user IDs */
  SPECIFIC_USERS: "specific_users",
} as const

/**
 * Schema for sending notifications
 */
const sendNotificationSchema = z.object({
  // Notification content
  type: z.enum(notificationTypes as [NotificationTypeValue, ...NotificationTypeValue[]]),
  priority: z.enum([
    NotificationPriority.LOW,
    NotificationPriority.MEDIUM,
    NotificationPriority.HIGH,
    NotificationPriority.CRITICAL,
  ]),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  actionUrl: z.string().url().optional(),

  // Targeting
  targetType: z.enum([
    TargetType.ALL_USERS,
    TargetType.PLATFORM_ROLES,
    TargetType.TENANT_ROLES,
    TargetType.SPECIFIC_USERS,
  ]),
  /** For PLATFORM_ROLES: which roles to target */
  platformRoles: z.array(z.enum(adminRoles as [AdminRoleType, ...AdminRoleType[]])).optional(),
  /** For TENANT_ROLES: which tenant and roles to target */
  tenantId: z.string().uuid().optional(),
  tenantRoles: z.array(z.string()).optional(),
  /** For SPECIFIC_USERS: list of user IDs */
  userIds: z.array(z.string().uuid()).optional(),
})

type SendNotificationInput = z.infer<typeof sendNotificationSchema>

/**
 * Roles allowed to send notifications
 */
const ALLOWED_SENDER_ROLES: AdminRoleType[] = [
  AdminRole.SUPER_ADMIN,
  AdminRole.PLATFORM_ENGINEER,
  AdminRole.ACCOUNT_MANAGER,
]

/**
 * POST /api/notifications/send
 *
 * Send notifications to targeted users based on roles or specific user IDs.
 *
 * Required permissions: super_admin, platform_engineer, or account_manager
 *
 * Request body:
 * - type: Notification type (announcement, broadcast, etc.)
 * - priority: Notification priority (low, medium, high, critical)
 * - title: Notification title
 * - message: Notification message
 * - actionUrl: Optional URL for "View" action
 * - targetType: How to target users (all_users, platform_roles, tenant_roles, specific_users)
 * - platformRoles: Array of platform roles (for platform_roles targeting)
 * - tenantId: Tenant ID (for tenant_roles targeting)
 * - tenantRoles: Array of tenant roles (for tenant_roles targeting)
 * - userIds: Array of user IDs (for specific_users targeting)
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Extract user for TypeScript narrowing
    const user = session.user

    // TODO: Check user's role from session or database
    // For now, we'll get it from the database
    const supabase = createAdminClient()

    // Get sender's role from admin_users table
    const { data: senderProfile } = await supabase
      .schema("copilot_core")
      .from("platform_admins")
      .select("role")
      .eq("id", user.id)
      .single()

    const senderRole = (senderProfile?.role as AdminRoleType) || AdminRole.VIEWER

    // Check permission to send notifications
    if (!ALLOWED_SENDER_ROLES.includes(senderRole)) {
      return NextResponse.json(
        {
          error: "Permission denied",
          message: "You don't have permission to send notifications",
          code: "INSUFFICIENT_PERMISSIONS",
        },
        { status: 403 }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const parseResult = sendNotificationSchema.safeParse(body)

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Validation error",
          details: parseResult.error.flatten(),
        },
        { status: 400 }
      )
    }

    const input = parseResult.data

    // Validate targeting configuration
    const validationError = validateTargeting(input)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Get target user IDs based on targeting type
    const targetUserIds = await getTargetUserIds(supabase, input)

    if (targetUserIds.length === 0) {
      return NextResponse.json(
        {
          error: "No recipients",
          message: "No users match the specified targeting criteria",
        },
        { status: 400 }
      )
    }

    // Create notifications for all target users
    const notifications = targetUserIds.map((userId) => ({
      user_id: userId,
      type: input.type,
      title: input.title,
      message: input.message,
      priority: input.priority,
      status: "UNREAD",
      action_url: input.actionUrl || null,
      metadata: {
        sent_by: user.id,
        sent_by_name: user.name || user.email,
        target_type: input.targetType,
        ...(input.platformRoles && { target_roles: input.platformRoles }),
        ...(input.tenantId && { target_tenant: input.tenantId }),
      },
      created_at: new Date().toISOString(),
    }))

    // Insert notifications into database
    const { data: insertedNotifications, error: insertError } = await supabase
      .schema("copilot_core")
      .from("notifications")
      .insert(notifications)
      .select("id, user_id")

    if (insertError) {
      console.error("[SendNotification] Insert error:", insertError)
      return NextResponse.json(
        { error: "Failed to create notifications", details: insertError.message },
        { status: 500 }
      )
    }

    // Broadcast to connected clients via notification hub
    const notificationHub = getNotificationHub()
    const broadcastPromises = (insertedNotifications || []).map(async (notification) => {
      try {
        notificationHub.broadcast(notification.user_id, "notification:new", {
          id: notification.id,
          type: input.type,
          title: input.title,
          message: input.message,
          priority: input.priority,
          actionUrl: input.actionUrl,
          createdAt: new Date().toISOString(),
        })
      } catch (error) {
        console.warn(`[SendNotification] Failed to broadcast to ${notification.user_id}:`, error)
      }
    })

    await Promise.allSettled(broadcastPromises)

    // Audit log
    console.log("[SendNotification] Notification sent", {
      senderId: user.id,
      senderRole,
      targetType: input.targetType,
      recipientCount: targetUserIds.length,
      type: input.type,
      priority: input.priority,
    })

    return NextResponse.json({
      success: true,
      message: `Notification sent to ${targetUserIds.length} user(s)`,
      recipientCount: targetUserIds.length,
    })
  } catch (error) {
    console.error("[SendNotification] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * Validate targeting configuration
 */
function validateTargeting(input: SendNotificationInput): string | null {
  switch (input.targetType) {
    case TargetType.PLATFORM_ROLES:
      if (!input.platformRoles || input.platformRoles.length === 0) {
        return "platformRoles is required when targetType is platform_roles"
      }
      break

    case TargetType.TENANT_ROLES:
      if (!input.tenantId) {
        return "tenantId is required when targetType is tenant_roles"
      }
      if (!input.tenantRoles || input.tenantRoles.length === 0) {
        return "tenantRoles is required when targetType is tenant_roles"
      }
      break

    case TargetType.SPECIFIC_USERS:
      if (!input.userIds || input.userIds.length === 0) {
        return "userIds is required when targetType is specific_users"
      }
      break
  }

  return null
}

/**
 * Get target user IDs based on targeting type
 */
async function getTargetUserIds(
  supabase: ReturnType<typeof createAdminClient>,
  input: SendNotificationInput
): Promise<string[]> {
  switch (input.targetType) {
    case TargetType.ALL_USERS: {
      // Get all active users
      const { data: users } = await supabase
        .from("profiles")
        .select("id")
        .eq("status", "active")

      return (users || []).map((u) => u.id)
    }

    case TargetType.PLATFORM_ROLES: {
      // Get admin users with specific platform roles
      const { data: users } = await supabase
        .schema("copilot_admin")
        .from("admin_users")
        .select("id")
        .eq("status", "active")
        .in("role", input.platformRoles || [])

      return (users || []).map((u) => u.id)
    }

    case TargetType.TENANT_ROLES: {
      // Get users with specific roles in a tenant
      const { data: memberships } = await supabase
        .from("tenant_memberships")
        .select("user_id")
        .eq("tenant_id", input.tenantId!)
        .in("role", input.tenantRoles || [])
        .eq("status", "active")

      return (memberships || []).map((m) => m.user_id)
    }

    case TargetType.SPECIFIC_USERS: {
      // Return the provided user IDs (after verifying they exist)
      const { data: users } = await supabase
        .from("profiles")
        .select("id")
        .in("id", input.userIds || [])

      return (users || []).map((u) => u.id)
    }

    default:
      return []
  }
}
