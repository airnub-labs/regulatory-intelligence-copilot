/**
 * Compaction Analytics Dashboard
 *
 * Displays comprehensive metrics and analytics for conversation compaction:
 * - Total tokens saved
 * - Compaction operations count
 * - Average compression ratio
 * - Strategy performance comparison
 * - Usage trends over time
 */

'use client';

import { useEffect, useState } from 'react';

interface CompactionMetrics {
  totalOperations: number;
  totalTokensSaved: number;
  totalMessagesRemoved: number;
  averageCompressionRatio: number;
  averageDurationMs: number;
  strategyBreakdown: {
    strategy: string;
    operations: number;
    tokensSaved: number;
    avgCompressionRatio: number;
  }[];
  recentOperations: {
    conversationId: string;
    timestamp: Date;
    strategy: string;
    tokensSaved: number;
    compressionRatio: number;
  }[];
}

export default function CompactionAnalytics() {
  const [metrics, setMetrics] = useState<CompactionMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

  useEffect(() => {
    // In production, fetch from your metrics endpoint
    // For now, show example data
    const exampleMetrics: CompactionMetrics = {
      totalOperations: 1_247,
      totalTokensSaved: 18_450_000,
      totalMessagesRemoved: 4_521,
      averageCompressionRatio: 0.42,
      averageDurationMs: 1_234,
      strategyBreakdown: [
        {
          strategy: 'semantic',
          operations: 543,
          tokensSaved: 9_200_000,
          avgCompressionRatio: 0.38,
        },
        {
          strategy: 'sliding_window',
          operations: 456,
          tokensSaved: 6_300_000,
          avgCompressionRatio: 0.45,
        },
        {
          strategy: 'moderate_merge',
          operations: 248,
          tokensSaved: 2_950_000,
          avgCompressionRatio: 0.48,
        },
      ],
      recentOperations: Array.from({ length: 10 }, (_, i) => ({
        conversationId: `conv-${i + 1}`,
        timestamp: new Date(Date.now() - i * 3600000),
        strategy: ['semantic', 'sliding_window', 'moderate_merge'][i % 3],
        tokensSaved: Math.floor(Math.random() * 50000) + 10000,
        compressionRatio: 0.3 + Math.random() * 0.3,
      })),
    };

    setMetrics(exampleMetrics);
    setLoading(false);
  }, [timeRange]);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <p>Loading analytics...</p>
      </div>
    );
  }

  if (error || !metrics) {
    return <div className="dashboard-error">Error loading metrics</div>;
  }

  const avgCompressionPercent = ((1 - metrics.averageCompressionRatio) * 100).toFixed(1);

  return (
    <div className="compaction-analytics">
      <header className="dashboard-header">
        <h1>Compaction Analytics</h1>
        <div className="time-range-selector">
          <button
            className={timeRange === '24h' ? 'active' : ''}
            onClick={() => setTimeRange('24h')}
          >
            24 Hours
          </button>
          <button className={timeRange === '7d' ? 'active' : ''} onClick={() => setTimeRange('7d')}>
            7 Days
          </button>
          <button
            className={timeRange === '30d' ? 'active' : ''}
            onClick={() => setTimeRange('30d')}
          >
            30 Days
          </button>
          <button
            className={timeRange === 'all' ? 'active' : ''}
            onClick={() => setTimeRange('all')}
          >
            All Time
          </button>
        </div>
      </header>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.totalOperations.toLocaleString()}</div>
            <div className="metric-label">Total Operations</div>
          </div>
        </div>

        <div className="metric-card highlight">
          <div className="metric-icon">💾</div>
          <div className="metric-content">
            <div className="metric-value">{(metrics.totalTokensSaved / 1_000_000).toFixed(2)}M</div>
            <div className="metric-label">Tokens Saved</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">🗜️</div>
          <div className="metric-content">
            <div className="metric-value">{avgCompressionPercent}%</div>
            <div className="metric-label">Avg Compression</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⚡</div>
          <div className="metric-content">
            <div className="metric-value">{metrics.averageDurationMs}ms</div>
            <div className="metric-label">Avg Duration</div>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <section className="strategy-breakdown">
          <h2>Strategy Performance</h2>
          <div className="strategy-table">
            <div className="table-header">
              <div>Strategy</div>
              <div>Operations</div>
              <div>Tokens Saved</div>
              <div>Avg Compression</div>
            </div>
            {metrics.strategyBreakdown.map((strategy) => (
              <div key={strategy.strategy} className="table-row">
                <div className="strategy-name">{strategy.strategy}</div>
                <div>{strategy.operations.toLocaleString()}</div>
                <div>{(strategy.tokensSaved / 1_000_000).toFixed(2)}M</div>
                <div>{((1 - strategy.avgCompressionRatio) * 100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </section>

        <section className="recent-operations">
          <h2>Recent Operations</h2>
          <div className="operations-table">
            <div className="table-header">
              <div>Time</div>
              <div>Conversation</div>
              <div>Strategy</div>
              <div>Tokens Saved</div>
              <div>Compression</div>
            </div>
            {metrics.recentOperations.map((op, index) => (
              <div key={index} className="table-row">
                <div className="time-cell">
                  {op.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="conversation-cell">{op.conversationId}</div>
                <div className="strategy-cell">{op.strategy}</div>
                <div className="tokens-cell">{op.tokensSaved.toLocaleString()}</div>
                <div className="compression-cell">
                  {((1 - op.compressionRatio) * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style jsx>{`
        .compaction-analytics {
          padding: 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .dashboard-header h1 {
          font-size: 2rem;
          font-weight: 700;
          color: #111827;
          margin: 0;
        }

        .time-range-selector {
          display: flex;
          gap: 0.5rem;
        }

        .time-range-selector button {
          padding: 0.5rem 1rem;
          border: 1px solid #e5e7eb;
          background: white;
          border-radius: 0.375rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .time-range-selector button:hover {
          background: #f3f4f6;
        }

        .time-range-selector button.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .metric-card {
          background: white;
          padding: 1.5rem;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          gap: 1rem;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }

        .metric-card.highlight {
          background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
          color: white;
          border: none;
        }

        .metric-icon {
          font-size: 2.5rem;
        }

        .metric-content {
          flex: 1;
        }

        .metric-value {
          font-size: 2rem;
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
          border-radius: 0.5rem;
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
          grid-template-columns: 1fr 1.5fr 1fr 1fr 1fr;
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
          grid-template-columns: 1fr 1.5fr 1fr 1fr 1fr;
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
          color: #6b7280;
        }

        .strategy-cell {
          text-transform: capitalize;
        }

        .tokens-cell {
          font-weight: 500;
        }

        .compression-cell {
          font-weight: 500;
          color: #10b981;
        }

        .dashboard-loading,
        .dashboard-error {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          font-size: 1.125rem;
          color: #6b7280;
        }

        .dashboard-error {
          color: #991b1b;
        }

        .spinner {
          width: 2rem;
          height: 2rem;
          border: 3px solid rgba(59, 130, 246, 0.3);
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
          margin-right: 1rem;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
