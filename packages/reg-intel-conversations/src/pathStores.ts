/**
 * Conversation Path Stores
 *
 * This module provides storage implementations for conversation paths,
 * supporting branching, merging, and path resolution operations.
 */

import { randomUUID } from 'crypto';
import { createLogger, withSpan } from '@reg-copilot/reg-intel-observability';
import {
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_NAME,
  SEMATTRS_DB_OPERATION,
  SEMATTRS_DB_SQL_TABLE,
} from '@opentelemetry/semantic-conventions';

const logger = createLogger('ConversationPathStore');

import type { SupabaseLikeClient } from './conversationStores.js';
import type {
  ConversationPath,
  PathAwareMessage,
  BranchPoint,
  BranchInput,
  BranchResult,
  MergeInput,
  MergeResult,
  MergePreview,
  PathResolution,
  CreatePathInput,
  UpdatePathInput,
  ListPathsInput,
  GetPathInput,
  ResolvePathMessagesInput,
  SetActivePathInput,
  GetActivePathInput,
  DeletePathInput,
  PinMessageInput,
  UnpinMessageInput,
  GetPinnedMessagesInput,
  MessageType,
} from './types/paths.js';

// =============================================================================
// Store Interface
// =============================================================================

/**
 * Interface for conversation path storage operations
 */
export interface ConversationPathStore {
  // Path CRUD
  createPath(input: CreatePathInput): Promise<{ pathId: string }>;
  getPath(input: GetPathInput): Promise<ConversationPath | null>;
  listPaths(input: ListPathsInput): Promise<ConversationPath[]>;
  updatePath(input: UpdatePathInput): Promise<void>;
  deletePath(input: DeletePathInput): Promise<void>;

  // Path Resolution
  resolvePathMessages(input: ResolvePathMessagesInput): Promise<PathAwareMessage[]>;
  getFullPathResolution(input: ResolvePathMessagesInput): Promise<PathResolution>;

  // Active Path Management
  getActivePath(input: GetActivePathInput): Promise<ConversationPath | null>;
  setActivePath(input: SetActivePathInput): Promise<void>;

  // Branching
  branchFromMessage(input: BranchInput): Promise<BranchResult>;
  getBranchPointsForPath(input: GetPathInput): Promise<BranchPoint[]>;

  // Merging
  mergePath(input: MergeInput): Promise<MergeResult>;
  previewMerge(input: Omit<MergeInput, 'userId' | 'archiveSource'>): Promise<MergePreview>;

  // Message Pinning
  pinMessage(input: PinMessageInput): Promise<void>;
  unpinMessage(input: UnpinMessageInput): Promise<void>;
  getPinnedMessages(input: GetPinnedMessagesInput): Promise<PathAwareMessage[]>;
  getPinnedMessageCount(input: GetPinnedMessagesInput): Promise<number>;

  // Utilities
  getPrimaryPath(input: { tenantId: string; conversationId: string }): Promise<ConversationPath | null>;
  ensurePrimaryPath(input: { tenantId: string; conversationId: string }): Promise<ConversationPath>;
}

// =============================================================================
// In-Memory Implementation
// =============================================================================


// =============================================================================
// Supabase Implementation
// =============================================================================

type SupabasePathRow = {
  id: string;
  conversation_id: string;
  tenant_id: string;
  parent_path_id: string | null;
  branch_point_message_id: string | null;
  name: string | null;
  description: string | null;
  is_primary: boolean;
  is_active: boolean;
  merged_to_path_id: string | null;
  merged_at: string | null;
  merge_summary_message_id: string | null;
  merge_mode: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
  branch_count?: number;
};

type SupabaseMessageRow = {
  id: string;
  conversation_id: string;
  path_id: string;
  tenant_id: string;
  user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  sequence_in_path: number;
  is_branch_point: boolean;
  branched_to_paths: string[];
  message_type: string;
  is_pinned: boolean;
  pinned_at: string | null;
  pinned_by: string | null;
  created_at: string;
  effective_sequence?: number;
};

