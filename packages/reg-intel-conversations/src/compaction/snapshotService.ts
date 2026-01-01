/**
 * Compaction Snapshot Service
 *
 * Manages snapshots of conversation state before compaction operations,
 * enabling rollback to previous state if needed.
 *
 * Features:
 * - Automatic snapshot creation before compaction
 * - Snapshot expiration and cleanup
 * - Rollback to previous message state
 * - Snapshot metadata tracking
 */

import type { ConversationMessage } from '../conversationStores.js';
import type { CompactionResult } from './types.js';

/**
 * Snapshot of conversation state before compaction
 */
export interface CompactionSnapshot {
  /** Unique snapshot ID */
  id: string;

  /** Conversation ID */
  conversationId: string;

  /** Path ID (if applicable) */
  pathId?: string;

  /** Timestamp when snapshot was created */
  createdAt: Date;

  /** Messages before compaction */
  messages: ConversationMessage[];

  /** Pinned message IDs at time of snapshot */
  pinnedMessageIds: string[];

  /** Token count before compaction */
  tokensBefore: number;

  /** Compaction strategy that was used */
  strategy: string;

  /** Compaction result (for reference) */
  compactionResult?: CompactionResult;

  /** Expiration time (snapshots auto-delete after this) */
  expiresAt: Date;
}

/**
 * Snapshot storage provider interface
 */
export interface SnapshotStorageProvider {
  /** Save a snapshot */
  save(snapshot: CompactionSnapshot): Promise<void>;

  /** Get a snapshot by ID */
  get(snapshotId: string): Promise<CompactionSnapshot | null>;

  /** List snapshots for a conversation */
  list(conversationId: string, limit?: number): Promise<CompactionSnapshot[]>;

  /** Delete a snapshot */
  delete(snapshotId: string): Promise<void>;

  /** Delete expired snapshots */
  deleteExpired(): Promise<number>;
}

/**
 * In-memory snapshot storage (for development/testing)
 */
export class InMemorySnapshotStorage implements SnapshotStorageProvider {
  private snapshots: Map<string, CompactionSnapshot> = new Map();

  async save(snapshot: CompactionSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot);
  }

  async get(snapshotId: string): Promise<CompactionSnapshot | null> {
    return this.snapshots.get(snapshotId) ?? null;
  }

  async list(conversationId: string, limit: number = 10): Promise<CompactionSnapshot[]> {
    const conversationSnapshots = Array.from(this.snapshots.values())
      .filter(s => s.conversationId === conversationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    return conversationSnapshots;
  }

  async delete(snapshotId: string): Promise<void> {
    this.snapshots.delete(snapshotId);
  }

  async deleteExpired(): Promise<number> {
    const now = new Date();
    let deletedCount = 0;

    for (const [id, snapshot] of this.snapshots.entries()) {
      if (snapshot.expiresAt < now) {
        this.snapshots.delete(id);
        deletedCount++;
      }
    }

    return deletedCount;
  }
}

/**
 * Compaction Snapshot Service
 */
export class CompactionSnapshotService {
  private storage: SnapshotStorageProvider;
  private defaultTTL: number; // Time-to-live in milliseconds

  constructor(
    storage?: SnapshotStorageProvider,
    options?: {
      /** Snapshot TTL in hours (default: 24 hours) */
      snapshotTTLHours?: number;
    }
  ) {
    this.storage = storage ?? new InMemorySnapshotStorage();
    this.defaultTTL = (options?.snapshotTTLHours ?? 24) * 60 * 60 * 1000;
  }

  /**
   * Create a snapshot before compaction
   */
  async createSnapshot(
    conversationId: string,
    messages: ConversationMessage[],
    pinnedMessageIds: Set<string>,
    tokensBefore: number,
    strategy: string,
    pathId?: string
  ): Promise<CompactionSnapshot> {
    const now = new Date();
    const snapshot: CompactionSnapshot = {
      id: `snapshot-${conversationId}-${now.getTime()}`,
      conversationId,
      pathId,
      createdAt: now,
      messages: JSON.parse(JSON.stringify(messages)), // Deep copy
      pinnedMessageIds: Array.from(pinnedMessageIds),
      tokensBefore,
      strategy,
      expiresAt: new Date(now.getTime() + this.defaultTTL),
    };

    await this.storage.save(snapshot);
    return snapshot;
  }

  /**
   * Update snapshot with compaction result
   */
  async updateWithResult(snapshotId: string, result: CompactionResult): Promise<void> {
    const snapshot = await this.storage.get(snapshotId);
    if (snapshot) {
      snapshot.compactionResult = result;
      await this.storage.save(snapshot);
    }
  }

  /**
   * Get a snapshot by ID
   */
  async getSnapshot(snapshotId: string): Promise<CompactionSnapshot | null> {
    return this.storage.get(snapshotId);
  }

  /**
   * List snapshots for a conversation
   */
  async listSnapshots(conversationId: string, limit: number = 10): Promise<CompactionSnapshot[]> {
    return this.storage.list(conversationId, limit);
  }

  /**
   * Get messages from a snapshot (for rollback)
   */
  async getSnapshotMessages(snapshotId: string): Promise<ConversationMessage[] | null> {
    const snapshot = await this.storage.get(snapshotId);
    return snapshot ? snapshot.messages : null;
  }

  /**
   * Delete a snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    await this.storage.delete(snapshotId);
  }

  /**
   * Clean up expired snapshots
   */
  async cleanupExpiredSnapshots(): Promise<number> {
    return this.storage.deleteExpired();
  }

  /**
   * Check if a snapshot is still valid (not expired)
   */
  async isSnapshotValid(snapshotId: string): Promise<boolean> {
    const snapshot = await this.storage.get(snapshotId);
    if (!snapshot) return false;

    const now = new Date();
    return snapshot.expiresAt > now;
  }
}

/**
 * Global snapshot service instance
 */
let globalSnapshotService: CompactionSnapshotService | null = null;

/**
 * Initialize the global compaction snapshot service
 */
export const initSnapshotService = (
  storage?: SnapshotStorageProvider,
  options?: { snapshotTTLHours?: number }
): CompactionSnapshotService => {
  globalSnapshotService = new CompactionSnapshotService(storage, options);
  return globalSnapshotService;
};

/**
 * Get the global snapshot service
 * @throws Error if not initialized
 */
export const getSnapshotService = (): CompactionSnapshotService => {
  if (!globalSnapshotService) {
    throw new Error('Snapshot service not initialized. Call initSnapshotService() first.');
  }
  return globalSnapshotService;
};

/**
 * Get the global snapshot service if initialized, otherwise null
 */
export const getSnapshotServiceIfInitialized = (): CompactionSnapshotService | null => {
  return globalSnapshotService;
};
