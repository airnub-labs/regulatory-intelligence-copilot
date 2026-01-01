/**
 * Cost Alert Notification Service
 *
 * Provides integrations for sending cost alerts to external services.
 * Currently provides stubs for Slack, Email, and PagerDuty integrations.
 *
 * @module notifications
 */

import type { CostQuota } from './types.js';

/**
 * Notification channel types
 */
export type NotificationChannel = 'slack' | 'email' | 'pagerduty';

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'critical';

/**
 * Alert payload structure
 */
export interface CostAlert {
  id: string;
  timestamp: Date;
  severity: AlertSeverity;
  type: 'quota_warning' | 'quota_exceeded' | 'spend_spike' | 'anomaly';
  quota: CostQuota;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Notification result
 */
export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  messageId?: string;
  error?: string;
}

/**
 * Slack notification configuration
 */
export interface SlackConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
}

/**
 * Email notification configuration
 */
export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  fromAddress: string;
  toAddresses: string[];
  useTls?: boolean;
}

/**
 * PagerDuty notification configuration
 */
export interface PagerDutyConfig {
  routingKey: string;
  serviceId?: string;
}

/**
 * Notification service configuration
 */
export interface NotificationConfig {
  slack?: SlackConfig;
  email?: EmailConfig;
  pagerduty?: PagerDutyConfig;
  enabledChannels: NotificationChannel[];
}

/**
 * Notification service interface
 */
export interface NotificationService {
  sendAlert(alert: CostAlert): Promise<NotificationResult[]>;
  sendToSlack(alert: CostAlert): Promise<NotificationResult>;
  sendEmail(alert: CostAlert): Promise<NotificationResult>;
  sendToPagerDuty(alert: CostAlert): Promise<NotificationResult>;
}

/**
 * Default notification service implementation
 *
 * This implementation provides stubs that log alerts.
 * Replace with actual implementations for production use.
 */
export class DefaultNotificationService implements NotificationService {
  private config: NotificationConfig;

  constructor(config?: Partial<NotificationConfig>) {
    this.config = {
      enabledChannels: config?.enabledChannels ?? [],
      slack: config?.slack,
      email: config?.email,
      pagerduty: config?.pagerduty,
    };
  }

