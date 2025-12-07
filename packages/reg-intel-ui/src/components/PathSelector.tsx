'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  ChevronDown,
  GitBranch,
  Check,
  Archive,
  Trash2,
  Edit3,
  GitMerge,
} from 'lucide-react';

import { useConversationPaths } from '../hooks/useConversationPaths';
import { cn, formatRelativeDate, buildPathTree, flattenPathTree } from '../utils';
import type { BaseComponentProps, ClientPath, PathSelectorVariant } from '../types';

export interface PathSelectorProps extends BaseComponentProps {
  /** Visual variant */
  variant?: PathSelectorVariant;
  /** Show branch count badge */
  showBranchCount?: boolean;
  /** Show message count */
  showMessageCount?: boolean;
  /** Callback when user wants to rename a path */
  onRename?: (path: ClientPath) => void;
  /** Callback when user wants to merge a path */
  onMerge?: (path: ClientPath) => void;
  /** Callback when user wants to delete a path */
  onDelete?: (path: ClientPath) => void;
  /** Disabled state */
  disabled?: boolean;
}

/**
 * PathSelector - Dropdown for selecting the active conversation path
 *
 * @example
 * ```tsx
 * <PathSelector
 *   variant="default"
 *   showBranchCount
 *   onMerge={(path) => setMergeDialogPath(path)}
 * />
 * ```
 */
export function PathSelector({
  className,
  variant = 'default',
  showBranchCount = true,
  showMessageCount = false,
  onRename,
  onMerge,
  onDelete,
  disabled = false,
}: PathSelectorProps) {
  const { paths, activePath, switchPath, isLoading } = useConversationPaths();
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-md bg-muted animate-pulse',
          className
        )}
      >
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (!activePath) {
    return null;
  }

  // Build tree for display
  const tree = buildPathTree(paths);
  const flatPaths = flattenPathTree(tree);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-md transition-colors',
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:opacity-50 disabled:pointer-events-none',
          variant === 'minimal' && 'border-0 bg-transparent px-2',
          variant === 'compact' && 'px-2 py-1 text-sm',
          className
        )}
      >
        <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="truncate max-w-[150px]">
          {activePath.name ?? (activePath.isPrimary ? 'Main' : 'Unnamed Branch')}
        </span>
        {showBranchCount && paths.length > 1 && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {paths.length}
          </span>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={cn(
            'z-50 min-w-[220px] max-w-[320px] overflow-hidden rounded-md',
            'border bg-popover p-1 text-popover-foreground shadow-md',
            'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
          )}
          sideOffset={4}
          align="start"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Conversation Paths
          </DropdownMenu.Label>

          <DropdownMenu.Separator className="my-1 h-px bg-muted" />

          {flatPaths.map(({ path, depth }) => (
            <DropdownMenu.Item
              key={path.id}
              className={cn(
                'relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                'cursor-pointer outline-none transition-colors',
                'focus:bg-accent focus:text-accent-foreground',
                'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
                activePath.id === path.id && 'bg-accent'
              )}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              onSelect={() => switchPath(path.id)}
            >
              {activePath.id === path.id && (
                <Check className="h-4 w-4 shrink-0" />
              )}
              {activePath.id !== path.id && (
                <div className="w-4" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">
                    {path.name ?? (path.isPrimary ? 'Main' : 'Unnamed')}
                  </span>
                  {path.isPrimary && (
                    <span className="text-xs text-muted-foreground bg-muted px-1 rounded">
                      primary
                    </span>
                  )}
                  {path.isMerged && (
                    <span className="text-xs text-orange-600 bg-orange-100 px-1 rounded">
                      merged
                    </span>
                  )}
                </div>
                {showMessageCount && (
                  <div className="text-xs text-muted-foreground">
                    {path.messageCount} messages
                  </div>
                )}
              </div>

              {/* Actions for non-primary paths */}
              {!path.isPrimary && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                  {onRename && (
                    <button
                      className="p-1 rounded hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRename(path as ClientPath);
                      }}
                    >
                      <Edit3 className="h-3 w-3" />
                    </button>
                  )}
                  {onMerge && !path.isMerged && (
                    <button
                      className="p-1 rounded hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMerge(path as ClientPath);
                      }}
                    >
                      <GitMerge className="h-3 w-3" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="p-1 rounded hover:bg-destructive hover:text-destructive-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(path as ClientPath);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              )}
            </DropdownMenu.Item>
          ))}

          {paths.filter(p => !p.isActive).length > 0 && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-muted" />
              <DropdownMenu.Label className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Archive className="h-3 w-3" />
                Archived
              </DropdownMenu.Label>
              {paths
                .filter(p => !p.isActive)
                .map(path => (
                  <DropdownMenu.Item
                    key={path.id}
                    className={cn(
                      'relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                      'cursor-pointer outline-none transition-colors opacity-60',
                      'focus:bg-accent focus:text-accent-foreground'
                    )}
                    onSelect={() => switchPath(path.id)}
                  >
                    <div className="w-4" />
                    <span className="truncate">
                      {path.name ?? 'Unnamed'}
                    </span>
                  </DropdownMenu.Item>
                ))}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
