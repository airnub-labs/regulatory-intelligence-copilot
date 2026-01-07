/**
 * Compaction System Initialization
 *
 * Central initialization and wiring for all compaction features.
 * Call this during application startup to enable compaction system.
 */

import {
  initSnapshotService,
  getSnapshotServiceIfInitialized,
  type SnapshotStorageProvider,
} from '@reg-copilot/reg-intel-conversations/compaction';
import {
  createLogger,
  initCompactionMetrics,
  initCostTracking,
  getCostTrackingServiceIfInitialized,
  type CostStorageProvider,
  type QuotaProvider,
} from '@reg-copilot/reg-intel-observability';

const logger = createLogger('CompactionInit');

/**
 * Initialize the compaction system
 *
 * This should be called once during application startup, after OpenTelemetry
 * is initialized but before any conversation operations.
 */
export async function initializeCompactionSystem(options: {
  /**
   * Snapshot storage provider (required for multi-instance safety)
   */
  snapshotStorage: SnapshotStorageProvider;

  /**
   * Snapshot TTL in hours
   * @default 24
   */
  snapshotTTLHours?: number;

  /**
   * Cost tracking storage provider
   */
  costStorage?: CostStorageProvider;

  /**
   * Quota provider for cost enforcement
   */
  quotaProvider?: QuotaProvider;

  /**
   * Whether to enforce cost quotas
   * @default false
   */
  enforceQuotas?: boolean;
}): Promise<void> {
  logger.info('Initializing compaction system...');

  try {
    if (!options?.snapshotStorage) {
      throw new Error('Snapshot storage provider is required to initialize the compaction system');
    }

    // 1. Initialize snapshot service for rollback support
    initSnapshotService(options.snapshotStorage, {
      snapshotTTLHours: options.snapshotTTLHours || 24,
    });
    logger.info('Snapshot service initialized');

    // 2. Initialize compaction metrics
    initCompactionMetrics();
    logger.info('Compaction metrics initialized');

    // 3. Initialize cost tracking (if storage/quotas provided)
    if (options?.costStorage || options?.quotaProvider) {
      initCostTracking({
        storage: options.costStorage,
        quotas: options.quotaProvider,
        enforceQuotas: options.enforceQuotas || false,
      });
      logger.info('Cost tracking initialized');
    }

    logger.info('Compaction system initialized successfully');
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to initialize compaction system'
    );
    throw error;
  }
}

/**
 * Get compaction system status
 */
export function getCompactionSystemStatus(): {
  snapshotService: boolean;
  compactionMetrics: boolean;
  costTracking: boolean;
} {
  try {
    return {
      snapshotService: getSnapshotServiceIfInitialized() !== null,
      compactionMetrics: true, // Metrics are always available after init
      costTracking: getCostTrackingServiceIfInitialized() !== null,
    };
  } catch {
    return {
      snapshotService: false,
      compactionMetrics: false,
      costTracking: false,
    };
  }
}
