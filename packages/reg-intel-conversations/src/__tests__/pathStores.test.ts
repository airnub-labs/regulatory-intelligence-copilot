/**
 * Unit tests for Conversation Path Stores
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryConversationPathStore } from '../pathStores.js';
import type {
  ConversationPath,
  CreatePathInput,
  UpdatePathInput,
  BranchInput,
  MergeInput,
} from '../types/paths.js';

describe('InMemoryConversationPathStore', () => {
  let store: InMemoryConversationPathStore;
  const tenantId = 'tenant-1';
  const conversationId = 'conv-1';

  beforeEach(() => {
    store = new InMemoryConversationPathStore();
  });

  describe('createPath', () => {
    it('should create a new path with default values', async () => {
      const input: CreatePathInput = {
        tenantId,
        conversationId,
      };

      const { pathId } = await store.createPath(input);
      expect(pathId).toBeDefined();

      const path = await store.getPath({ tenantId, pathId });
      expect(path).not.toBeNull();
      expect(path?.conversationId).toBe(conversationId);
      expect(path?.tenantId).toBe(tenantId);
      expect(path?.isPrimary).toBe(false);
      expect(path?.isActive).toBe(true);
      expect(path?.parentPathId).toBeNull();
      expect(path?.branchPointMessageId).toBeNull();
      expect(path?.messageCount).toBe(0);
      expect(path?.branchCount).toBe(0);
    });

    it('should create a primary path', async () => {
      const input: CreatePathInput = {
        tenantId,
        conversationId,
        name: 'Main',
        isPrimary: true,
      };

      const { pathId } = await store.createPath(input);
      const path = await store.getPath({ tenantId, pathId });

      expect(path?.isPrimary).toBe(true);
      expect(path?.name).toBe('Main');
    });

    it('should create a branch path with parent and branch point', async () => {
      // Create parent path
      const { pathId: parentId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
      });

      // Add a message to the parent
      const messageId = store.addTestMessage(parentId, {
        conversationId,
        pathId: parentId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Test message',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      // Create branch
      const input: CreatePathInput = {
        tenantId,
        conversationId,
        parentPathId: parentId,
        branchPointMessageId: messageId,
        name: 'Branch 1',
        description: 'Test branch',
      };

      const { pathId: branchId } = await store.createPath(input);
      const branch = await store.getPath({ tenantId, pathId: branchId });

      expect(branch?.parentPathId).toBe(parentId);
      expect(branch?.branchPointMessageId).toBe(messageId);
      expect(branch?.name).toBe('Branch 1');
      expect(branch?.description).toBe('Test branch');
    });
  });

  describe('getPath', () => {
    it('should return path by id', async () => {
      const { pathId } = await store.createPath({
        tenantId,
        conversationId,
        name: 'Test',
      });

      const path = await store.getPath({ tenantId, pathId });
      expect(path).not.toBeNull();
      expect(path?.id).toBe(pathId);
      expect(path?.name).toBe('Test');
    });

    it('should return null if path does not exist', async () => {
      const path = await store.getPath({ tenantId, pathId: 'nonexistent' });
      expect(path).toBeNull();
    });

    it('should return null if tenant does not match', async () => {
      const { pathId } = await store.createPath({
        tenantId,
        conversationId,
      });

      const path = await store.getPath({ tenantId: 'other-tenant', pathId });
      expect(path).toBeNull();
    });
  });

  describe('listPaths', () => {
    it('should list paths for conversation', async () => {
      await store.createPath({ tenantId, conversationId, name: 'Path 1' });
      await store.createPath({ tenantId, conversationId, name: 'Path 2' });
      await store.createPath({ tenantId, conversationId: 'other-conv', name: 'Path 3' });

      const paths = await store.listPaths({ tenantId, conversationId });
      expect(paths).toHaveLength(2);
      expect(paths.map(p => p.name).sort()).toEqual(['Path 1', 'Path 2']);
    });

    it('should exclude inactive paths by default', async () => {
      const { pathId: activeId } = await store.createPath({ tenantId, conversationId, name: 'Active' });
      const { pathId: inactiveId } = await store.createPath({ tenantId, conversationId, name: 'Inactive' });

      await store.updatePath({ tenantId, pathId: inactiveId, isActive: false });

      const paths = await store.listPaths({ tenantId, conversationId });
      expect(paths).toHaveLength(1);
      expect(paths[0].id).toBe(activeId);
    });

    it('should include inactive paths when requested', async () => {
      await store.createPath({ tenantId, conversationId, name: 'Active' });
      const { pathId: inactiveId } = await store.createPath({ tenantId, conversationId, name: 'Inactive' });

      await store.updatePath({ tenantId, pathId: inactiveId, isActive: false });

      const paths = await store.listPaths({ tenantId, conversationId, includeInactive: true });
      expect(paths).toHaveLength(2);
    });

    it('should filter by parent path id', async () => {
      const { pathId: parentId } = await store.createPath({ tenantId, conversationId, isPrimary: true });
      await store.createPath({
        tenantId,
        conversationId,
        parentPathId: parentId,
        name: 'Child 1',
      });
      await store.createPath({
        tenantId,
        conversationId,
        parentPathId: parentId,
        name: 'Child 2',
      });
      await store.createPath({
        tenantId,
        conversationId,
        name: 'Other',
      });

      const children = await store.listPaths({
        tenantId,
        conversationId,
        parentPathId: parentId,
      });

      expect(children).toHaveLength(2);
      expect(children.map(p => p.name).sort()).toEqual(['Child 1', 'Child 2']);
    });

    it('should sort primary path first', async () => {
      await store.createPath({ tenantId, conversationId, name: 'Regular' });
      await store.createPath({ tenantId, conversationId, name: 'Main', isPrimary: true });

      const paths = await store.listPaths({ tenantId, conversationId });
      expect(paths[0].isPrimary).toBe(true);
      expect(paths[0].name).toBe('Main');
    });
  });

  describe('updatePath', () => {
    it('should update path name', async () => {
      const { pathId } = await store.createPath({
        tenantId,
        conversationId,
        name: 'Original',
      });

      await store.updatePath({ tenantId, pathId, name: 'Updated' });

      const path = await store.getPath({ tenantId, pathId });
      expect(path?.name).toBe('Updated');
    });

    it('should update path description', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      await store.updatePath({ tenantId, pathId, description: 'New description' });

      const path = await store.getPath({ tenantId, pathId });
      expect(path?.description).toBe('New description');
    });

    it('should update path active status', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      await store.updatePath({ tenantId, pathId, isActive: false });

      const path = await store.getPath({ tenantId, pathId });
      expect(path?.isActive).toBe(false);
    });

    it('should throw error if path not found', async () => {
      await expect(
        store.updatePath({ tenantId, pathId: 'nonexistent', name: 'Test' })
      ).rejects.toThrow('Path not found');
    });

    it('should throw error if tenant does not match', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      await expect(
        store.updatePath({ tenantId: 'other-tenant', pathId, name: 'Test' })
      ).rejects.toThrow('Path not found');
    });
  });

  describe('deletePath', () => {
    it('should archive path by default', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      await store.deletePath({ tenantId, pathId });

      const path = await store.getPath({ tenantId, pathId });
      expect(path?.isActive).toBe(false);
    });

    it('should hard delete path when requested', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      await store.deletePath({ tenantId, pathId, hardDelete: true });

      const path = await store.getPath({ tenantId, pathId });
      expect(path).toBeNull();
    });

    it('should not allow deleting primary path', async () => {
      const { pathId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
      });

      await expect(
        store.deletePath({ tenantId, pathId })
      ).rejects.toThrow('Cannot delete primary path');
    });

    it('should throw error if path not found', async () => {
      await expect(
        store.deletePath({ tenantId, pathId: 'nonexistent' })
      ).rejects.toThrow('Path not found');
    });
  });

  describe('resolvePathMessages', () => {
    it('should return messages from single path', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      store.addTestMessage(pathId, {
        conversationId,
        pathId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Message 1',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      store.addTestMessage(pathId, {
        conversationId,
        pathId,
        tenantId,
        userId: 'user-1',
        role: 'assistant',
        content: 'Message 2',
        metadata: {},
        sequenceInPath: 2,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      const messages = await store.resolvePathMessages({ tenantId, pathId });
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Message 1');
      expect(messages[1].content).toBe('Message 2');
    });

    it('should include inherited messages from parent path', async () => {
      // Create parent path with messages
      const { pathId: parentId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
      });

      const msg1Id = store.addTestMessage(parentId, {
        conversationId,
        pathId: parentId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Parent message 1',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      const branchPointId = store.addTestMessage(parentId, {
        conversationId,
        pathId: parentId,
        tenantId,
        userId: 'user-1',
        role: 'assistant',
        content: 'Branch point message',
        metadata: {},
        sequenceInPath: 2,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      store.addTestMessage(parentId, {
        conversationId,
        pathId: parentId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Parent message 3 (not inherited)',
        metadata: {},
        sequenceInPath: 3,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      // Create branch path
      const { pathId: branchId } = await store.createPath({
        tenantId,
        conversationId,
        parentPathId: parentId,
        branchPointMessageId: branchPointId,
      });

      store.addTestMessage(branchId, {
        conversationId,
        pathId: branchId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Branch message',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      // Resolve branch messages
      const messages = await store.resolvePathMessages({ tenantId, pathId: branchId });
      expect(messages).toHaveLength(3); // 2 inherited + 1 own
      expect(messages[0].content).toBe('Parent message 1');
      expect(messages[1].content).toBe('Branch point message');
      expect(messages[2].content).toBe('Branch message');
    });

    it('should filter deleted messages when requested', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      store.addTestMessage(pathId, {
        conversationId,
        pathId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Active message',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      store.addTestMessage(pathId, {
        conversationId,
        pathId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Deleted message',
        metadata: { deletedAt: new Date().toISOString() },
        sequenceInPath: 2,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      const messages = await store.resolvePathMessages({
        tenantId,
        pathId,
        options: { includeDeleted: false },
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Active message');
    });

    it('should apply offset and limit', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      for (let i = 1; i <= 5; i++) {
        store.addTestMessage(pathId, {
          conversationId,
          pathId,
          tenantId,
          userId: 'user-1',
          role: 'user',
          content: `Message ${i}`,
          metadata: {},
          sequenceInPath: i,
          isBranchPoint: false,
          branchedToPaths: [],
          messageType: 'standard',
          isPinned: false,
          pinnedAt: null,
          pinnedBy: null,
        });
      }

      const messages = await store.resolvePathMessages({
        tenantId,
        pathId,
        options: { offset: 1, limit: 2 },
      });

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Message 2');
      expect(messages[1].content).toBe('Message 3');
    });
  });

  describe('branchFromMessage', () => {
    it('should create branch from message', async () => {
      const { pathId: parentId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
      });

      const messageId = store.addTestMessage(parentId, {
        conversationId,
        pathId: parentId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Branch point',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      const input: BranchInput = {
        tenantId,
        conversationId,
        sourceMessageId: messageId,
        name: 'My Branch',
        description: 'Test branch',
      };

      const result = await store.branchFromMessage(input);

      expect(result.path).toBeDefined();
      expect(result.path.parentPathId).toBe(parentId);
      expect(result.path.branchPointMessageId).toBe(messageId);
      expect(result.path.name).toBe('My Branch');
      expect(result.branchPointMessage.isBranchPoint).toBe(true);
      expect(result.branchPointMessage.branchedToPaths).toContain(result.path.id);
    });

    it('should throw error if source message not found', async () => {
      const input: BranchInput = {
        tenantId,
        conversationId,
        sourceMessageId: 'nonexistent',
        name: 'Branch',
      };

      await expect(store.branchFromMessage(input)).rejects.toThrow('Source message not found');
    });
  });

  describe('mergePath', () => {
    it('should merge path with summary mode', async () => {
      // Create source and target paths
      const { pathId: targetId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
      });

      const { pathId: sourceId } = await store.createPath({
        tenantId,
        conversationId,
        name: 'Source',
      });

      // Add messages to source
      store.addTestMessage(sourceId, {
        conversationId,
        pathId: sourceId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Source message',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      const input: MergeInput = {
        tenantId,
        sourcePathId: sourceId,
        targetPathId: targetId,
        mergeMode: 'summary',
        userId: 'user-1',
      };

      const result = await store.mergePath(input);

      expect(result.success).toBe(true);
      expect(result.summaryMessageId).toBeDefined();
      expect(result.sourcePath.mergedToPathId).toBe(targetId);
      expect(result.sourcePath.isActive).toBe(false);
    });

    it('should merge path with full mode', async () => {
      const { pathId: targetId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
      });

      const { pathId: sourceId } = await store.createPath({
        tenantId,
        conversationId,
      });

      store.addTestMessage(sourceId, {
        conversationId,
        pathId: sourceId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Message 1',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      const input: MergeInput = {
        tenantId,
        sourcePathId: sourceId,
        targetPathId: targetId,
        mergeMode: 'full',
        userId: 'user-1',
      };

      const result = await store.mergePath(input);

      expect(result.success).toBe(true);
      expect(result.mergedMessageIds).toHaveLength(1);
      expect(result.sourcePath.mergeMode).toBe('full');
    });

    it('should merge path with selective mode', async () => {
      const { pathId: targetId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
      });

      const { pathId: sourceId } = await store.createPath({
        tenantId,
        conversationId,
      });

      const msg1 = store.addTestMessage(sourceId, {
        conversationId,
        pathId: sourceId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Selected',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      const msg2 = store.addTestMessage(sourceId, {
        conversationId,
        pathId: sourceId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Not selected',
        metadata: {},
        sequenceInPath: 2,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      const input: MergeInput = {
        tenantId,
        sourcePathId: sourceId,
        targetPathId: targetId,
        mergeMode: 'selective',
        selectedMessageIds: [msg1],
        userId: 'user-1',
      };

      const result = await store.mergePath(input);

      expect(result.success).toBe(true);
      expect(result.mergedMessageIds).toHaveLength(1);
    });

    it('should throw error if paths from different conversations', async () => {
      const { pathId: path1 } = await store.createPath({
        tenantId,
        conversationId: 'conv-1',
      });

      const { pathId: path2 } = await store.createPath({
        tenantId,
        conversationId: 'conv-2',
      });

      const input: MergeInput = {
        tenantId,
        sourcePathId: path1,
        targetPathId: path2,
        mergeMode: 'summary',
        userId: 'user-1',
      };

      await expect(store.mergePath(input)).rejects.toThrow(
        'Cannot merge paths from different conversations'
      );
    });
  });

  describe('previewMerge', () => {
    it('should generate merge preview', async () => {
      const { pathId: targetId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
      });

      const { pathId: sourceId } = await store.createPath({
        tenantId,
        conversationId,
        name: 'Source',
      });

      store.addTestMessage(sourceId, {
        conversationId,
        pathId: sourceId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Test message',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      const preview = await store.previewMerge({
        tenantId,
        sourcePathId: sourceId,
        targetPathId: targetId,
        mergeMode: 'summary',
      });

      expect(preview.messagesToMerge).toHaveLength(1);
      expect(preview.generatedSummary).toBeDefined();
      expect(preview.estimatedMessageCount).toBe(1);
      expect(preview.sourcePath.id).toBe(sourceId);
      expect(preview.targetPath.id).toBe(targetId);
    });
  });

  describe('activePath', () => {
    it('should set and get active path', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      await store.setActivePath({ tenantId, conversationId, pathId });

      const activePath = await store.getActivePath({ tenantId, conversationId });
      expect(activePath?.id).toBe(pathId);
    });

    it('should return primary path as default active path', async () => {
      const { pathId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
      });

      const activePath = await store.getActivePath({ tenantId, conversationId });
      expect(activePath?.id).toBe(pathId);
    });

    it('should throw error if path does not belong to conversation', async () => {
      const { pathId } = await store.createPath({
        tenantId,
        conversationId: 'conv-1',
      });

      await expect(
        store.setActivePath({
          tenantId,
          conversationId: 'conv-2',
          pathId,
        })
      ).rejects.toThrow('Path does not belong to this conversation');
    });
  });

  describe('primaryPath', () => {
    it('should get primary path', async () => {
      const { pathId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
      });

      const primary = await store.getPrimaryPath({ tenantId, conversationId });
      expect(primary?.id).toBe(pathId);
    });

    it('should return null if no primary path exists', async () => {
      const primary = await store.getPrimaryPath({ tenantId, conversationId });
      expect(primary).toBeNull();
    });

    it('should ensure primary path exists', async () => {
      const primary = await store.ensurePrimaryPath({ tenantId, conversationId });
      expect(primary.isPrimary).toBe(true);
      expect(primary.name).toBe('Main');
    });

    it('should return existing primary path when ensuring', async () => {
      const { pathId } = await store.createPath({
        tenantId,
        conversationId,
        isPrimary: true,
        name: 'Custom Main',
      });

      const primary = await store.ensurePrimaryPath({ tenantId, conversationId });
      expect(primary.id).toBe(pathId);
      expect(primary.name).toBe('Custom Main');
    });
  });

  describe('message pinning', () => {
    it('should pin message', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      const messageId = store.addTestMessage(pathId, {
        conversationId,
        pathId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Test',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      await store.pinMessage({
        tenantId,
        conversationId,
        messageId,
        userId: 'user-1',
      });

      const pinned = await store.getPinnedMessages({ tenantId, conversationId });
      expect(pinned).toHaveLength(1);
      expect(pinned[0].id).toBe(messageId);
      expect(pinned[0].isPinned).toBe(true);
    });

    it('should unpin message', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      const messageId = store.addTestMessage(pathId, {
        conversationId,
        pathId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Test',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      await store.pinMessage({ tenantId, conversationId, messageId, userId: 'user-1' });
      await store.unpinMessage({ tenantId, conversationId, messageId });

      const pinned = await store.getPinnedMessages({ tenantId, conversationId });
      expect(pinned).toHaveLength(0);
    });

    it('should get pinned message count', async () => {
      const { pathId } = await store.createPath({ tenantId, conversationId });

      const msg1 = store.addTestMessage(pathId, {
        conversationId,
        pathId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Test 1',
        metadata: {},
        sequenceInPath: 1,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      const msg2 = store.addTestMessage(pathId, {
        conversationId,
        pathId,
        tenantId,
        userId: 'user-1',
        role: 'user',
        content: 'Test 2',
        metadata: {},
        sequenceInPath: 2,
        isBranchPoint: false,
        branchedToPaths: [],
        messageType: 'standard',
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      });

      await store.pinMessage({ tenantId, conversationId, messageId: msg1, userId: 'user-1' });
      await store.pinMessage({ tenantId, conversationId, messageId: msg2, userId: 'user-1' });

      const count = await store.getPinnedMessageCount({ tenantId, conversationId });
      expect(count).toBe(2);
    });

    it('should throw error if pinning non-existent message', async () => {
      await expect(
        store.pinMessage({
          tenantId,
          conversationId,
          messageId: 'nonexistent',
          userId: 'user-1',
        })
      ).rejects.toThrow('Message not found');
    });
  });
});
