'use client';

import { useMemo, useState } from 'react';
import { GitBranch, Merge, PencilLine, X } from 'lucide-react';
import { useConversationPaths, useHasPathProvider } from '@reg-copilot/reg-intel-ui';
import type { PathMessage } from '@reg-copilot/reg-intel-ui';

import { Message, MessageLoading } from './message';
import { ProgressIndicator } from './progress-indicator';
import type { StreamingStage } from './progress-indicator';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface PathAwareMessageListProps {
  /** Fallback messages to show when path context is not available */
  fallbackMessages?: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
    disclaimer?: string;
    isPinned?: boolean;
    isBranchPoint?: boolean;
    branchedToPaths?: string[];
  }>;
  /** Whether messages are currently loading */
  isLoading?: boolean;
  /** Current streaming stage for progress indicator */
  streamingStage?: StreamingStage;
  /** Currently editing message ID */
  editingMessageId?: string | null;
  /** Current editing content */
  editingContent?: string;
  /** Called when editing content changes */
  onEditingContentChange?: (content: string) => void;
  /** Called when edit is submitted */
  onEditSubmit?: () => void;
  /** Called when edit is cancelled */
  onEditCancel?: () => void;
  /** Called when user wants to edit a message */
  onEditRequest?: (messageId: string) => void;
  /** Called when user wants to branch from a message */
  onBranchRequest?: (messageId: string, content: string) => void;
  /** Called when user wants to view a branch */
  onViewBranch?: (pathId: string) => void;
  /** Called when user toggles pin on a message */
  onTogglePin?: (messageId: string, isPinned: boolean) => void;
  /** Show branch buttons on messages */
  showBranchButtons?: boolean;
  /** Show action buttons on messages */
  showActions?: boolean;
  /** Reference to the textarea for editing */
  editTextareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Path-aware message list that displays messages from the active conversation path.
 * Falls back to standard message display when outside PathProvider.
 */
export function PathAwareMessageList({
  fallbackMessages = [],
  isLoading = false,
  streamingStage,
  editingMessageId,
  editingContent = '',
  onEditingContentChange,
  onEditSubmit,
  onEditCancel,
  onEditRequest,
  onBranchRequest,
  onViewBranch,
  onTogglePin,
  showBranchButtons = true,
  showActions = true,
  editTextareaRef,
}: PathAwareMessageListProps) {
  const hasPathProvider = useHasPathProvider();

  if (!hasPathProvider) {
    // Render fallback messages without path context
    return (
      <FallbackMessageList
        messages={fallbackMessages}
        isLoading={isLoading}
        streamingStage={streamingStage}
        editingMessageId={editingMessageId}
        editingContent={editingContent}
        onEditingContentChange={onEditingContentChange}
        onEditSubmit={onEditSubmit}
        onEditCancel={onEditCancel}
        onEditRequest={onEditRequest}
        onBranchRequest={onBranchRequest}
        onViewBranch={onViewBranch}
        onTogglePin={onTogglePin}
        showActions={showActions}
        editTextareaRef={editTextareaRef}
      />
    );
  }

  return (
    <PathContextMessageList
      isLoading={isLoading}
      streamingStage={streamingStage}
      editingMessageId={editingMessageId}
      editingContent={editingContent}
      onEditingContentChange={onEditingContentChange}
      onEditSubmit={onEditSubmit}
      onEditCancel={onEditCancel}
      onEditRequest={onEditRequest}
      onBranchRequest={onBranchRequest}
      onViewBranch={onViewBranch}
      onTogglePin={onTogglePin}
      showBranchButtons={showBranchButtons}
      showActions={showActions}
      editTextareaRef={editTextareaRef}
    />
  );
}

