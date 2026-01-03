'use client';

import type { ReactNode } from 'react';
import { ConversationPathProvider, type PathApiClient, type ClientPath } from '@reg-copilot/reg-intel-ui';

interface ConditionalPathProviderProps {
  /** Conversation ID - if null/undefined, children are rendered without provider */
  conversationId: string | undefined;
  /** Initial active path ID to load */
  initialActivePathId?: string;
  /** API client for path operations */
  apiClient: PathApiClient;
  /** Called when active path changes */
  onPathChange?: (path: ClientPath) => void;
  /** Called when error occurs */
  onError?: (error: Error) => void;
  /** Children to render */
  children: ReactNode;
}

/**
 * Conditionally wraps children with ConversationPathProvider when conversationId exists.
 * Useful for components that need to work both with and without path context.
 */
export function ConditionalPathProvider({
  conversationId,
  initialActivePathId,
  apiClient,
  onPathChange,
  onError,
  children,
}: ConditionalPathProviderProps) {
  if (!conversationId) {
    return <>{children}</>;
  }

  return (
    <ConversationPathProvider
      conversationId={conversationId}
      initialPathId={initialActivePathId}
      apiClient={apiClient}
      onPathChange={onPathChange}
      onError={onError}
    >
      {children}
    </ConversationPathProvider>
  );
}

export default ConditionalPathProvider;
