/**
 * Shared event hub utilities - re-exported from @reg-copilot/reg-intel-eventhub
 *
 * This module provides backwards compatibility for existing code that imports
 * from this file. New code should import directly from @reg-copilot/reg-intel-eventhub.
 *
 * @deprecated Import from '@reg-copilot/reg-intel-eventhub' instead
 */

export {
  type DistributedEventMessage,
  LocalSubscriptionManager,
  ChannelLifecycleManager,
  generateInstanceId,
} from '@reg-copilot/reg-intel-eventhub';
