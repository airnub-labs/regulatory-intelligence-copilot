/**
 * Core types for the event hub infrastructure
 */

/**
 * SSE subscriber interface for receiving events
 *
 * Implementations of this interface are used to send events to connected clients
 * via Server-Sent Events (SSE).
 */
export interface SseSubscriber<TEvent extends string> {
  /**
   * Send an event to the subscriber
   * @param event The event type
   * @param data The event payload
   */
  send(event: TEvent, data: unknown): void;

  /**
   * Optional callback invoked when the subscriber is unsubscribed
   */
  onClose?(): void;
}

/**
 * Wrapper for events distributed across instances
 *
 * Contains the original event plus metadata for cross-instance communication.
 */
export interface DistributedEventMessage<TEvent extends string> {
  /** The event type */
  event: TEvent;
  /** The event payload */
  data: unknown;
  /** Unix timestamp when the event was created */
  timestamp: number;
  /** Unique identifier of the instance that published the event (for echo prevention) */
  instanceId?: string;
}

/**
 * Health check result from an event hub
 */
export interface HealthCheckResult {
  healthy: boolean;
  error?: string;
}

/**
 * Base interface for event hub implementations
 *
 * Event hubs manage SSE subscriptions and broadcast events to all connected clients
 * across multiple server instances.
 */
export interface EventHub<TEvent extends string, TKeyArgs extends unknown[]> {
  /**
   * Subscribe a client to receive events
   * @param args Key arguments that identify the subscription scope
   * @param subscriber The SSE subscriber to receive events
   * @returns Unsubscribe function
   */
  subscribe(...args: [...TKeyArgs, SseSubscriber<TEvent>]): () => void;

  /**
   * Unsubscribe a client from receiving events
   * @param args Key arguments plus the subscriber to remove
   */
  unsubscribe(...args: [...TKeyArgs, SseSubscriber<TEvent>]): void;

  /**
   * Broadcast an event to all subscribers
   * @param args Key arguments, event type, and event data
   */
  broadcast(...args: [...TKeyArgs, TEvent, unknown]): void;

  /**
   * Graceful shutdown - cleanup all subscriptions
   */
  shutdown(): Promise<void>;

  /**
   * Check if the event hub is healthy
   */
  healthCheck(): Promise<HealthCheckResult>;
}
