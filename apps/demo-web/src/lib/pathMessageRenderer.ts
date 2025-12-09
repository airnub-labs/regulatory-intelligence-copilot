/**
 * Path-Based Message Rendering Utilities
 *
 * Replaces the legacy supersededBy pattern with proper path-based message resolution.
 * This enables showing complete conversation history for each path version.
 */

import type { PathAwareMessage } from '@reg-copilot/reg-intel-conversations';

/**
 * Chat message type (legacy format used by UI)
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  disclaimer?: string;
  metadata?: {
    agentId?: string;
    jurisdictions?: string[];
    uncertaintyLevel?: 'low' | 'medium' | 'high';
    disclaimerKey?: string;
    referencedNodes?: string[];
    warnings?: string[];
    timelineSummary?: string;
    timelineFocus?: string;
    deletedAt?: string;
    supersededBy?: string;
  };
  deletedAt?: string | null;
  supersededBy?: string | null;
  // Path-aware fields
  pathId?: string;
  sequenceInPath?: number;
  isBranchPoint?: boolean;
  branchedToPaths?: string[];
}

/**
 * Versioned message chain (for UI rendering)
 */
export interface VersionedMessage {
  latestId: string;
  versions: ChatMessage[];
}

/**
 * Convert PathAwareMessage to ChatMessage format
 */
export function pathMessageToChatMessage(msg: PathAwareMessage): ChatMessage {
  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    metadata: msg.metadata as ChatMessage['metadata'],
    deletedAt: null, // Path system doesn't use soft deletes - messages are part of path history
    supersededBy: null, // Not used in path system
    pathId: msg.pathId,
    sequenceInPath: msg.sequenceInPath,
    isBranchPoint: msg.isBranchPoint,
    branchedToPaths: msg.branchedToPaths,
  };
}

/**
 * Build versioned messages from path-aware messages
 *
 * Unlike the legacy buildVersionedMessages which used supersededBy chains,
 * this groups messages by their position in the conversation flow, respecting
 * the path sequence order.
 *
 * @param messages - Array of PathAwareMessage from path store
 * @returns Array of VersionedMessage for UI rendering
 */
export function buildPathVersionedMessages(messages: PathAwareMessage[]): VersionedMessage[] {
  // Sort messages by sequence in path
  const sortedMessages = [...messages].sort((a, b) => a.sequenceInPath - b.sequenceInPath);

  // Convert to chat message format
  const chatMessages = sortedMessages.map(pathMessageToChatMessage);

  // Group into versioned chains - in path system, each message is its own "latest"
  // since we don't use supersededBy pattern anymore
  return chatMessages.map(msg => ({
    latestId: msg.id,
    versions: [msg], // Single version per message in path system
  }));
}

/**
 * Legacy buildVersionedMessages for backwards compatibility
 * This is used when path data is not available
 */
export function buildVersionedMessages(messages: ChatMessage[]): VersionedMessage[] {
  const messageMap = new Map(messages.map(message => [message.id, message]));
  const predecessor = new Map<string, string>();

  messages.forEach(message => {
    const successorId = message.supersededBy ?? message.metadata?.supersededBy;
    if (successorId) {
      predecessor.set(successorId, message.id);
    }
  });

  const findLatest = (messageId: string): string => {
    let current = messageId;
    let next = messageMap.get(current)?.supersededBy ?? messageMap.get(current)?.metadata?.supersededBy;
    while (next && messageMap.has(next)) {
      current = next;
      next = messageMap.get(current)?.supersededBy ?? messageMap.get(current)?.metadata?.supersededBy;
    }
    return current;
  };

  const orderedLatestIds: string[] = [];
  const seenLatest = new Set<string>();
  messages.forEach(message => {
    const latestId = findLatest(message.id);
    if (!seenLatest.has(latestId)) {
      orderedLatestIds.push(latestId);
      seenLatest.add(latestId);
    }
  });

  const chains: VersionedMessage[] = orderedLatestIds.map(latestId => {
    const versions: ChatMessage[] = [];
    let cursor: string | undefined = latestId;

    while (cursor) {
      const current = messageMap.get(cursor);
      if (current) {
        versions.unshift(current);
      }
      cursor = predecessor.get(cursor);
    }

    return { latestId, versions };
  });

  return chains;
}

/**
 * Get branch metadata for a message
 */
export function getBranchMetadata(message: ChatMessage): {
  isBranchPoint: boolean;
  branchCount: number;
  branchIds: string[];
} {
  return {
    isBranchPoint: message.isBranchPoint ?? false,
    branchCount: message.branchedToPaths?.length ?? 0,
    branchIds: message.branchedToPaths ?? [],
  };
}
