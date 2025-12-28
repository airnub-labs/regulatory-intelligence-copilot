import { requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { authMetrics } from '@/lib/auth/authMetrics';
import { systemMetrics, businessMetrics } from '@/lib/metrics';
import type { AggregatedMetrics } from '@/lib/metrics/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  // SEC.1: Add authentication check - observability endpoint should be protected
  const session = (await getServerSession(authOptions)) as { user?: { id?: string; tenantId?: string } } | null;

  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tenantId = session.user.tenantId ?? 'system';
  const userId = session.user.id;

  return requestContext.run(
    { tenantId, userId },
    () =>
      withSpan(
        'api.observability.diagnostics',
        { 'app.route': '/api/observability', 'app.tenant.id': tenantId, 'app.user.id': userId },
        async () => {
          // Collect metrics from all categories
          const systemMetricsData = systemMetrics.getMetrics();
          const authenticationMetricsData = authMetrics.getMetrics();
          const businessMetricsData = businessMetrics.getMetrics();

          // Build aggregated metrics response
          const aggregatedMetrics: AggregatedMetrics = {
            system: systemMetricsData,
            authentication: authenticationMetricsData,
            business: businessMetricsData,
            timestamp: new Date().toISOString(),
            version: process.env.APP_VERSION || process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
          };

          return Response.json(aggregatedMetrics);
        },
      ),
  );
}
