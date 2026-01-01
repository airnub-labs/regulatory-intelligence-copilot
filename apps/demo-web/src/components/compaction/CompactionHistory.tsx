/**
 * Compaction History Component
 *
 * Displays the history of compaction operations for a conversation.
 * Shows metrics like tokens saved, compression ratio, and duration.
 */

'use client';

import { useEffect, useState } from 'react';

export interface CompactionHistoryProps {
  conversationId: string;
  limit?: number;
  className?: string;
}

interface CompactionHistoryEntry {
  id: string;
  timestamp: Date;
  strategy: string;
  messagesBefore: number;
  messagesAfter: number;
  tokensBefore: number;
  tokensAfter: number;
  compressionRatio: number;
  durationMs: number;
  triggeredBy: 'auto' | 'manual';
}

export function CompactionHistory({
  conversationId,
  limit = 10,
  className = '',
}: CompactionHistoryProps) {
  const [history, setHistory] = useState<CompactionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(
          `/api/conversations/${conversationId}/compact/history?limit=${limit}`
        );
        const data = await response.json();

        if (response.ok && Array.isArray(data.history)) {
          setHistory(
            data.history.map((entry: CompactionHistoryEntry) => ({
              ...entry,
              timestamp: new Date(entry.timestamp),
            }))
          );
        } else {
          setError(data.error || 'Failed to fetch history');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [conversationId, limit]);

  if (loading) {
    return <div className={`compaction-history loading ${className}`}>Loading history...</div>;
  }

  if (error) {
    return (
      <div className={`compaction-history error ${className}`} role="alert">
        Error: {error}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className={`compaction-history empty ${className}`}>
        No compaction history available.
      </div>
    );
  }

  return (
    <div className={`compaction-history ${className}`}>
      <h3 className="history-title">Compaction History</h3>

      <div className="history-list">
        {history.map((entry) => (
          <div key={entry.id} className="history-entry">
            <div className="entry-header">
              <span className="entry-strategy">{entry.strategy}</span>
              <span className="entry-trigger">
                {entry.triggeredBy === 'auto' ? '🤖 Auto' : '👤 Manual'}
              </span>
              <time className="entry-timestamp" dateTime={entry.timestamp.toISOString()}>
                {entry.timestamp.toLocaleDateString()} {entry.timestamp.toLocaleTimeString()}
              </time>
            </div>

            <div className="entry-metrics">
              <div className="metric">
                <span className="metric-label">Tokens Saved:</span>
                <span className="metric-value">
                  {(entry.tokensBefore - entry.tokensAfter).toLocaleString()}
                </span>
              </div>

              <div className="metric">
                <span className="metric-label">Compression:</span>
                <span className="metric-value">
                  {((1 - entry.compressionRatio) * 100).toFixed(1)}%
                </span>
              </div>

              <div className="metric">
                <span className="metric-label">Messages:</span>
                <span className="metric-value">
                  {entry.messagesBefore} → {entry.messagesAfter}
                </span>
              </div>

              <div className="metric">
                <span className="metric-label">Duration:</span>
                <span className="metric-value">{entry.durationMs}ms</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .compaction-history {
          border: 1px solid #e5e7eb;
          border-radius: 0.5rem;
          padding: 1rem;
          background-color: white;
        }

        .compaction-history.loading,
        .compaction-history.error,
        .compaction-history.empty {
          text-align: center;
          padding: 2rem;
          color: #6b7280;
        }

        .compaction-history.error {
          color: #991b1b;
          background-color: #fef2f2;
          border-color: #fecaca;
        }

        .history-title {
          margin: 0 0 1rem 0;
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .history-entry {
          padding: 0.75rem;
          border: 1px solid #e5e7eb;
          border-radius: 0.375rem;
          background-color: #f9fafb;
          transition: background-color 0.2s;
        }

        .history-entry:hover {
          background-color: #f3f4f6;
        }

        .entry-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .entry-strategy {
          font-weight: 600;
          color: #3b82f6;
          text-transform: capitalize;
          font-size: 0.875rem;
        }

        .entry-trigger {
          font-size: 0.75rem;
          padding: 0.125rem 0.5rem;
          background-color: #dbeafe;
          border-radius: 9999px;
          color: #1e40af;
        }

        .entry-timestamp {
          font-size: 0.75rem;
          color: #6b7280;
          margin-left: auto;
        }

        .entry-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 0.5rem;
        }

        .metric {
          display: flex;
          flex-direction: column;
        }

        .metric-label {
          font-size: 0.75rem;
          color: #6b7280;
        }

        .metric-value {
          font-size: 0.875rem;
          font-weight: 500;
          color: #111827;
        }
      `}</style>
    </div>
  );
}
