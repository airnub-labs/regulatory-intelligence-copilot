import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface MessageVersionNavProps {
  currentIndex: number;
  totalVersions: number;
  currentTimestamp: Date;
  onPrevious: () => void;
  onNext: () => void;
  isOriginal?: boolean;
}

export function MessageVersionNav({
  currentIndex,
  totalVersions,
  currentTimestamp,
  onPrevious,
  onNext,
  isOriginal = false,
}: MessageVersionNavProps) {
  if (totalVersions <= 1) {
    return null; // Don't show navigation if only one version
  }

  const displayIndex = currentIndex + 1; // Convert to 1-based for display
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < totalVersions - 1;

  const versionLabel = isOriginal ? 'Original' : displayIndex === totalVersions ? 'Latest' : `Version ${displayIndex}`;
  const timeAgo = formatDistanceToNow(currentTimestamp, { addSuffix: true });

  return (
    <div className="flex flex-col items-center gap-1 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className="h-7 w-7 p-0"
          aria-label="Previous version"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[80px] text-center">
          {displayIndex} / {totalVersions}
        </span>

        <Button
          variant="ghost"
          size="sm"
          onClick={onNext}
          disabled={!canGoNext}
          className="h-7 w-7 p-0"
          aria-label="Next version"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        {versionLabel} • {timeAgo}
      </div>
    </div>
  );
}
