/**
 * Path-Based Message Rendering Utilities
 *
 * Utilities for working with path-aware messages in the conversation branching system.
 */

import type { PathAwareMessage } from '@reg-copilot/reg-intel-conversations';

/**
 * Chat message type used by UI
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
  };
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
    pathId: msg.pathId,
    sequenceInPath: msg.sequenceInPath,
    isBranchPoint: msg.isBranchPoint,
    branchedToPaths: msg.branchedToPaths,
  };
}

/**
 * Build versioned messages from path-aware messages
 *
 * Groups messages by their position in the conversation flow, respecting
 * the path sequence order. In the path system, each message is its own version -
 * branching is handled via separate paths, not message chains.
 *
 * @param messages - Array of PathAwareMessage from path store
 * @returns Array of VersionedMessage for UI rendering
 */
export function buildPathVersionedMessages(messages: PathAwareMessage[]): VersionedMessage[] {
  // Sort messages by sequence in path
  const sortedMessages = [...messages].sort((a, b) => a.sequenceInPath - b.sequenceInPath);

  // Convert to chat message format
  const chatMessages = sortedMessages.map(pathMessageToChatMessage);

  // Each message is its own version in the path system
  return chatMessages.map(msg => ({
    latestId: msg.id,
    versions: [msg],
  }));
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
