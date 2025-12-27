import { createLogger } from '@reg-copilot/reg-intel-observability';
import type { ConversationRecord } from './conversationStores.js';

const logger = createLogger('AuthorizationService');

/**
 * Authorization check result
 */
export interface AuthorizationCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * Authorization service interface
 * Provides a unified interface for different authorization providers
 */
export interface AuthorizationService {
  /**
   * Check if a user can read a conversation
   */
  canRead(params: {
    conversation: ConversationRecord;
    userId: string | null;
    tenantId: string;
  }): Promise<AuthorizationCheck>;

  /**
   * Check if a user can write to a conversation
   */
  canWrite(params: {
    conversation: ConversationRecord;
    userId: string | null;
    tenantId: string;
    role?: 'user' | 'assistant' | 'system';
  }): Promise<AuthorizationCheck>;

  /**
   * Health check for the authorization service
   */
  healthCheck?(): Promise<{ healthy: boolean; error?: string }>;
}

/**
 * Supabase RLS-based authorization service
 * Uses Row Level Security policies and conversation metadata
 */
export class SupabaseRLSAuthorizationService implements AuthorizationService {
  async canRead(params: {
    conversation: ConversationRecord;
    userId: string | null;
    tenantId: string;
  }): Promise<AuthorizationCheck> {
    const { conversation, userId } = params;

    // Determine effective share audience
    const audience = conversation.shareAudience;

    // Public conversations can be read by anyone
    if (audience === 'public') {
      return { allowed: true, reason: 'public_conversation' };
    }

    // Tenant-wide conversations can be read by any user in the tenant
    if (audience === 'tenant') {
      return { allowed: true, reason: 'tenant_shared' };
    }

    // Private conversations can only be read by the owner
    // If no userId on conversation, it's accessible (system conversation)
    if (!conversation.userId) {
      return { allowed: true, reason: 'system_conversation' };
    }

    // Check if user is the owner
    if (userId && conversation.userId === userId) {
      return { allowed: true, reason: 'owner' };
    }

    return { allowed: false, reason: 'not_authorized' };
  }

  async canWrite(params: {
    conversation: ConversationRecord;
    userId: string | null;
    tenantId: string;
    role?: 'user' | 'assistant' | 'system';
  }): Promise<AuthorizationCheck> {
    const { conversation, userId, role } = params;

    // System and assistant messages are always allowed (for AI responses)
    if (role === 'assistant' || role === 'system') {
      return { allowed: true, reason: 'system_role' };
    }

    const audience = conversation.shareAudience;

    // Tenant conversations with edit access allow any tenant user to write
    if (audience === 'tenant' && conversation.tenantAccess === 'edit') {
      if (userId) {
        return { allowed: true, reason: 'tenant_edit_access' };
      }
    }

    // If no userId on conversation, it's writable (system conversation)
    if (!conversation.userId) {
      return { allowed: true, reason: 'system_conversation' };
    }

    // Check if user is the owner
    if (userId && conversation.userId === userId) {
      return { allowed: true, reason: 'owner' };
    }

    return { allowed: false, reason: 'not_authorized' };
  }
}

/**
 * OpenFGA-based authorization service
 * Uses OpenFGA for fine-grained relationship-based access control
 */
export class OpenFGAAuthorizationService implements AuthorizationService {
  private apiUrl: string;
  private storeId: string;
  private authorizationModelId?: string;

  constructor(config: { apiUrl: string; storeId: string; authorizationModelId?: string }) {
    this.apiUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    this.storeId = config.storeId;
    this.authorizationModelId = config.authorizationModelId;

    logger.info(
      {
        apiUrl: this.apiUrl,
        storeId: this.storeId,
        hasModelId: Boolean(this.authorizationModelId),
      },
      'OpenFGA authorization service initialized'
    );
  }

