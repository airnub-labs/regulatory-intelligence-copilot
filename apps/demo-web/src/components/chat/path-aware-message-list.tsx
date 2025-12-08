'use client';

import { useMemo, useState } from 'react';
import { GitBranch, Merge } from 'lucide-react';
import { useConversationPaths, useHasPathProvider } from '@reg-copilot/reg-intel-ui';
import type { PathMessage } from '@reg-copilot/reg-intel-ui';

import { Message, MessageLoading } from './message';
import { Button } from '@/components/ui/button';

interface PathAwareMessageListProps {
  /** Fallback messages to show when path context is not available */
  fallbackMessages?: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
    deletedAt?: string | null;
    supersededBy?: string | null;
    disclaimer?: string;
  }>;
  /** Whether messages are currently loading */
  isLoading?: boolean;
  /** Currently editing message ID */
  editingMessageId?: string | null;
  /** Render a custom message editor */
  renderMessageEditor?: (message: PathMessage) => React.ReactNode;
  /** Called when user wants to branch from a message */
  onBranchRequest?: (messageId: string, content: string) => void;
  /** Show branch buttons on messages */
  showBranchButtons?: boolean;
}

/**
 * Path-aware message list that displays messages from the active conversation path.
 * Falls back to standard message display when outside PathProvider.
 */
export function PathAwareMessageList({
  fallbackMessages = [],
  isLoading = false,
  editingMessageId,
  renderMessageEditor,
  onBranchRequest,
  showBranchButtons = true,
}: PathAwareMessageListProps) {
  const hasPathProvider = useHasPathProvider();

  if (!hasPathProvider) {
    // Render fallback messages without path context
    return (
      <FallbackMessageList
        messages={fallbackMessages}
        isLoading={isLoading}
        editingMessageId={editingMessageId}
      />
    );
  }

  return (
    <PathContextMessageList
      isLoading={isLoading}
      editingMessageId={editingMessageId}
      renderMessageEditor={renderMessageEditor}
      onBranchRequest={onBranchRequest}
      showBranchButtons={showBranchButtons}
    />
  );
}

interface FallbackMessageListProps {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
    deletedAt?: string | null;
    supersededBy?: string | null;
    disclaimer?: string;
  }>;
  isLoading: boolean;
  editingMessageId?: string | null;
}

function FallbackMessageList({ messages, isLoading }: FallbackMessageListProps) {
  return (
    <>
      {messages
        .filter(msg => !msg.deletedAt)
        .map(msg => (
          <Message
            key={msg.id}
            role={msg.role}
            content={msg.content}
            disclaimer={msg.disclaimer}
            metadata={msg.metadata as Parameters<typeof Message>[0]['metadata']}
            deletedAt={msg.deletedAt}
            supersededBy={msg.supersededBy}
          />
        ))}
      {isLoading && <MessageLoading />}
    </>
  );
}

interface PathContextMessageListProps {
  isLoading: boolean;
  editingMessageId?: string | null;
  renderMessageEditor?: (message: PathMessage) => React.ReactNode;
  onBranchRequest?: (messageId: string, content: string) => void;
  showBranchButtons: boolean;
}

function PathContextMessageList({
  isLoading,
  editingMessageId,
  renderMessageEditor,
  onBranchRequest,
  showBranchButtons,
}: PathContextMessageListProps) {
  const {
    messages,
    activePath,
    paths,
    isLoadingMessages,
    isBranching,
    createBranch,
  } = useConversationPaths();

  const [branchingMessageId, setBranchingMessageId] = useState<string | null>(null);

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

  // Group messages by their role for better visualization
  const displayMessages = useMemo(() => {
    return messages.map(msg => ({
      ...msg,
      isBranchable: msg.role === 'user' || msg.role === 'assistant',
      hasBranches: msg.branchedToPaths.length > 0,
      branchCount: msg.branchedToPaths.length,
    }));
  }, [messages]);

  if (isLoadingMessages && messages.length === 0) {
    return <MessageLoading />;
  }

  return (
    <>
      {displayMessages.map(msg => {
        const isEditing = editingMessageId === msg.id;

        if (isEditing && renderMessageEditor) {
          return <div key={msg.id}>{renderMessageEditor(msg)}</div>;
        }

        return (
          <div key={msg.id} className="group relative">
            <Message
              role={msg.role as 'user' | 'assistant'}
              content={msg.content}
              metadata={msg.metadata as Parameters<typeof Message>[0]['metadata']}
            />

            {/* Branch indicator */}
            {msg.hasBranches && (
              <div className="absolute -left-6 top-1/2 -translate-y-1/2">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <GitBranch className="h-3 w-3" />
                </div>
                {msg.branchCount > 1 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                    {msg.branchCount}
                  </span>
                )}
              </div>
            )}

            {/* Branch button on hover */}
            {showBranchButtons && msg.isBranchable && !isEditing && (
              <div className="absolute -right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7 bg-background shadow-sm"
                  onClick={() => handleBranch(msg.id, msg.content)}
                  disabled={isBranching || branchingMessageId === msg.id}
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

      {isLoading && <MessageLoading />}
    </>
  );
}

export default PathAwareMessageList;
