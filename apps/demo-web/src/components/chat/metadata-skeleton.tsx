import { Card } from '@/components/ui/card';

interface MetadataSkeletonProps {
  stage?: 'analyzing' | 'querying' | 'generating';
}

export function MetadataSkeleton({ stage = 'analyzing' }: MetadataSkeletonProps) {
  const getStageMessage = () => {
    switch (stage) {
      case 'analyzing':
        return 'Analyzing query...';
      case 'querying':
        return 'Querying regulatory graph...';
      case 'generating':
        return 'Generating response...';
      default:
        return 'Loading...';
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-4 mb-4">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {/* Agent Skeleton */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Agent:
          </span>
          <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Jurisdictions Skeleton */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Jurisdictions:
          </span>
          <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Uncertainty Skeleton */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Uncertainty:
          </span>
          <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Nodes Skeleton */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Nodes:
          </span>
          <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Stage Message */}
        <div className="w-full mt-2">
          <span className="text-blue-600 dark:text-blue-400 text-xs font-medium animate-pulse">
            {getStageMessage()}
          </span>
        </div>
      </div>
    </Card>
  );
}
