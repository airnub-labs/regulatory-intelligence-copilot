'use client';

import {
  useConversationPaths,
  useHasPathProvider,
  PathBreadcrumbs,
  scrollToMessage,
  type NavigateOptions,
} from '@reg-copilot/reg-intel-ui';
import { recordBreadcrumbNavigate, recordPathSwitch } from '@reg-copilot/reg-intel-observability';

interface PathBreadcrumbNavProps {
  /** Called when user navigates to a different path */
  onPathSwitch?: (pathId: string) => void;
  className?: string;
}

/**
 * Breadcrumb navigation for conversation paths with jump-to-message support.
 * Only renders when inside a ConversationPathProvider.
 */
export function PathBreadcrumbNav({
  onPathSwitch,
  className,
}: PathBreadcrumbNavProps) {
  const hasPathProvider = useHasPathProvider();

  if (!hasPathProvider) {
    return null;
  }

  return (
    <PathBreadcrumbNavContent
      onPathSwitch={onPathSwitch}
      className={className}
    />
  );
}

function PathBreadcrumbNavContent({
  onPathSwitch,
  className,
}: PathBreadcrumbNavProps) {
  const {
    paths,
    activePath,
    messages,
    switchPath,
    conversationId,
  } = useConversationPaths();

  const handleBreadcrumbNavigate = async (
    pathId: string,
    options?: NavigateOptions
  ) => {
    const fromPathId = activePath?.id ?? 'unknown';

    // Record breadcrumb navigation metric
    recordBreadcrumbNavigate({
      fromPathId,
      toPathId: pathId,
      pathDepth: paths.length,
      conversationId,
    });

    // Switch to the selected path
    await switchPath(pathId);

    // Record path switch metric
    recordPathSwitch({
      fromPathId,
      toPathId: pathId,
      switchMethod: 'breadcrumb',
      conversationId,
    });

    // Notify parent if callback provided
    if (onPathSwitch) {
      onPathSwitch(pathId);
    }

    // Scroll to branch point message if specified
    if (options?.scrollToMessage) {
      // Wait for messages to render after path switch
      setTimeout(() => {
        scrollToMessage(options.scrollToMessage!, {
          highlight: options.highlightMessage ?? true,
          highlightDuration: 2000,
          block: 'center',
        });
      }, 300); // Slightly longer delay to ensure DOM updates
    }
  };

  // Only show breadcrumbs if we have an active path and multiple paths exist
  if (!activePath || paths.length === 0) {
    return null;
  }

  return (
    <PathBreadcrumbs
      activePath={activePath}
      paths={paths}
      messages={messages}
      onNavigate={handleBreadcrumbNavigate}
      className={className}
    />
  );
}
