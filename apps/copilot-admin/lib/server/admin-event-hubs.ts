/**
 * Server-side singleton for admin event hubs
 *
 * Transport priority:
 * 1. Redis (if REDIS_URL is set) - Most reliable for local development
 * 2. Supabase Realtime - Fallback when Redis is unavailable
 *
 * This singleton ensures one set of event hubs per server instance.
 */

import {
  createAdminEventHubs,
  type AdminEventHubs,
  type RedisNotificationHub,
  type RedisSessionHub,
  type SupabaseNotificationHub,
  type SupabaseSessionHub,
} from "@reg-copilot/reg-intel-admin";
import { createClient } from "@supabase/supabase-js";
import Redis from "ioredis";

// Singleton storage using a WeakMap-like pattern to handle HMR
declare global {
  var __adminEventHubs: AdminEventHubs | undefined;
  var __adminEventHubsRedisClients: { pub: Redis; sub: Redis } | undefined;
}

/**
 * Create Redis pub/sub client wrapper that implements the eventhub interface
 */
function createRedisPubSubClient(redis: Redis) {
  const handlers = new Map<string, (message: string) => void>();

  // Set up message handler
  redis.on("message", (channel: string, message: string) => {
    const handler = handlers.get(channel);
    if (handler) {
      handler(message);
    }
  });

  return {
    async publish(channel: string, message: string): Promise<number> {
      return redis.publish(channel, message);
    },
    async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
      handlers.set(channel, handler);
      await redis.subscribe(channel);
    },
    async unsubscribe(channel: string): Promise<void> {
      handlers.delete(channel);
      await redis.unsubscribe(channel);
    },
    async ping(): Promise<string> {
      return redis.ping();
    },
  };
}

/**
 * Try to create Redis clients for event hub
 * Returns null if Redis is not available
 */
function tryCreateRedisClients(): { pub: Redis; sub: Redis } | null {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  try {
    const pub = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false, // Don't send INFO command
      lazyConnect: false,
    });

    const sub = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false, // CRITICAL: subscriber mode can't handle INFO command
      lazyConnect: false,
    });

    return { pub, sub };
  } catch (error) {
    console.warn("[AdminEventHubs] Failed to create Redis clients:", error);
    return null;
  }
}

/**
 * Get the admin event hubs singleton
 *
 * Creates the hubs on first call, reuses on subsequent calls.
 * Prefers Redis if available, falls back to Supabase Realtime.
 */
export function getAdminEventHubs(): AdminEventHubs {
  // Return existing singleton if available
  if (global.__adminEventHubs) {
    return global.__adminEventHubs;
  }

  // Try Redis first
  let redisClients = global.__adminEventHubsRedisClients;
  if (!redisClients) {
    const newClients = tryCreateRedisClients();
    if (newClients) {
      redisClients = newClients;
      global.__adminEventHubsRedisClients = newClients;
    }
  }

  if (redisClients) {
    const hubs = createAdminEventHubs({
      redis: {
        clients: {
          pub: createRedisPubSubClient(redisClients.pub),
          sub: createRedisPubSubClient(redisClients.sub),
        },
        prefix: "copilot-admin:events",
      },
    });

    global.__adminEventHubs = hubs;
    console.log("[AdminEventHubs] Initialized with Redis transport");
    return hubs;
  }

  // Fall back to Supabase Realtime
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Admin event hubs require REDIS_URL or (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  const supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const hubs = createAdminEventHubs({
    supabase: {
      client: supabaseClient,
      prefix: "copilot-admin:events",
    },
  });

  global.__adminEventHubs = hubs;
  console.log("[AdminEventHubs] Initialized with Supabase Realtime transport");

  return hubs;
}

/**
 * Get the notification hub directly
 */
export function getNotificationHub(): RedisNotificationHub | SupabaseNotificationHub {
  const { notificationHub } = getAdminEventHubs();
  return notificationHub;
}

/**
 * Get the session hub directly
 */
export function getSessionHub(): RedisSessionHub | SupabaseSessionHub {
  const { sessionHub } = getAdminEventHubs();
  return sessionHub;
}

/**
 * Shutdown the admin event hubs (for graceful shutdown)
 */
export async function shutdownAdminEventHubs(): Promise<void> {
  if (global.__adminEventHubs) {
    const { notificationHub, sessionHub } = global.__adminEventHubs;
    await Promise.all([notificationHub.shutdown(), sessionHub.shutdown()]);
    global.__adminEventHubs = undefined;
    console.log("[AdminEventHubs] Shutdown complete");
  }

  if (global.__adminEventHubsRedisClients) {
    const { pub, sub } = global.__adminEventHubsRedisClients;
    await Promise.all([pub.quit(), sub.quit()]);
    global.__adminEventHubsRedisClients = undefined;
    console.log("[AdminEventHubs] Redis clients closed");
  }
}
