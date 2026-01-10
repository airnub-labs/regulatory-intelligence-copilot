/**
 * Manages the lifecycle of distributed channels (Redis pub/sub or Supabase Realtime)
 *
 * Handles:
 * - Lazy initialization: Channels are only created when first subscriber connects
 * - Promise deduplication: Prevents multiple concurrent channel creations for the same key
 * - Graceful cleanup: Channels are removed when no longer needed
 *
 * ## Usage
 *
 * ```typescript
 * const manager = new ChannelLifecycleManager<RealtimeChannel>();
 *
 * // Get or create a channel (with factory function)
 * const channel = await manager.getOrCreate('my-channel', async () => {
 *   return await createAndSubscribeChannel('my-channel');
 * });
 *
 * // Take (remove and return) a channel
 * const channelPromise = manager.take('my-channel');
 *
 * // Shutdown all channels
 * await manager.shutdown(async (name, channelPromise) => {
 *   const channel = await channelPromise;
 *   await channel.unsubscribe();
 * });
 * ```
 */
export class ChannelLifecycleManager<TChannel> {
  private readonly channels = new Map<string, Promise<TChannel>>();

  /**
   * Get an existing channel or create a new one
   *
   * Uses promise-based deduplication to prevent multiple concurrent creations
   * for the same channel name.
   *
   * @param channelName The unique name/identifier for the channel
   * @param factory Async function to create the channel if it doesn't exist
   * @returns Promise resolving to the channel
   */
  getOrCreate(channelName: string, factory: () => Promise<TChannel>): Promise<TChannel> {
    const existing = this.channels.get(channelName);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      try {
        return await factory();
      } catch (error) {
        // Remove failed channel creation from cache to allow retry
        this.channels.delete(channelName);
        throw error;
      }
    })();

    this.channels.set(channelName, promise);
    return promise;
  }

  /**
   * Check if a channel exists
   */
  has(channelName: string): boolean {
    return this.channels.has(channelName);
  }

  /**
   * Get a channel without creating it
   */
  get(channelName: string): Promise<TChannel> | undefined {
    return this.channels.get(channelName);
  }

  /**
   * Take (remove and return) a channel
   *
   * Useful when cleaning up a channel that is no longer needed.
   *
   * @param channelName The channel name to remove
   * @returns The channel promise, or undefined if not found
   */
  take(channelName: string): Promise<TChannel> | undefined {
    const channel = this.channels.get(channelName);
    this.channels.delete(channelName);
    return channel;
  }

  /**
   * Get the number of active channels
   */
  get size(): number {
    return this.channels.size;
  }

  /**
   * Shutdown all channels
   *
   * Calls the provided unsubscribe function for each channel.
   *
   * @param unsubscribe Function to unsubscribe/cleanup each channel
   */
  async shutdown(
    unsubscribe: (channelName: string, channel: Promise<TChannel>) => Promise<void>,
  ): Promise<void> {
    const unsubscribePromises = Array.from(this.channels.entries()).map(
      ([name, channel]: [string, Promise<TChannel>]) => unsubscribe(name, channel),
    );
    this.channels.clear();
    await Promise.all(unsubscribePromises);
  }
}
