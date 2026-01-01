/**
 * Compaction Status Indicator
 *
 * Displays the current token usage and compaction status for a conversation.
 * Shows when compaction is needed and provides visual feedback.
 */

'use client';

import { useEffect, useState } from 'react';

export interface CompactionStatusIndicatorProps {
  conversationId: string;
  /**
   * Token threshold that triggers compaction need
   * @default 100000
   */
  threshold?: number;
  /**
   * Poll interval in milliseconds (0 to disable)
   * @default 30000 (30 seconds)
   */
  pollInterval?: number;
  className?: string;
}

interface CompactionStatus {
  needsCompaction: boolean;
  currentTokens: number;
  threshold: number;
  messageCount: number;
  estimatedSavings: number;
  estimatedSavingsPercent: number;
  recommendedStrategy: string;
}

export function CompactionStatusIndicator({
  conversationId,
  threshold = 100_000,
  pollInterval = 30_000,
  className = '',
}: CompactionStatusIndicatorProps) {
  const [status, setStatus] = useState<CompactionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/compact/status`);
      const data = await response.json();

      if (response.ok) {
        setStatus(data);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch immediately
    fetchStatus();

    // Set up polling if interval > 0
    if (pollInterval > 0) {
      const interval = setInterval(fetchStatus, pollInterval);
      return () => clearInterval(interval);
    }
  }, [conversationId, pollInterval]);

  if (loading) {
    return (
      <div className={`compaction-status loading ${className}`}>
        <div className="spinner" />
        <span>Loading status...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`compaction-status error ${className}`} role="alert">
        <span className="error-icon">⚠</span>
        <span>{error}</span>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const usagePercent = (status.currentTokens / status.threshold) * 100;
  const needsCompaction = status.needsCompaction;

  return (
    <div
      className={`compaction-status ${needsCompaction ? 'warning' : 'ok'} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="status-header">
        <span className="status-icon" aria-hidden="true">
          {needsCompaction ? '⚠' : '✓'}
        </span>
        <span className="status-label">
          {needsCompaction ? 'Compaction Recommended' : 'Token Usage'}
        </span>
      </div>

      <div className="status-details">
        <div className="progress-bar-container">
          <div
            className="progress-bar"
            style={{ width: `${Math.min(100, usagePercent)}%` }}
            role="progressbar"
            aria-valuenow={status.currentTokens}
            aria-valuemin={0}
            aria-valuemax={status.threshold}
          />
        </div>

        <div className="token-info">
          <span className="token-count">
            {status.currentTokens.toLocaleString()} / {status.threshold.toLocaleString()} tokens
          </span>
          <span className="token-percent">({usagePercent.toFixed(1)}%)</span>
        </div>

        {needsCompaction && (
          <div className="recommendation">
            <p className="recommendation-text">
              Estimated savings: {status.estimatedSavings.toLocaleString()} tokens (
              {status.estimatedSavingsPercent}%)
            </p>
            <p className="recommendation-strategy">
              Recommended: <strong>{status.recommendedStrategy}</strong> strategy
            </p>
          </div>
        )}

        <div className="message-count">
          {status.messageCount} messages in conversation
        </div>
      </div>

      <style jsx>{`
        .compaction-status {
          padding: 1rem;
          border-radius: 0.5rem;
          border: 1px solid;
          transition: all 0.3s;
        }

        .compaction-status.loading {
          border-color: #d1d5db;
          background-color: #f9fafb;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #6b7280;
        }

        .compaction-status.ok {
          border-color: #d1fae5;
          background-color: #f0fdf4;
        }

        .compaction-status.warning {
          border-color: #fed7aa;
          background-color: #fffbeb;
        }

        .compaction-status.error {
          border-color: #fecaca;
          background-color: #fef2f2;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: #991b1b;
        }

        .status-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .status-icon {
          font-size: 1.25rem;
        }

        .status-label {
          font-weight: 600;
          font-size: 0.875rem;
        }

        .ok .status-label {
          color: #065f46;
        }

        .warning .status-label {
          color: #92400e;
        }

        .status-details {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .progress-bar-container {
          width: 100%;
          height: 0.5rem;
          background-color: #e5e7eb;
          border-radius: 9999px;
          overflow: hidden;
        }

        .progress-bar {
          height: 100%;
          transition: width 0.5s ease;
          border-radius: 9999px;
        }

        .ok .progress-bar {
          background-color: #10b981;
        }

        .warning .progress-bar {
          background-color: #f59e0b;
        }

        .token-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
        }

        .token-count {
          font-weight: 500;
        }

        .ok .token-count {
          color: #065f46;
        }

        .warning .token-count {
          color: #92400e;
        }

        .token-percent {
          color: #6b7280;
        }

        .recommendation {
          margin-top: 0.5rem;
          padding: 0.75rem;
          background-color: #fef3c7;
          border-radius: 0.375rem;
          border: 1px solid #fbbf24;
        }

        .recommendation-text {
          margin: 0 0 0.5rem 0;
          font-size: 0.875rem;
          color: #78350f;
        }

        .recommendation-strategy {
          margin: 0;
          font-size: 0.875rem;
          color: #78350f;
        }

        .recommendation-strategy strong {
          text-transform: capitalize;
        }

        .message-count {
          font-size: 0.75rem;
          color: #6b7280;
          margin-top: 0.25rem;
        }

        .spinner {
          display: inline-block;
          width: 1rem;
          height: 1rem;
          border: 2px solid rgba(107, 114, 128, 0.3);
          border-top-color: #6b7280;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .error-icon {
          font-size: 1.25rem;
        }
      `}</style>
    </div>
  );
}
