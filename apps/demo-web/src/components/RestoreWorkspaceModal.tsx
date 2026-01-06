'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw, Info } from 'lucide-react'
import { Button } from './ui/button'

interface RestoreWorkspaceModalProps {
  workspaceId: string
  workspaceName: string
  deletedAt: string
  restoreDeadline: string
  daysRemaining: number
  isOpen: boolean
  onClose: () => void
}

export function RestoreWorkspaceModal({
  workspaceId,
  workspaceName,
  deletedAt,
  restoreDeadline,
  daysRemaining,
  isOpen,
  onClose,
}: RestoreWorkspaceModalProps) {
  const router = useRouter()
  const [isRestoring, setIsRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRestore = async () => {
    setIsRestoring(true)
    setError(null)

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'restore' }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to restore workspace')
      }

      // Close modal
      onClose()

      // Refresh to show restored workspace
      router.refresh()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore workspace')
    } finally {
      setIsRestoring(false)
    }
  }

  const handleClose = () => {
    if (!isRestoring) {
      setError(null)
      onClose()
    }
  }

  if (!isOpen) return null

  const deletedDate = new Date(deletedAt).toLocaleDateString()
  const deadlineDate = new Date(restoreDeadline).toLocaleDateString()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <RotateCcw className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Restore Workspace</h2>
        </div>

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
          <div className="flex gap-2">
            <Info className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Restore "{workspaceName}"
              </p>
              <ul className="mt-2 space-y-1 text-blue-700 dark:text-blue-300">
                <li>• Deleted on: {deletedDate}</li>
                <li>• {daysRemaining} days remaining before permanent deletion</li>
                <li>• Deadline: {deadlineDate}</li>
                <li>• All members will regain access</li>
                <li>• All data will be fully restored</li>
              </ul>
            </div>
          </div>
        </div>

        {daysRemaining <= 3 && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">⚠️ Urgent: Only {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} left!</p>
            <p className="mt-1 text-muted-foreground">
              After {deadlineDate}, this workspace will be permanently deleted and cannot be recovered.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            onClick={handleClose}
            variant="outline"
            disabled={isRestoring}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Restoring...
              </>
            ) : (
              'Restore Workspace'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
