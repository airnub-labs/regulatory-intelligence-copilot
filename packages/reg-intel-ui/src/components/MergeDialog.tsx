'use client';

import { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { X, GitMerge, Loader2, FileText, ListPlus, CheckSquare, Info, Check, ChevronDown, ChevronUp } from 'lucide-react';

import { useConversationPaths } from '../hooks/useConversationPaths.js';
import { cn, truncate, buildPathTree, flattenPathTree } from '../utils.js';
import { scrollToMessage } from '../utils/scroll-to-message.js';
import type { BaseComponentProps, ClientPath, MergeMode, MergeResult, MergePreview } from '../types.js';

/**
 * Format path label consistently across the application
 * Matches pattern from PathBreadcrumbs and PathSelector
 */
function formatPathLabel(path: ClientPath): string {
  return path.name || (path.isPrimary ? 'Primary' : `Branch ${path.id.slice(0, 6)}`);
}

export interface MergeDialogProps extends BaseComponentProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** The source path to merge */
  sourcePath: ClientPath;
  /** Callback after successful merge */
  onMergeComplete?: (result: MergeResult) => void;
  /**
   * Callback to scroll to a message after merge completes
   * If not provided, the dialog will use the built-in scrollToMessage utility
   */
  onScrollToMessage?: (messageId: string, highlight?: boolean) => void;
}

