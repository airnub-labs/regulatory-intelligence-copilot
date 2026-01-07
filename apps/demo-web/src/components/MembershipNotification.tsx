'use client'

import { useMembershipMonitor, type MembershipEvent } from '@/hooks/useMembershipMonitor'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { X, UserPlus, UserMinus, UserCog, AlertTriangle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Membership Notification Component
 *
 * MEDIUM-2: Stale Active Tenant After Membership Removal
 *
 * Displays notifications for workspace membership changes:
 * - Added to workspace
 * - Removed from workspace
 * - Role changed
 * - Access suspended/reactivated
 *
 * Automatically switches workspace when removed from active workspace.
 */
export function MembershipNotification() {
  const { pendingEvents, showNotification, dismissNotification, isHandlingRemoval } = useMembershipMonitor()

  if (!showNotification || pendingEvents.length === 0) {
    return null
  }

  const getEventIcon = (eventType: MembershipEvent['event_type']) => {
    switch (eventType) {
      case 'added':
        return <UserPlus className="h-5 w-5 text-green-600" />
      case 'removed':
        return <UserMinus className="h-5 w-5 text-red-600" />
      case 'role_changed':
        return <UserCog className="h-5 w-5 text-blue-600" />
      case 'suspended':
        return <AlertTriangle className="h-5 w-5 text-orange-600" />
      case 'reactivated':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      default:
        return <UserCog className="h-5 w-5 text-gray-600" />
    }
  }

  const getEventBadgeVariant = (eventType: MembershipEvent['event_type']): 'default' | 'destructive' | 'outline' | 'secondary' => {
    switch (eventType) {
      case 'added':
      case 'reactivated':
        return 'default'
      case 'removed':
      case 'suspended':
        return 'destructive'
      case 'role_changed':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const getEventMessage = (event: MembershipEvent) => {
    switch (event.event_type) {
      case 'added':
        return (
          <>
            You&apos;ve been added to <strong>{event.tenant_name}</strong> as{' '}
            <Badge variant="outline" className="ml-1">
              {event.new_role}
            </Badge>
          </>
        )
      case 'removed':
        return (
          <>
            You&apos;ve been removed from <strong>{event.tenant_name}</strong>
          </>
        )
      case 'role_changed':
        return (
          <>
            Your role in <strong>{event.tenant_name}</strong> changed from{' '}
            <Badge variant="outline" className="ml-1">
              {event.old_role}
            </Badge>{' '}
            to{' '}
            <Badge variant="outline" className="ml-1">
              {event.new_role}
            </Badge>
          </>
        )
      case 'suspended':
        return (
          <>
            Your access to <strong>{event.tenant_name}</strong> has been suspended
          </>
        )
      case 'reactivated':
        return (
          <>
            Your access to <strong>{event.tenant_name}</strong> has been restored
          </>
        )
      default:
        return (
          <>
            Membership change in <strong>{event.tenant_name}</strong>
          </>
        )
    }
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins === 1) return '1 minute ago'
    if (diffMins < 60) return `${diffMins} minutes ago`

    const diffHours = Math.floor(diffMins / 60)
    if (diffHours === 1) return '1 hour ago'
    if (diffHours < 24) return `${diffHours} hours ago`

    return date.toLocaleString()
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <Card className="shadow-lg border-2">
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-lg">Workspace Membership Changes</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissNotification}
              className="h-6 w-6 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Events List */}
          <div className="space-y-3">
            {pendingEvents.map((event) => (
              <div
                key={event.event_id}
                className={cn(
                  'flex gap-3 p-3 rounded-lg border',
                  'bg-muted/50 hover:bg-muted transition-colors'
                )}
              >
                {/* Icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {getEventIcon(event.event_type)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm mb-1">
                    {getEventMessage(event)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getEventBadgeVariant(event.event_type)} className="text-xs">
                      {event.event_type.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(event.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Auto-switch indicator */}
          {isHandlingRemoval && (
            <div className="mt-3 p-2 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Switching to another workspace...
              </p>
            </div>
          )}

          {/* Dismiss button */}
          <div className="mt-3 pt-3 border-t">
            <Button
              onClick={dismissNotification}
              variant="outline"
              size="sm"
              className="w-full"
            >
              Dismiss All
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
