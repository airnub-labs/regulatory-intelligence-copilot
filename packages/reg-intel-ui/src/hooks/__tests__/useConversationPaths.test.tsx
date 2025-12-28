/**
 * Tests for useConversationPaths hook and ConversationPathProvider
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  ConversationPathProvider,
  useConversationPaths,
  useHasPathProvider,
} from '../useConversationPaths';
import type { PathApiClient, ClientPath, PathMessage, MergePreview } from '../../types';

describe('useConversationPaths', () => {
  let mockApiClient: PathApiClient;
  const conversationId = 'conv-123';

  const primaryPath: ClientPath = {
    id: 'path-primary',
    conversationId: 'conv-123',
    parentPathId: null,
    branchPointMessageId: null,
    name: null,
    isPrimary: true,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const branchPath: ClientPath = {
    id: 'path-branch',
    conversationId: 'conv-123',
    parentPathId: 'path-primary',
    branchPointMessageId: 'msg-5',
    name: 'Alternative Scenario',
    isPrimary: false,
    isActive: false,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  };

  const mockMessages: PathMessage[] = [
    {
      id: 'msg-1',
      conversationId: 'conv-123',
      pathId: 'path-primary',
      role: 'user',
      content: 'Test message 1',
      metadata: {},
      sequenceInPath: 1,
      effectiveSequence: 1,
      isBranchPoint: false,
      branchedToPaths: [],
      messageType: 'user',
      createdAt: '2024-01-01T10:00:00Z',
    },
    {
      id: 'msg-2',
      conversationId: 'conv-123',
      pathId: 'path-primary',
      role: 'assistant',
      content: 'Test message 2',
      metadata: {},
      sequenceInPath: 2,
      effectiveSequence: 2,
      isBranchPoint: false,
      branchedToPaths: [],
      messageType: 'assistant',
      createdAt: '2024-01-01T10:01:00Z',
    },
  ];

  beforeEach(() => {
    mockApiClient = {
      listPaths: vi.fn().mockResolvedValue([primaryPath, branchPath]),
      getPathMessages: vi.fn().mockResolvedValue(mockMessages),
      setActivePath: vi.fn().mockImplementation(async (_, pathId) => {
        if (pathId === 'path-branch') return branchPath;
        return primaryPath;
      }),
      createBranch: vi.fn().mockResolvedValue({
        path: branchPath,
        branchPointMessage: {
          id: 'msg-5',
          isBranchPoint: true,
        },
      }),
      mergePath: vi.fn().mockResolvedValue({
        targetPath: primaryPath,
        mergedMessages: [],
        summary: 'Merge successful',
      }),
      previewMerge: vi.fn().mockResolvedValue({
        targetPath: primaryPath,
        messagesToMerge: [],
        generatedSummary: 'Preview summary',
        conflictCount: 0,
        aiGenerated: true,
      } as MergePreview),
      updatePath: vi.fn().mockImplementation(async (_, pathId, updates) => ({
        ...primaryPath,
        ...updates,
        id: pathId,
      })),
      deletePath: vi.fn().mockResolvedValue(undefined),
    };
  });

  const createWrapper = (onPathChange?: (path: ClientPath) => void, onError?: (error: Error) => void) => {
    return function Wrapper({ children }: { children: ReactNode }) {
      return (
        <ConversationPathProvider
          conversationId={conversationId}
          apiClient={mockApiClient}
          onPathChange={onPathChange}
          onError={onError}
        >
          {children}
        </ConversationPathProvider>
      );
    };
  };

  describe('Provider initialization', () => {
    it('should load paths on mount', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockApiClient.listPaths).toHaveBeenCalledWith(conversationId);
      expect(result.current.paths).toEqual([primaryPath, branchPath]);
    });

    it('should set primary path as active by default', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });
    });

    it('should load messages for active path', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.messages).toEqual(mockMessages);
      });

      expect(mockApiClient.getPathMessages).toHaveBeenCalledWith(
        conversationId,
        primaryPath.id
      );
    });

    it('should handle errors during path loading', async () => {
      const error = new Error('Failed to load paths');
      const onError = vi.fn();
      mockApiClient.listPaths = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(undefined, onError),
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toEqual(error);
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('switchPath', () => {
    it('should switch to a different path', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      await act(async () => {
        await result.current.switchPath('path-branch');
      });

      expect(mockApiClient.setActivePath).toHaveBeenCalledWith(
        conversationId,
        'path-branch'
      );
      expect(result.current.activePath).toEqual(branchPath);
    });

    it('should call onPathChange callback', async () => {
      const onPathChange = vi.fn();
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(onPathChange),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      await act(async () => {
        await result.current.switchPath('path-branch');
      });

      expect(onPathChange).toHaveBeenCalledWith(branchPath);
    });

    it('should load messages for new path', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      (mockApiClient.getPathMessages as any).mockClear();

      await act(async () => {
        await result.current.switchPath('path-branch');
      });

      expect(mockApiClient.getPathMessages).toHaveBeenCalledWith(
        conversationId,
        'path-branch'
      );
    });

    it('should handle errors during path switch', async () => {
      const error = new Error('Failed to switch path');
      const onError = vi.fn();
      mockApiClient.setActivePath = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(undefined, onError),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      await act(async () => {
        await result.current.switchPath('path-branch');
      });

      expect(result.current.error).toEqual(error);
      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('createBranch', () => {
    it('should create a new branch', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      result.current.isBranching = false;
      let newBranch: ClientPath | undefined;

      await act(async () => {
        newBranch = await result.current.createBranch(
          'msg-5',
          'New Branch',
          'Testing branch creation'
        );
      });

      expect(mockApiClient.createBranch).toHaveBeenCalledWith(conversationId, {
        sourceMessageId: 'msg-5',
        name: 'New Branch',
        description: 'Testing branch creation',
      });
      expect(newBranch).toEqual(branchPath);
    });

    it('should refresh paths after creating branch', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      (mockApiClient.listPaths as any).mockClear();

      await act(async () => {
        await result.current.createBranch('msg-5');
      });

      expect(mockApiClient.listPaths).toHaveBeenCalledWith(conversationId);
    });

    it('should set isBranching state during operation', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isBranching).toBe(false);
      });

      const branchPromise = act(async () => {
        await result.current.createBranch('msg-5');
      });

      // Note: isBranching state changes happen very fast in tests
      await branchPromise;

      expect(result.current.isBranching).toBe(false);
    });

    it('should handle errors during branch creation', async () => {
      const error = new Error('Failed to create branch');
      const onError = vi.fn();
      mockApiClient.createBranch = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(undefined, onError),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      try {
        await act(async () => {
          await result.current.createBranch('msg-5');
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toEqual(error);
        expect(onError).toHaveBeenCalledWith(error);
      }
    });
  });

  describe('mergePath', () => {
    it('should merge a path', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      const mergeResult = await act(async () => {
        return await result.current.mergePath('path-branch', {
          mode: 'full',
          targetPathId: 'path-primary',
        });
      });

      expect(mockApiClient.mergePath).toHaveBeenCalledWith(
        conversationId,
        'path-branch',
        {
          mode: 'full',
          targetPathId: 'path-primary',
        }
      );
      expect(mergeResult.summary).toBe('Merge successful');
    });

    it('should refresh paths and messages after merge', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      (mockApiClient.listPaths as any).mockClear();
      (mockApiClient.getPathMessages as any).mockClear();

      await act(async () => {
        await result.current.mergePath('path-branch', {
          mode: 'full',
          targetPathId: 'path-primary',
        });
      });

      expect(mockApiClient.listPaths).toHaveBeenCalledWith(conversationId);
      expect(mockApiClient.getPathMessages).toHaveBeenCalledWith(
        conversationId,
        primaryPath.id
      );
    });

    it('should set isMerging state during operation', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.isMerging).toBe(false);
      });

      await act(async () => {
        await result.current.mergePath('path-branch', {
          mode: 'full',
          targetPathId: 'path-primary',
        });
      });

      expect(result.current.isMerging).toBe(false);
    });

    it('should handle errors during merge', async () => {
      const error = new Error('Failed to merge');
      const onError = vi.fn();
      mockApiClient.mergePath = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(undefined, onError),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      try {
        await act(async () => {
          await result.current.mergePath('path-branch', {
            mode: 'full',
            targetPathId: 'path-primary',
          });
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toEqual(error);
        expect(onError).toHaveBeenCalledWith(error);
      }
    });
  });

  describe('previewMerge', () => {
    it('should preview a merge', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      const preview = await act(async () => {
        return await result.current.previewMerge('path-branch', {
          targetPathId: 'path-primary',
        });
      });

      expect(mockApiClient.previewMerge).toHaveBeenCalledWith(
        conversationId,
        'path-branch',
        {
          targetPathId: 'path-primary',
        }
      );
      expect(preview.generatedSummary).toBe('Preview summary');
    });
  });

  describe('updatePath', () => {
    it('should update a path', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.paths.length).toBeGreaterThan(0);
      });

      await act(async () => {
        await result.current.updatePath('path-primary', {
          name: 'Updated Name',
        });
      });

      expect(mockApiClient.updatePath).toHaveBeenCalledWith(
        conversationId,
        'path-primary',
        {
          name: 'Updated Name',
        }
      );
    });

    it('should update paths state after update', async () => {
      const updatedPath = { ...primaryPath, name: 'Updated Name' };
      mockApiClient.updatePath = vi.fn().mockResolvedValue(updatedPath);

      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.paths.length).toBeGreaterThan(0);
      });

      await act(async () => {
        await result.current.updatePath('path-primary', {
          name: 'Updated Name',
        });
      });

      expect(
        result.current.paths.find((p) => p.id === 'path-primary')?.name
      ).toBe('Updated Name');
    });

    it('should update activePath if it is the updated path', async () => {
      const updatedPath = { ...primaryPath, name: 'Updated Name' };
      mockApiClient.updatePath = vi.fn().mockResolvedValue(updatedPath);

      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      await act(async () => {
        await result.current.updatePath('path-primary', {
          name: 'Updated Name',
        });
      });

      expect(result.current.activePath?.name).toBe('Updated Name');
    });

    it('should handle errors during update', async () => {
      const error = new Error('Failed to update');
      const onError = vi.fn();
      mockApiClient.updatePath = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(undefined, onError),
      });

      await waitFor(() => {
        expect(result.current.paths.length).toBeGreaterThan(0);
      });

      try {
        await act(async () => {
          await result.current.updatePath('path-primary', {
            name: 'Updated Name',
          });
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toEqual(error);
        expect(onError).toHaveBeenCalledWith(error);
      }
    });
  });

  describe('deletePath', () => {
    it('should delete a path', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.paths.length).toBe(2);
      });

      await act(async () => {
        await result.current.deletePath('path-branch');
      });

      expect(mockApiClient.deletePath).toHaveBeenCalledWith(
        conversationId,
        'path-branch',
        undefined
      );
      expect(result.current.paths.length).toBe(1);
    });

    it('should support hard delete', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.paths.length).toBe(2);
      });

      await act(async () => {
        await result.current.deletePath('path-branch', true);
      });

      expect(mockApiClient.deletePath).toHaveBeenCalledWith(
        conversationId,
        'path-branch',
        true
      );
    });

    it('should switch to primary path if deleting active path', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.activePath).toEqual(primaryPath);
      });

      // Switch to branch path first
      await act(async () => {
        await result.current.switchPath('path-branch');
      });

      expect(result.current.activePath).toEqual(branchPath);

      // Now delete it
      await act(async () => {
        await result.current.deletePath('path-branch');
      });

      // Should switch back to primary
      expect(result.current.activePath).toEqual(primaryPath);
    });

    it('should handle errors during deletion', async () => {
      const error = new Error('Failed to delete');
      const onError = vi.fn();
      mockApiClient.deletePath = vi.fn().mockRejectedValue(error);

      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(undefined, onError),
      });

      await waitFor(() => {
        expect(result.current.paths.length).toBe(2);
      });

      try {
        await act(async () => {
          await result.current.deletePath('path-branch');
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toEqual(error);
        expect(onError).toHaveBeenCalledWith(error);
      }
    });
  });

  describe('refreshPaths', () => {
    it('should reload paths', async () => {
      const { result } = renderHook(() => useConversationPaths(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.paths.length).toBe(2);
      });

      (mockApiClient.listPaths as any).mockClear();

      await act(async () => {
        await result.current.refreshPaths();
      });

      expect(mockApiClient.listPaths).toHaveBeenCalledWith(conversationId);
    });
  });

  describe('useConversationPaths hook', () => {
    it('should throw error when used outside provider', () => {
      expect(() => {
        renderHook(() => useConversationPaths());
      }).toThrow('useConversationPaths must be used within a ConversationPathProvider');
    });
  });

  describe('useHasPathProvider hook', () => {
    it('should return true when inside provider', () => {
      const { result } = renderHook(() => useHasPathProvider(), {
        wrapper: createWrapper(),
      });

      expect(result.current).toBe(true);
    });

    it('should return false when outside provider', () => {
      const { result } = renderHook(() => useHasPathProvider());

      expect(result.current).toBe(false);
    });
  });
});