function mapPathRow(row: SupabasePathRow): ConversationPath {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    tenantId: row.tenant_id,
    parentPathId: row.parent_path_id,
    branchPointMessageId: row.branch_point_message_id,
    name: row.name,
    description: row.description,
    isPrimary: row.is_primary,
    isActive: row.is_active,
    mergedToPathId: row.merged_to_path_id,
    mergedAt: row.merged_at ? new Date(row.merged_at) : null,
    mergeSummaryMessageId: row.merge_summary_message_id,
    mergeMode: row.merge_mode as ConversationPath['mergeMode'],
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    messageCount: row.message_count,
    branchCount: row.branch_count,
  };
}

function mapMessageRow(row: SupabaseMessageRow): PathAwareMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    pathId: row.path_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    role: row.role,
    content: row.content,
    metadata: row.metadata ?? undefined,
    sequenceInPath: row.sequence_in_path,
    isBranchPoint: row.is_branch_point,
    branchedToPaths: row.branched_to_paths ?? [],
    messageType: row.message_type as MessageType,
    isPinned: row.is_pinned,
    pinnedAt: row.pinned_at ? new Date(row.pinned_at) : null,
    pinnedBy: row.pinned_by,
    createdAt: new Date(row.created_at),
    effectiveSequence: row.effective_sequence,
  };
}

/**
 * Supabase implementation of ConversationPathStore
 */
export class SupabaseConversationPathStore implements ConversationPathStore {
  private readonly internalClient: SupabaseLikeClient;

  constructor(
    private client: SupabaseLikeClient,
    internalClient?: SupabaseLikeClient
  ) {
    this.internalClient = internalClient ?? client;
  }

  private wrapOperation<T>(
    input: { operation: string; table: string; tenantId: string; pathId?: string },
    fn: () => Promise<T>
  ): Promise<T> {
    return withSpan(
      'db.supabase.path_operation',
      {
        [SEMATTRS_DB_SYSTEM]: 'postgresql',
        [SEMATTRS_DB_NAME]: 'supabase',
        [SEMATTRS_DB_OPERATION]: input.operation,
        [SEMATTRS_DB_SQL_TABLE]: input.table,
        'app.tenant.id': input.tenantId,
        ...(input.pathId ? { 'app.path.id': input.pathId } : {}),
      },
      async () => {
        logger.debug({
          operation: input.operation,
          table: input.table,
          tenantId: input.tenantId,
          pathId: input.pathId,
        }, `DB ${input.operation.toUpperCase()} on ${input.table}`);
        return fn();
      }
    );
  }

  async createPath(input: CreatePathInput): Promise<{ pathId: string }> {
    return this.wrapOperation(
      { operation: 'insert', table: 'conversation_paths', tenantId: input.tenantId },
      async () => {
        // Check if creating a primary path - prevent race condition
        if (input.isPrimary) {
          const existingPrimary = await this.getPrimaryPath({
            tenantId: input.tenantId,
            conversationId: input.conversationId,
          });
          if (existingPrimary) {
            throw new Error(
              `Primary path already exists for conversation: ${input.conversationId} (pathId: ${existingPrimary.id})`
            );
          }
        }

        const now = new Date().toISOString();

        const { data, error } = await this.internalClient
          .from('conversation_paths')
          .insert({
            conversation_id: input.conversationId,
            tenant_id: input.tenantId,
            parent_path_id: input.parentPathId ?? null,
            branch_point_message_id: input.branchPointMessageId ?? null,
            name: input.name ?? null,
            description: input.description ?? null,
            is_primary: input.isPrimary ?? false,
            is_active: true,
            created_at: now,
            updated_at: now,
          })
          .select('id')
          .single();

        if (error) {
          throw new Error(`Failed to create path: ${error.message}`);
        }

        return { pathId: (data as { id: string }).id };
      }
    );
  }

