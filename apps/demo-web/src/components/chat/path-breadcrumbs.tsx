'use client';

import { useRef, useEffect, useState } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import {
  useConversationPaths,
  useHasPathProvider,
  type ClientPath,
} from '@reg-copilot/reg-intel-ui';
import { Button } from '@/components/ui/button';
import { scrollToMessage, cn } from '@/lib/utils';

interface PathBreadcrumbsProps {
  /** Called when user switches to a different path */
  onPathSwitch?: (path: ClientPath) => void;
  /** Custom class name */
  className?: string;
  /** Compact mode (smaller text/padding) */
  compact?: boolean;
}

/**
 * Breadcrumb navigation for conversation paths.
 *
 * Shows the chain from primary path to current path, with clickable
 * breadcrumbs that allow jumping to parent paths and scrolling to
 * branch point messages.
 *
 * Only renders when inside a ConversationPathProvider and when not
 * on the primary path (no breadcrumbs needed for primary).
 */
export function PathBreadcrumbs({
  onPathSwitch,
  className,
  compact = false,
}: PathBreadcrumbsProps) {
  const hasPathProvider = useHasPathProvider();

  if (!hasPathProvider) {
    return null;
  }

  return (
    <PathBreadcrumbsContent
      onPathSwitch={onPathSwitch}
      className={className}
      compact={compact}
    />
  );
}

interface PathBreadcrumbsContentProps extends PathBreadcrumbsProps {}

function PathBreadcrumbsContent({
  onPathSwitch,
  className,
  compact = false,
}: PathBreadcrumbsContentProps) {
  const {
    paths,
    activePath,
    switchPath,
    isLoading,
  } = useConversationPaths();

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Build breadcrumb chain from primary to active path
  const breadcrumbs: ClientPath[] = [];
  if (activePath) {
    const pathMap = new Map(paths.map(p => [p.id, p]));
    let current = activePath;

    // Walk up the parent chain
    while (current) {
      breadcrumbs.unshift(current);
      if (current.parentPathId) {
        const parent = pathMap.get(current.parentPathId);
        if (parent) {
          current = parent;
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }

  // Don't render if on primary path (no navigation needed)
  if (breadcrumbs.length <= 1) {
    return null;
  }

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!containerRef.current?.contains(document.activeElement)) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveIndex(prev => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveIndex(prev => Math.min(breadcrumbs.length - 1, prev + 1));
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault();
        const path = breadcrumbs[activeIndex];
        if (path) {
          handleBreadcrumbClick(path, activeIndex);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, breadcrumbs]);

  // Auto-scroll active breadcrumb into view
  useEffect(() => {
    if (containerRef.current && activeIndex >= 0) {
      const buttons = containerRef.current.querySelectorAll('button');
      const activeButton = buttons[activeIndex];
      if (activeButton) {
        activeButton.focus();
        activeButton.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }
    }
  }, [activeIndex]);

  const handleBreadcrumbClick = async (path: ClientPath, index: number) => {
    // If clicking the active path, do nothing
    if (path.id === activePath?.id) {
      return;
    }

    // Switch to the clicked path
    await switchPath(path.id);

    // Call onPathSwitch callback
    if (onPathSwitch) {
      onPathSwitch(path);
    }

    // If there's a next path in the chain, jump to its branch point message
    const nextPath = breadcrumbs[index + 1];
    if (nextPath?.branchPointMessageId) {
      // Delay to allow path switch to complete and DOM to update
      setTimeout(() => {
        scrollToMessage(nextPath.branchPointMessageId!, {
          highlight: true,
          highlightDuration: 2000,
          block: 'center',
        });
      }, 200);
    }
  };

  const getPathLabel = (path: ClientPath): string => {
    if (path.isPrimary) {
      return path.name || 'Primary';
    }
    return path.name || `Branch ${path.id.slice(0, 6)}`;
  };

  const getBranchPointTooltip = (path: ClientPath): string | null => {
    if (!path.branchPointMessageId) {
      return null;
    }
    return `Branched from message ${path.branchPointMessageId.slice(0, 8)}`;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex items-center gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent',
        compact ? 'text-xs' : 'text-sm',
        className
      )}
      role="navigation"
      aria-label="Path breadcrumbs"
    >
      {breadcrumbs.map((path, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const isActive = path.id === activePath?.id;
        const tooltip = getBranchPointTooltip(path);

        return (
          <div key={path.id} className="flex items-center gap-1 shrink-0">
            {/* Breadcrumb button */}
            <Button
              variant={isActive ? 'secondary' : 'ghost'}
              size={compact ? 'sm' : 'default'}
              className={cn(
                'font-medium transition-colors',
                compact ? 'h-6 px-2 text-xs' : 'h-8 px-3 text-sm',
                isActive
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
                !isActive && 'cursor-pointer'
              )}
              onClick={() => handleBreadcrumbClick(path, index)}
              disabled={isLoading || isActive}
              aria-current={isActive ? 'page' : undefined}
              title={tooltip || undefined}
            >
              {index === 0 && path.isPrimary && (
                <Home className={cn('mr-1', compact ? 'h-3 w-3' : 'h-4 w-4')} />
              )}
              <span className="truncate max-w-[200px]">
                {getPathLabel(path)}
              </span>
            </Button>

            {/* Separator */}
            {!isLast && (
              <ChevronRight
                className={cn(
                  'text-muted-foreground/50',
                  compact ? 'h-3 w-3' : 'h-4 w-4'
                )}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default PathBreadcrumbs;
