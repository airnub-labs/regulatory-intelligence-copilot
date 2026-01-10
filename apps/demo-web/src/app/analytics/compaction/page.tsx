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
 * copilot_audit.compaction_operations table in Supabase.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Database, Zap, Gauge, CheckCircle2, BarChart3, Clock } from 'lucide-react';

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
      <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.2),transparent_35%)] blur-3xl" />
        <AppHeader
          subtitle="Conversation compression performance metrics and analytics"
          primaryAction={{ label: 'Back to chat', href: '/', variant: 'outline' }}
        />
        <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading compaction analytics...</p>
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
          subtitle="Conversation compression performance metrics and analytics"
          primaryAction={{ label: 'Back to chat', href: '/', variant: 'outline' }}
        />
        <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <Card className="mx-4 max-w-md">
            <CardHeader>
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <Database className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Failed to Load Metrics</CardTitle>
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
          subtitle="Conversation compression performance metrics and analytics"
          primaryAction={{ label: 'Back to chat', href: '/', variant: 'outline' }}
        />
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Card>
            <CardContent className="flex min-h-[400px] flex-col items-center justify-center gap-2 py-16">
              <BarChart3 className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">No compaction data available yet.</p>
              <p className="text-sm text-muted-foreground">Compaction metrics will appear once operations are performed.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const avgCompressionPercent = ((1 - metrics.averageCompressionRatio) * 100).toFixed(1);
  const hasData = metrics.totalOperations > 0;

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.2),transparent_35%)] blur-3xl" />
      <AppHeader
        subtitle="Conversation compression performance metrics and analytics"
        primaryAction={{ label: 'Back to chat', href: '/', variant: 'outline' }}
      />

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-8 pt-4">
        {/* Header with time range selector */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Compaction Analytics</h1>
            <p className="text-sm text-muted-foreground">Monitor conversation compression and token optimization</p>
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
          </div>
        </div>

        {!hasData ? (
          <Card className="border-dashed">
            <CardContent className="flex min-h-[400px] flex-col items-center justify-center gap-4 py-16">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
                <BarChart3 className="h-10 w-10 text-muted-foreground" />
              </div>
              <div className="text-center">
                <h2 className="text-xl font-semibold">No Compaction Operations Yet</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Compaction metrics will appear here once conversations are compacted.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Compaction occurs automatically during long conversations or can be triggered manually.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Metric Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Operations</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(metrics.totalOperations)}</div>
                </CardContent>
              </Card>

              <Card className="border-primary/50 bg-gradient-to-br from-primary/10 via-primary/5 to-background">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Tokens Saved</CardTitle>
                  <Database className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(metrics.totalTokensSaved)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Compression</CardTitle>
                  <Gauge className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{avgCompressionPercent}%</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.averageDurationMs}ms</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Messages</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatNumber(metrics.totalMessagesRemoved)}</div>
                  <p className="text-xs text-muted-foreground">Removed</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.successRate.toFixed(1)}%</div>
                </CardContent>
              </Card>
            </div>

            {/* Strategy Performance Table */}
            <Card>
              <CardHeader>
                <CardTitle>Strategy Performance</CardTitle>
                <CardDescription>Compaction strategy effectiveness breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.strategyBreakdown.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Strategy</TableHead>
                        <TableHead className="text-right">Operations</TableHead>
                        <TableHead className="text-right">Tokens Saved</TableHead>
                        <TableHead className="text-right">Avg Compression</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metrics.strategyBreakdown.map((strategy) => (
                        <TableRow key={strategy.strategy}>
                          <TableCell className="font-medium capitalize">
                            {strategy.strategy.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell className="text-right">{strategy.operations.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            {formatNumber(strategy.tokensSaved)}
                          </TableCell>
                          <TableCell className="text-right">
                            {((1 - strategy.avgCompressionRatio) * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No strategy data available</p>
                )}
              </CardContent>
            </Card>

            {/* Recent Operations Table */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Operations</CardTitle>
                <CardDescription>Latest compaction operations and their results</CardDescription>
              </CardHeader>
              <CardContent>
                {metrics.recentOperations.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Conversation</TableHead>
                        <TableHead>Strategy</TableHead>
                        <TableHead className="text-right">Tokens Saved</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metrics.recentOperations.map((op) => (
                        <TableRow key={op.id}>
                          <TableCell className="text-muted-foreground">{formatTimestamp(op.timestamp)}</TableCell>
                          <TableCell className="font-mono text-xs" title={op.conversationId || undefined}>
                            {formatConversationId(op.conversationId)}
                          </TableCell>
                          <TableCell className="capitalize">{op.strategy.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="text-right font-medium">{formatNumber(op.tokensSaved)}</TableCell>
                          <TableCell className="text-center">
                            {op.success ? (
                              <Badge variant="outline" className="border-green-500 text-green-600">
                                Success
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Failed</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="py-8 text-center text-sm text-muted-foreground">No recent operations</p>
                )}
              </CardContent>
            </Card>

            {/* LLM Usage Card */}
            {metrics.operationsUsingLlm > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>LLM Usage</CardTitle>
                  <CardDescription>Operations using LLM for intelligent compaction</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <span className="text-sm text-muted-foreground">Operations using LLM</span>
                      <span className="text-2xl font-bold">{metrics.operationsUsingLlm.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <span className="text-sm text-muted-foreground">Total LLM cost</span>
                      <span className="text-2xl font-bold">${metrics.totalCostUsd.toFixed(4)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}
