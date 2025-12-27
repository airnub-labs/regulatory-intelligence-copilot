'use client';

import { useState } from 'react';
import { GitBranch, GitMerge } from 'lucide-react';
import {
  useConversationPaths,
  useHasPathProvider,
  MergeDialog,
  type ClientPath,
  type MergeResult,
} from '@reg-copilot/reg-intel-ui';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface PathToolbarProps {
  /** Called when user switches to a different path */
  onPathSwitch?: (path: ClientPath) => void;
  /** Show merge controls */
  showMergeControls?: boolean;
  /** Compact mode */
  compact?: boolean;
  className?: string;
}

/**
 * Toolbar for path selection and management.
 * Only renders when inside a ConversationPathProvider.
 */
export function PathToolbar({
  onPathSwitch,
  showMergeControls = true,
  compact = false,
  className,
}: PathToolbarProps) {
  const hasPathProvider = useHasPathProvider();

  if (!hasPathProvider) {
    return null;
  }

  return (
    <PathToolbarContent
      onPathSwitch={onPathSwitch}
      showMergeControls={showMergeControls}
      compact={compact}
      className={className}
    />
  );
}

interface PathToolbarContentProps extends PathToolbarProps {}

function PathToolbarContent({
  onPathSwitch,
  showMergeControls,
  compact,
  className,
}: PathToolbarContentProps) {
  const {
    paths,
    activePath,
    switchPath,
    isLoading,
    isMerging,
  } = useConversationPaths();

  // Merge dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [selectedBranchForMerge, setSelectedBranchForMerge] = useState<ClientPath | null>(null);

  const handleMergeClick = () => {
    // Get active branch paths (excluding primary)
    const branchPaths = paths.filter(p => !p.isPrimary && p.isActive && !p.isMerged);

    if (branchPaths.length === 0) {
      return; // No branches to merge
    }

    // If only one branch, select it automatically
    if (branchPaths.length === 1) {
      setSelectedBranchForMerge(branchPaths[0]);
      setMergeDialogOpen(true);
    } else {
      // Multiple branches - select the first non-current branch, or first if all are non-current
      const nonCurrentBranch = branchPaths.find(p => p.id !== activePath?.id) || branchPaths[0];
      setSelectedBranchForMerge(nonCurrentBranch);
      setMergeDialogOpen(true);
    }
  };

  const handleMergeComplete = async (result: MergeResult) => {
    // Switch to target path after merge
    if (result.targetPath?.id) {
      await switchPath(result.targetPath.id);
      const newPath = paths.find(p => p.id === result.targetPath.id);
      if (newPath && onPathSwitch) {
        onPathSwitch(newPath);
      }
    }
    setMergeDialogOpen(false);
    setSelectedBranchForMerge(null);
  };

  const handlePathChange = async (pathId: string) => {
    await switchPath(pathId);
    const newPath = paths.find(p => p.id === pathId);
    if (newPath && onPathSwitch) {
      onPathSwitch(newPath);
    }
  };

  // Get branch paths (non-primary)
  const branchPaths = paths.filter(p => !p.isPrimary && p.isActive);
  const hasBranches = branchPaths.length > 0;

  // Build path tree for display with depth-aware prefixes
  const buildPathLabel = (path: ClientPath): string => {
    if (path.isPrimary) {
      return path.name || 'Primary';
    }

    // Calculate depth for enhanced tree visualization
    let depth = 0;
    let current = path;
    const pathMap = new Map(paths.map(p => [p.id, p]));

    while (current.parentPathId) {
      depth++;
      const parent = pathMap.get(current.parentPathId);
      if (!parent) break;
      current = parent;
    }

    // Generate prefix based on depth
    let prefix = '';
    if (depth === 0) {
      prefix = '';
    } else if (depth === 1) {
      prefix = '  └─ ';
    } else {
      prefix = '  '.repeat(depth) + '└─ ';
    }

    return prefix + (path.name || `Branch ${path.id.slice(0, 6)}`);
  };

  if (paths.length <= 1) {
    // Only show if there are multiple paths
    return null;
  }

  if (compact) {
    return (
      <>
        <div className={`flex items-center gap-2 ${className || ''}`}>
          <Select
            value={activePath?.id || ''}
            onValueChange={handlePathChange}
            disabled={isLoading}
          >
            <SelectTrigger className="h-7 w-[160px] text-xs">
              <GitBranch className="mr-1 h-3 w-3" />
              <SelectValue placeholder="Select path" />
            </SelectTrigger>
            <SelectContent>
              {paths.filter(p => p.isActive).map(path => (
                <SelectItem key={path.id} value={path.id}>
                  <span className="flex items-center gap-1">
                    {path.isPrimary && <Badge variant="secondary" className="h-4 px-1 text-[10px]">Primary</Badge>}
                    <span className="truncate">{path.name || `Path ${path.id.slice(0, 6)}`}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showMergeControls && hasBranches && activePath?.isPrimary && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={handleMergeClick}
              disabled={isMerging}
            >
              <GitMerge className="mr-1 h-3 w-3" />
              Merge
            </Button>
          )}
        </div>

        {selectedBranchForMerge && (
          <MergeDialog
            open={mergeDialogOpen}
            onOpenChange={setMergeDialogOpen}
            sourcePath={selectedBranchForMerge}
            onMergeComplete={handleMergeComplete}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className={`flex items-center gap-3 ${className || ''}`}>
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Path:</span>
          <Select
            value={activePath?.id || ''}
            onValueChange={handlePathChange}
            disabled={isLoading}
          >
            <SelectTrigger className="h-8 min-w-[180px]">
              <SelectValue placeholder="Select path" />
            </SelectTrigger>
            <SelectContent>
              {paths.filter(p => p.isActive).map(path => (
                <SelectItem key={path.id} value={path.id}>
                  <span className="flex items-center gap-2">
                    {path.isPrimary ? (
                      <Badge variant="default" className="h-5 px-1.5 text-[10px]">Primary</Badge>
                    ) : (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">Branch</Badge>
                    )}
                    <span>{buildPathLabel(path)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showMergeControls && hasBranches && (
          <div className="flex items-center gap-1 border-l pl-3">
            <span className="text-xs text-muted-foreground">
              {branchPaths.length} branch{branchPaths.length !== 1 ? 'es' : ''}
            </span>
            {activePath?.isPrimary && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={handleMergeClick}
                disabled={isMerging}
              >
                <GitMerge className="mr-1 h-3 w-3" />
                Merge Branch
              </Button>
            )}
          </div>
        )}

        {activePath && !activePath.isPrimary && (
          <Badge variant="secondary" className="text-xs">
            Viewing branch
          </Badge>
        )}
      </div>

      {selectedBranchForMerge && (
        <MergeDialog
          open={mergeDialogOpen}
          onOpenChange={setMergeDialogOpen}
          sourcePath={selectedBranchForMerge}
          onMergeComplete={handleMergeComplete}
        />
      )}
    </>
  );
}

export default PathToolbar;