interface FallbackMessageListProps {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
    disclaimer?: string;
    isPinned?: boolean;
    isBranchPoint?: boolean;
    branchedToPaths?: string[];
  }>;
  isLoading: boolean;
  streamingStage?: StreamingStage;
  editingMessageId?: string | null;
  editingContent?: string;
  onEditingContentChange?: (content: string) => void;
  onEditSubmit?: () => void;
  onEditCancel?: () => void;
  onEditRequest?: (messageId: string) => void;
  onBranchRequest?: (messageId: string, content: string) => void;
  onViewBranch?: (pathId: string) => void;
  onTogglePin?: (messageId: string, isPinned: boolean) => void;
  showActions?: boolean;
  editTextareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

function FallbackMessageList({
  messages,
  isLoading,
  streamingStage,
  editingMessageId,
  editingContent = '',
  onEditingContentChange,
  onEditSubmit,
  onEditCancel,
  onEditRequest,
  onBranchRequest,
  onViewBranch,
  onTogglePin,
  showActions = true,
  editTextareaRef,
}: FallbackMessageListProps) {
  // Track active version index for each message with branches
  const [activeVersionIndex, setActiveVersionIndex] = useState<Record<string, number>>({});

  // Build versioned messages for fallback mode
  const versionedMessages = useMemo(() => {
    return messages.map(message => {
      const branchedPaths = message.branchedToPaths ?? [];

      if (branchedPaths.length > 0) {
        const versions = [message];
        branchedPaths.forEach((pathId, index) => {
          versions.push({
            ...message,
            id: `${message.id}-branch-${pathId}`,
            content: `[Branch ${index + 1}]`,
            metadata: {
              ...message.metadata,
              isBranchPreview: true,
              branchPathId: pathId,
              branchIndex: index + 1,
            },
          });
        });
        return { latestId: message.id, versions };
      }

      return { latestId: message.id, versions: [message] };
    });
  }, [messages]);

  return (
    <>
      {versionedMessages.map(chain => {
        const baseMessage = chain.versions[0];
        const isEditing = editingMessageId === baseMessage.id && baseMessage.role === 'user';
        const versionCount = chain.versions.length;
        const currentVersionIdx = activeVersionIndex[chain.latestId] ?? 0;
        const displayedMessage = chain.versions[currentVersionIdx] ?? baseMessage;

        if (isEditing && onEditSubmit && onEditCancel) {
          return (
            <div key={chain.latestId} className="rounded-2xl border bg-muted/40 p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <PencilLine className="h-4 w-4" /> Editing last message
              </div>
              <Label htmlFor={`edit-${chain.latestId}`} className="sr-only">
                Edit message
              </Label>
              <textarea
                ref={editTextareaRef}
                id={`edit-${chain.latestId}`}
                value={editingContent}
                onChange={event => onEditingContentChange?.(event.target.value)}
                className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none"
                rows={3}
                disabled={isLoading}
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onEditCancel} disabled={isLoading}>
                  <X className="mr-1 h-4 w-4" /> Cancel
                </Button>
                <Button size="sm" onClick={onEditSubmit} disabled={isLoading || !editingContent.trim()}>
                  <PencilLine className="mr-1 h-4 w-4" /> Save edit
                </Button>
              </div>
            </div>
          );
        }

        const metadata = displayedMessage.metadata as Parameters<typeof Message>[0]['metadata'];

        return (
          <div key={chain.latestId} className="relative">
            <Message
              role={displayedMessage.role}
              content={displayedMessage.content}
              disclaimer={displayedMessage.disclaimer}
              metadata={metadata}
              messageId={displayedMessage.id}
              onEdit={onEditRequest}
              onBranch={onBranchRequest ? (id) => onBranchRequest(id, displayedMessage.content) : undefined}
              showActions={showActions}
              isBranchPoint={baseMessage.isBranchPoint}
              branchedPaths={baseMessage.branchedToPaths}
              onViewBranch={onViewBranch}
              isPinned={displayedMessage.isPinned}
              onTogglePin={onTogglePin}
              versionCount={versionCount}
              currentVersionIndex={currentVersionIdx}
              versionTimestamp={new Date()}
              onVersionPrevious={versionCount > 1 ? () => {
                setActiveVersionIndex(prev => ({
                  ...prev,
                  [chain.latestId]: Math.max(0, (prev[chain.latestId] ?? 0) - 1)
                }));
              } : undefined}
              onVersionNext={versionCount > 1 ? () => {
                setActiveVersionIndex(prev => ({
                  ...prev,
                  [chain.latestId]: Math.min(versionCount - 1, (prev[chain.latestId] ?? 0) + 1)
                }));
              } : undefined}
            />
          </div>
        );
      })}
      {isLoading && (
        <>
          {streamingStage && <ProgressIndicator currentStage={streamingStage} />}
          <MessageLoading />
        </>
      )}
    </>
  );
}

