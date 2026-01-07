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
import { AppHeader } from '@/components/layout/app-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, RefreshCw, DollarSign, Activity, TrendingUp, Zap, Calendar, BarChart3 } from 'lucide-react';

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

/**
 * Export data to CSV
 */
function exportToCSV(metrics: CostMetrics, timeRange: TimeRange) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rows: string[] = [
    'LLM Cost Report',
    `Generated: ${new Date().toLocaleString()}`,
    `Time Range: ${timeRange}`,
    '',
    'Summary',
    `Today,$${metrics.totalCostToday.toFixed(4)}`,
    `This Week,$${metrics.totalCostWeek.toFixed(4)}`,
    `This Month,$${metrics.totalCostMonth.toFixed(4)}`,
    `All Time,$${metrics.totalCostAllTime.toFixed(4)}`,
    `Total Requests,${metrics.totalRequests}`,
    `Avg Cost/Request,$${metrics.avgCostPerRequest.toFixed(6)}`,
    '',
    'Cost by Provider',
    'Provider,Requests,Total Cost,Avg Cost/Request',
    ...metrics.byProvider.map(p => `${p.value},${p.requestCount},$${p.totalCostUsd.toFixed(4)},$${p.avgCostPerRequest.toFixed(6)}`),
    '',
    'Cost by Model',
    'Model,Requests,Total Cost,Avg Cost/Request',
    ...metrics.byModel.map(m => `${m.value},${m.requestCount},$${m.totalCostUsd.toFixed(4)},$${m.avgCostPerRequest.toFixed(6)}`),
    '',
    'Cost by Touchpoint',
    'Touchpoint,Requests,Total Cost,Avg Cost/Request',
    ...metrics.byTouchpoint.map(t => `${t.value},${t.requestCount},$${t.totalCostUsd.toFixed(4)},$${t.avgCostPerRequest.toFixed(6)}`),
    '',
    'Cost by Tenant',
    'Tenant,Requests,Total Cost,Avg Cost/Request',
    ...metrics.byTenant.map(t => `${t.value || 'Unknown'},${t.requestCount},$${t.totalCostUsd.toFixed(4)},$${t.avgCostPerRequest.toFixed(6)}`),
  ];

  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `llm-costs-${timeRange}-${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
      <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.2),transparent_35%)] blur-3xl" />
        <AppHeader
          subtitle="Real-time LLM cost tracking and budget management"
          primaryAction={{ label: 'Back to chat', href: '/', variant: 'outline' }}
        />
        <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading cost data from Supabase...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.2),transparent_35%)] blur-3xl" />
        <AppHeader
          subtitle="Real-time LLM cost tracking and budget management"
          primaryAction={{ label: 'Back to chat', href: '/', variant: 'outline' }}
        />
        <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <Card className="mx-4 max-w-md">
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <Activity className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Failed to Load Cost Data</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={fetchMetrics} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.2),transparent_35%)] blur-3xl" />
        <AppHeader
          subtitle="Real-time LLM cost tracking and budget management"
          primaryAction={{ label: 'Back to chat', href: '/', variant: 'outline' }}
        />
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Card>
            <CardContent className="flex min-h-[400px] flex-col items-center justify-center gap-2 py-16">
              <BarChart3 className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No cost data available yet.</p>
              <p className="text-sm text-muted-foreground">Cost data will appear once LLM requests are made.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.2),transparent_35%)] blur-3xl" />
      <AppHeader
        subtitle="Real-time LLM cost tracking and budget management"
        primaryAction={{ label: 'Back to chat', href: '/', variant: 'outline' }}
      />

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-8 pt-4">
        {/* Header with time range selector */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cost Analytics</h1>
            <p className="text-sm text-muted-foreground">Monitor LLM usage and spending across your organization</p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <TabsList>
                <TabsTrigger value="24h">24h</TabsTrigger>
                <TabsTrigger value="7d">7d</TabsTrigger>
                <TabsTrigger value="30d">30d</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="icon" onClick={fetchMetrics} title="Refresh data">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={() => exportToCSV(metrics, timeRange)} title="Export CSV">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.totalCostToday)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.totalCostWeek)}</div>
            </CardContent>
          </Card>
          <Card className="border-primary/50 bg-gradient-to-br from-primary/10 via-primary/5 to-background">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(metrics.totalCostMonth)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(metrics.totalRequests)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg/Request</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${metrics.avgCostPerRequest.toFixed(4)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Quota Status */}
        {metrics.quotas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Budget Status</CardTitle>
              <CardDescription>Monitor spending against configured limits</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {metrics.quotas.map((quota) => {
                const usagePercent = (quota.currentSpendUsd / quota.limitUsd) * 100;
                const remaining = quota.limitUsd - quota.currentSpendUsd;
                return (
                  <div key={quota.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {quota.scope === 'platform' ? 'Platform Budget' : `${quota.scope}: ${quota.scopeId}`}
                        </span>
                        <Badge variant="outline" className="capitalize">{quota.period}</Badge>
                      </div>
                      <span className="text-muted-foreground">
                        {formatCurrency(quota.currentSpendUsd)} / {formatCurrency(quota.limitUsd)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${
                          quota.isExceeded
                            ? 'bg-destructive'
                            : quota.warningExceeded
                            ? 'bg-yellow-500'
                            : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(usagePercent, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{formatCurrency(remaining)} remaining</span>
                      {quota.isExceeded && (
                        <Badge variant="destructive">Budget exceeded</Badge>
                      )}
                      {quota.warningExceeded && !quota.isExceeded && (
                        <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                          {usagePercent.toFixed(0)}% used
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Cost Breakdown Tables */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* By Provider */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Provider</CardTitle>
              <CardDescription>LLM provider usage breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.byProvider.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Avg/Req</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.byProvider.map((item) => (
                      <TableRow key={item.value}>
                        <TableCell className="font-medium">{item.value || 'Unknown'}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.requestCount)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatCurrency(item.totalCostUsd)}
                        </TableCell>
                        <TableCell className="text-right">${item.avgCostPerRequest.toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No provider data yet</p>
              )}
            </CardContent>
          </Card>

          {/* By Model */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Model</CardTitle>
              <CardDescription>Model-level cost analysis</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.byModel.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Avg/Req</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.byModel.map((item) => (
                      <TableRow key={item.value}>
                        <TableCell className="font-medium">{item.value || 'Unknown'}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.requestCount)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatCurrency(item.totalCostUsd)}
                        </TableCell>
                        <TableCell className="text-right">${item.avgCostPerRequest.toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No model data yet</p>
              )}
            </CardContent>
          </Card>

          {/* By Touchpoint */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Touchpoint</CardTitle>
              <CardDescription>Usage by task or feature</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.byTouchpoint.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Touchpoint</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Avg/Req</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.byTouchpoint.map((item) => (
                      <TableRow key={item.value}>
                        <TableCell className="font-medium">{item.value || 'Unknown'}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.requestCount)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatCurrency(item.totalCostUsd)}
                        </TableCell>
                        <TableCell className="text-right">${item.avgCostPerRequest.toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No touchpoint data yet</p>
              )}
            </CardContent>
          </Card>

          {/* By Tenant */}
          <Card>
            <CardHeader>
              <CardTitle>Cost by Tenant</CardTitle>
              <CardDescription>Multi-tenant usage breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {metrics.byTenant.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Avg/Req</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.byTenant.map((item) => (
                      <TableRow key={item.value}>
                        <TableCell className="font-medium">{item.value || 'Unknown'}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.requestCount)}</TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatCurrency(item.totalCostUsd)}
                        </TableCell>
                        <TableCell className="text-right">${item.avgCostPerRequest.toFixed(4)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No tenant data yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
