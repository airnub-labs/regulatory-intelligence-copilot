import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

export type StreamingStage = 'analyzing' | 'querying' | 'generating' | 'complete';

interface ProgressIndicatorProps {
  currentStage: StreamingStage;
}

interface StageInfo {
  name: string;
  label: string;
}

const stages: StageInfo[] = [
  { name: 'analyzing', label: 'Analyzing query' },
  { name: 'querying', label: 'Querying regulatory graph' },
  { name: 'generating', label: 'Generating response' },
];

export function ProgressIndicator({ currentStage }: ProgressIndicatorProps) {
  const getStageStatus = (stageName: string): 'completed' | 'in_progress' | 'pending' => {
    const stageIndex = stages.findIndex((s) => s.name === stageName);
    const currentIndex = stages.findIndex((s) => s.name === currentStage);

    if (currentStage === 'complete') return 'completed';
    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'in_progress';
    return 'pending';
  };

  const renderIcon = (status: 'completed' | 'in_progress' | 'pending') => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'in_progress':
        return (
          <Loader2 className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-spin" />
        );
      case 'pending':
        return <Circle className="w-4 h-4 text-gray-400 dark:text-gray-600" />;
    }
  };

  if (currentStage === 'complete') {
    return null; // Don't show when complete
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Processing your request...
      </div>
      <div className="space-y-2">
        {stages.map((stage) => {
          const status = getStageStatus(stage.name);
          const textColor =
            status === 'completed'
              ? 'text-green-600 dark:text-green-400'
              : status === 'in_progress'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-500';

          return (
            <div key={stage.name} className="flex items-center gap-2">
              {renderIcon(status)}
              <span className={`text-sm ${textColor}`}>{stage.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
