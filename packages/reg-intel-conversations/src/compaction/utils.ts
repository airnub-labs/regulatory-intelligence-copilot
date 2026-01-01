/**
 * Compaction Utilities
 *
 * Common utility functions used across compaction strategies:
 * - Message deduplication
 * - Content hashing
 * - Message list merging
 * - Reduction calculation
 */

import type { ConversationMessage as Message } from '../conversationStores.js';
import { createHash } from 'crypto';

/**
 * Result of deduplication operation
 */
export interface DeduplicationResult {
  /** Unique messages after deduplication */
  unique: Message[];
  /** Duplicate messages that were removed */
  removed: Message[];
  /** Map of hash -> message for conflict resolution */
  hashMap: Map<string, Message>;
}

/**
 * Hash options for message hashing
 */
export interface HashOptions {
  /** Include role in hash (default: true) */
  includeRole?: boolean;
  /** Include timestamp in hash (default: false) */
  includeTimestamp?: boolean;
  /** Normalize whitespace before hashing (default: true) */
  normalizeWhitespace?: boolean;
  /** Convert to lowercase before hashing (default: false) */
  caseSensitive?: boolean;
}

/**
 * Merge options for combining message lists
 */
export interface MergeOptions {
  /** Remove duplicates during merge (default: true) */
  deduplicate?: boolean;
  /** Prefer messages from first list on conflict (default: true) */
  preferFirst?: boolean;
  /** Sort by timestamp after merge (default: true) */
  sortByTimestamp?: boolean;
}

/**
 * Generate a hash for a message's content
 *
 * @param message - Message to hash
 * @param options - Hashing options
 * @returns SHA-256 hash of the message content
 */
