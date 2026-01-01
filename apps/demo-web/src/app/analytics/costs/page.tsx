/**
 * Cost Analytics Dashboard
 *
 * Displays comprehensive LLM cost metrics from Supabase:
 * - Total spend (today, week, month)
 * - Spend by provider/model/touchpoint
 * - Quota status and usage
 * - Cost trends over time
 */

'use client';

import { useEffect, useState, useCallback } from 'react';

interface CostAggregate {
  dimension: string;
  value: string;
  totalCostUsd: number;
  requestCount: number;
  totalTokens: number;
  avgCostPerRequest: number;
  firstRequest: string;
  lastRequest: string;
}

interface QuotaStatus {
  id: string;
  scope: 'platform' | 'tenant' | 'user';
  scopeId?: string;
  limitUsd: number;
  period: string;
  currentSpendUsd: number;
  periodStart: string;
  periodEnd: string;
  isExceeded: boolean;
  warningThreshold?: number;
  warningExceeded?: boolean;
}

interface CostMetrics {
  totalCostToday: number;
  totalCostWeek: number;
  totalCostMonth: number;
  totalCostAllTime: number;
  totalRequests: number;
  avgCostPerRequest: number;
  byProvider: CostAggregate[];
  byModel: CostAggregate[];
  byTouchpoint: CostAggregate[];
  byTenant: CostAggregate[];
  quotas: QuotaStatus[];
}

type TimeRange = '24h' | '7d' | '30d' | 'all';

function getTimeRangeStart(range: TimeRange): Date | undefined {
  const now = new Date();
  switch (range) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'all':
      return undefined;
  }
}

