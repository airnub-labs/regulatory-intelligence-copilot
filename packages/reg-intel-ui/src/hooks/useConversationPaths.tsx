'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';

import type {
  PathContextValue,
  PathApiClient,
  PathState,
  ClientPath,
  PathMessage,
  MergeInput,
  PreviewMergeInput,
  MergeResult,
  MergePreview,
  UpdatePathInput,
} from '../types';

/**
 * Context for path state
 */
const PathContext = createContext<PathContextValue | null>(null);

/**
 * Props for the ConversationPathProvider
 */
export interface ConversationPathProviderProps {
  /** The conversation ID to manage paths for */
  conversationId: string;
  /** API client for path operations */
  apiClient: PathApiClient;
  /** Initial active path ID (optional) */
  initialPathId?: string;
  /** Children to render */
  children: ReactNode;
  /** Callback when active path changes */
  onPathChange?: (path: ClientPath) => void;
  /** Callback when error occurs */
  onError?: (error: Error) => void;
}

/**
 * Provider component for conversation path state
 *
 * @example
 * ```tsx
 * <ConversationPathProvider
 *   conversationId="conv-123"
 *   apiClient={myApiClient}
 *   onPathChange={(path) => console.log('Path changed:', path)}
 * >
 *   <PathSelector />
 *   <MessageList />
 * </ConversationPathProvider>
 * ```
 */
export function ConversationPathProvider({
  conversationId,
  apiClient,
  initialPathId,
  children,
  onPathChange,
  onError,
}: ConversationPathProviderProps) {
  // State
  const [paths, setPaths] = useState<ClientPath[]>([]);
  const [activePath, setActivePath] = useState<ClientPath | null>(null);
  const [messages, setMessages] = useState<PathMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isBranching, setIsBranching] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Error handler
  const handleError = useCallback(
    (err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
    },
    [onError]
  );

  // Load paths
  const refreshPaths = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loadedPaths = await apiClient.listPaths(conversationId);
      setPaths(loadedPaths);

      // Set active path if not already set
      if (!activePath && loadedPaths.length > 0) {
        const targetPath = initialPathId
          ? loadedPaths.find(p => p.id === initialPathId)
          : loadedPaths.find(p => p.isPrimary);
        if (targetPath) {
          setActivePath(targetPath);
        }
      }
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient, conversationId, activePath, initialPathId, handleError]);

  // Load messages for a path
  const loadMessages = useCallback(
    async (pathId: string) => {
      try {
        setIsLoadingMessages(true);
        const loadedMessages = await apiClient.getPathMessages(conversationId, pathId);
        setMessages(loadedMessages);
      } catch (err) {
        handleError(err);
      } finally {
        setIsLoadingMessages(false);
      }
    },
    [apiClient, conversationId, handleError]
  );

  // Switch to a different path
  const switchPath = useCallback(
    async (pathId: string) => {
      try {
        const newPath = await apiClient.setActivePath(conversationId, pathId);
        setActivePath(newPath);
        onPathChange?.(newPath);
        await loadMessages(pathId);
      } catch (err) {
        handleError(err);
      }
    },
    [apiClient, conversationId, loadMessages, onPathChange, handleError]
  );

  // Create a branch
  const createBranch = useCallback(
    async (messageId: string, name?: string, description?: string): Promise<ClientPath> => {
      try {
        setIsBranching(true);
        const result = await apiClient.createBranch(conversationId, {
          sourceMessageId: messageId,
          name,
          description,
        });
        // Refresh paths to include the new one
        await refreshPaths();
        return result.path;
      } catch (err) {
        handleError(err);
        throw err;
      } finally {
        setIsBranching(false);
      }
    },
    [apiClient, conversationId, refreshPaths, handleError]
  );

  // Merge a path
  const mergePath = useCallback(
    async (sourcePathId: string, options: MergeInput): Promise<MergeResult> => {
      try {
        setIsMerging(true);
        const result = await apiClient.mergePath(conversationId, sourcePathId, options);
        // Refresh paths and messages
        await refreshPaths();
        if (activePath) {
          await loadMessages(activePath.id);
        }
        return result;
      } catch (err) {
        handleError(err);
        throw err;
      } finally {
        setIsMerging(false);
      }
    },
    [apiClient, conversationId, refreshPaths, loadMessages, activePath, handleError]
  );

  // Preview merge
  const previewMerge = useCallback(
    async (sourcePathId: string, options: PreviewMergeInput): Promise<MergePreview> => {
      return apiClient.previewMerge(conversationId, sourcePathId, options);
    },
    [apiClient, conversationId]
  );

  // Update path
  const updatePath = useCallback(
    async (pathId: string, updates: UpdatePathInput): Promise<void> => {
      try {
        const updated = await apiClient.updatePath(conversationId, pathId, updates);
        setPaths(prev => prev.map(p => (p.id === pathId ? updated : p)));
        if (activePath?.id === pathId) {
          setActivePath(updated);
        }
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [apiClient, conversationId, activePath, handleError]
  );

  // Delete path
  const deletePath = useCallback(
    async (pathId: string, hardDelete?: boolean): Promise<void> => {
      try {
        await apiClient.deletePath(conversationId, pathId, hardDelete);
        setPaths(prev => prev.filter(p => p.id !== pathId));
        // If deleting active path, switch to primary
        if (activePath?.id === pathId) {
          const primary = paths.find(p => p.isPrimary && p.id !== pathId);
          if (primary) {
            await switchPath(primary.id);
          }
        }
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [apiClient, conversationId, activePath, paths, switchPath, handleError]
  );

  // Initial load
  useEffect(() => {
    refreshPaths();
  }, [conversationId]); // Only reload when conversation changes

  // Load messages when active path changes
  useEffect(() => {
    if (activePath) {
      loadMessages(activePath.id);
    }
  }, [activePath?.id]); // Only reload when path ID changes

  // Context value
  const value = useMemo<PathContextValue>(
    () => ({
      conversationId,
      paths,
      activePath,
      messages,
      isLoading,
      isLoadingMessages,
      isBranching,
      isMerging,
      error,
      refreshPaths,
      switchPath,
      createBranch,
      mergePath,
      previewMerge,
      updatePath,
      deletePath,
    }),
    [
      conversationId,
      paths,
      activePath,
      messages,
      isLoading,
      isLoadingMessages,
      isBranching,
      isMerging,
      error,
      refreshPaths,
      switchPath,
      createBranch,
      mergePath,
      previewMerge,
      updatePath,
      deletePath,
    ]
  );

  return <PathContext.Provider value={value}>{children}</PathContext.Provider>;
}

/**
 * Hook to access path context
 *
 * @throws Error if used outside of ConversationPathProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { paths, activePath, switchPath } = useConversationPaths();
 *   return (
 *     <select onChange={(e) => switchPath(e.target.value)}>
 *       {paths.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
 *     </select>
 *   );
 * }
 * ```
 */
export function useConversationPaths(): PathContextValue {
  const context = useContext(PathContext);
  if (!context) {
    throw new Error('useConversationPaths must be used within a ConversationPathProvider');
  }
  return context;
}

/**
 * Hook to check if inside a PathProvider
 */
export function useHasPathProvider(): boolean {
  return useContext(PathContext) !== null;
}
