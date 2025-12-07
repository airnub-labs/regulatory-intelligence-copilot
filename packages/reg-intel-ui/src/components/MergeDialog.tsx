'use client';

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, GitMerge, Loader2, FileText, ListPlus, CheckSquare } from 'lucide-react';

import { useConversationPaths } from '../hooks/useConversationPaths';
import { cn } from '../utils';
import type { BaseComponentProps, ClientPath, MergeMode, MergeResult, MergePreview } from '../types';

export interface MergeDialogProps extends BaseComponentProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The source path to merge */
  sourcePath: ClientPath;
  /** Callback after successful merge */
  onMergeComplete?: (result: MergeResult) => void;
}

const MERGE_MODES: { value: MergeMode; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'summary',
    label: 'Summary',
    icon: <FileText className="h-4 w-4" />,
    description: 'AI summarizes key findings into a single message',
  },
  {
    value: 'full',
    label: 'Full merge',
    icon: <ListPlus className="h-4 w-4" />,
    description: 'All messages from branch added to main',
  },
  {
    value: 'selective',
    label: 'Selective',
    icon: <CheckSquare className="h-4 w-4" />,
    description: 'Choose specific messages to include',
  },
];

/**
 * MergeDialog - Modal for merging a branch back to the main path
 *
 * @example
 * ```tsx
 * <MergeDialog
 *   open={showMergeDialog}
 *   onOpenChange={setShowMergeDialog}
 *   sourcePath={branchToMerge}
 *   onMergeComplete={(result) => {
 *     console.log('Merged:', result);
 *   }}
 * />
 * ```
 */
export function MergeDialog({
  className,
  open,
  onOpenChange,
  sourcePath,
  onMergeComplete,
}: MergeDialogProps) {
  const { paths, activePath, mergePath, previewMerge, isMerging } = useConversationPaths();
  const [mergeMode, setMergeMode] = useState<MergeMode>('summary');
  const [targetPathId, setTargetPathId] = useState<string>('');
  const [archiveSource, setArchiveSource] = useState(true);
  const [summaryPrompt, setSummaryPrompt] = useState('');
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available target paths (exclude source and non-primary for simplicity)
  const targetPaths = paths.filter(
    p => p.id !== sourcePath.id && p.isActive && !p.isMerged
  );

  // Set default target path
  useEffect(() => {
    if (open && targetPaths.length > 0 && !targetPathId) {
      const primary = targetPaths.find(p => p.isPrimary);
      setTargetPathId(primary?.id ?? targetPaths[0].id);
    }
  }, [open, targetPaths, targetPathId]);

  // Load preview when mode or target changes
  useEffect(() => {
    if (!open || !targetPathId) return;

    const loadPreview = async () => {
      setIsLoadingPreview(true);
      setError(null);
      try {
        const result = await previewMerge(sourcePath.id, {
          targetPathId,
          mergeMode,
          summaryPrompt: summaryPrompt || undefined,
        });
        setPreview(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load preview');
      } finally {
        setIsLoadingPreview(false);
      }
    };

    loadPreview();
  }, [open, targetPathId, mergeMode, summaryPrompt, previewMerge, sourcePath.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!targetPathId) {
      setError('Please select a target path');
      return;
    }

    try {
      const result = await mergePath(sourcePath.id, {
        targetPathId,
        mergeMode,
        archiveSource,
        summaryPrompt: summaryPrompt || undefined,
      });
      onMergeComplete?.(result);
      onOpenChange(false);
      // Reset form
      setMergeMode('summary');
      setSummaryPrompt('');
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to merge');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setMergeMode('summary');
      setTargetPathId('');
      setSummaryPrompt('');
      setPreview(null);
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
            'fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%]',
            'gap-4 border bg-background p-6 shadow-lg duration-200 max-h-[90vh] overflow-y-auto',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'sm:rounded-lg',
            className
          )}
        >
          <Dialog.Title className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">
            <GitMerge className="h-5 w-5" />
            Merge Branch
          </Dialog.Title>

          <Dialog.Description className="text-sm text-muted-foreground">
            Merge &quot;{sourcePath.name ?? 'Unnamed Branch'}&quot; into another path.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Target Path Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">
                Merge into
              </label>
              <select
                value={targetPathId}
                onChange={(e) => setTargetPathId(e.target.value)}
                className={cn(
                  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2',
                  'text-sm ring-offset-background',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                )}
                disabled={isMerging}
              >
                <option value="">Select a path...</option>
                {targetPaths.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? (p.isPrimary ? 'Main' : 'Unnamed')}
                    {p.isPrimary ? ' (primary)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Merge Mode Selection */}
            <div className="space-y-3">
              <label className="text-sm font-medium leading-none">
                Merge mode
              </label>
              <div className="grid gap-3">
                {MERGE_MODES.map(mode => (
                  <label
                    key={mode.value}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-4 cursor-pointer',
                      'transition-colors hover:bg-accent/50',
                      mergeMode === mode.value && 'border-primary bg-primary/5'
                    )}
                  >
                    <input
                      type="radio"
                      name="mergeMode"
                      value={mode.value}
                      checked={mergeMode === mode.value}
                      onChange={(e) => setMergeMode(e.target.value as MergeMode)}
                      className="mt-1"
                      disabled={isMerging}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium">
                        {mode.icon}
                        {mode.label}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {mode.description}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Summary Prompt (for summary mode) */}
            {mergeMode === 'summary' && (
              <div className="space-y-2">
                <label htmlFor="summary-prompt" className="text-sm font-medium leading-none">
                  Summarization instructions <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="summary-prompt"
                  value={summaryPrompt}
                  onChange={(e) => setSummaryPrompt(e.target.value)}
                  placeholder="e.g., Focus on the key regulatory requirements discussed..."
                  rows={3}
                  className={cn(
                    'flex w-full rounded-md border border-input bg-background px-3 py-2',
                    'text-sm ring-offset-background placeholder:text-muted-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    'resize-none'
                  )}
                  disabled={isMerging}
                />
              </div>
            )}

            {/* Preview */}
            {preview && (
              <div className="rounded-md border bg-muted/50 p-4 space-y-3">
                <h4 className="text-sm font-medium">Preview</h4>
                <div className="text-sm text-muted-foreground">
                  {preview.estimatedMessageCount} messages will be merged
                </div>
                {preview.generatedSummary && (
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground mb-1">Generated summary:</p>
                    <p className="text-sm whitespace-pre-wrap">{preview.generatedSummary}</p>
                  </div>
                )}
              </div>
            )}

            {isLoadingPreview && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Archive Option */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={archiveSource}
                onChange={(e) => setArchiveSource(e.target.checked)}
                className="rounded border-input"
                disabled={isMerging}
              />
              <span className="text-sm">Archive branch after merge</span>
            </label>

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
                  disabled={isMerging}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={isMerging || !targetPathId}
                className={cn(
                  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2',
                  'text-sm font-medium bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:pointer-events-none disabled:opacity-50'
                )}
              >
                {isMerging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <GitMerge className="h-4 w-4" />
                    Merge
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
              disabled={isMerging}
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
