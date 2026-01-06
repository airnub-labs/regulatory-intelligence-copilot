'use client'

import { useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { createClient } from '@/lib/supabase/client'

/**
 * Session/DB Consistency Monitor Hook
 *
 * Monitors for session/database sync issues and auto-heals if detected.
 * Checks every 30 seconds and after any tenant switch.
 *
 * MEDIUM-1: Session/DB Consistency on Workspace Switch
 *
 * This hook prevents the issue where a failed session update after
 * workspace switching leaves the JWT currentTenantId out of sync
 * with the database current_tenant_id.
 *
 * Auto-healing process:
 * 1. Periodically check if JWT matches database
 * 2. If mismatch detected, update session
 * 3. If still mismatched after update, force page reload
 */
export function useSessionSync() {
  const { data: session, update: updateSession } = useSession()
  const lastCheckRef = useRef<number>(0)
  const isHealingRef = useRef<boolean>(false)

  useEffect(() => {
    if (!session?.user?.id || !session?.user?.currentTenantId) {
      return
    }

    const checkInterval = 30000 // 30 seconds

    async function checkSync() {
      const now = Date.now()

      // Rate limit checks
      if (now - lastCheckRef.current < checkInterval) {
        return
      }

      // Prevent concurrent healing attempts
      if (isHealingRef.current) {
        return
      }

      lastCheckRef.current = now

      try {
        const supabase = createClient()

        const { data: dbTenantId, error } = await supabase
          .rpc('get_current_tenant_id', {
            p_user_id: session.user.id,
          })
          .single()

        if (error) {
          console.error('Failed to check session sync:', error)
          return
        }

        if (dbTenantId && dbTenantId !== session.user.currentTenantId) {
          console.warn('Session out of sync with database, auto-healing...', {
            jwtTenantId: session.user.currentTenantId,
            dbTenantId,
          })

          isHealingRef.current = true

          // Auto-heal by updating session
          try {
            await updateSession()

            // Verify healing worked
            setTimeout(async () => {
              try {
                const { data: checkAgain } = await supabase
                  .rpc('get_current_tenant_id', {
                    p_user_id: session.user.id,
                  })
                  .single()

                if (checkAgain && checkAgain !== session.user.currentTenantId) {
                  console.error('Session still out of sync after healing, forcing reload')
                  window.location.reload()
                } else {
                  console.info('Session sync auto-healing successful')
                  isHealingRef.current = false
                }
              } catch (verifyError) {
                console.error('Failed to verify healing:', verifyError)
                isHealingRef.current = false
              }
            }, 2000)

          } catch (healError) {
            console.error('Session update failed during healing:', healError)
            isHealingRef.current = false
            // Force reload as last resort
            window.location.reload()
          }
        }

      } catch (error) {
        console.error('Session sync check failed:', error)
      }
    }

    // Check immediately and set up interval
    checkSync()
    const interval = setInterval(checkSync, checkInterval)

    return () => clearInterval(interval)

  }, [session, updateSession])
}
