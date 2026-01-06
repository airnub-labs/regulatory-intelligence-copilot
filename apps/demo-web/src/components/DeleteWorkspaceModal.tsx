'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

interface DeleteWorkspaceModalProps {
  workspaceId: string
  workspaceName: string
  workspaceType: 'personal' | 'team' | 'enterprise'
  isOpen: boolean
  onClose: () => void
}

export function DeleteWorkspaceModal({
  workspaceId,
  workspaceName,
  workspaceType,
  isOpen,
  onClose,
}: DeleteWorkspaceModalProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const handleDelete = async () => {
    if (confirmText !== workspaceName) {
      setError('Workspace name does not match')
      return
    }

    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete workspace')
      }

      // Close modal
      onClose()

      // Redirect to home (will trigger workspace switch if needed)
      router.push('/')
      router.refresh()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workspace')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    if (!isDeleting) {
      setConfirmText('')
      setError(null)
      onClose()
    }
  }

  if (!isOpen) return null

  // Prevent deletion of personal workspaces
  if (workspaceType === 'personal') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold">Cannot Delete Personal Workspace</h2>
          </div>

          <p className="text-sm text-muted-foreground">
            Personal workspaces cannot be deleted. They are created automatically for each user
            and serve as your default workspace.
          </p>

          <div className="mt-6 flex justify-end">
            <Button onClick={handleClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
            <Trash2 className="h-5 w-5 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Delete Workspace</h2>
        </div>

        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium text-destructive">This action will delete "{workspaceName}"</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>• All members will lose access</li>
                <li>• Data will be retained for 30 days</li>
                <li>• You can restore within the grace period</li>
                <li>• Cost records will be preserved for audit</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="confirm-workspace-name">
              Type <span className="font-mono font-semibold">{workspaceName}</span> to confirm:
            </Label>
            <Input
              id="confirm-workspace-name"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={workspaceName}
              className="mt-1.5 font-mono"
              disabled={isDeleting}
              autoFocus
            />
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
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={isDeleting || confirmText !== workspaceName}
            variant="destructive"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              'Delete Workspace'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
