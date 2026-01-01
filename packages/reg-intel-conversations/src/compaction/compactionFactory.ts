/**
 * Compaction Factory
 *
 * Creates compaction strategy instances based on configuration.
 */

import type {
  MessageCompactor,
  PathCompactionStrategy,
  MergeCompactionStrategy,
  SlidingWindowConfig,
  SemanticConfig,
  HybridConfig,
  MergeCompactionConfig,
} from './types.js';
import { NoneCompactor } from './strategies/NoneCompactor.js';
import { SlidingWindowCompactor } from './strategies/SlidingWindowCompactor.js';
import { SemanticCompactor } from './strategies/SemanticCompactor.js';
import { HybridCompactor } from './strategies/HybridCompactor.js';
import { ModerateMergeCompactor } from './strategies/ModerateMergeCompactor.js';

/**
 * Get a path compaction strategy
 */
export const getPathCompactor = (
  strategy: PathCompactionStrategy,
  config?: SlidingWindowConfig | SemanticConfig | HybridConfig
): MessageCompactor => {
  switch (strategy) {
    case 'none':
      return new NoneCompactor();

    case 'sliding_window':
      return new SlidingWindowCompactor(config as SlidingWindowConfig);

    case 'semantic':
      return new SemanticCompactor(config as SemanticConfig);

    case 'hybrid':
      return new HybridCompactor(config as HybridConfig);

    default:
      console.warn(`Unknown path compaction strategy: ${strategy}, using 'none'`);
      return new NoneCompactor();
  }
};

/**
 * Get a merge compaction strategy
 */
export const getMergeCompactor = (
  strategy: MergeCompactionStrategy,
  config?: MergeCompactionConfig
): MessageCompactor => {
  switch (strategy) {
    case 'none':
      return new NoneCompactor();

    case 'minimal':
      // Minimal = just deduplication, no summarization
      return new ModerateMergeCompactor({
        ...config,
        strategy: 'minimal',
        deduplicate: true,
        mergeConsecutive: false,
        useLlm: false,
      });

    case 'moderate':
      return new ModerateMergeCompactor(config);

    case 'aggressive':
      // Aggressive = all features enabled
      return new ModerateMergeCompactor({
        ...config,
        strategy: 'aggressive',
        deduplicate: true,
        mergeConsecutive: true,
        useLlm: true,
      });

    default:
      console.warn(`Unknown merge compaction strategy: ${strategy}, using 'none'`);
      return new NoneCompactor();
  }
};

/**
 * Default path compaction configuration
 */
export const DEFAULT_PATH_COMPACTION_CONFIG: SlidingWindowConfig = {
  windowSize: 50,
  summarizeOld: false,
  keepSystemMessages: true,
};

/**
 * Default merge compaction configuration
 */
export const DEFAULT_MERGE_COMPACTION_CONFIG = {
  strategy: 'none' as MergeCompactionStrategy,
  deduplicate: true,
  mergeConsecutive: false,
};
