'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, GitBranch, Loader2 } from 'lucide-react';

import { useConversationPaths } from '../hooks/useConversationPaths.js';
import { cn, truncate } from '../utils.js';
import type { BaseComponentProps, ClientPath } from '../types.js';

export interface BranchDialogProps extends BaseComponentProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The message to branch from */
  messageId: string;
  /** Preview of the message content */
  messagePreview?: string;
  /** Callback after successful branch creation */
  onBranchCreated?: (path: ClientPath) => void;
}

/**
 * BranchDialog - Modal for creating a new conversation branch
 *
 * @example
 * ```tsx
 * <BranchDialog
 *   open={showBranchDialog}
 *   onOpenChange={setShowBranchDialog}
 *   messageId="msg-123"
 *   messagePreview="What are the tax obligations..."
 *   onBranchCreated={(path) => {
 *     console.log('Created branch:', path);
 *     switchPath(path.id);
 *   }}
 * />
 * ```
 */
export function BranchDialog({
  className,
  open,
  onOpenChange,
  messageId,
  messagePreview,
  onBranchCreated,
}: BranchDialogProps) {
  const { createBranch, isBranching } = useConversationPaths();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const path = await createBranch(
        messageId,
        name.trim() || undefined,
        description.trim() || undefined
      );
      onBranchCreated?.(path);
      onOpenChange(false);
      // Reset form
      setName('');
      setDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create branch');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset form on close
      setName('');
      setDescription('');
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-black/80',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
            'gap-4 border bg-background p-6 shadow-lg duration-200',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
            'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
            'sm:rounded-lg',
            className
          )}
        >
          <Dialog.Title className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
            <GitBranch className="h-5 w-5" />
            Create Branch
          </Dialog.Title>

          <Dialog.Description className="text-sm text-muted-foreground">
            Create a new conversation branch from this message. The branch will inherit all
            messages up to this point and allow you to explore a different direction.
          </Dialog.Description>

          {messagePreview && (
            <div className="rounded-md border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground mb-1">Branching from:</p>
              <p className="text-sm">{truncate(messagePreview, 150)}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="branch-name" className="text-sm font-medium leading-none">
                Branch name <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                id="branch-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., PRSI Deep Dive"
                className={cn(
                  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
                  'text-sm ring-offset-background placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50'
                )}
                disabled={isBranching}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="branch-description" className="text-sm font-medium leading-none">
                Description <span className="text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="branch-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will you explore in this branch?"
                rows={3}
                className={cn(
                  'flex w-full rounded-md border border-input bg-background px-3 py-2',
                  'text-sm ring-offset-background placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50 resize-none'
                )}
                disabled={isBranching}
              />
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center justify-center rounded-md px-4 py-2',
                    'text-sm font-medium border border-input bg-background',
                    'hover:bg-accent hover:text-accent-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    'disabled:pointer-events-none disabled:opacity-50'
                  )}
                  disabled={isBranching}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isBranching}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2',
                  'text-sm font-medium bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:pointer-events-none disabled:opacity-50'
                )}
              >
                {isBranching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <GitBranch className="h-4 w-4" />
                    Create Branch
                  </>
                )}
              </button>
            </div>
          </form>

          <Dialog.Close asChild>
            <button
              className={cn(
                'absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background',
                'transition-opacity hover:opacity-100',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'disabled:pointer-events-none'
              )}
              disabled={isBranching}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
