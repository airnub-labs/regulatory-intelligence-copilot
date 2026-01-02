/**
 * Compaction Analytics Dashboard
 *
 * Displays comprehensive metrics and analytics for conversation compaction:
 * - Total tokens saved
 * - Compaction operations count
 * - Average compression ratio
 * - Strategy performance comparison
 * - Recent operations history
 *
 * Data is fetched from /api/compaction/metrics which queries the
 * copilot_internal.compaction_operations table in Supabase.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';

interface CompactionMetrics {
  totalOperations: number;
  totalTokensSaved: number;
  totalMessagesRemoved: number;
  averageCompressionRatio: number;
  averageDurationMs: number;
  totalCostUsd: number;
  operationsUsingLlm: number;
  successRate: number;
  strategyBreakdown: {
    strategy: string;
    operations: number;
    tokensSaved: number;
    avgCompressionRatio: number;
  }[];
  recentOperations: {
    id: string;
    conversationId: string | null;
    timestamp: string;
    strategy: string;
    tokensSaved: number;
    compressionRatio: number;
    durationMs: number | null;
    success: boolean;
  }[];
}

type TimeRange = '24h' | '7d' | '30d' | 'all';

export default function CompactionAnalytics() {
  const [metrics, setMetrics] = useState<CompactionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/compaction/metrics?timeRange=${timeRange}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch metrics: ${response.statusText}`);
      }

      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      console.error('Failed to fetch compaction metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const formatNumber = (value: number): string => {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toLocaleString();
  };

  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatConversationId = (id: string | null): string => {
    if (!id) return '-';
    // Shorten UUID for display
    return id.length > 8 ? `${id.substring(0, 8)}...` : id;
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <p>Loading compaction analytics...</p>
        <style>{dashboardStyles}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <div className="error-icon">!</div>
        <h2>Failed to Load Metrics</h2>
        <p>{error}</p>
        <button onClick={fetchMetrics}>Retry</button>
        <style>{dashboardStyles}</style>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="dashboard-empty">
        <p>No compaction data available yet.</p>
        <p className="hint">Compaction metrics will appear once operations are performed.</p>
        <style>{dashboardStyles}</style>
      </div>
    );
  }

  const avgCompressionPercent = ((1 - metrics.averageCompressionRatio) * 100).toFixed(1);
  const hasData = metrics.totalOperations > 0;

  return (
    <div className="compaction-analytics">
      <header className="dashboard-header">
        <div>
          <h1>Compaction Analytics</h1>
          <p className="subtitle">Conversation compression performance metrics</p>
        </div>
        <div className="time-range-selector">
          {(['24h', '7d', '30d', 'all'] as TimeRange[]).map((range) => (
            <button
              key={range}
              className={timeRange === range ? 'active' : ''}
              onClick={() => setTimeRange(range)}
            >
              {range === '24h' ? '24 Hours' : range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : 'All Time'}
            </button>
          ))}
          <button className="refresh-btn" onClick={fetchMetrics} title="Refresh data">
            &#x21bb;
          </button>
        </div>
      </header>

      {!hasData ? (
        <div className="no-data-message">
          <div className="no-data-icon">&#x1F4CA;</div>
          <h2>No Compaction Operations Yet</h2>
          <p>Compaction metrics will appear here once conversations are compacted.</p>
          <p className="hint">
            Compaction occurs automatically during long conversations or can be triggered manually.
          </p>
        </div>
      ) : (
        <>
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-icon">&#x1F4CA;</div>
              <div className="metric-content">
                <div className="metric-value">{formatNumber(metrics.totalOperations)}</div>
                <div className="metric-label">Total Operations</div>
              </div>
            </div>

            <div className="metric-card highlight">
              <div className="metric-icon">&#x1F4BE;</div>
              <div className="metric-content">
                <div className="metric-value">{formatNumber(metrics.totalTokensSaved)}</div>
                <div className="metric-label">Tokens Saved</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">&#x1F5DC;</div>
              <div className="metric-content">
                <div className="metric-value">{avgCompressionPercent}%</div>
                <div className="metric-label">Avg Compression</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">&#x26A1;</div>
              <div className="metric-content">
                <div className="metric-value">{metrics.averageDurationMs}ms</div>
                <div className="metric-label">Avg Duration</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">&#x1F4AC;</div>
              <div className="metric-content">
                <div className="metric-value">{formatNumber(metrics.totalMessagesRemoved)}</div>
                <div className="metric-label">Messages Removed</div>
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-icon">&#x2705;</div>
              <div className="metric-content">
                <div className="metric-value">{metrics.successRate.toFixed(1)}%</div>
                <div className="metric-label">Success Rate</div>
              </div>
            </div>
          </div>

          <div className="dashboard-content">
            <section className="strategy-breakdown">
              <h2>Strategy Performance</h2>
              {metrics.strategyBreakdown.length > 0 ? (
                <div className="strategy-table">
                  <div className="table-header">
                    <div>Strategy</div>
                    <div>Operations</div>
                    <div>Tokens Saved</div>
                    <div>Avg Compression</div>
                  </div>
                  {metrics.strategyBreakdown.map((strategy) => (
                    <div key={strategy.strategy} className="table-row">
                      <div className="strategy-name">{strategy.strategy.replace(/_/g, ' ')}</div>
                      <div>{strategy.operations.toLocaleString()}</div>
                      <div>{formatNumber(strategy.tokensSaved)}</div>
                      <div>{((1 - strategy.avgCompressionRatio) * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-data">No strategy data available</p>
              )}
            </section>

            <section className="recent-operations">
              <h2>Recent Operations</h2>
              {metrics.recentOperations.length > 0 ? (
                <div className="operations-table">
                  <div className="table-header">
                    <div>Time</div>
                    <div>Conversation</div>
                    <div>Strategy</div>
                    <div>Saved</div>
                    <div>Status</div>
                  </div>
                  {metrics.recentOperations.map((op) => (
                    <div key={op.id} className="table-row">
                      <div className="time-cell">{formatTimestamp(op.timestamp)}</div>
                      <div className="conversation-cell" title={op.conversationId || undefined}>
                        {formatConversationId(op.conversationId)}
                      </div>
                      <div className="strategy-cell">{op.strategy.replace(/_/g, ' ')}</div>
                      <div className="tokens-cell">{formatNumber(op.tokensSaved)}</div>
                      <div className={`status-cell ${op.success ? 'success' : 'failed'}`}>
                        {op.success ? '&#x2713;' : '&#x2717;'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-data">No recent operations</p>
              )}
            </section>
          </div>

          {metrics.operationsUsingLlm > 0 && (
            <section className="llm-usage">
              <h2>LLM Usage</h2>
              <div className="llm-stats">
                <div className="llm-stat">
                  <span className="stat-label">Operations using LLM:</span>
                  <span className="stat-value">{metrics.operationsUsingLlm.toLocaleString()}</span>
                </div>
                <div className="llm-stat">
                  <span className="stat-label">Total LLM cost:</span>
                  <span className="stat-value">${metrics.totalCostUsd.toFixed(4)}</span>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      <style>{dashboardStyles}</style>
    </div>
  );
}

const dashboardStyles = `
  .compaction-analytics {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .dashboard-header h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #111827;
    margin: 0;
  }

  .subtitle {
    color: #6b7280;
    margin-top: 0.25rem;
  }

  .time-range-selector {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .time-range-selector button {
    padding: 0.5rem 1rem;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.875rem;
  }

  .time-range-selector button:hover {
    background: #f3f4f6;
  }

  .time-range-selector button.active {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .refresh-btn {
    font-size: 1.25rem;
    padding: 0.5rem 0.75rem !important;
  }

  .no-data-message {
    text-align: center;
    padding: 4rem 2rem;
    background: white;
    border-radius: 0.75rem;
    border: 1px solid #e5e7eb;
  }

  .no-data-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .no-data-message h2 {
    color: #374151;
    margin: 0 0 0.5rem 0;
  }

  .no-data-message p {
    color: #6b7280;
    margin: 0;
  }

  .no-data-message .hint {
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .metric-card {
    background: white;
    padding: 1.5rem;
    border-radius: 0.75rem;
    border: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    gap: 1rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .metric-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .metric-card.highlight {
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    border: none;
  }

  .metric-icon {
    font-size: 2rem;
  }

  .metric-content {
    flex: 1;
  }

  .metric-value {
    font-size: 1.75rem;
    font-weight: 700;
    margin-bottom: 0.25rem;
  }

  .metric-label {
    font-size: 0.875rem;
    opacity: 0.8;
  }

  .dashboard-content {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2rem;
  }

  @media (min-width: 1024px) {
    .dashboard-content {
      grid-template-columns: 1fr 1fr;
    }
  }

  section {
    background: white;
    padding: 1.5rem;
    border-radius: 0.75rem;
    border: 1px solid #e5e7eb;
  }

  section h2 {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
  }

  .strategy-table,
  .operations-table {
    font-size: 0.875rem;
  }

  .table-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1.5fr 1fr;
    gap: 1rem;
    padding: 0.75rem;
    background: #f9fafb;
    border-radius: 0.375rem;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.5rem;
  }

  .operations-table .table-header {
    grid-template-columns: 1fr 1.5fr 1.5fr 1fr 0.5fr;
  }

  .table-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1.5fr 1fr;
    gap: 1rem;
    padding: 0.75rem;
    border-radius: 0.375rem;
    transition: background 0.2s;
  }

  .operations-table .table-row {
    grid-template-columns: 1fr 1.5fr 1.5fr 1fr 0.5fr;
  }

  .table-row:hover {
    background: #f9fafb;
  }

  .strategy-name {
    text-transform: capitalize;
    font-weight: 500;
    color: #3b82f6;
  }

  .time-cell {
    color: #6b7280;
  }

  .conversation-cell {
    font-family: monospace;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .strategy-cell {
    text-transform: capitalize;
  }

  .tokens-cell {
    font-weight: 500;
  }

  .status-cell {
    text-align: center;
  }

  .status-cell.success {
    color: #10b981;
  }

  .status-cell.failed {
    color: #ef4444;
  }

  .no-data {
    color: #9ca3af;
    font-style: italic;
    text-align: center;
    padding: 2rem;
  }

  .llm-usage {
    margin-top: 2rem;
  }

  .llm-stats {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .llm-stat {
    display: flex;
    gap: 0.5rem;
  }

  .stat-label {
    color: #6b7280;
  }

  .stat-value {
    font-weight: 600;
    color: #374151;
  }

  .dashboard-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    color: #6b7280;
  }

  .dashboard-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
  }

  .error-icon {
    width: 3rem;
    height: 3rem;
    background: #fee2e2;
    color: #dc2626;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    font-weight: bold;
    margin-bottom: 1rem;
  }

  .dashboard-error h2 {
    color: #991b1b;
    margin: 0 0 0.5rem 0;
  }

  .dashboard-error p {
    color: #6b7280;
    margin: 0 0 1rem 0;
  }

  .dashboard-error button {
    padding: 0.5rem 1rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 0.375rem;
    cursor: pointer;
  }

  .dashboard-empty {
    text-align: center;
    padding: 4rem 2rem;
    color: #6b7280;
  }

  .dashboard-empty .hint {
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  .spinner {
    width: 2rem;
    height: 2rem;
    border: 3px solid rgba(59, 130, 246, 0.3);
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .compaction-analytics {
      padding: 1rem;
    }

    .dashboard-header {
      flex-direction: column;
      align-items: stretch;
    }

    .time-range-selector {
      justify-content: center;
    }

    .dashboard-content {
      grid-template-columns: 1fr;
    }

    .table-header,
    .table-row {
      font-size: 0.75rem;
      gap: 0.5rem;
    }
  }
`;
