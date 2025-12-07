/**
 * Conversation Path Types
 *
 * This module defines the types for the conversation branching and merging system.
 * Paths represent different branches of a conversation, allowing users to:
 * - View message history for specific paths
 * - Branch conversations from any message
 * - Merge results back to parent paths
 */

import type { ShareAudience, TenantAccess } from '../conversationStores.js';

// =============================================================================
// Core Path Types
// =============================================================================

/**
 * Represents a conversation path (main thread or branch).
 * Paths form a tree structure with parent-child relationships.
 */
export interface ConversationPath {
  id: string;
  conversationId: string;
  tenantId: string;

  // Lineage
  /** Parent path ID (null for root/primary path) */
  parentPathId: string | null;
  /** Message ID where this branch started from parent */
  branchPointMessageId: string | null;

  // Metadata
  /** Optional name for the branch (e.g., "PRSI Deep Dive") */
  name: string | null;
  /** Optional description of the branch purpose */
  description: string | null;
  /** Whether this is the primary/main path for the conversation */
  isPrimary: boolean;
  /** Whether this path is currently active (false = archived) */
  isActive: boolean;

  // Merge state
  /** Path this was merged into (null if not merged) */
  mergedToPathId: string | null;
  /** When this path was merged */
  mergedAt: Date | null;
  /** Message ID of the merge summary in target path */
  mergeSummaryMessageId: string | null;
  /** How this path was merged */
  mergeMode: MergeMode | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Computed (from view)
  /** Number of messages in this path (not including inherited) */
  messageCount?: number;
  /** Number of active child branches */
  branchCount?: number;
}

/**
 * Message type indicators for special messages
 */
export type MessageType = 'standard' | 'merge_summary' | 'branch_point' | 'system';

/**
 * Extended message interface with path information
 */
export interface PathAwareMessage {
  id: string;
  conversationId: string;
  pathId: string;
  tenantId: string;
  userId: string | null;

  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;

  // Path ordering
  sequenceInPath: number;

  // Branch tracking
  isBranchPoint: boolean;
  branchedToPaths: string[];

  // Message classification
  messageType: MessageType;

  // Timestamps
  createdAt: Date;

  // For resolved views: the effective sequence across inherited paths
  effectiveSequence?: number;
}

// =============================================================================
// Branch Types
// =============================================================================

/**
 * Represents a point where a branch can be or has been created
 */
export interface BranchPoint {
  /** The message that can serve as a branch point */
  messageId: string;
  /** Content preview of the message */
  messageContent: string;
  /** Role of the message */
  messageRole: 'user' | 'assistant' | 'system';
  /** Sequence number in the path */
  sequenceInPath: number;
  /** Existing branches from this point */
  branchedPaths: ConversationPath[];
  /** Whether more branches can be created */
  canBranch: boolean;
}

/**
 * Input for creating a new branch
 */
export interface BranchInput {
  tenantId: string;
  conversationId: string;
  /** Message to branch from */
  sourceMessageId: string;
  /** User creating the branch */
  userId?: string | null;
  /** Optional name for the branch */
  name?: string | null;
  /** Optional description */
  description?: string | null;
}

/**
 * Result of creating a branch
 */
export interface BranchResult {
  /** The newly created path */
  path: ConversationPath;
  /** The conversation ID (same as source) */
  conversationId: string;
  /** The message marked as branch point */
  branchPointMessage: PathAwareMessage;
}

// =============================================================================
// Merge Types
// =============================================================================

/**
 * How to merge a path
 */
export type MergeMode = 'summary' | 'full' | 'selective';

/**
 * Input for merging a path
 */
export interface MergeInput {
  tenantId: string;
  /** Path to merge from */
  sourcePathId: string;
  /** Path to merge into */
  targetPathId: string;
  /** Merge strategy */
  mergeMode: MergeMode;
  /** For selective mode: which messages to include */
  selectedMessageIds?: string[];
  /** For summary mode: custom prompt for AI summarization */
  summaryPrompt?: string;
  /** Pre-generated summary content (if not using AI) */
  summaryContent?: string;
  /** User performing the merge */
  userId?: string | null;
  /** Whether to archive the source path after merge */
  archiveSource?: boolean;
}

/**
 * Result of a merge operation
 */
export interface MergeResult {
  success: boolean;
  /** The summary message ID (for summary mode) */
  summaryMessageId?: string;
  /** The merged message IDs (for full/selective mode) */
  mergedMessageIds?: string[];
  /** The target path after merge */
  targetPath: ConversationPath;
  /** The source path after merge (may be archived) */
  sourcePath: ConversationPath;
}

