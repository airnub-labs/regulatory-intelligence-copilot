'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Membership Change Event
 *
 * Represents a change to user's workspace membership:
 * - added: User was added to a workspace
 * - removed: User was removed from a workspace
 * - role_changed: User's role changed within a workspace
 * - suspended: User's access was suspended
 * - reactivated: User's access was restored from suspension
 */
export interface MembershipEvent {
  event_id: string
  tenant_id: string
  tenant_name: string
  event_type: 'added' | 'removed' | 'role_changed' | 'suspended' | 'reactivated' | 'status_changed'
  old_role?: string
  new_role?: string
  old_status?: string
  new_status?: string
  created_at: string
}

/**
 * Membership Monitor Hook
 *
 * MEDIUM-2: Stale Active Tenant After Membership Removal
 *
 * Monitors for membership changes and automatically handles:
 * 1. Auto-switch workspace when removed from active workspace
 * 2. Show notifications for membership changes
 * 3. Prevent stale session access after membership removal
 *
 * Polling interval: 10 seconds
 */
export function useMembershipMonitor() {
  const { data: session, update: updateSession } = useSession()
  const router = useRouter()
  const [pendingEvents, setPendingEvents] = useState<MembershipEvent[]>([])
  const [showNotification, setShowNotification] = useState(false)
  const [isHandlingRemoval, setIsHandlingRemoval] = useState(false)
  const lastCheckRef = useRef<number>(0)

  const checkForEvents = useCallback(async () => {
    if (!session?.user?.id) return

    // Rate limit checks
    const now = Date.now()
    const checkInterval = 10000 // 10 seconds

    if (now - lastCheckRef.current < checkInterval) {
      return
    }

    lastCheckRef.current = now

    try {
      const supabase = createClient()

      const { data: events, error } = await supabase
        .rpc('get_pending_membership_events', {
          p_user_id: session.user.id,
        })

      if (error) {
        console.error('Failed to check membership events:', error)
        return
      }

      if (events && events.length > 0) {
        setPendingEvents(events)
        setShowNotification(true)

        // Check if removed from current workspace
        const removedFromCurrent = (events as MembershipEvent[]).find(
          (e: MembershipEvent) =>
            e.tenant_id === session.user.currentTenantId &&
            (e.event_type === 'removed' || e.event_type === 'suspended')
        )

        if (removedFromCurrent && !isHandlingRemoval) {
          // Auto-switch to another workspace
          await handleRemovedFromActiveWorkspace()
        }
      }
    } catch (error) {
      console.error('Membership event check failed:', error)
    }
  }, [session, isHandlingRemoval])

  const handleRemovedFromActiveWorkspace = async () => {
    if (!session?.user?.id || isHandlingRemoval) return

    setIsHandlingRemoval(true)

    try {
      const supabase = createClient()

      // Get user's remaining workspaces
      const { data: tenants, error: tenantsError } = await supabase
        .rpc('get_user_tenants')

      if (tenantsError) {
        console.error('Failed to get user tenants:', tenantsError)
        setIsHandlingRemoval(false)
        return
      }

      if (!tenants || tenants.length === 0) {
        // User has no workspaces left - should not happen for personal workspaces
        console.error('User has no remaining workspaces')
        router.push('/no-workspaces')
        setIsHandlingRemoval(false)
        return
      }

      // Switch to first available workspace (prefer personal)
      const personalWorkspace = tenants.find((t: { tenant_type: string }) => t.tenant_type === 'personal')
      const targetWorkspace = personalWorkspace || tenants[0]

      console.info('Auto-switching workspace after removal', {
        from: session.user.currentTenantId,
        to: targetWorkspace.tenant_id,
        reason: 'removed_from_active_workspace',
      })

      const { error: switchError } = await supabase.rpc('switch_tenant', {
        p_tenant_id: targetWorkspace.tenant_id,
      })

      if (switchError) {
        console.error('Failed to switch tenant:', switchError)
        setIsHandlingRemoval(false)
        return
      }

      // Update session
      await updateSession()

      // Show notification
      setShowNotification(true)

      // Reload to fetch new workspace data
      router.refresh()

    } catch (error) {
      console.error('Failed to switch workspace after removal:', error)
    } finally {
      setIsHandlingRemoval(false)
    }
  }

  const dismissNotification = async () => {
    if (pendingEvents.length === 0 || !session?.user?.id) return

    try {
      const supabase = createClient()

      await supabase.rpc('mark_membership_events_processed', {
        p_user_id: session.user.id,
        p_event_ids: pendingEvents.map((e) => e.event_id),
      })

      setPendingEvents([])
      setShowNotification(false)

    } catch (error) {
      console.error('Failed to mark events as processed:', error)
    }
  }

  // Poll for events every 10 seconds
  useEffect(() => {
    if (!session?.user?.id) return

    checkForEvents()
    const interval = setInterval(checkForEvents, 10000)

    return () => clearInterval(interval)
  }, [session, checkForEvents])

  return {
    pendingEvents,
    showNotification,
    dismissNotification,
    isHandlingRemoval,
  }
}