export default function CostAnalyticsDashboard() {
  const [metrics, setMetrics] = useState<CostMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const startTime = getTimeRangeStart(timeRange);
      const endTime = new Date();

      // Fetch aggregated costs by different dimensions in parallel
      const [
        totalResponse,
        byProviderResponse,
        byModelResponse,
        byTouchpointResponse,
        byTenantResponse,
        quotaResponse,
      ] = await Promise.all([
        // Total cost
        fetch('/api/costs/total', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope: 'platform',
            startTime: startTime?.toISOString(),
            endTime: endTime.toISOString(),
          }),
        }),
        // By provider
        fetch('/api/costs/aggregate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupBy: ['provider'],
            startTime: startTime?.toISOString(),
            endTime: endTime.toISOString(),
            sortBy: 'cost_desc',
            limit: 10,
          }),
        }),
        // By model
        fetch('/api/costs/aggregate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupBy: ['model'],
            startTime: startTime?.toISOString(),
            endTime: endTime.toISOString(),
            sortBy: 'cost_desc',
            limit: 10,
          }),
        }),
        // By touchpoint/task
        fetch('/api/costs/aggregate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupBy: ['task'],
            startTime: startTime?.toISOString(),
            endTime: endTime.toISOString(),
            sortBy: 'cost_desc',
            limit: 10,
          }),
        }),
        // By tenant
        fetch('/api/costs/aggregate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupBy: ['tenant'],
            startTime: startTime?.toISOString(),
            endTime: endTime.toISOString(),
            sortBy: 'cost_desc',
            limit: 10,
          }),
        }),
        // Get platform quota
        fetch('/api/costs/quotas?scope=platform'),
      ]);

      // Also fetch period-specific totals
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [todayResponse, weekResponse, monthResponse] = await Promise.all([
        fetch('/api/costs/total', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope: 'platform',
            startTime: todayStart.toISOString(),
          }),
        }),
        fetch('/api/costs/total', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope: 'platform',
            startTime: weekStart.toISOString(),
          }),
        }),
        fetch('/api/costs/total', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scope: 'platform',
            startTime: monthStart.toISOString(),
          }),
        }),
      ]);

      // Parse responses
      const totalData = await totalResponse.json();
      const byProviderData = await byProviderResponse.json();
      const byModelData = await byModelResponse.json();
      const byTouchpointData = await byTouchpointResponse.json();
      const byTenantData = await byTenantResponse.json();
      const todayData = await todayResponse.json();
      const weekData = await weekResponse.json();
      const monthData = await monthResponse.json();

      // Parse quota (may return 404 if not set)
      let quotas: QuotaStatus[] = [];
      if (quotaResponse.ok) {
        const quotaData = await quotaResponse.json();
        if (quotaData && !quotaData.error) {
          quotas = [quotaData];
        }
      }

      // Calculate total requests and avg cost
      const allAggregates = byProviderData.aggregates || [];
      const totalRequests = allAggregates.reduce(
        (sum: number, agg: CostAggregate) => sum + agg.requestCount,
        0
      );
      const totalCost = totalData.totalCostUsd || 0;

      setMetrics({
        totalCostToday: todayData.totalCostUsd || 0,
        totalCostWeek: weekData.totalCostUsd || 0,
        totalCostMonth: monthData.totalCostUsd || 0,
        totalCostAllTime: totalCost,
        totalRequests,
        avgCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
        byProvider: byProviderData.aggregates || [],
        byModel: byModelData.aggregates || [],
        byTouchpoint: byTouchpointData.aggregates || [],
        byTenant: byTenantData.aggregates || [],
        quotas,
      });
    } catch (err) {
      console.error('Failed to fetch cost metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load cost data');
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  const formatCurrency = (value: number): string => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(2)}k`;
    }
    return `$${value.toFixed(2)}`;
  };

  const formatNumber = (value: number): string => {
    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(2)}M`;
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toLocaleString();
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner" />
        <p>Loading cost data from Supabase...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <div className="error-icon">!</div>
        <h2>Failed to Load Cost Data</h2>
        <p>{error}</p>
        <button onClick={fetchMetrics}>Retry</button>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="dashboard-empty">
        <p>No cost data available yet.</p>
        <p className="hint">Cost data will appear once LLM requests are made.</p>
      </div>
    );
  }

  return (
    <div className="cost-analytics">
      <header className="dashboard-header">
        <div>
          <h1>LLM Cost Dashboard</h1>
          <p className="subtitle">Real-time cost tracking from Supabase</p>
        </div>
        <div className="time-range-selector">
          <button
            className={timeRange === '24h' ? 'active' : ''}
            onClick={() => setTimeRange('24h')}
          >
            24 Hours
          </button>
          <button
            className={timeRange === '7d' ? 'active' : ''}
            onClick={() => setTimeRange('7d')}
          >
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
          <button className="refresh-btn" onClick={fetchMetrics} title="Refresh data">
            ↻
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-icon">📅</div>
          <div className="metric-content">
            <div className="metric-value">{formatCurrency(metrics.totalCostToday)}</div>
            <div className="metric-label">Today</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">📊</div>
          <div className="metric-content">
            <div className="metric-value">{formatCurrency(metrics.totalCostWeek)}</div>
            <div className="metric-label">This Week</div>
          </div>
        </div>

        <div className="metric-card highlight">
          <div className="metric-icon">💰</div>
          <div className="metric-content">
            <div className="metric-value">{formatCurrency(metrics.totalCostMonth)}</div>
            <div className="metric-label">This Month</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">🔢</div>
          <div className="metric-content">
            <div className="metric-value">{formatNumber(metrics.totalRequests)}</div>
            <div className="metric-label">Total Requests</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon">⚡</div>
          <div className="metric-content">
            <div className="metric-value">${metrics.avgCostPerRequest.toFixed(4)}</div>
            <div className="metric-label">Avg Cost/Request</div>
          </div>
        </div>
      </div>

      {/* Quota Status */}
      {metrics.quotas.length > 0 && (
        <section className="quota-section">
          <h2>Budget Status</h2>
          <div className="quota-cards">
            {metrics.quotas.map((quota) => {
              const usagePercent = (quota.currentSpendUsd / quota.limitUsd) * 100;
              const remaining = quota.limitUsd - quota.currentSpendUsd;
              return (
                <div
                  key={quota.id}
                  className={`quota-card ${quota.isExceeded ? 'exceeded' : quota.warningExceeded ? 'warning' : ''}`}
                >
                  <div className="quota-header">
                    <span className="quota-scope">
                      {quota.scope === 'platform' ? 'Platform Budget' : `${quota.scope}: ${quota.scopeId}`}
                    </span>
                    <span className="quota-period">{quota.period}</span>
                  </div>
                  <div className="quota-progress">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${Math.min(usagePercent, 100)}%` }}
                      />
                    </div>
                    <div className="progress-labels">
                      <span>{formatCurrency(quota.currentSpendUsd)} used</span>
                      <span>{formatCurrency(remaining)} remaining</span>
                    </div>
                  </div>
                  <div className="quota-limit">
                    Limit: {formatCurrency(quota.limitUsd)} / {quota.period}
                  </div>
                  {quota.isExceeded && (
                    <div className="quota-alert exceeded">Budget exceeded!</div>
                  )}
                  {quota.warningExceeded && !quota.isExceeded && (
                    <div className="quota-alert warning">
                      Warning: {usagePercent.toFixed(0)}% used
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Breakdown Tables */}
      <div className="dashboard-content">
        {/* By Provider */}
        <section className="breakdown-section">
          <h2>Cost by Provider</h2>
          {metrics.byProvider.length > 0 ? (
            <div className="breakdown-table">
              <div className="table-header">
                <div>Provider</div>
                <div>Requests</div>
                <div>Total Cost</div>
                <div>Avg/Request</div>
              </div>
              {metrics.byProvider.map((item) => (
                <div key={item.value} className="table-row">
                  <div className="provider-name">{item.value || 'Unknown'}</div>
                  <div>{formatNumber(item.requestCount)}</div>
                  <div className="cost-value">{formatCurrency(item.totalCostUsd)}</div>
                  <div>${item.avgCostPerRequest.toFixed(4)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data">No provider data yet</p>
          )}
        </section>

        {/* By Model */}
        <section className="breakdown-section">
          <h2>Cost by Model</h2>
          {metrics.byModel.length > 0 ? (
            <div className="breakdown-table">
              <div className="table-header">
                <div>Model</div>
                <div>Requests</div>
                <div>Total Cost</div>
                <div>Avg/Request</div>
              </div>
              {metrics.byModel.map((item) => (
                <div key={item.value} className="table-row">
                  <div className="model-name">{item.value || 'Unknown'}</div>
                  <div>{formatNumber(item.requestCount)}</div>
                  <div className="cost-value">{formatCurrency(item.totalCostUsd)}</div>
                  <div>${item.avgCostPerRequest.toFixed(4)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data">No model data yet</p>
          )}
        </section>

        {/* By Touchpoint */}
        <section className="breakdown-section">
          <h2>Cost by Touchpoint</h2>
          {metrics.byTouchpoint.length > 0 ? (
            <div className="breakdown-table">
              <div className="table-header">
                <div>Touchpoint</div>
                <div>Requests</div>
                <div>Total Cost</div>
                <div>Avg/Request</div>
              </div>
              {metrics.byTouchpoint.map((item) => (
                <div key={item.value} className="table-row">
                  <div className="touchpoint-name">{item.value || 'Unknown'}</div>
                  <div>{formatNumber(item.requestCount)}</div>
                  <div className="cost-value">{formatCurrency(item.totalCostUsd)}</div>
                  <div>${item.avgCostPerRequest.toFixed(4)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data">No touchpoint data yet</p>
          )}
        </section>

        {/* By Tenant */}
        <section className="breakdown-section">
          <h2>Cost by Tenant</h2>
          {metrics.byTenant.length > 0 ? (
            <div className="breakdown-table">
              <div className="table-header">
                <div>Tenant</div>
                <div>Requests</div>
                <div>Total Cost</div>
                <div>Avg/Request</div>
              </div>
              {metrics.byTenant.map((item) => (
                <div key={item.value} className="table-row">
                  <div className="tenant-name">{item.value || 'Unknown'}</div>
                  <div>{formatNumber(item.requestCount)}</div>
                  <div className="cost-value">{formatCurrency(item.totalCostUsd)}</div>
                  <div>${item.avgCostPerRequest.toFixed(4)}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data">No tenant data yet</p>
          )}
        </section>
      </div>

      <style>{`
        .cost-analytics {
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
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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

        .quota-section {
          background: white;
          padding: 1.5rem;
          border-radius: 0.75rem;
          border: 1px solid #e5e7eb;
          margin-bottom: 2rem;
        }

        .quota-section h2 {
          margin: 0 0 1rem 0;
          font-size: 1.25rem;
          font-weight: 600;
        }

        .quota-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1rem;
        }

        .quota-card {
          padding: 1rem;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
          background: #f9fafb;
        }

        .quota-card.warning {
          border-color: #fbbf24;
          background: #fffbeb;
        }

        .quota-card.exceeded {
          border-color: #ef4444;
          background: #fef2f2;
        }

        .quota-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .quota-scope {
          font-weight: 600;
        }

        .quota-period {
          text-transform: capitalize;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .quota-progress {
          margin-bottom: 0.5rem;
        }

        .progress-bar {
          height: 8px;
          background: #e5e7eb;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }

        .progress-fill {
          height: 100%;
          background: #10b981;
          border-radius: 4px;
          transition: width 0.3s;
        }

        .quota-card.warning .progress-fill {
          background: #f59e0b;
        }

        .quota-card.exceeded .progress-fill {
          background: #ef4444;
        }

        .progress-labels {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          color: #6b7280;
        }

        .quota-limit {
          font-size: 0.875rem;
          color: #374151;
        }

        .quota-alert {
          margin-top: 0.5rem;
          padding: 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.875rem;
          font-weight: 500;
        }

        .quota-alert.warning {
          background: #fef3c7;
          color: #92400e;
        }

        .quota-alert.exceeded {
          background: #fee2e2;
          color: #991b1b;
        }

        .dashboard-content {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 1.5rem;
        }

        .breakdown-section {
          background: white;
          padding: 1.5rem;
          border-radius: 0.75rem;
          border: 1px solid #e5e7eb;
        }

        .breakdown-section h2 {
          margin: 0 0 1rem 0;
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
        }

        .breakdown-table {
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

        .table-row {
          display: grid;
          grid-template-columns: 2fr 1fr 1.5fr 1fr;
          gap: 1rem;
          padding: 0.75rem;
          border-radius: 0.375rem;
          transition: background 0.2s;
        }

        .table-row:hover {
          background: #f9fafb;
        }

        .provider-name,
        .model-name,
        .touchpoint-name,
        .tenant-name {
          font-weight: 500;
          color: #3b82f6;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .cost-value {
          font-weight: 600;
          color: #059669;
        }

        .no-data {
          color: #9ca3af;
          font-style: italic;
          text-align: center;
          padding: 2rem;
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
          .cost-analytics {
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
            grid-template-columns: 1.5fr 1fr 1fr 1fr;
            gap: 0.5rem;
            font-size: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}
