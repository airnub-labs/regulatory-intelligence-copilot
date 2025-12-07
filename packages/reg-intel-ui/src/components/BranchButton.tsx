'use client';

import { GitBranch } from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';

import { cn } from '../utils';
import type { BaseComponentProps, ButtonVariant, ButtonSize } from '../types';

export interface BranchButtonProps extends BaseComponentProps {
  /** Button click handler */
  onClick: () => void;
  /** Button variant */
  variant?: ButtonVariant;
  /** Button size */
  size?: ButtonSize;
  /** Tooltip text */
  tooltip?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Show text label */
  showLabel?: boolean;
  /** Custom label */
  label?: string;
}

/**
 * BranchButton - Button to trigger branch creation from a message
 *
 * @example
 * ```tsx
 * <BranchButton
 *   onClick={() => setBranchFromMessage(message)}
 *   tooltip="Create a new branch from this message"
 * />
 * ```
 */
export function BranchButton({
  className,
  onClick,
  variant = 'ghost',
  size = 'icon',
  tooltip = 'Branch from here',
  disabled = false,
  showLabel = false,
  label = 'Branch',
}: BranchButtonProps) {
  const buttonContent = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:pointer-events-none',
        // Variants
        variant === 'default' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'outline' && 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        variant === 'ghost' && 'hover:bg-accent hover:text-accent-foreground',
        variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Sizes
        size === 'default' && 'h-10 px-4 py-2',
        size === 'sm' && 'h-9 px-3',
        size === 'lg' && 'h-11 px-8',
        size === 'icon' && 'h-8 w-8',
        className
      )}
    >
      <GitBranch className="h-4 w-4" />
      {showLabel && <span>{label}</span>}
    </button>
  );

  if (!tooltip || showLabel) {
    return buttonContent;
  }

  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{buttonContent}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className={cn(
              'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5',
              'text-sm text-popover-foreground shadow-md',
              'animate-in fade-in-0 zoom-in-95'
            )}
            sideOffset={4}
          >
            {tooltip}
            <Tooltip.Arrow className="fill-popover" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