/**
 * Preview of what a merge would produce
 */
export interface MergePreview {
  /** Messages that would be merged */
  messagesToMerge: PathAwareMessage[];
  /** Generated summary (for summary mode) */
  generatedSummary?: string;
  /** Target path info */
  targetPath: ConversationPath;
  /** Source path info */
  sourcePath: ConversationPath;
  /** Estimated impact */
  estimatedMessageCount: number;
}

// =============================================================================
// Path Resolution Types
// =============================================================================

/**
 * Result of resolving messages for a path (including inherited messages)
 */
export interface PathResolution {
  /** All messages visible in this path, in order */
  messages: PathAwareMessage[];
  /** The path being viewed */
  path: ConversationPath;
  /** Chain of ancestor paths (from root to current) */
  ancestorPaths: ConversationPath[];
  /** Available branch points in this path */
  branchPoints: BranchPoint[];
  /** Paths that can be merged into this one */
  mergeablePaths: ConversationPath[];
}

/**
 * Options for resolving path messages
 */
export interface PathResolutionOptions {
  /** Include messages marked as deleted */
  includeDeleted?: boolean;
  /** Limit the number of messages returned */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// =============================================================================
// Store Input/Output Types
// =============================================================================

/**
 * Input for creating a new path
 */
export interface CreatePathInput {
  tenantId: string;
  conversationId: string;
  parentPathId?: string | null;
  branchPointMessageId?: string | null;
  name?: string | null;
  description?: string | null;
  isPrimary?: boolean;
}

/**
 * Input for updating a path
 */
export interface UpdatePathInput {
  tenantId: string;
  pathId: string;
  name?: string | null;
  description?: string | null;
  isActive?: boolean;
}

/**
 * Input for listing paths
 */
export interface ListPathsInput {
  tenantId: string;
  conversationId: string;
  /** Include inactive (archived/merged) paths */
  includeInactive?: boolean;
  /** Include only paths with specific parent */
  parentPathId?: string | null;
}

/**
 * Input for getting a path
 */
export interface GetPathInput {
  tenantId: string;
  pathId: string;
}

/**
 * Input for resolving path messages
 */
export interface ResolvePathMessagesInput {
  tenantId: string;
  pathId: string;
  options?: PathResolutionOptions;
}

/**
 * Input for setting active path
 */
export interface SetActivePathInput {
  tenantId: string;
  conversationId: string;
  pathId: string;
}

/**
 * Input for getting active path
 */
export interface GetActivePathInput {
  tenantId: string;
  conversationId: string;
}

/**
 * Input for deleting/archiving a path
 */
export interface DeletePathInput {
  tenantId: string;
  pathId: string;
  /** If true, permanently delete; if false, archive */
  hardDelete?: boolean;
}

// =============================================================================
// SSE Event Types
// =============================================================================

/**
 * Path-related SSE event types
 */
export type PathEventType =
  | 'path:created'
  | 'path:updated'
  | 'path:deleted'
  | 'path:merged'
  | 'path:active';

// =============================================================================
// Client Types (for API responses)
// =============================================================================

/**
 * Path data formatted for client consumption
 */
export interface ClientPath {
  id: string;
  conversationId: string;
  parentPathId: string | null;
  branchPointMessageId: string | null;
  name: string | null;
  description: string | null;
  isPrimary: boolean;
  isActive: boolean;
  isMerged: boolean;
  mergedToPathId: string | null;
  mergedAt: string | null;
  mergeMode: MergeMode | null;
  messageCount: number;
  branchCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert internal path to client format
 */
export function toClientPath(path: ConversationPath): ClientPath {
  return {
    id: path.id,
    conversationId: path.conversationId,
    parentPathId: path.parentPathId,
    branchPointMessageId: path.branchPointMessageId,
    name: path.name,
    description: path.description,
    isPrimary: path.isPrimary,
    isActive: path.isActive,
    isMerged: path.mergedToPathId !== null,
    mergedToPathId: path.mergedToPathId,
    mergedAt: path.mergedAt?.toISOString() ?? null,
    mergeMode: path.mergeMode,
    messageCount: path.messageCount ?? 0,
    branchCount: path.branchCount ?? 0,
    createdAt: path.createdAt.toISOString(),
    updatedAt: path.updatedAt.toISOString(),
  };
}