  async getPath(input: GetPathInput): Promise<ConversationPath | null> {
    const { data, error } = await this.client
      .from('conversation_paths_view')
      .select('*')
      .eq('id', input.pathId)
      .eq('tenant_id', input.tenantId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get path: ${error.message}`);
    }

    if (!data) return null;
    return mapPathRow(data as SupabasePathRow);
  }

  async listPaths(input: ListPathsInput): Promise<ConversationPath[]> {
    let query = this.client
      .from('conversation_paths_view')
      .select('*')
      .eq('conversation_id', input.conversationId)
      .eq('tenant_id', input.tenantId);

    if (!input.includeInactive) {
      query = query.eq('is_active', true);
    }

    if (input.parentPathId !== undefined) {
      if (input.parentPathId === null) {
        query = query.is('parent_path_id', null);
      } else {
        query = query.eq('parent_path_id', input.parentPathId);
      }
    }

    query = query
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list paths: ${error.message}`);
    }

    return (data as SupabasePathRow[]).map(mapPathRow);
  }

  async updatePath(input: UpdatePathInput): Promise<void> {
    return this.wrapOperation(
      { operation: 'update', table: 'conversation_paths', tenantId: input.tenantId, pathId: input.pathId },
      async () => {
        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined) updates.description = input.description;
        if (input.isActive !== undefined) updates.is_active = input.isActive;

        const { error } = await this.internalClient
          .from('conversation_paths')
          .update(updates)
          .eq('id', input.pathId)
          .eq('tenant_id', input.tenantId);

        if (error) {
          throw new Error(`Failed to update path: ${error.message}`);
        }
      }
    );
  }

  async deletePath(input: DeletePathInput): Promise<void> {
    return this.wrapOperation(
      { operation: input.hardDelete ? 'delete' : 'update', table: 'conversation_paths', tenantId: input.tenantId, pathId: input.pathId },
      async () => {
        // Check if primary
        const path = await this.getPath({ tenantId: input.tenantId, pathId: input.pathId });
        if (!path) {
          throw new Error('Path not found');
        }
        if (path.isPrimary) {
          throw new Error('Cannot delete primary path');
        }

        if (input.hardDelete) {
          const { error } = await this.internalClient
            .from('conversation_paths')
            .delete()
            .eq('id', input.pathId)
            .eq('tenant_id', input.tenantId);

          if (error) {
            throw new Error(`Failed to delete path: ${error.message}`);
          }
        } else {
          const { error } = await this.internalClient
            .from('conversation_paths')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', input.pathId)
            .eq('tenant_id', input.tenantId);

          if (error) {
            throw new Error(`Failed to archive path: ${error.message}`);
          }
        }
      }
    );
  }

  async resolvePathMessages(input: ResolvePathMessagesInput): Promise<PathAwareMessage[]> {
    // Use the database function for efficient resolution if available
    if (!this.client.rpc) {
      return this.resolvePathMessagesManual(input);
    }

    const { data, error } = await this.client.rpc('resolve_path_messages', { p_path_id: input.pathId });

    if (error) {
      // Fallback to manual resolution if function doesn't exist
      return this.resolvePathMessagesManual(input);
    }

    let messages = (data as SupabaseMessageRow[]).map(mapMessageRow);

    // Apply options
    if (input.options?.includeDeleted === false) {
      messages = messages.filter(m => !(m.metadata as { deletedAt?: string } | undefined)?.deletedAt);
    }

    if (input.options?.offset !== undefined || input.options?.limit !== undefined) {
      const offset = input.options.offset ?? 0;
      const limit = input.options.limit ?? messages.length;
      messages = messages.slice(offset, offset + limit);
    }

    return messages;
  }

  private async resolvePathMessagesManual(input: ResolvePathMessagesInput): Promise<PathAwareMessage[]> {
    const path = await this.getPath({ tenantId: input.tenantId, pathId: input.pathId });
    if (!path) return [];

    const messages: PathAwareMessage[] = [];

    // If this path has a parent, get inherited messages first
    if (path.parentPathId && path.branchPointMessageId) {
      const parentMessages = await this.resolvePathMessagesManual({
        tenantId: input.tenantId,
        pathId: path.parentPathId,
        options: input.options,
      });

      // Find the branch point index
      const branchPointIdx = parentMessages.findIndex(
        m => m.id === path.branchPointMessageId
      );

      if (branchPointIdx >= 0) {
        messages.push(...parentMessages.slice(0, branchPointIdx + 1));
      }
    }

    // Get this path's own messages
    const { data, error } = await this.client
      .from('conversation_messages_view')
      .select('*')
      .eq('path_id', input.pathId)
      .eq('tenant_id', input.tenantId)
      .order('sequence_in_path', { ascending: true });

    if (error) {
      throw new Error(`Failed to get messages: ${error.message}`);
    }

    const ownMessages = (data as SupabaseMessageRow[]).map(mapMessageRow);
    const baseSequence = messages.length;

    for (const msg of ownMessages) {
      messages.push({
        ...msg,
        effectiveSequence: baseSequence + msg.sequenceInPath,
      });
    }

    return messages;
  }

  async getFullPathResolution(input: ResolvePathMessagesInput): Promise<PathResolution> {
    const path = await this.getPath({ tenantId: input.tenantId, pathId: input.pathId });
    if (!path) {
      throw new Error('Path not found');
    }

    const [messages, branchPoints, mergeablePaths] = await Promise.all([
      this.resolvePathMessages(input),
      this.getBranchPointsForPath({ tenantId: input.tenantId, pathId: input.pathId }),
      this.getMergeablePaths(input.tenantId, path),
    ]);

    const ancestorPaths = await this.getAncestorPaths(input.tenantId, input.pathId);

    return {
      messages,
      path,
      ancestorPaths,
      branchPoints,
      mergeablePaths,
    };
  }

  async getActivePath(input: GetActivePathInput): Promise<ConversationPath | null> {
    const { data, error } = await this.client
      .from('conversations_view')
      .select('active_path_id')
      .eq('id', input.conversationId)
      .eq('tenant_id', input.tenantId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get active path: ${error.message}`);
    }

    if (!data?.active_path_id) {
      return this.getPrimaryPath(input);
    }

    return this.getPath({ tenantId: input.tenantId, pathId: data.active_path_id as string });
  }

  async setActivePath(input: SetActivePathInput): Promise<void> {
    return this.wrapOperation(
      { operation: 'update', table: 'conversations', tenantId: input.tenantId },
      async () => {
        // Verify path exists and belongs to conversation
        const path = await this.getPath({ tenantId: input.tenantId, pathId: input.pathId });
        if (!path || path.conversationId !== input.conversationId) {
          throw new Error('Path not found or does not belong to this conversation');
        }

        const { error } = await this.internalClient
          .from('conversations')
          .update({
            active_path_id: input.pathId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.conversationId)
          .eq('tenant_id', input.tenantId);

        if (error) {
          throw new Error(`Failed to set active path: ${error.message}`);
        }
      }
    );
  }

  async branchFromMessage(input: BranchInput): Promise<BranchResult> {
    return this.wrapOperation(
      { operation: 'branch', table: 'conversation_paths', tenantId: input.tenantId },
      async () => {
        // Get the source message
        const { data: msgData, error: msgError } = await this.client
          .from('conversation_messages_view')
          .select('*')
          .eq('id', input.sourceMessageId)
          .eq('tenant_id', input.tenantId)
          .single();

        if (msgError || !msgData) {
          throw new Error('Source message not found');
        }

        const sourceMessage = mapMessageRow(msgData as SupabaseMessageRow);

        // Create the branch path
        const { pathId } = await this.createPath({
          tenantId: input.tenantId,
          conversationId: input.conversationId,
          parentPathId: sourceMessage.pathId,
          branchPointMessageId: input.sourceMessageId,
          name: input.name,
          description: input.description,
          isPrimary: false,
        });

        // The trigger will mark the message as a branch point
        // But we need to fetch the updated message
        const { data: updatedMsgData } = await this.client
          .from('conversation_messages_view')
          .select('*')
          .eq('id', input.sourceMessageId)
          .single();

        const newPath = await this.getPath({ tenantId: input.tenantId, pathId });

        return {
          path: newPath!,
          conversationId: input.conversationId,
          branchPointMessage: mapMessageRow(updatedMsgData as SupabaseMessageRow),
        };
      }
    );
  }

  async getBranchPointsForPath(input: GetPathInput): Promise<BranchPoint[]> {
    const messages = await this.resolvePathMessages({
      tenantId: input.tenantId,
      pathId: input.pathId,
    });

    const branchPoints: BranchPoint[] = [];

    for (const msg of messages) {
      // Get branches from this message
      const branchedPaths: ConversationPath[] = [];
      for (const pid of msg.branchedToPaths ?? []) {
        const path = await this.getPath({ tenantId: input.tenantId, pathId: pid });
        if (path) branchedPaths.push(path);
      }

      branchPoints.push({
        messageId: msg.id,
        messageContent: msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : ''),
        messageRole: msg.role,
        sequenceInPath: msg.effectiveSequence ?? msg.sequenceInPath,
        branchedPaths,
        canBranch: true,
      });
    }

    return branchPoints;
  }

  async mergePath(input: MergeInput): Promise<MergeResult> {
    return this.wrapOperation(
      { operation: 'merge', table: 'conversation_paths', tenantId: input.tenantId, pathId: input.sourcePathId },
      async () => {
        const sourcePath = await this.getPath({ tenantId: input.tenantId, pathId: input.sourcePathId });
        const targetPath = await this.getPath({ tenantId: input.tenantId, pathId: input.targetPathId });

        if (!sourcePath || !targetPath) {
          throw new Error('Source or target path not found');
        }

        if (sourcePath.conversationId !== targetPath.conversationId) {
          throw new Error('Cannot merge paths from different conversations');
        }

        // Get source path's own messages
        const { data: ownMsgsData, error: ownMsgsError } = await this.client
          .from('conversation_messages_view')
          .select('*')
          .eq('path_id', input.sourcePathId)
          .eq('tenant_id', input.tenantId)
          .order('sequence_in_path', { ascending: true });

        if (ownMsgsError) {
          throw new Error(`Failed to get source messages: ${ownMsgsError.message}`);
        }

        const sourceOwnMessages = (ownMsgsData as SupabaseMessageRow[]).map(mapMessageRow);

        let summaryMessageId: string | undefined;
        let mergedMessageIds: string[] | undefined;

        if (input.mergeMode === 'summary') {
          const summaryContent = input.summaryContent ??
            `**Merged from: ${sourcePath.name ?? 'Branch'}**\n\n` +
            sourceOwnMessages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');

          // Insert summary message
          const { data: summaryData, error: summaryError } = await this.internalClient
            .from('conversation_messages')
            .insert({
              conversation_id: targetPath.conversationId,
              path_id: input.targetPathId,
              tenant_id: input.tenantId,
              user_id: input.userId ?? null,
              role: 'system',
              content: summaryContent,
              message_type: 'merge_summary',
              metadata: {
                mergeSource: {
                  pathId: input.sourcePathId,
                  pathName: sourcePath.name,
                  messageCount: sourceOwnMessages.length,
                  mergedAt: new Date().toISOString(),
                },
              },
            })
            .select('id')
            .single();

          if (summaryError) {
            throw new Error(`Failed to create summary message: ${summaryError.message}`);
          }

          summaryMessageId = (summaryData as { id: string }).id;
        } else if (input.mergeMode === 'full' || input.mergeMode === 'selective') {
          const messagesToMerge = input.mergeMode === 'selective' && input.selectedMessageIds
            ? sourceOwnMessages.filter(m => input.selectedMessageIds!.includes(m.id))
            : sourceOwnMessages;

          mergedMessageIds = [];

          for (const msg of messagesToMerge) {
            const { data: newMsgData, error: newMsgError } = await this.internalClient
              .from('conversation_messages')
              .insert({
                conversation_id: targetPath.conversationId,
                path_id: input.targetPathId,
                tenant_id: input.tenantId,
                user_id: msg.userId,
                role: msg.role,
                content: msg.content,
                message_type: msg.messageType,
                metadata: {
                  ...msg.metadata,
                  mergedFrom: {
                    pathId: input.sourcePathId,
                    originalMessageId: msg.id,
                  },
                },
              })
              .select('id')
              .single();

            if (newMsgError) {
              throw new Error(`Failed to merge message: ${newMsgError.message}`);
            }

            mergedMessageIds.push((newMsgData as { id: string }).id);
          }
        }

        // Update source path
        const { error: updateError } = await this.internalClient
          .from('conversation_paths')
          .update({
            merged_to_path_id: input.targetPathId,
            merged_at: new Date().toISOString(),
            merge_summary_message_id: summaryMessageId ?? null,
            merge_mode: input.mergeMode,
            is_active: input.archiveSource !== false ? false : true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.sourcePathId)
          .eq('tenant_id', input.tenantId);

        if (updateError) {
          throw new Error(`Failed to update source path: ${updateError.message}`);
        }

        const [updatedTarget, updatedSource] = await Promise.all([
          this.getPath({ tenantId: input.tenantId, pathId: input.targetPathId }),
          this.getPath({ tenantId: input.tenantId, pathId: input.sourcePathId }),
        ]);

        return {
          success: true,
          summaryMessageId,
          mergedMessageIds,
          targetPath: updatedTarget!,
          sourcePath: updatedSource!,
        };
      }
    );
  }

  async previewMerge(input: Omit<MergeInput, 'userId' | 'archiveSource'>): Promise<MergePreview> {
    const sourcePath = await this.getPath({ tenantId: input.tenantId, pathId: input.sourcePathId });
    const targetPath = await this.getPath({ tenantId: input.tenantId, pathId: input.targetPathId });

    if (!sourcePath || !targetPath) {
      throw new Error('Source or target path not found');
    }

    const { data: ownMsgsData, error } = await this.client
      .from('conversation_messages_view')
      .select('*')
      .eq('path_id', input.sourcePathId)
      .eq('tenant_id', input.tenantId)
      .order('sequence_in_path', { ascending: true });

    if (error) {
      throw new Error(`Failed to get source messages: ${error.message}`);
    }

    const sourceOwnMessages = (ownMsgsData as SupabaseMessageRow[]).map(mapMessageRow);

    let messagesToMerge: PathAwareMessage[];
    if (input.mergeMode === 'selective' && input.selectedMessageIds) {
      messagesToMerge = sourceOwnMessages.filter(m => input.selectedMessageIds!.includes(m.id));
    } else {
      messagesToMerge = sourceOwnMessages;
    }

    let generatedSummary: string | undefined;
    if (input.mergeMode === 'summary') {
      generatedSummary = `Summary of ${messagesToMerge.length} messages from "${sourcePath.name ?? 'Branch'}":\n\n` +
        messagesToMerge.slice(0, 3).map(m => `- ${m.content.slice(0, 100)}...`).join('\n');
    }

    return {
      messagesToMerge,
      generatedSummary,
      targetPath,
      sourcePath,
      estimatedMessageCount: messagesToMerge.length,
    };
  }

  async getPrimaryPath(input: { tenantId: string; conversationId: string }): Promise<ConversationPath | null> {
    const { data, error } = await this.client
      .from('conversation_paths_view')
      .select('*')
      .eq('conversation_id', input.conversationId)
      .eq('tenant_id', input.tenantId)
      .eq('is_primary', true)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get primary path: ${error.message}`);
    }

    if (!data) return null;
    return mapPathRow(data as SupabasePathRow);
  }

  async ensurePrimaryPath(input: { tenantId: string; conversationId: string }): Promise<ConversationPath> {
    const existing = await this.getPrimaryPath(input);
    if (existing) return existing;

    const { pathId } = await this.createPath({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      name: 'Main',
      isPrimary: true,
    });

    // Update the conversation's active_path_id to point to this new primary path
    const { error: updateError } = await this.internalClient
      .from('conversations')
      .update({
        active_path_id: pathId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.conversationId)
      .eq('tenant_id', input.tenantId);

    if (updateError) {
      logger.error(
        { ...input, pathId, error: updateError, errorMessage: updateError.message, errorDetails: updateError.details },
        'Failed to set active_path_id on conversation'
      );
      throw new Error(`Failed to set active_path_id: ${updateError.message}`);
    }

    return (await this.getPath({ tenantId: input.tenantId, pathId }))!;
  }

  private async getAncestorPaths(tenantId: string, pathId: string): Promise<ConversationPath[]> {
    // Fallback function for manual traversal
    const manualTraversal = async (): Promise<ConversationPath[]> => {
      const ancestors: ConversationPath[] = [];
      let currentPath = await this.getPath({ tenantId, pathId });

      while (currentPath?.parentPathId) {
        const parent = await this.getPath({ tenantId, pathId: currentPath.parentPathId });
        if (parent) {
          ancestors.unshift(parent);
          currentPath = parent;
        } else {
          break;
        }
      }

      return ancestors;
    };

    // Use recursive query if available
    if (!this.client.rpc) {
      return manualTraversal();
    }

    const { data, error } = await this.client.rpc('get_path_ancestors', { p_path_id: pathId });

    if (error) {
      return manualTraversal();
    }

    const pathIds = (data as { path_id: string }[]).map(r => r.path_id);
    const paths: ConversationPath[] = [];

    for (const pid of pathIds) {
      if (pid !== pathId) {
        const path = await this.getPath({ tenantId, pathId: pid });
        if (path) paths.push(path);
      }
    }

    return paths;
  }

  private async getMergeablePaths(tenantId: string, targetPath: ConversationPath): Promise<ConversationPath[]> {
    const allPaths = await this.listPaths({
      tenantId,
      conversationId: targetPath.conversationId,
      includeInactive: false,
    });

    return allPaths.filter(p =>
      p.id !== targetPath.id &&
      !p.mergedToPathId &&
      !p.isPrimary
    );
  }

  // Message Pinning
  async pinMessage(input: PinMessageInput): Promise<void> {
    if (!this.internalClient.rpc) {
      throw new Error('Supabase client does not support RPC operations');
    }

    const { error } = await this.internalClient.rpc('pin_message', {
      p_tenant_id: input.tenantId,
      p_conversation_id: input.conversationId,
      p_message_id: input.messageId,
      p_user_id: input.userId,
    });

    if (error) {
      throw new Error(`Failed to pin message: ${error.message}`);
    }
  }

  async unpinMessage(input: UnpinMessageInput): Promise<void> {
    if (!this.internalClient.rpc) {
      throw new Error('Supabase client does not support RPC operations');
    }

    const { error } = await this.internalClient.rpc('unpin_message', {
      p_tenant_id: input.tenantId,
      p_conversation_id: input.conversationId,
      p_message_id: input.messageId,
    });

    if (error) {
      throw new Error(`Failed to unpin message: ${error.message}`);
    }
  }

  async getPinnedMessages(input: GetPinnedMessagesInput): Promise<PathAwareMessage[]> {
    if (!this.internalClient.rpc) {
      throw new Error('Supabase client does not support RPC operations');
    }

    const { data, error } = await this.internalClient.rpc('get_pinned_messages', {
      p_tenant_id: input.tenantId,
      p_conversation_id: input.conversationId,
      p_path_id: input.pathId ?? null,
    });

    if (error) {
      throw new Error(`Failed to get pinned messages: ${error.message}`);
    }

    // Map the returned data to PathAwareMessage format
    return (data ?? []).map((row: any) => ({
      id: row.message_id,
      conversationId: input.conversationId,
      pathId: input.pathId ?? '',
      tenantId: input.tenantId,
      userId: row.pinned_by,
      role: row.role,
      content: row.content,
      sequenceInPath: 0,
      isBranchPoint: false,
      branchedToPaths: [],
      messageType: 'standard',
      isPinned: true,
      pinnedAt: new Date(row.pinned_at),
      pinnedBy: row.pinned_by,
      createdAt: new Date(row.created_at),
    }));
  }

  async getPinnedMessageCount(input: GetPinnedMessagesInput): Promise<number> {
    if (!this.internalClient.rpc) {
      throw new Error('Supabase client does not support RPC operations');
    }

    const { data, error } = await this.internalClient.rpc('get_pinned_message_count', {
      p_tenant_id: input.tenantId,
      p_conversation_id: input.conversationId,
      p_path_id: input.pathId ?? null,
    });

    if (error) {
      throw new Error(`Failed to get pinned message count: ${error.message}`);
    }

    return data ?? 0;
  }
}
