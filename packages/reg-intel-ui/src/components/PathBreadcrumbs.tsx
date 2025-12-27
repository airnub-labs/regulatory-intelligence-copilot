'use client';

import { Fragment } from 'react';
import { ChevronRight, MessageCircle } from 'lucide-react';
import { cn } from '../utils.js';
import type { ClientPath, PathMessage } from '../types.js';

export interface PathBreadcrumbsProps {
  /** The currently active path */
  activePath: ClientPath | null;
  /** All paths for the conversation */
  paths: ClientPath[];
  /** All messages (to show branch point context) */
  messages?: PathMessage[];
  /** Callback when user clicks a path */
  onNavigate: (pathId: string, options?: NavigateOptions) => void;
  /** Optional className */
  className?: string;
}

export interface NavigateOptions {
  /** Should scroll to branch point message */
  scrollToMessage?: string;
  /** Should highlight the message */
  highlightMessage?: boolean;
}

/**
 * Build breadcrumb chain from root to active path
 */
function buildBreadcrumbChain(
  activePath: ClientPath | null,
  allPaths: ClientPath[]
): ClientPath[] {
  if (!activePath) return [];

  const chain: ClientPath[] = [];
  let current: ClientPath | null = activePath;

  // Walk up the parent chain
  while (current) {
    chain.unshift(current);
    if (!current.parentPathId) break;
    current = allPaths.find(p => p.id === current!.parentPathId) || null;
  }

  return chain;
}

/**
 * Get branch point message content for tooltip
 */
function getBranchPointPreview(
  branchPointMessageId: string | null,
  messages?: PathMessage[]
): string {
  if (!branchPointMessageId || !messages) return '';

  const message = messages.find(m => m.id === branchPointMessageId);
  if (!message) return 'Branch point message';

  const preview = message.content.substring(0, 80);
  return preview + (message.content.length > 80 ? '...' : '');
}

/**
 * PathBreadcrumbs - Horizontal breadcrumb navigation showing path hierarchy
 *
 * Features:
 * - Shows path chain from root to active path
 * - Click parent paths to navigate back
 * - Auto-scroll to branch point messages
 * - Branch point indicators and tooltips
 * - Mobile-responsive with horizontal scroll
 *
 * @example
 * ```tsx
 * <PathBreadcrumbs
 *   activePath={activePath}
 *   paths={paths}
 *   messages={messages}
 *   onNavigate={handleBreadcrumbNavigate}
 *   className="px-4 pt-2"
 * />
 * ```
 */
export function PathBreadcrumbs({
  activePath,
  paths,
  messages,
  onNavigate,
  className,
}: PathBreadcrumbsProps) {
  const breadcrumbs = buildBreadcrumbChain(activePath, paths);

  if (breadcrumbs.length === 0) return null;

  const handlePathClick = (path: ClientPath, index: number) => {
    // If clicking a non-active path, navigate to it
    if (path.id !== activePath?.id) {
      // Find the next path in the chain (the child of this path)
      const nextPath = breadcrumbs[index + 1];

      // If there's a child path, it has a branch point message
      const branchPointMessageId = nextPath?.branchPointMessageId;

      onNavigate(path.id, {
        scrollToMessage: branchPointMessageId || undefined,
        highlightMessage: !!branchPointMessageId,
      });
    }
  };

  return (
    <nav
      className={cn('flex items-center gap-1 text-xs overflow-x-auto', className)}
      aria-label="Path breadcrumb navigation"
    >
      {breadcrumbs.map((path, index) => {
        const isActive = path.id === activePath?.id;
        const nextPath = breadcrumbs[index + 1];
        const branchPointPreview = getBranchPointPreview(
          nextPath?.branchPointMessageId,
          messages
        );

        return (
          <Fragment key={path.id}>
            {index > 0 && (
              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}

            <button
              onClick={() => handlePathClick(path, index)}
              disabled={isActive}
              className={cn(
                'transition-colors whitespace-nowrap flex items-center',
                isActive
                  ? 'font-semibold text-foreground cursor-default'
                  : 'hover:underline text-muted-foreground hover:text-foreground'
              )}
              title={
                branchPointPreview
                  ? `Next branch originated from: "${branchPointPreview}"`
                  : path.name || (path.isPrimary ? 'Primary path' : 'Branch')
              }
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Navigate to ${path.name || (path.isPrimary ? 'Primary path' : 'Branch')}`}
            >
              {path.name || (path.isPrimary ? 'Primary' : `Branch ${path.id.slice(0, 6)}`)}

              {nextPath?.branchPointMessageId && (
                <MessageCircle className="ml-1 h-2.5 w-2.5 inline opacity-50" />
              )}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