export function hashMessage(message: Message, options: HashOptions = {}): string {
  const {
    includeRole = true,
    includeTimestamp = false,
    normalizeWhitespace = true,
    caseSensitive = true,
  } = options;

  let content = message.content;

  // Normalize whitespace
  if (normalizeWhitespace) {
    content = content.replace(/\s+/g, ' ').trim();
  }

  // Case sensitivity
  if (!caseSensitive) {
    content = content.toLowerCase();
  }

  // Build hash input
  const parts: string[] = [content];

  if (includeRole) {
    parts.unshift(message.role);
  }

  if (includeTimestamp) {
    const ts = message.createdAt instanceof Date
      ? message.createdAt.toISOString()
      : String(message.createdAt);
    parts.push(ts);
  }

  const hashInput = parts.join('|');
  return createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Generate a short hash for display purposes
 *
 * @param message - Message to hash
 * @param length - Length of hash to return (default: 8)
 * @returns Short hash string
 */
export function shortHash(message: Message, length: number = 8): string {
  return hashMessage(message).substring(0, length);
}

/**
 * Deduplicate messages by content
 *
 * @param messages - Messages to deduplicate
 * @param options - Hash options for comparison
 * @returns Deduplication result with unique and removed messages
 */
export function deduplicateMessages(
  messages: Message[],
  options: HashOptions = {}
): DeduplicationResult {
  const hashMap = new Map<string, Message>();
  const unique: Message[] = [];
  const removed: Message[] = [];

  for (const message of messages) {
    const hash = hashMessage(message, options);

    if (hashMap.has(hash)) {
      // This is a duplicate
      removed.push(message);
    } else {
      // This is unique
      hashMap.set(hash, message);
      unique.push(message);
    }
  }

  return { unique, removed, hashMap };
}

/**
 * Find duplicate messages without removing them
 *
 * @param messages - Messages to check for duplicates
 * @param options - Hash options for comparison
 * @returns Array of duplicate message pairs
 */
export function findDuplicates(
  messages: Message[],
  options: HashOptions = {}
): Array<{ original: Message; duplicate: Message }> {
  const hashMap = new Map<string, Message>();
  const duplicates: Array<{ original: Message; duplicate: Message }> = [];

  for (const message of messages) {
    const hash = hashMessage(message, options);
    const existing = hashMap.get(hash);

    if (existing) {
      duplicates.push({ original: existing, duplicate: message });
    } else {
      hashMap.set(hash, message);
    }
  }

  return duplicates;
}

/**
 * Merge multiple message lists into one
 *
 * @param lists - Arrays of messages to merge
 * @param options - Merge options
 * @returns Merged message list
 */
export function mergeMessageLists(
  lists: Message[][],
  options: MergeOptions = {}
): Message[] {
  const {
    deduplicate = true,
    preferFirst = true,
    sortByTimestamp = true,
  } = options;

  // Flatten all lists
  let merged: Message[] = [];

  if (preferFirst) {
    // Process in order, first list has priority
    for (const list of lists) {
      merged = merged.concat(list);
    }
  } else {
    // Process in reverse order, last list has priority
    for (let i = lists.length - 1; i >= 0; i--) {
      merged = lists[i].concat(merged);
    }
  }

  // Deduplicate if requested
  if (deduplicate) {
    const result = deduplicateMessages(merged);
    merged = result.unique;
  }

  // Sort by timestamp if requested
  if (sortByTimestamp) {
    merged = sortMessagesByTimestamp(merged);
  }

  return merged;
}

/**
 * Sort messages by timestamp
 *
 * @param messages - Messages to sort
 * @param ascending - Sort in ascending order (default: true)
 * @returns Sorted messages
 */
export function sortMessagesByTimestamp(
  messages: Message[],
  ascending: boolean = true
): Message[] {
  return [...messages].sort((a, b) => {
    const timeA = a.createdAt instanceof Date
      ? a.createdAt.getTime()
      : new Date(a.createdAt).getTime();
    const timeB = b.createdAt instanceof Date
      ? b.createdAt.getTime()
      : new Date(b.createdAt).getTime();

    return ascending ? timeA - timeB : timeB - timeA;
  });
}

/**
 * Calculate the reduction percentage
 *
 * @param before - Value before reduction
 * @param after - Value after reduction
 * @returns Reduction percentage (0-100)
 */
export function calculateReduction(before: number, after: number): number {
  if (before === 0) return 0;
  const reduction = ((before - after) / before) * 100;
  return Math.round(reduction * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate the compression ratio
 *
 * @param before - Value before compression
 * @param after - Value after compression
 * @returns Compression ratio (0-1, where 0.5 means 50% of original size)
 */
export function calculateCompressionRatio(before: number, after: number): number {
  if (before === 0) return 1;
  return Math.round((after / before) * 1000) / 1000; // Round to 3 decimal places
}

/**
 * Group consecutive messages by role
 *
 * @param messages - Messages to group
 * @returns Array of message groups, where each group has same role
 */
export function groupConsecutiveByRole(messages: Message[]): Message[][] {
  if (messages.length === 0) return [];

  const groups: Message[][] = [];
  let currentGroup: Message[] = [messages[0]];
  let currentRole = messages[0].role;

  for (let i = 1; i < messages.length; i++) {
    const message = messages[i];

    if (message.role === currentRole) {
      currentGroup.push(message);
    } else {
      groups.push(currentGroup);
      currentGroup = [message];
      currentRole = message.role;
    }
  }

  // Don't forget the last group
  groups.push(currentGroup);

  return groups;
}

/**
 * Merge consecutive messages from the same role into one
 *
 * @param messages - Messages to merge
 * @param separator - Separator between merged content (default: '\n\n')
 * @returns Messages with consecutive same-role messages merged
 */
export function mergeConsecutiveSameRole(
  messages: Message[],
  separator: string = '\n\n'
): Message[] {
  const groups = groupConsecutiveByRole(messages);

  return groups.map(group => {
    if (group.length === 1) {
      return group[0];
    }

    // Merge all messages in the group
    const content = group.map(m => m.content).join(separator);
    const firstMessage = group[0];
    const lastMessage = group[group.length - 1];

    return {
      ...firstMessage,
      id: `merged-${firstMessage.id}-${lastMessage.id}`,
      content,
      // Use the timestamp of the first message
      createdAt: firstMessage.createdAt,
    };
  });
}

/**
 * Partition messages into categories
 *
 * @param messages - Messages to partition
 * @param pinnedMessageIds - Set of pinned message IDs
 * @returns Partitioned messages
 */
export function partitionMessages(
  messages: Message[],
  pinnedMessageIds: Set<string>
): {
  system: Message[];
  pinned: Message[];
  regular: Message[];
} {
  const system: Message[] = [];
  const pinned: Message[] = [];
  const regular: Message[] = [];

  for (const message of messages) {
    if (pinnedMessageIds.has(message.id)) {
      pinned.push(message);
    } else if (message.role === 'system') {
      system.push(message);
    } else {
      regular.push(message);
    }
  }

  return { system, pinned, regular };
}

/**
 * Calculate similarity between two messages using Jaccard index
 *
 * @param a - First message
 * @param b - Second message
 * @returns Similarity score (0-1)
 */
export function calculateSimilarity(a: Message, b: Message): number {
  const wordsA = new Set(a.content.toLowerCase().split(/\s+/));
  const wordsB = new Set(b.content.toLowerCase().split(/\s+/));

  const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
  const union = new Set([...wordsA, ...wordsB]);

  if (union.size === 0) return 1; // Both empty
  return intersection.size / union.size;
}

/**
 * Find similar messages above a threshold
 *
 * @param messages - Messages to check
 * @param threshold - Similarity threshold (0-1, default: 0.8)
 * @returns Array of similar message pairs with their similarity scores
 */
export function findSimilarMessages(
  messages: Message[],
  threshold: number = 0.8
): Array<{ a: Message; b: Message; similarity: number }> {
  const similar: Array<{ a: Message; b: Message; similarity: number }> = [];

  for (let i = 0; i < messages.length; i++) {
    for (let j = i + 1; j < messages.length; j++) {
      const similarity = calculateSimilarity(messages[i], messages[j]);
      if (similarity >= threshold) {
        similar.push({ a: messages[i], b: messages[j], similarity });
      }
    }
  }

  return similar;
}

/**
 * Estimate tokens in a message using character-based heuristic
 * (Use proper token counting in production)
 *
 * @param message - Message to estimate
 * @returns Estimated token count
 */
export function estimateTokensQuick(message: Message): number {
  // Rough estimate: 1 token ≈ 4 characters for English
  return Math.ceil(message.content.length / 4);
}

/**
 * Estimate total tokens in a list of messages
 *
 * @param messages - Messages to estimate
 * @returns Estimated total token count
 */
export function estimateTotalTokensQuick(messages: Message[]): number {
  return messages.reduce((sum, msg) => sum + estimateTokensQuick(msg), 0);
}
