'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';

import { cn, formatRelativeDate } from '../utils.js';
import type { BaseComponentProps } from '../types.js';

export interface VersionNavigatorProps extends BaseComponentProps {
  /** Current version index (0-based) */
  currentIndex: number;
  /** Total number of versions */
  totalVersions: number;
  /** Timestamp of the current version */
  currentTimestamp?: Date | string;
  /** Callback when navigating to previous version */
  onPrevious: () => void;
  /** Callback when navigating to next version */
  onNext: () => void;
  /** Whether this is the original (first) version */
  isOriginal?: boolean;
  /** Whether this is the latest version */
  isLatest?: boolean;
  /** Size variant */
  size?: 'default' | 'sm';
}

/**
 * VersionNavigator - Navigate between message versions (edits)
 *
 * @example
 * ```tsx
 * <VersionNavigator
 *   currentIndex={1}
 *   totalVersions={3}
 *   currentTimestamp={new Date()}
 *   onPrevious={() => setVersionIndex(i => i - 1)}
 *   onNext={() => setVersionIndex(i => i + 1)}
 * />
 * ```
 */
export function VersionNavigator({
  className,
  currentIndex,
  totalVersions,
  currentTimestamp,
  onPrevious,
  onNext,
  isOriginal,
  isLatest,
  size = 'default',
}: VersionNavigatorProps) {
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < totalVersions - 1;

  const buttonClasses = cn(
    'inline-flex items-center justify-center rounded-md transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
    'disabled:opacity-50 disabled:pointer-events-none',
    'hover:bg-accent hover:text-accent-foreground',
    size === 'default' && 'h-7 w-7',
    size === 'sm' && 'h-5 w-5'
  );

  const iconClasses = cn(
    size === 'default' && 'h-4 w-4',
    size === 'sm' && 'h-3 w-3'
  );

  return (
    <Tooltip.Provider>
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-md bg-muted/50 px-1',
          size === 'default' && 'py-0.5',
          size === 'sm' && 'py-0',
          className
        )}
      >
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              onClick={onPrevious}
              disabled={!hasPrevious}
              className={buttonClasses}
              aria-label="Previous version"
            >
              <ChevronLeft className={iconClasses} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
              sideOffset={4}
            >
              Previous version
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>

        <div
          className={cn(
            'flex flex-col items-center px-2',
            size === 'default' && 'min-w-[60px]',
            size === 'sm' && 'min-w-[40px]'
          )}
        >
          <span
            className={cn(
              'font-medium tabular-nums',
              size === 'default' && 'text-sm',
              size === 'sm' && 'text-xs'
            )}
          >
            {currentIndex + 1} / {totalVersions}
          </span>
          {currentTimestamp && size === 'default' && (
            <span className="text-xs text-muted-foreground">
              {isOriginal
                ? 'Original'
                : isLatest
                ? 'Latest'
                : formatRelativeDate(currentTimestamp)}
            </span>
          )}
        </div>

        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              className={buttonClasses}
              aria-label="Next version"
            >
              <ChevronRight className={iconClasses} />
            </button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
              sideOffset={4}
            >
              Next version
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    </Tooltip.Provider>
  );
}
