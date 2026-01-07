'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail, Check } from 'lucide-react'
import { Button } from './ui/button'
import { Card } from './ui/card'

interface Invitation {
  invitation_id: string
  workspace_id: string
  workspace_name: string
  workspace_slug: string
  role: string
  invited_by_email: string
  expires_at: string
  created_at: string
}

export function PendingInvitations() {
  const router = useRouter()
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState<string | null>(null)

  useEffect(() => {
    loadInvitations()
  }, [])

  const loadInvitations = async () => {
    try {
      const response = await fetch('/api/invitations', {
        credentials: 'include',
      })

      if (response.ok) {
        const data = await response.json()
        setInvitations(data.invitations || [])
      }
    } catch (error) {
      console.error('Failed to load invitations:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleAccept = async (invitationId: string, token: string) => {
    setAccepting(invitationId)
    try {
      // Extract token from invitation_id (we'll need to get it properly)
      // For now, we'll need to modify the API to return tokens
      const response = await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
        credentials: 'include',
      })

      if (response.ok) {
        await response.json()
        // Refresh invitations list
        await loadInvitations()
        // Refresh page to show new workspace
        router.refresh()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to accept invitation')
      }
    } catch (error) {
      console.error('Failed to accept invitation:', error)
      alert('Failed to accept invitation')
    } finally {
      setAccepting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (invitations.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">Pending Invitations</h3>
      {invitations.map((invitation) => {
        const expiresAt = new Date(invitation.expires_at)
        const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        const isExpiringSoon = daysLeft <= 2

        return (
          <Card key={invitation.invitation_id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium">{invitation.workspace_name}</h4>
                  <p className="text-sm text-muted-foreground">
                    Invited by {invitation.invited_by_email}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {invitation.role}
                    </span>
                    <span className={`text-xs ${isExpiringSoon ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {isExpiringSoon ? `⚠️ Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : `Expires in ${daysLeft} days`}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleAccept(invitation.invitation_id, invitation.workspace_slug)}
                  disabled={accepting === invitation.invitation_id}
                  size="sm"
                >
                  {accepting === invitation.invitation_id ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Accepting...
                    </>
                  ) : (
                    <>
                      <Check className="mr-1 h-3 w-3" />
                      Accept
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
