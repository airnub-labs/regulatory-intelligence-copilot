'use client'

import { useState } from 'react'
import { Loader2, UserPlus, Copy, Check } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface InviteUserModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceName?: string
}

export function InviteUserModal({ isOpen, onClose, workspaceName }: InviteUserModalProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member')
  const [isInviting, setIsInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleInvite = async () => {
    setError(null)

    if (!email.trim()) {
      setError('Email is required')
      return
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address')
      return
    }

    setIsInviting(true)
    try {
      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.toLowerCase().trim(), role }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation')
      }

      // Show invite URL
      setInviteUrl(data.invitation.inviteUrl)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setIsInviting(false)
    }
  }

  const handleCopyLink = async () => {
    if (inviteUrl) {
      try {
        await navigator.clipboard.writeText(inviteUrl)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (err) {
        console.error('Failed to copy:', err)
      }
    }
  }

  const handleClose = () => {
    if (!isInviting) {
      setEmail('')
      setRole('member')
      setError(null)
      setInviteUrl(null)
      setCopied(false)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Invite User</h2>
        </div>

        {!inviteUrl ? (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              Invite a team member to {workspaceName || 'this workspace'}. They'll receive an invitation link to join.
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  className="mt-1.5"
                  disabled={isInviting}
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(value) => setRole(value as 'admin' | 'member' | 'viewer')}
                  disabled={isInviting}
                >
                  <SelectTrigger id="invite-role" className="mt-1.5">
                    <SelectValue placeholder="Choose role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="viewer">
                      <div>
                        <div className="font-medium">Viewer</div>
                        <div className="text-xs text-muted-foreground">Can view conversations and data</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="member">
                      <div>
                        <div className="font-medium">Member</div>
                        <div className="text-xs text-muted-foreground">Can create and manage conversations</div>
                      </div>
                    </SelectItem>
                    <SelectItem value="admin">
                      <div>
                        <div className="font-medium">Admin</div>
                        <div className="text-xs text-muted-foreground">Can manage workspace and members</div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                onClick={handleClose}
                variant="outline"
                disabled={isInviting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleInvite}
                disabled={isInviting || !email}
              >
                {isInviting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Invitation'
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                ✅ Invitation sent successfully!
              </p>
              <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                Share this link with {email}:
              </p>
            </div>

            <div className="mb-4">
              <Label>Invitation Link (expires in 7 days)</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  value={inviteUrl}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                  size="icon"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {copied ? 'Copied to clipboard!' : 'Click to copy invitation link'}
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button onClick={handleClose}>
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