  /**
   * Send alert to all enabled channels
   */
  async sendAlert(alert: CostAlert): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const channel of this.config.enabledChannels) {
      try {
        let result: NotificationResult;
        switch (channel) {
          case 'slack':
            result = await this.sendToSlack(alert);
            break;
          case 'email':
            result = await this.sendEmail(alert);
            break;
          case 'pagerduty':
            result = await this.sendToPagerDuty(alert);
            break;
          default:
            result = {
              success: false,
              channel,
              error: `Unknown channel: ${channel}`,
            };
        }
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          channel,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Send alert to Slack
   *
   * TODO: Implement actual Slack webhook integration
   * - POST to webhook URL with formatted message
   * - Use Block Kit for rich formatting
   * - Include buttons for quick actions (view dashboard, acknowledge)
   *
   * @see https://api.slack.com/messaging/webhooks
   */
  async sendToSlack(alert: CostAlert): Promise<NotificationResult> {
    if (!this.config.slack?.webhookUrl) {
      return {
        success: false,
        channel: 'slack',
        error: 'Slack webhook URL not configured',
      };
    }

    // TODO: Implement actual Slack webhook call
    // Example implementation:
    // const payload = {
    //   channel: this.config.slack.channel,
    //   username: this.config.slack.username ?? 'Cost Alert Bot',
    //   icon_emoji: this.config.slack.iconEmoji ?? ':money_with_wings:',
    //   blocks: this.formatSlackBlocks(alert),
    // };
    //
    // const response = await fetch(this.config.slack.webhookUrl, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload),
    // });
    //
    // return {
    //   success: response.ok,
    //   channel: 'slack',
    //   error: response.ok ? undefined : await response.text(),
    // };

    console.log('[STUB] Slack notification would be sent:', {
      webhookUrl: this.config.slack.webhookUrl.substring(0, 50) + '...',
      alert: {
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        quota: {
          scope: alert.quota.scope,
          scopeId: alert.quota.scopeId,
          currentSpendUsd: alert.quota.currentSpendUsd,
          limitUsd: alert.quota.limitUsd,
        },
      },
    });

    return {
      success: true,
      channel: 'slack',
      messageId: `stub-slack-${Date.now()}`,
    };
  }

  /**
   * Send alert via Email
   *
   * TODO: Implement actual email sending
   * - Use nodemailer or similar SMTP library
   * - Support HTML templates for rich formatting
   * - Include unsubscribe link for compliance
   *
   * @see https://nodemailer.com/
   */
  async sendEmail(alert: CostAlert): Promise<NotificationResult> {
    if (!this.config.email?.smtpHost) {
      return {
        success: false,
        channel: 'email',
        error: 'Email SMTP configuration not provided',
      };
    }

    // TODO: Implement actual email sending with nodemailer
    // Example implementation:
    // import nodemailer from 'nodemailer';
    //
    // const transporter = nodemailer.createTransport({
    //   host: this.config.email.smtpHost,
    //   port: this.config.email.smtpPort,
    //   secure: this.config.email.useTls ?? true,
    //   auth: {
    //     user: this.config.email.smtpUser,
    //     pass: this.config.email.smtpPassword,
    //   },
    // });
    //
    // const info = await transporter.sendMail({
    //   from: this.config.email.fromAddress,
    //   to: this.config.email.toAddresses.join(', '),
    //   subject: this.formatEmailSubject(alert),
    //   html: this.formatEmailHtml(alert),
    // });
    //
    // return {
    //   success: true,
    //   channel: 'email',
    //   messageId: info.messageId,
    // };

    console.log('[STUB] Email notification would be sent:', {
      smtpHost: this.config.email.smtpHost,
      toAddresses: this.config.email.toAddresses,
      subject: `[${alert.severity.toUpperCase()}] Cost Alert: ${alert.type}`,
      alert: {
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
      },
    });

    return {
      success: true,
      channel: 'email',
      messageId: `stub-email-${Date.now()}`,
    };
  }

  /**
   * Send alert to PagerDuty
   *
   * TODO: Implement actual PagerDuty Events API v2 integration
   * - Send events to Events API v2 endpoint
   * - Use routing key for service routing
   * - Support trigger, acknowledge, and resolve actions
   *
   * @see https://developer.pagerduty.com/docs/events-api-v2/overview/
   */
  async sendToPagerDuty(alert: CostAlert): Promise<NotificationResult> {
    if (!this.config.pagerduty?.routingKey) {
      return {
        success: false,
        channel: 'pagerduty',
        error: 'PagerDuty routing key not configured',
      };
    }

    // TODO: Implement actual PagerDuty Events API v2 call
    // Example implementation:
    // const payload = {
    //   routing_key: this.config.pagerduty.routingKey,
    //   event_action: 'trigger',
    //   dedup_key: `cost-alert-${alert.quota.scope}-${alert.quota.scopeId}-${alert.type}`,
    //   payload: {
    //     summary: alert.message,
    //     severity: this.mapSeverityToPagerDuty(alert.severity),
    //     source: 'regulatory-intelligence-copilot',
    //     custom_details: {
    //       quota_scope: alert.quota.scope,
    //       quota_scope_id: alert.quota.scopeId,
    //       current_spend: alert.quota.currentSpendUsd,
    //       limit: alert.quota.limitUsd,
    //       period: alert.quota.period,
    //     },
    //   },
    // };
    //
    // const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(payload),
    // });
    //
    // const data = await response.json();
    // return {
    //   success: data.status === 'success',
    //   channel: 'pagerduty',
    //   messageId: data.dedup_key,
    //   error: data.status !== 'success' ? data.message : undefined,
    // };

    console.log('[STUB] PagerDuty notification would be sent:', {
      routingKey: this.config.pagerduty.routingKey.substring(0, 10) + '...',
      eventAction: 'trigger',
      severity: alert.severity,
      alert: {
        type: alert.type,
        message: alert.message,
        quota: {
          scope: alert.quota.scope,
          scopeId: alert.quota.scopeId,
        },
      },
    });

    return {
      success: true,
      channel: 'pagerduty',
      messageId: `stub-pagerduty-${Date.now()}`,
    };
  }

  /**
   * Format Slack blocks for rich message formatting
   *
   * TODO: Implement Block Kit formatting
   */
  // private formatSlackBlocks(alert: CostAlert): object[] {
  //   return [
  //     {
  //       type: 'header',
  //       text: {
  //         type: 'plain_text',
  //         text: `${this.getSeverityEmoji(alert.severity)} Cost Alert: ${alert.type}`,
  //       },
  //     },
  //     {
  //       type: 'section',
  //       text: {
  //         type: 'mrkdwn',
  //         text: alert.message,
  //       },
  //     },
  //     {
  //       type: 'section',
  //       fields: [
  //         { type: 'mrkdwn', text: `*Scope:* ${alert.quota.scope}` },
  //         { type: 'mrkdwn', text: `*ID:* ${alert.quota.scopeId || 'N/A'}` },
  //         { type: 'mrkdwn', text: `*Current:* $${alert.quota.currentSpendUsd.toFixed(2)}` },
  //         { type: 'mrkdwn', text: `*Limit:* $${alert.quota.limitUsd.toFixed(2)}` },
  //       ],
  //     },
  //     {
  //       type: 'actions',
  //       elements: [
  //         {
  //           type: 'button',
  //           text: { type: 'plain_text', text: 'View Dashboard' },
  //           url: '/analytics/costs',
  //         },
  //       ],
  //     },
  //   ];
  // }

  // private getSeverityEmoji(severity: AlertSeverity): string {
  //   switch (severity) {
  //     case 'critical': return ':rotating_light:';
  //     case 'warning': return ':warning:';
  //     case 'info': return ':information_source:';
  //   }
  // }

  // private mapSeverityToPagerDuty(severity: AlertSeverity): string {
  //   switch (severity) {
  //     case 'critical': return 'critical';
  //     case 'warning': return 'warning';
  //     case 'info': return 'info';
  //   }
  // }
}

/**
 * Create a notification service instance
 */
export function createNotificationService(
  config?: Partial<NotificationConfig>
): NotificationService {
  return new DefaultNotificationService(config);
}

/**
 * Create a cost alert from a quota
 */
export function createCostAlert(
  type: CostAlert['type'],
  quota: CostQuota,
  severity?: AlertSeverity
): CostAlert {
  const percentUsed = (quota.currentSpendUsd / quota.limitUsd) * 100;

  let message: string;
  let alertSeverity: AlertSeverity;

  switch (type) {
    case 'quota_exceeded':
      message = `Budget exceeded for ${quota.scope}${quota.scopeId ? `:${quota.scopeId}` : ''}: ` +
        `$${quota.currentSpendUsd.toFixed(2)} spent of $${quota.limitUsd.toFixed(2)} limit (${percentUsed.toFixed(1)}%)`;
      alertSeverity = severity ?? 'critical';
      break;
    case 'quota_warning':
      message = `Budget warning for ${quota.scope}${quota.scopeId ? `:${quota.scopeId}` : ''}: ` +
        `${percentUsed.toFixed(1)}% of limit used ($${quota.currentSpendUsd.toFixed(2)}/$${quota.limitUsd.toFixed(2)})`;
      alertSeverity = severity ?? 'warning';
      break;
    case 'spend_spike':
      message = `Unusual spending detected for ${quota.scope}${quota.scopeId ? `:${quota.scopeId}` : ''}`;
      alertSeverity = severity ?? 'warning';
      break;
    case 'anomaly':
      message = `Cost anomaly detected for ${quota.scope}${quota.scopeId ? `:${quota.scopeId}` : ''}`;
      alertSeverity = severity ?? 'info';
      break;
  }

  return {
    id: `alert-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date(),
    severity: alertSeverity,
    type,
    quota,
    message,
  };
}

/**
 * Singleton notification service for convenience
 */
let defaultNotificationService: NotificationService | null = null;

/**
 * Get or create the default notification service
 */
export function getNotificationService(
  config?: Partial<NotificationConfig>
): NotificationService {
  if (!defaultNotificationService || config) {
    defaultNotificationService = createNotificationService(config);
  }
  return defaultNotificationService;
}

/**
 * Initialize notification service from environment variables
 *
 * Environment variables:
 * - COST_ALERT_SLACK_WEBHOOK_URL: Slack webhook URL
 * - COST_ALERT_SLACK_CHANNEL: Slack channel (optional)
 * - COST_ALERT_EMAIL_SMTP_HOST: SMTP host
 * - COST_ALERT_EMAIL_SMTP_PORT: SMTP port
 * - COST_ALERT_EMAIL_SMTP_USER: SMTP username
 * - COST_ALERT_EMAIL_SMTP_PASSWORD: SMTP password
 * - COST_ALERT_EMAIL_FROM: From address
 * - COST_ALERT_EMAIL_TO: Comma-separated recipient addresses
 * - COST_ALERT_PAGERDUTY_ROUTING_KEY: PagerDuty routing key
 * - COST_ALERT_CHANNELS: Comma-separated list of enabled channels
 */
export function initNotificationServiceFromEnv(): NotificationService {
  const enabledChannelsEnv = process.env.COST_ALERT_CHANNELS ?? '';
  const enabledChannels = enabledChannelsEnv
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter((c): c is NotificationChannel =>
      ['slack', 'email', 'pagerduty'].includes(c)
    );

  const config: Partial<NotificationConfig> = {
    enabledChannels,
  };

  // Slack config
  const slackWebhook = process.env.COST_ALERT_SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    config.slack = {
      webhookUrl: slackWebhook,
      channel: process.env.COST_ALERT_SLACK_CHANNEL,
    };
  }

  // Email config
  const smtpHost = process.env.COST_ALERT_EMAIL_SMTP_HOST;
  const emailTo = process.env.COST_ALERT_EMAIL_TO;
  if (smtpHost && emailTo) {
    config.email = {
      smtpHost,
      smtpPort: parseInt(process.env.COST_ALERT_EMAIL_SMTP_PORT ?? '587', 10),
      smtpUser: process.env.COST_ALERT_EMAIL_SMTP_USER ?? '',
      smtpPassword: process.env.COST_ALERT_EMAIL_SMTP_PASSWORD ?? '',
      fromAddress: process.env.COST_ALERT_EMAIL_FROM ?? 'alerts@example.com',
      toAddresses: emailTo.split(',').map(e => e.trim()),
      useTls: process.env.COST_ALERT_EMAIL_USE_TLS !== 'false',
    };
  }

  // PagerDuty config
  const pagerdutyKey = process.env.COST_ALERT_PAGERDUTY_ROUTING_KEY;
  if (pagerdutyKey) {
    config.pagerduty = {
      routingKey: pagerdutyKey,
      serviceId: process.env.COST_ALERT_PAGERDUTY_SERVICE_ID,
    };
  }

  return createNotificationService(config);
}