  /**
   * Check authorization using OpenFGA Check API
   * https://openfga.dev/api/service#/Relationship%20Queries/Check
   */
  private async checkTuple(params: {
    user: string;
    relation: string;
    object: string;
  }): Promise<boolean> {
    const url = `${this.apiUrl}/stores/${this.storeId}/check`;

    const body: any = {
      tuple_key: {
        user: params.user,
        relation: params.relation,
        object: params.object,
      },
    };

    // Include authorization model ID if provided
    if (this.authorizationModelId) {
      body.authorization_model_id = this.authorizationModelId;
    }

    try {
      logger.debug(
        {
          user: params.user,
          relation: params.relation,
          object: params.object,
        },
        'Checking OpenFGA tuple'
      );

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(
          {
            status: response.status,
            error: errorText,
          },
          'OpenFGA check request failed'
        );
        throw new Error(`OpenFGA check failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const allowed = result.allowed === true;

      logger.debug(
        {
          user: params.user,
          relation: params.relation,
          object: params.object,
          allowed,
        },
        'OpenFGA check result'
      );

      return allowed;
    } catch (error) {
      logger.error(
        {
          err: error,
          user: params.user,
          relation: params.relation,
          object: params.object,
        },
        'Error checking OpenFGA tuple'
      );
      throw error;
    }
  }

  async canRead(params: {
    conversation: ConversationRecord;
    userId: string | null;
    tenantId: string;
  }): Promise<AuthorizationCheck> {
    const { conversation, userId, tenantId } = params;

    // If no userId, deny access (OpenFGA requires a user)
    if (!userId) {
      return { allowed: false, reason: 'no_user_id' };
    }

    // Check if user has 'can_view' relation to the conversation
    // Errors are thrown to caller (e.g., HybridAuthorizationService) for fallback handling
    const allowed = await this.checkTuple({
      user: `user:${userId}`,
      relation: 'can_view',
      object: `conversation:${conversation.id}`,
    });

    return {
      allowed,
      reason: allowed ? 'openfga_authorized' : 'openfga_denied',
    };
  }

  async canWrite(params: {
    conversation: ConversationRecord;
    userId: string | null;
    tenantId: string;
    role?: 'user' | 'assistant' | 'system';
  }): Promise<AuthorizationCheck> {
    const { conversation, userId, tenantId, role } = params;

    // System and assistant messages are always allowed
    if (role === 'assistant' || role === 'system') {
      return { allowed: true, reason: 'system_role' };
    }

    // If no userId, deny access
    if (!userId) {
      return { allowed: false, reason: 'no_user_id' };
    }

    // Check if user has 'can_edit' relation to the conversation
    // Errors are thrown to caller (e.g., HybridAuthorizationService) for fallback handling
    const allowed = await this.checkTuple({
      user: `user:${userId}`,
      relation: 'can_edit',
      object: `conversation:${conversation.id}`,
    });

    return {
      allowed,
      reason: allowed ? 'openfga_authorized' : 'openfga_denied',
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const url = `${this.apiUrl}/stores/${this.storeId}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          healthy: false,
          error: `OpenFGA health check failed: ${response.status}`,
        };
      }

      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Hybrid authorization service
 * Falls back to Supabase RLS if OpenFGA is not configured or fails
 */
export class HybridAuthorizationService implements AuthorizationService {
  private openfgaService?: OpenFGAAuthorizationService;
  private rlsService: SupabaseRLSAuthorizationService;

  constructor(conversation: ConversationRecord, openfgaConfig?: { apiUrl: string; storeId: string; authorizationModelId?: string }) {
    this.rlsService = new SupabaseRLSAuthorizationService();

    // Only initialize OpenFGA if conversation uses it
    if (conversation.authorizationModel === 'openfga' && openfgaConfig) {
      // Use conversation-specific config if available
      const storeId = conversation.authorizationSpec?.storeId ?? openfgaConfig.storeId;
      const authorizationModelId = conversation.authorizationSpec?.authorizationModelId ?? openfgaConfig.authorizationModelId;

      this.openfgaService = new OpenFGAAuthorizationService({
        apiUrl: openfgaConfig.apiUrl,
        storeId,
        authorizationModelId,
      });
    }
  }

  async canRead(params: {
    conversation: ConversationRecord;
    userId: string | null;
    tenantId: string;
  }): Promise<AuthorizationCheck> {
    const { conversation } = params;

    // Use OpenFGA if configured for this conversation
    if (conversation.authorizationModel === 'openfga' && this.openfgaService) {
      try {
        return await this.openfgaService.canRead(params);
      } catch (error) {
        logger.warn(
          {
            err: error,
            conversationId: conversation.id,
          },
          'OpenFGA check failed, falling back to RLS'
        );

        // Fall back to RLS on error
        const fallbackAudience = conversation.authorizationSpec?.fallbackShareAudience ?? 'private';
        const fallbackConversation = { ...conversation, shareAudience: fallbackAudience };
        return this.rlsService.canRead({ ...params, conversation: fallbackConversation });
      }
    }

    // Use Supabase RLS by default
    return this.rlsService.canRead(params);
  }

  async canWrite(params: {
    conversation: ConversationRecord;
    userId: string | null;
    tenantId: string;
    role?: 'user' | 'assistant' | 'system';
  }): Promise<AuthorizationCheck> {
    const { conversation } = params;

    // Use OpenFGA if configured for this conversation
    if (conversation.authorizationModel === 'openfga' && this.openfgaService) {
      try {
        return await this.openfgaService.canWrite(params);
      } catch (error) {
        logger.warn(
          {
            err: error,
            conversationId: conversation.id,
          },
          'OpenFGA check failed, falling back to RLS'
        );

        // Fall back to RLS on error
        const fallbackAudience = conversation.authorizationSpec?.fallbackShareAudience ?? 'private';
        const fallbackConversation = { ...conversation, shareAudience: fallbackAudience };
        return this.rlsService.canWrite({ ...params, conversation: fallbackConversation });
      }
    }

    // Use Supabase RLS by default
    return this.rlsService.canWrite(params);
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    if (this.openfgaService) {
      return this.openfgaService.healthCheck();
    }
    return { healthy: true };
  }
}

/**
 * Create an authorization service instance
 * Returns a service appropriate for the conversation's authorization model
 */
export function createAuthorizationService(
  conversation: ConversationRecord,
  config?: {
    openfga?: {
      apiUrl: string;
      storeId: string;
      authorizationModelId?: string;
    };
  }
): AuthorizationService {
  // If conversation uses OpenFGA and config is provided, use hybrid service
  if (conversation.authorizationModel === 'openfga' && config?.openfga) {
    return new HybridAuthorizationService(conversation, config.openfga);
  }

  // Default to Supabase RLS
  return new SupabaseRLSAuthorizationService();
}
