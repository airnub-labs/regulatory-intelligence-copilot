'use client';

import { Fragment, useRef, useCallback, KeyboardEvent } from 'react';
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
 * - Keyboard navigation (arrow keys + Enter)
 * - Auto-hides when only one path (no navigation needed)
 * - Mobile-responsive with horizontal scroll
 * - Smart truncation for long path names
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
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Auto-hide if only one path (nothing to navigate to)
  if (breadcrumbs.length <= 1) return null;

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

  /**
   * Keyboard navigation handler
   * Only works when breadcrumb buttons have focus
   * Doesn't interfere with text input/textarea/contenteditable
   */
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, index: number) => {
    // Only handle if the event target is a button (not input/textarea)
    const target = event.target as HTMLElement;
    if (target.tagName !== 'BUTTON') return;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        // Move focus to previous breadcrumb
        if (index > 0) {
          buttonRefs.current[index - 1]?.focus();
        }
        break;

      case 'ArrowRight':
        event.preventDefault();
        // Move focus to next breadcrumb
        if (index < breadcrumbs.length - 1) {
          buttonRefs.current[index + 1]?.focus();
        }
        break;

      case 'Home':
        event.preventDefault();
        // Jump to first breadcrumb
        buttonRefs.current[0]?.focus();
        break;

      case 'End':
        event.preventDefault();
        // Jump to last breadcrumb
        buttonRefs.current[breadcrumbs.length - 1]?.focus();
        break;
    }
  }, [breadcrumbs.length]);

  return (
    <nav
      className={cn('flex items-center gap-1 text-xs overflow-x-auto', className)}
      aria-label="Path breadcrumb navigation"
      role="navigation"
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
              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            )}

            <button
              ref={(el) => { buttonRefs.current[index] = el; }}
              onClick={() => handlePathClick(path, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              disabled={isActive}
              className={cn(
                'transition-colors whitespace-nowrap flex items-center',
                'max-w-[200px] overflow-hidden text-ellipsis', // Smart truncation
                isActive
                  ? 'font-semibold text-foreground cursor-default'
                  : 'hover:underline text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 rounded-sm px-1'
              )}
              title={
                branchPointPreview
                  ? `Next branch originated from: "${branchPointPreview}"`
                  : path.name || (path.isPrimary ? 'Primary path' : 'Branch')
              }
              aria-current={isActive ? 'page' : undefined}
              aria-label={`Navigate to ${path.name || (path.isPrimary ? 'Primary path' : 'Branch')}. Use arrow keys to navigate between breadcrumbs.`}
              tabIndex={isActive ? -1 : 0}
            >
              <span className="truncate">
                {path.name || (path.isPrimary ? 'Primary' : `Branch ${path.id.slice(0, 6)}`)}
              </span>

              {nextPath?.branchPointMessageId && (
                <MessageCircle className="ml-1 h-2.5 w-2.5 flex-shrink-0 inline opacity-50" aria-hidden="true" />
              )}
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}
