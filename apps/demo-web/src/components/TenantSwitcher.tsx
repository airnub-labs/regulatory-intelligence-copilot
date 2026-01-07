'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Building2, Check, ChevronDown, Loader2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'

interface Tenant {
  tenant_id: string
  tenant_name: string
  tenant_slug: string
  tenant_type: string
  tenant_plan: string
  role: string
  is_active: boolean
  joined_at: string
}

interface TenantSwitcherProps {
  onCreateWorkspace?: () => void
  className?: string
}

export function TenantSwitcher({ onCreateWorkspace, className }: TenantSwitcherProps) {
  const { update } = useSession()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    loadTenants()
  }, [])

  async function loadTenants() {
    try {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_user_tenants')

      if (error) throw error

      setTenants(data || [])
    } catch (error) {
      console.error('Failed to load tenants:', error)
    } finally {
      setLoading(false)
    }
  }

  async function switchTenantWithRetry(
    tenantId: string,
    maxRetries: number = 3
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient()

    // Step 1: Update database (this is source of truth)
    const { data: switchResult, error: switchError } = await supabase
      .rpc('switch_tenant', { p_tenant_id: tenantId })
      .single()

    if (switchError || !switchResult) {
      return {
        success: false,
        error: 'Failed to switch workspace in database',
      }
    }

    // Step 2: Update session with retry logic
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await update()

        // Session updated successfully
        return { success: true }

      } catch (error) {
        lastError = error as Error
        console.error(`Session update attempt ${attempt}/${maxRetries} failed:`, error)

        // Exponential backoff
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }
      }
    }

    // All retries failed - force page reload to re-sync
    console.error('Session update failed after retries, forcing page reload')
    window.location.reload()

    return {
      success: false,
      error: `Session update failed: ${lastError?.message}`,
    }
  }

  async function switchTenant(tenantId: string) {
    if (switching) return

    setSwitching(true)
    try {
      const result = await switchTenantWithRetry(tenantId, 3)

      if (!result.success) {
        console.error('Failed to switch workspace:', result.error)
        // Page will reload automatically in switchTenantWithRetry
        return
      }

      // Success - reload page to fetch new tenant's data
      window.location.reload()

    } catch (error) {
      console.error('Unexpected error while switching workspace:', error)
      setSwitching(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="hidden sm:inline">Loading workspaces...</span>
      </div>
    )
  }

  const activeTenant = tenants.find(t => t.is_active)

  if (!activeTenant && tenants.length === 0) {
    return null
  }

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center gap-1">
        {/* Workspace Dropdown */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2 pr-2"
            onClick={() => setIsOpen(!isOpen)}
            disabled={switching}
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline max-w-[150px] truncate">
              {activeTenant?.tenant_name || 'Select workspace'}
            </span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>

          {/* Dropdown Menu */}
          {isOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsOpen(false)}
              />

              {/* Menu */}
              <div className="absolute right-0 mt-2 w-64 z-50 rounded-md border bg-popover p-1 shadow-lg">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  Your Workspaces
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {tenants.map((tenant) => (
                    <button
                      key={tenant.tenant_id}
                      onClick={() => {
                        setIsOpen(false)
                        if (!tenant.is_active) {
                          switchTenant(tenant.tenant_id)
                        }
                      }}
                      disabled={switching}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors",
                        "hover:bg-accent hover:text-accent-foreground",
                        "focus:bg-accent focus:text-accent-foreground focus:outline-none",
                        tenant.is_active && "bg-accent"
                      )}
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        {tenant.tenant_type === 'personal' ? '👤' : '👥'}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium truncate">{tenant.tenant_name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {tenant.role} · {tenant.tenant_type}
                        </div>
                      </div>
                      {tenant.is_active && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>

                {onCreateWorkspace && (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <button
                      onClick={() => {
                        setIsOpen(false)
                        onCreateWorkspace()
                      }}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                        <Plus className="h-4 w-4" />
                      </div>
                      <span className="font-medium">Create Workspace</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {switching && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
    </div>
  )
}