const MERGE_MODES: {
  value: MergeMode;
  label: string;
  icon: React.ReactNode;
  description: string;
  tooltip: string;
}[] = [
  {
    value: 'summary',
    label: 'Summary',
    icon: <FileText className="h-4 w-4" />,
    description: 'AI summarizes key findings into a single message',
    tooltip: 'Best for: capturing insights from exploration without conversation bloat. Creates a single system message with AI-generated summary.',
  },
  {
    value: 'full',
    label: 'Full merge',
    icon: <ListPlus className="h-4 w-4" />,
    description: 'All messages from branch added to main',
    tooltip: 'Best for: preserving complete conversation history. All messages from the branch are copied to the target path.',
  },
  {
    value: 'selective',
    label: 'Selective',
    icon: <CheckSquare className="h-4 w-4" />,
    description: 'Choose specific messages to include',
    tooltip: 'Best for: cherry-picking specific insights. Select individual messages to merge while leaving others behind.',
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
  onScrollToMessage,
}: MergeDialogProps) {
  const { paths, activePath, mergePath, previewMerge, isMerging } = useConversationPaths();
  const [mergeMode, setMergeMode] = useState<MergeMode>('summary');
  const [targetPathId, setTargetPathId] = useState<string>('');
  const [archiveSource, setArchiveSource] = useState(true);
  const [summaryPrompt, setSummaryPrompt] = useState('');
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selective mode state
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [showMessageList, setShowMessageList] = useState(false);

  // Build path tree for target selection (with depth-aware display)
  // Filter target paths first, then build tree
  const filteredTargetPaths = paths.filter(p => p.id !== sourcePath.id && p.isActive && !p.isMerged);
  const pathTree = buildPathTree(filteredTargetPaths);
  const flattenedPaths = flattenPathTree(pathTree).map(node => ({
    path: node.path as ClientPath,
    depth: node.depth,
  }));

  // Available target paths (exclude source and non-primary for simplicity)
  const targetPaths = paths.filter(
    p => p.id !== sourcePath.id && p.isActive && !p.isMerged
  );

  // Reset selected messages when mode changes
  useEffect(() => {
    if (mergeMode !== 'selective') {
      setSelectedMessageIds([]);
      setShowMessageList(false);
    } else {
      setShowMessageList(true);
    }
  }, [mergeMode]);

  // Auto-select all messages when entering selective mode with preview
  useEffect(() => {
    if (mergeMode === 'selective' && preview?.messagesToMerge && selectedMessageIds.length === 0) {
      setSelectedMessageIds(preview.messagesToMerge.map(m => m.id));
    }
  }, [mergeMode, preview?.messagesToMerge, selectedMessageIds.length]);

  // Toggle message selection
  const toggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds(prev =>
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    );
  }, []);

  // Select/deselect all messages
  const selectAllMessages = useCallback(() => {
    if (preview?.messagesToMerge) {
      setSelectedMessageIds(preview.messagesToMerge.map(m => m.id));
    }
  }, [preview?.messagesToMerge]);

  const deselectAllMessages = useCallback(() => {
    setSelectedMessageIds([]);
  }, []);

  // Set default target path
  useEffect(() => {
    if (open && targetPaths.length > 0 && !targetPathId) {
      const primary = targetPaths.find(p => p.isPrimary);
      setTargetPathId(primary?.id ?? targetPaths[0].id);
    }
  }, [open, targetPaths, targetPathId]);

  // Memoize selectedMessageIds for dependency tracking in selective mode only
  // This prevents unnecessary re-fetches when selectedMessageIds changes in non-selective modes
  const selectedIdsKey = mergeMode === 'selective' ? selectedMessageIds.join(',') : '';

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
          // For selective mode, include selected messages (or all if none selected yet)
          selectedMessageIds: mergeMode === 'selective' && selectedMessageIds.length > 0
            ? selectedMessageIds
            : undefined,
        });
        setPreview(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load preview');
      } finally {
        setIsLoadingPreview(false);
      }
    };

    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetPathId, mergeMode, summaryPrompt, previewMerge, sourcePath.id, selectedIdsKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!targetPathId) {
      setError('Please select a target path');
      return;
    }

    // Validate selective mode has at least one message selected
    if (mergeMode === 'selective' && selectedMessageIds.length === 0) {
      setError('Please select at least one message to merge');
      return;
    }

    try {
      const result = await mergePath(sourcePath.id, {
        targetPathId,
        mergeMode,
        archiveSource,
        summaryPrompt: summaryPrompt || undefined,
        // Include selectedMessageIds for selective mode
        selectedMessageIds: mergeMode === 'selective' ? selectedMessageIds : undefined,
      });

      onMergeComplete?.(result);
      onOpenChange(false);

      // Scroll to the merged content with highlight
      // For summary mode, scroll to the summary message
      // For full/selective mode, scroll to the first merged message
      const scrollTargetId = result.summaryMessageId || result.mergedMessageIds?.[0];
      if (scrollTargetId) {
        // Use setTimeout to allow DOM to update after dialog closes
        setTimeout(() => {
          if (onScrollToMessage) {
            onScrollToMessage(scrollTargetId, true);
          } else {
            scrollToMessage(scrollTargetId, { highlight: true, highlightDuration: 3000 });
          }
        }, 300);
      }

      // Reset form
      setMergeMode('summary');
      setSummaryPrompt('');
      setPreview(null);
      setSelectedMessageIds([]);
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
      setSelectedMessageIds([]);
      setShowMessageList(false);
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
            Merge &quot;{formatPathLabel(sourcePath)}&quot; into another path.
            {sourcePath.isPrimary && (
              <span className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded">primary</span>
            )}
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="space-y-6" role="form" aria-label="Merge branch form">
            {/* Target Path Selection with Tree Visualization */}
            <div className="space-y-2">
              <label
                id="target-path-label"
                className="text-sm font-medium leading-none"
              >
                Merge into
              </label>
              <div
                className={cn(
                  'rounded-md border border-input bg-background',
                  'max-h-[200px] overflow-y-auto'
                )}
                role="listbox"
                aria-labelledby="target-path-label"
                aria-activedescendant={targetPathId ? `path-option-${targetPathId}` : undefined}
              >
                {flattenedPaths.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No available target paths
                  </div>
                ) : (
                  flattenedPaths.map(({ path, depth }) => {
                    const isSelected = targetPathId === path.id;
                    return (
                      <button
                        key={path.id}
                        id={`path-option-${path.id}`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={isMerging}
                        onClick={() => setTargetPathId(path.id)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-sm text-left',
                          'transition-colors hover:bg-accent focus:bg-accent',
                          'focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary',
                          isSelected && 'bg-primary/10 font-medium',
                          isMerging && 'opacity-50 cursor-not-allowed'
                        )}
                        style={{ paddingLeft: `${12 + depth * 16}px` }}
                      >
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        )}
                        {!isSelected && <div className="w-4" aria-hidden="true" />}

                        <span className="truncate flex-1">{formatPathLabel(path)}</span>

                        {/* Badge indicators */}
                        {path.isPrimary && (
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            primary
                          </span>
                        )}
                        {path.isMerged && (
                          <span className="text-xs text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded shrink-0">
                            merged
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Merge Mode Selection with Tooltips */}
            <div className="space-y-3">
              <label id="merge-mode-label" className="text-sm font-medium leading-none">
                Merge mode
              </label>
              <Tooltip.Provider delayDuration={300}>
                <div
                  className="grid gap-3"
                  role="radiogroup"
                  aria-labelledby="merge-mode-label"
                >
                  {MERGE_MODES.map(mode => (
                    <Tooltip.Root key={mode.value}>
                      <Tooltip.Trigger asChild>
                        <label
                          className={cn(
                            'flex items-start gap-3 rounded-lg border p-4 cursor-pointer',
                            'transition-colors hover:bg-accent/50',
                            'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2',
                            mergeMode === mode.value && 'border-primary bg-primary/5'
                          )}
                        >
                          <input
                            type="radio"
                            name="mergeMode"
                            value={mode.value}
                            checked={mergeMode === mode.value}
                            onChange={(e) => setMergeMode(e.target.value as MergeMode)}
                            className={cn(
                              'mt-1 h-4 w-4 rounded-full border border-primary text-primary',
                              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
                            )}
                            disabled={isMerging}
                            aria-describedby={`mode-desc-${mode.value}`}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 font-medium">
                              {mode.icon}
                              {mode.label}
                              <Info className="h-3 w-3 text-muted-foreground opacity-50" aria-hidden="true" />
                            </div>
                            <p
                              id={`mode-desc-${mode.value}`}
                              className="text-sm text-muted-foreground mt-1"
                            >
                              {mode.description}
                            </p>
                          </div>
                        </label>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          className={cn(
                            'z-50 max-w-xs rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md',
                            'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out',
                            'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
                          )}
                          sideOffset={5}
                        >
                          {mode.tooltip}
                          <Tooltip.Arrow className="fill-popover" />
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  ))}
                </div>
              </Tooltip.Provider>
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
                  aria-describedby="summary-prompt-hint"
                />
                <p id="summary-prompt-hint" className="text-xs text-muted-foreground">
                  Provide custom instructions for the AI to focus on specific aspects of the conversation.
                </p>
              </div>
            )}

            {/* Selective Mode Message Picker */}
            {mergeMode === 'selective' && preview?.messagesToMerge && showMessageList && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium leading-none">
                    Select messages to merge
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllMessages}
                      className={cn(
                        'text-xs text-primary hover:underline',
                        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded'
                      )}
                      disabled={isMerging}
                    >
                      Select all
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      type="button"
                      onClick={deselectAllMessages}
                      className={cn(
                        'text-xs text-primary hover:underline',
                        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded'
                      )}
                      disabled={isMerging}
                    >
                      Deselect all
                    </button>
                  </div>
                </div>

                <div
                  className={cn(
                    'rounded-md border bg-background',
                    'max-h-[250px] overflow-y-auto'
                  )}
                  role="group"
                  aria-label="Messages to merge"
                >
                  {preview.messagesToMerge.map((msg, idx) => {
                    const isSelected = selectedMessageIds.includes(msg.id);
                    const roleLabel = msg.role === 'user' ? 'You' : 'Assistant';
                    const preview80 = truncate(msg.content, 80);

                    return (
                      <label
                        key={msg.id}
                        className={cn(
                          'flex items-start gap-3 p-3 cursor-pointer',
                          'transition-colors hover:bg-accent/50',
                          'border-b last:border-b-0',
                          isSelected && 'bg-primary/5',
                          isMerging && 'opacity-50 cursor-not-allowed'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleMessageSelection(msg.id)}
                          className={cn(
                            'mt-1 h-4 w-4 rounded border border-primary text-primary',
                            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
                          )}
                          disabled={isMerging}
                          aria-label={`Select message ${idx + 1} from ${roleLabel}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={cn(
                              'text-xs font-medium px-1.5 py-0.5 rounded',
                              msg.role === 'user'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            )}>
                              {roleLabel}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              #{idx + 1}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {preview80}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <p className="text-xs text-muted-foreground">
                  {selectedMessageIds.length} of {preview.messagesToMerge.length} messages selected
                </p>
              </div>
            )}

            {/* Preview Section */}
            {preview && (
              <div className="rounded-md border bg-muted/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Preview</h4>
                  {mergeMode === 'selective' && (
                    <button
                      type="button"
                      onClick={() => setShowMessageList(!showMessageList)}
                      className={cn(
                        'flex items-center gap-1 text-xs text-primary hover:underline',
                        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded'
                      )}
                    >
                      {showMessageList ? (
                        <>
                          <ChevronUp className="h-3 w-3" />
                          Hide messages
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-3 w-3" />
                          Show messages
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="text-sm text-muted-foreground">
                  {mergeMode === 'selective'
                    ? `${selectedMessageIds.length} messages selected for merge`
                    : `${preview.estimatedMessageCount} messages will be merged`
                  }
                </div>

                {preview.generatedSummary && mergeMode === 'summary' && (
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <FileText className="h-3 w-3" aria-hidden="true" />
                      Generated summary:
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{preview.generatedSummary}</p>
                  </div>
                )}

                {/* Source and target path info */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                  <span className="font-medium">{formatPathLabel(sourcePath)}</span>
                  <GitMerge className="h-3 w-3" aria-hidden="true" />
                  <span className="font-medium">
                    {targetPathId
                      ? formatPathLabel(targetPaths.find(p => p.id === targetPathId) || sourcePath)
                      : 'Select target'}
                  </span>
                </div>
              </div>
            )}

            {isLoadingPreview && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Archive Option */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                id="archive-source"
                checked={archiveSource}
                onChange={(e) => setArchiveSource(e.target.checked)}
                className={cn(
                  'h-4 w-4 rounded border border-primary text-primary',
                  'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
                )}
                disabled={isMerging}
                aria-describedby="archive-hint"
              />
              <span className="text-sm">Archive branch after merge</span>
              <Tooltip.Provider delayDuration={300}>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground opacity-50 group-hover:opacity-100" aria-hidden="true" />
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className={cn(
                        'z-50 max-w-xs rounded-md bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md',
                        'animate-in fade-in-0 zoom-in-95'
                      )}
                      sideOffset={5}
                    >
                      Archiving hides the branch from the active paths list. You can restore it later if needed.
                      <Tooltip.Arrow className="fill-popover" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
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
                disabled={
                  isMerging ||
                  !targetPathId ||
                  (mergeMode === 'selective' && selectedMessageIds.length === 0)
                }
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
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Merging...
                  </>
                ) : (
                  <>
                    <GitMerge className="h-4 w-4" aria-hidden="true" />
                    {mergeMode === 'selective' && selectedMessageIds.length > 0
                      ? `Merge (${selectedMessageIds.length})`
                      : 'Merge'
                    }
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