interface PathContextMessageListProps {
  isLoading: boolean;
  streamingStage?: StreamingStage;
  editingMessageId?: string | null;
  editingContent?: string;
  onEditingContentChange?: (content: string) => void;
  onEditSubmit?: () => void;
  onEditCancel?: () => void;
  onEditRequest?: (messageId: string) => void;
  onBranchRequest?: (messageId: string, content: string) => void;
  onViewBranch?: (pathId: string) => void;
  onTogglePin?: (messageId: string, isPinned: boolean) => void;
  showBranchButtons: boolean;
  showActions: boolean;
  editTextareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

function PathContextMessageList({
  isLoading,
  streamingStage,
  editingMessageId,
  editingContent = '',
  onEditingContentChange,
  onEditSubmit,
  onEditCancel,
  onEditRequest,
  onBranchRequest,
  onViewBranch,
  onTogglePin,
  showBranchButtons,
  showActions,
  editTextareaRef,
}: PathContextMessageListProps) {
  const {
    messages,
    activePath,
    paths,
    isLoadingMessages,
    isBranching,
    createBranch,
    switchPath,
  } = useConversationPaths();

  const [branchingMessageId, setBranchingMessageId] = useState<string | null>(null);
  const [activeVersionIndex, setActiveVersionIndex] = useState<Record<string, number>>({});

  const handleBranch = async (messageId: string, content: string) => {
    if (onBranchRequest) {
      onBranchRequest(messageId, content);
      return;
    }

    try {
      setBranchingMessageId(messageId);
      const branchName = `Branch from: ${content.slice(0, 30)}${content.length > 30 ? '...' : ''}`;
      await createBranch(messageId, branchName);
    } finally {
      setBranchingMessageId(null);
    }
  };

  const handleViewBranch = async (pathId: string) => {
    if (onViewBranch) {
      onViewBranch(pathId);
      return;
    }
    // Default: switch to the branch path
    await switchPath(pathId);
  };

  // Build versioned messages with branch previews
  const versionedMessages = useMemo(() => {
    return messages.map(msg => {
      const branchedPaths = msg.branchedToPaths ?? [];

      if (branchedPaths.length > 0) {
        const versions: Array<PathMessage & { isBranchPreview?: boolean; branchPathId?: string; branchIndex?: number }> = [msg];
        branchedPaths.forEach((pathId, index) => {
          versions.push({
            ...msg,
            id: `${msg.id}-branch-${pathId}`,
            content: `[Branch ${index + 1}]`,
            metadata: {
              ...msg.metadata,
              isBranchPreview: true,
              branchPathId: pathId,
              branchIndex: index + 1,
            },
            isBranchPreview: true,
            branchPathId: pathId,
            branchIndex: index + 1,
          });
        });

        return {
          latestId: msg.id,
          versions,
          isBranchable: msg.role === 'user' || msg.role === 'assistant',
          hasBranches: true,
          branchCount: branchedPaths.length,
        };
      }

      return {
        latestId: msg.id,
        versions: [msg],
        isBranchable: msg.role === 'user' || msg.role === 'assistant',
        hasBranches: false,
        branchCount: 0,
      };
    });
  }, [messages]);

  if (isLoadingMessages && messages.length === 0) {
    return <MessageLoading />;
  }

  return (
    <>
      {versionedMessages.map(chain => {
        const baseMessage = chain.versions[0];
        const isEditing = editingMessageId === baseMessage.id && baseMessage.role === 'user';
        const versionCount = chain.versions.length;
        const currentVersionIdx = activeVersionIndex[chain.latestId] ?? 0;
        const displayedMessage = chain.versions[currentVersionIdx] ?? baseMessage;

        if (isEditing && onEditSubmit && onEditCancel) {
          return (
            <div key={chain.latestId} className="rounded-2xl border bg-muted/40 p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                <PencilLine className="h-4 w-4" /> Editing last message
              </div>
              <Label htmlFor={`edit-${chain.latestId}`} className="sr-only">
                Edit message
              </Label>
              <textarea
                ref={editTextareaRef}
                id={`edit-${chain.latestId}`}
                value={editingContent}
                onChange={event => onEditingContentChange?.(event.target.value)}
                className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none"
                rows={3}
                disabled={isLoading}
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={onEditCancel} disabled={isLoading}>
                  <X className="mr-1 h-4 w-4" /> Cancel
                </Button>
                <Button size="sm" onClick={onEditSubmit} disabled={isLoading || !editingContent.trim()}>
                  <PencilLine className="mr-1 h-4 w-4" /> Save edit
                </Button>
              </div>
            </div>
          );
        }

        const metadata = displayedMessage.metadata as Parameters<typeof Message>[0]['metadata'];

        return (
          <div key={chain.latestId} className="group relative">
            <Message
              role={displayedMessage.role as 'user' | 'assistant'}
              content={displayedMessage.content}
              metadata={metadata}
              messageId={displayedMessage.id}
              onEdit={onEditRequest}
              onBranch={showBranchButtons ? (id) => handleBranch(id, displayedMessage.content) : undefined}
              showActions={showActions}
              isBranchPoint={baseMessage.isBranchPoint}
              branchedPaths={baseMessage.branchedToPaths}
              onViewBranch={handleViewBranch}
              isPinned={baseMessage.isPinned ?? false}
              onTogglePin={onTogglePin}
              versionCount={versionCount}
              currentVersionIndex={currentVersionIdx}
              versionTimestamp={new Date(displayedMessage.createdAt)}
              onVersionPrevious={versionCount > 1 ? () => {
                setActiveVersionIndex(prev => ({
                  ...prev,
                  [chain.latestId]: Math.max(0, (prev[chain.latestId] ?? 0) - 1)
                }));
              } : undefined}
              onVersionNext={versionCount > 1 ? () => {
                setActiveVersionIndex(prev => ({
                  ...prev,
                  [chain.latestId]: Math.min(versionCount - 1, (prev[chain.latestId] ?? 0) + 1)
                }));
              } : undefined}
            />

            {/* Branch button on hover (additional visual indicator) */}
            {showBranchButtons && chain.isBranchable && !isEditing && (
              <div className="absolute -right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 bg-background shadow-sm"
                  onClick={() => handleBranch(baseMessage.id, baseMessage.content)}
                  disabled={isBranching || branchingMessageId === baseMessage.id}
                  title="Create branch from this message"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* Path info badge */}
      {activePath && paths.length > 1 && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
          <GitBranch className="h-3 w-3" />
          <span>
            Viewing path: <strong>{activePath.name || 'Primary'}</strong>
          </span>
          {activePath.parentPathId && (
            <>
              <span className="text-muted-foreground/50">|</span>
              <Merge className="h-3 w-3" />
              <span>Branched conversation</span>
            </>
          )}
        </div>
      )}

      {isLoading && (
        <>
          {streamingStage && <ProgressIndicator currentStage={streamingStage} />}
          <MessageLoading />
        </>
      )}
    </>
  );
}

export default PathAwareMessageList;
