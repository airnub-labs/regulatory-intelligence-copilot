'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'

interface CreateWorkspaceModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateWorkspaceModal({ isOpen, onClose }: CreateWorkspaceModalProps) {
  const { update } = useSession()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [type, setType] = useState<'team' | 'enterprise'>('team')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value)
    // Generate slug: lowercase, replace spaces/special chars with hyphens
    const generatedSlug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    setSlug(generatedSlug)
  }

  const handleCreate = async () => {
    setError(null)

    if (!name.trim()) {
      setError('Workspace name is required')
      return
    }

    if (!slug.trim()) {
      setError('Workspace slug is required')
      return
    }

    setCreating(true)
    try {
      // Create workspace via API
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, slug, type }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create workspace')
      }

      const { tenant } = await response.json()

      // Switch to new workspace
      const supabase = createClient()
      const { error: switchError } = await supabase.rpc('switch_tenant', {
        p_tenant_id: tenant.id
      })

      if (switchError) throw switchError

      // Refresh NextAuth session
      await update()

      // Reload to show new workspace
      window.location.reload()

    } catch (error) {
      console.error('Failed to create workspace:', error)
      setError(error instanceof Error ? error.message : 'Failed to create workspace')
    } finally {
      setCreating(false)
    }
  }

  const handleClose = () => {
    if (!creating) {
      setName('')
      setSlug('')
      setType('team')
      setError(null)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Create Workspace</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="workspace-name">Workspace Name</Label>
            <Input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Acme Corp"
              className="mt-1.5"
              disabled={creating}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="workspace-slug">URL Slug</Label>
            <Input
              id="workspace-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="acme-corp"
              className="mt-1.5"
              disabled={creating}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Used in workspace URLs. Only lowercase letters, numbers, and hyphens.
            </p>
          </div>

          <div>
            <Label htmlFor="workspace-type">Workspace Type</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as 'team' | 'enterprise')}
              disabled={creating}
            >
              <SelectTrigger id="workspace-type" className="mt-1.5">
                <SelectValue placeholder="Choose type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="team">
                  <div className="flex items-center gap-2">
                    <span>👥</span>
                    <div>
                      <div className="font-medium">Team</div>
                      <div className="text-xs text-muted-foreground">For small teams and projects</div>
                    </div>
                  </div>
                </SelectItem>
                <SelectItem value="enterprise">
                  <div className="flex items-center gap-2">
                    <span>🏢</span>
                    <div>
                      <div className="font-medium">Enterprise</div>
                      <div className="text-xs text-muted-foreground">For large organizations</div>
                    </div>
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
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={creating || !name || !slug}
          >
            {creating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Workspace'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
