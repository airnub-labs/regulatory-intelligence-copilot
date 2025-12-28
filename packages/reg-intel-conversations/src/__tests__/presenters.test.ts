/**
 * Unit tests for Presenters
 */

import { describe, it, expect } from 'vitest';
import {
  presentConversation,
  presentConversationMetadata,
  type ClientConversation,
  type ConversationMetadataPayload,
} from '../presenters.js';
import type { ConversationRecord } from '../conversationStores.js';

describe('Presenters', () => {
  const createConversationRecord = (overrides?: Partial<ConversationRecord>): ConversationRecord => ({
    id: 'conv-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    title: 'Test Conversation',
    shareAudience: 'private',
    tenantAccess: 'read',
    jurisdictions: ['us', 'eu'],
    lastMessageAt: new Date('2025-01-01T00:00:00Z'),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    archivedAt: null,
    authorizationModel: 'supabase_rbac',
    authorizationSpec: null,
    ...overrides,
  });

  describe('presentConversation', () => {
    it('should present conversation with only client fields', () => {
      const record = createConversationRecord();
      const result: ClientConversation = presentConversation(record);

      // Should have client fields
      expect(result.id).toBe('conv-1');
      expect(result.title).toBe('Test Conversation');
      expect(result.shareAudience).toBe('private');
      expect(result.tenantAccess).toBe('read');
      expect(result.jurisdictions).toEqual(['us', 'eu']);
      expect(result.lastMessageAt).toEqual(new Date('2025-01-01T00:00:00Z'));
      expect(result.createdAt).toEqual(new Date('2025-01-01T00:00:00Z'));
      expect(result.archivedAt).toBeNull();

      // Should NOT have internal fields
      expect('tenantId' in result).toBe(false);
      expect('userId' in result).toBe(false);
      expect('updatedAt' in result).toBe(false);
    });

    it('should handle archived conversation', () => {
      const archivedAt = new Date('2025-01-02T00:00:00Z');
      const record = createConversationRecord({ archivedAt });
      const result = presentConversation(record);

      expect(result.archivedAt).toEqual(archivedAt);
    });

    it('should handle null lastMessageAt', () => {
      const record = createConversationRecord({ lastMessageAt: null });
      const result = presentConversation(record);

      expect(result.lastMessageAt).toBeNull();
    });

    it('should handle empty jurisdictions', () => {
      const record = createConversationRecord({ jurisdictions: [] });
      const result = presentConversation(record);

      expect(result.jurisdictions).toEqual([]);
    });

    it('should handle undefined jurisdictions', () => {
      const record = createConversationRecord({ jurisdictions: undefined });
      const result = presentConversation(record);

      expect(result.jurisdictions).toBeUndefined();
    });

    it('should handle different share audiences', () => {
      const publicRecord = createConversationRecord({ shareAudience: 'public' });
      const tenantRecord = createConversationRecord({ shareAudience: 'tenant' });
      const privateRecord = createConversationRecord({ shareAudience: 'private' });

      expect(presentConversation(publicRecord).shareAudience).toBe('public');
      expect(presentConversation(tenantRecord).shareAudience).toBe('tenant');
      expect(presentConversation(privateRecord).shareAudience).toBe('private');
    });

    it('should handle different tenant access levels', () => {
      const readRecord = createConversationRecord({ tenantAccess: 'read' });
      const writeRecord = createConversationRecord({ tenantAccess: 'write' });

      expect(presentConversation(readRecord).tenantAccess).toBe('read');
      expect(presentConversation(writeRecord).tenantAccess).toBe('write');
    });

    it('should not mutate original record', () => {
      const record = createConversationRecord();
      const recordCopy = { ...record };

      presentConversation(record);

      expect(record).toEqual(recordCopy);
    });
  });

  describe('presentConversationMetadata', () => {
    it('should include isShared for private conversation', () => {
      const record = createConversationRecord({ shareAudience: 'private' });
      const result: ConversationMetadataPayload = presentConversationMetadata(record);

      expect(result.isShared).toBe(false);
    });

    it('should include isShared for public conversation', () => {
      const record = createConversationRecord({ shareAudience: 'public' });
      const result = presentConversationMetadata(record);

      expect(result.isShared).toBe(true);
    });

    it('should include isShared for tenant conversation', () => {
      const record = createConversationRecord({ shareAudience: 'tenant' });
      const result = presentConversationMetadata(record);

      expect(result.isShared).toBe(true);
    });

    it('should include all client conversation fields', () => {
      const record = createConversationRecord();
      const result = presentConversationMetadata(record);

      expect(result.id).toBe('conv-1');
      expect(result.title).toBe('Test Conversation');
      expect(result.shareAudience).toBe('private');
      expect(result.tenantAccess).toBe('read');
      expect(result.jurisdictions).toEqual(['us', 'eu']);
      expect(result.lastMessageAt).toEqual(new Date('2025-01-01T00:00:00Z'));
      expect(result.createdAt).toEqual(new Date('2025-01-01T00:00:00Z'));
      expect(result.archivedAt).toBeNull();
    });

    it('should not include internal fields', () => {
      const record = createConversationRecord();
      const result = presentConversationMetadata(record);

      expect('tenantId' in result).toBe(false);
      expect('userId' in result).toBe(false);
      expect('updatedAt' in result).toBe(false);
    });

    it('should handle different combinations of shareAudience', () => {
      const testCases = [
        { shareAudience: 'private' as const, expectedIsShared: false },
        { shareAudience: 'tenant' as const, expectedIsShared: true },
        { shareAudience: 'public' as const, expectedIsShared: true },
      ];

      testCases.forEach(({ shareAudience, expectedIsShared }) => {
        const record = createConversationRecord({ shareAudience });
        const result = presentConversationMetadata(record);

        expect(result.isShared).toBe(expectedIsShared);
      });
    });

    it('should not mutate original record', () => {
      const record = createConversationRecord();
      const recordCopy = { ...record };

      presentConversationMetadata(record);

      expect(record).toEqual(recordCopy);
    });
  });

  describe('field filtering', () => {
    it('should only include specified client fields', () => {
      const record = createConversationRecord({
        id: 'conv-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        title: 'Title',
        shareAudience: 'private',
        tenantAccess: 'read',
        jurisdictions: ['us'],
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      });

      const result = presentConversation(record);

      // Exactly these fields should be present
      const expectedFields = [
        'id',
        'title',
        'shareAudience',
        'tenantAccess',
        'jurisdictions',
        'lastMessageAt',
        'createdAt',
        'archivedAt',
      ];

      const actualFields = Object.keys(result);
      expect(actualFields.sort()).toEqual(expectedFields.sort());
    });

    it('should only include specified fields plus isShared for metadata', () => {
      const record = createConversationRecord();
      const result = presentConversationMetadata(record);

      // Exactly these fields should be present
      const expectedFields = [
        'id',
        'title',
        'shareAudience',
        'tenantAccess',
        'jurisdictions',
        'lastMessageAt',
        'createdAt',
        'archivedAt',
        'isShared',
      ];

      const actualFields = Object.keys(result);
      expect(actualFields.sort()).toEqual(expectedFields.sort());
    });
  });
});
