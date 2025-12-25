/**
 * UI Component Types for Conversation Paths
 */

import type {
  ClientPath,
  MergeMode,
  PathAwareMessage,
} from '@reg-copilot/reg-intel-conversations';

// Re-export for convenience
export type { ClientPath, MergeMode, PathAwareMessage };

/**
 * API client interface for path operations
 * Consumers must implement this to connect components to their backend
 */
export interface PathApiClient {
  // Path CRUD
  listPaths(conversationId: string): Promise<ClientPath[]>;
  createPath(conversationId: string, input: CreatePathInput): Promise<ClientPath>;
  updatePath(conversationId: string, pathId: string, input: UpdatePathInput): Promise<ClientPath>;
  deletePath(conversationId: string, pathId: string, hardDelete?: boolean): Promise<void>;

  // Path Resolution
  getPathMessages(conversationId: string, pathId: string): Promise<PathMessage[]>;

  // Active Path
  getActivePath(conversationId: string): Promise<ClientPath>;
  setActivePath(conversationId: string, pathId: string): Promise<ClientPath>;

  // Branching
  createBranch(conversationId: string, input: BranchInput): Promise<BranchResult>;

  // Merging
  mergePath(conversationId: string, sourcePathId: string, input: MergeInput): Promise<MergeResult>;
  previewMerge(conversationId: string, sourcePathId: string, input: PreviewMergeInput): Promise<MergePreview>;
}

export interface CreatePathInput {
  name?: string;
  description?: string;
  parentPathId?: string;
  branchPointMessageId?: string;
}

export interface UpdatePathInput {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface BranchInput {
  sourceMessageId: string;
  name?: string;
  description?: string;
}

export interface BranchResult {
  path: ClientPath;
  conversationId: string;
  branchPointMessage: {
    id: string;
    role: string;
    content: string;
  };
}

export interface MergeInput {
  targetPathId: string;
  mergeMode: MergeMode;
  selectedMessageIds?: string[];
  summaryPrompt?: string;
  summaryContent?: string;
  archiveSource?: boolean;
}

export interface PreviewMergeInput {
  targetPathId: string;
  mergeMode: MergeMode;
  selectedMessageIds?: string[];
  summaryPrompt?: string;
}

export interface MergeResult {
  success: boolean;
  summaryMessageId?: string;
  mergedMessageIds?: string[];
  targetPath: ClientPath;
  sourcePath: ClientPath;
}

export interface MergePreview {
  messagesToMerge: PathMessage[];
  generatedSummary?: string;
  targetPath: ClientPath;
  sourcePath: ClientPath;
  estimatedMessageCount: number;
}

export interface PathMessage {
  id: string;
  conversationId: string;
  pathId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  sequenceInPath: number;
  effectiveSequence?: number;
  isBranchPoint: boolean;
  branchedToPaths: string[];
  messageType: string;
  createdAt: string;
  // Pinning fields
  isPinned?: boolean;
  pinnedAt?: string;
  pinnedBy?: string;
}

/**
 * Path provider state
 */
export interface PathState {
  /** All paths for the current conversation */
  paths: ClientPath[];
  /** Currently active path */
  activePath: ClientPath | null;
  /** Messages for the active path */
  messages: PathMessage[];
  /** Loading states */
  isLoading: boolean;
  isLoadingMessages: boolean;
  isBranching: boolean;
  isMerging: boolean;
  /** Errors */
  error: Error | null;
}

/**
 * Path provider actions
 */
export interface PathActions {
  /** Reload paths from API */
  refreshPaths(): Promise<void>;
  /** Switch to a different path */
  switchPath(pathId: string): Promise<void>;
  /** Create a new branch from a message */
  createBranch(messageId: string, name?: string, description?: string): Promise<ClientPath>;
  /** Merge a path into the active path */
  mergePath(sourcePathId: string, options: MergeInput): Promise<MergeResult>;
  /** Preview a merge operation */
  previewMerge(sourcePathId: string, options: PreviewMergeInput): Promise<MergePreview>;
  /** Update path metadata */
  updatePath(pathId: string, updates: UpdatePathInput): Promise<void>;
  /** Delete or archive a path */
  deletePath(pathId: string, hardDelete?: boolean): Promise<void>;
}

/**
 * Full path context value
 */
export interface PathContextValue extends PathState, PathActions {
  /** The conversation ID being managed */
  conversationId: string;
}

/**
 * Component style variants
 */
export type PathSelectorVariant = 'default' | 'minimal' | 'compact';
export type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

/**
 * Common component props
 */
export interface BaseComponentProps {
  className?: string;
}
