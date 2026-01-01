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
} from './types.js';
import { NoneCompactor } from './strategies/NoneCompactor.js';
import { SlidingWindowCompactor } from './strategies/SlidingWindowCompactor.js';

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
      // TODO: Implement SemanticCompactor
      console.warn('Semantic compaction not yet implemented, falling back to sliding_window');
      return new SlidingWindowCompactor(config as SlidingWindowConfig);

    case 'hybrid':
      // TODO: Implement HybridCompactor
      console.warn('Hybrid compaction not yet implemented, falling back to sliding_window');
      return new SlidingWindowCompactor(config as SlidingWindowConfig);

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
  config?: any
): MessageCompactor => {
  switch (strategy) {
    case 'none':
      return new NoneCompactor();

    case 'minimal':
      // TODO: Implement MinimalMergeCompactor
      console.warn('Minimal merge compaction not yet implemented, using none');
      return new NoneCompactor();

    case 'moderate':
      // TODO: Implement ModerateMergeCompactor
      console.warn('Moderate merge compaction not yet implemented, using none');
      return new NoneCompactor();

    case 'aggressive':
      // TODO: Implement AggressiveMergeCompactor
      console.warn('Aggressive merge compaction not yet implemented, using none');
      return new NoneCompactor();

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
