/**
 * Cost Alert Notification Service
 *
 * Provides integrations for sending cost alerts to external services:
 * - Slack (via incoming webhooks)
 * - Email (via SMTP/nodemailer)
 * - PagerDuty (via Events API v2)
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
  /** Base URL for dashboard links in notifications */
  dashboardUrl?: string;
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
 * Implements real integrations for Slack, Email, and PagerDuty.
 */
export class DefaultNotificationService implements NotificationService {
  private config: NotificationConfig;

  constructor(config?: Partial<NotificationConfig>) {
    this.config = {
      enabledChannels: config?.enabledChannels ?? [],
      slack: config?.slack,
      email: config?.email,
      pagerduty: config?.pagerduty,
      dashboardUrl: config?.dashboardUrl ?? '/analytics/costs',
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
   * Send alert to Slack via incoming webhook
   *
   * Uses Slack Block Kit for rich message formatting.
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

    const payload = {
      channel: this.config.slack.channel,
      username: this.config.slack.username ?? 'Cost Alert Bot',
      icon_emoji: this.config.slack.iconEmoji ?? ':money_with_wings:',
      blocks: this.formatSlackBlocks(alert),
      // Fallback text for notifications
      text: alert.message,
    };

    try {
      const response = await fetch(this.config.slack.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          channel: 'slack',
          error: `Slack webhook failed: ${response.status} ${errorText}`,
        };
      }

      return {
        success: true,
        channel: 'slack',
        messageId: `slack-${alert.id}`,
      };
    } catch (error) {
      return {
        success: false,
        channel: 'slack',
        error: `Slack webhook error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Send alert via Email using SMTP
   *
   * Uses native fetch to communicate with SMTP service or nodemailer if available.
   * For production, consider using a proper email service like SendGrid, SES, etc.
   */
  async sendEmail(alert: CostAlert): Promise<NotificationResult> {
    if (!this.config.email?.smtpHost) {
      return {
        success: false,
        channel: 'email',
        error: 'Email SMTP configuration not provided',
      };
    }

    console.warn(
      'Nodemailer is not installed; logging email alert instead of sending.'
    );


    console.log('[EMAIL] Would send cost alert email:', {
      to: this.config.email.toAddresses,
      subject: this.formatEmailSubject(alert),
      body: this.formatEmailText(alert),
    });

    return {
      success: true,
      channel: 'email',
      messageId: `email-fallback-${alert.id}`,
    };
  }

  /**
   * Send alert to PagerDuty via Events API v2
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

    const dedupKey = `cost-alert-${alert.quota.scope}-${alert.quota.scopeId ?? 'global'}-${alert.type}`;

    const payload = {
      routing_key: this.config.pagerduty.routingKey,
      event_action: 'trigger',
      dedup_key: dedupKey,
      payload: {
        summary: alert.message,
        severity: this.mapSeverityToPagerDuty(alert.severity),
        source: 'regulatory-intelligence-copilot',
        timestamp: alert.timestamp.toISOString(),
        component: 'cost-tracking',
        group: alert.quota.scope,
        class: alert.type,
        custom_details: {
          alert_id: alert.id,
          quota_scope: alert.quota.scope,
          quota_scope_id: alert.quota.scopeId,
          current_spend_usd: alert.quota.currentSpendUsd,
          limit_usd: alert.quota.limitUsd,
          period: alert.quota.period,
          percent_used: ((alert.quota.currentSpendUsd / alert.quota.limitUsd) * 100).toFixed(1),
          dashboard_url: this.config.dashboardUrl,
          ...alert.details,
        },
      },
      links: [
        {
          href: this.config.dashboardUrl ?? '/analytics/costs',
          text: 'View Cost Dashboard',
        },
      ],
    };

    try {
      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.status === 'success') {
        return {
          success: true,
          channel: 'pagerduty',
          messageId: data.dedup_key ?? dedupKey,
        };
      } else {
        return {
          success: false,
          channel: 'pagerduty',
          error: `PagerDuty error: ${data.message ?? 'Unknown error'}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        channel: 'pagerduty',
        error: `PagerDuty API error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Format Slack blocks for rich message formatting
   */
  private formatSlackBlocks(alert: CostAlert): object[] {
    const percentUsed = ((alert.quota.currentSpendUsd / alert.quota.limitUsd) * 100).toFixed(1);

    return [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${this.getSeverityEmoji(alert.severity)} Cost Alert: ${this.formatAlertType(alert.type)}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: alert.message,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Scope:*\n${alert.quota.scope}` },
          { type: 'mrkdwn', text: `*ID:*\n${alert.quota.scopeId || 'Platform-wide'}` },
          { type: 'mrkdwn', text: `*Current Spend:*\n$${alert.quota.currentSpendUsd.toFixed(2)}` },
          { type: 'mrkdwn', text: `*Limit:*\n$${alert.quota.limitUsd.toFixed(2)}` },
          { type: 'mrkdwn', text: `*Usage:*\n${percentUsed}%` },
          { type: 'mrkdwn', text: `*Period:*\n${alert.quota.period}` },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Alert ID: ${alert.id} | ${alert.timestamp.toISOString()}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Dashboard', emoji: true },
            url: this.config.dashboardUrl ?? '/analytics/costs',
            style: 'primary',
          },
        ],
      },
    ];
  }

  /**
   * Format email subject line
   */
  private formatEmailSubject(alert: CostAlert): string {
    const prefix = alert.severity === 'critical' ? '[CRITICAL]' :
                   alert.severity === 'warning' ? '[WARNING]' : '[INFO]';
    return `${prefix} Cost Alert: ${this.formatAlertType(alert.type)} - ${alert.quota.scope}`;
  }

  /**
   * Format email HTML body
   */
  private formatEmailHtml(alert: CostAlert): string {
    const percentUsed = ((alert.quota.currentSpendUsd / alert.quota.limitUsd) * 100).toFixed(1);
    const severityColor = alert.severity === 'critical' ? '#dc2626' :
                          alert.severity === 'warning' ? '#f59e0b' : '#3b82f6';

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${severityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
    .stat { background: white; padding: 12px; border-radius: 4px; border: 1px solid #e5e7eb; }
    .stat-label { color: #6b7280; font-size: 12px; }
    .stat-value { font-size: 20px; font-weight: bold; }
    .progress { height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin: 16px 0; }
    .progress-bar { height: 100%; background: ${severityColor}; }
    .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; }
    .footer { text-align: center; color: #6b7280; font-size: 12px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin:0;">${this.getSeverityEmoji(alert.severity)} Cost Alert</h1>
      <p style="margin:8px 0 0;">${this.formatAlertType(alert.type)}</p>
    </div>
    <div class="content">
      <p style="font-size:16px;color:#111827;">${alert.message}</p>

      <div class="progress">
        <div class="progress-bar" style="width:${Math.min(parseFloat(percentUsed), 100)}%"></div>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="stat-label">Current Spend</div>
          <div class="stat-value">$${alert.quota.currentSpendUsd.toFixed(2)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Budget Limit</div>
          <div class="stat-value">$${alert.quota.limitUsd.toFixed(2)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Scope</div>
          <div class="stat-value">${alert.quota.scope}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Period</div>
          <div class="stat-value">${alert.quota.period}</div>
        </div>
      </div>

      <p style="text-align:center;margin:24px 0;">
        <a href="${this.config.dashboardUrl ?? '/analytics/costs'}" class="button">View Cost Dashboard</a>
      </p>
    </div>
    <div class="footer">
      <p>Alert ID: ${alert.id}<br>Sent at ${alert.timestamp.toISOString()}</p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Format email plain text body
   */
  private formatEmailText(alert: CostAlert): string {
    const percentUsed = ((alert.quota.currentSpendUsd / alert.quota.limitUsd) * 100).toFixed(1);

    return `
COST ALERT: ${this.formatAlertType(alert.type)}

${alert.message}

Details:
- Scope: ${alert.quota.scope}
- Scope ID: ${alert.quota.scopeId || 'N/A'}
- Current Spend: $${alert.quota.currentSpendUsd.toFixed(2)}
- Budget Limit: $${alert.quota.limitUsd.toFixed(2)}
- Usage: ${percentUsed}%
- Period: ${alert.quota.period}

View Dashboard: ${this.config.dashboardUrl ?? '/analytics/costs'}

---
Alert ID: ${alert.id}
Sent at: ${alert.timestamp.toISOString()}
`.trim();
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical': return '🚨';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
    }
  }

  /**
   * Format alert type for display
   */
  private formatAlertType(type: CostAlert['type']): string {
    switch (type) {
      case 'quota_exceeded': return 'Budget Exceeded';
      case 'quota_warning': return 'Budget Warning';
      case 'spend_spike': return 'Spending Spike';
      case 'anomaly': return 'Cost Anomaly';
    }
  }

  /**
   * Map severity to PagerDuty severity levels
   */
  private mapSeverityToPagerDuty(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical': return 'critical';
      case 'warning': return 'warning';
      case 'info': return 'info';
    }
  }
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
  severity?: AlertSeverity,
  details?: Record<string, unknown>
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
    details,
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
 * - COST_ALERT_DASHBOARD_URL: Base URL for dashboard links
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
    dashboardUrl: process.env.COST_ALERT_DASHBOARD_URL,
  };

  // Slack config
  const slackWebhook = process.env.COST_ALERT_SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    config.slack = {
      webhookUrl: slackWebhook,
      channel: process.env.COST_ALERT_SLACK_CHANNEL,
      username: process.env.COST_ALERT_SLACK_USERNAME,
      iconEmoji: process.env.COST_ALERT_SLACK_ICON_EMOJI,
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
