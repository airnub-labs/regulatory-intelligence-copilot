import { getObservabilityDiagnostics, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';
import { authMetrics } from '@/lib/auth/authMetrics';
import { distributedValidationCache } from '@/lib/auth/distributedValidationCache';

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
          // Get base observability diagnostics
          const baseDiagnostics = getObservabilityDiagnostics();

          // Get authentication metrics
          const authenticationMetrics = authMetrics.getMetrics();

          // Get cache stats
          const cacheStats = await distributedValidationCache.getStats();

          // Combine all diagnostics
          return Response.json({
            ...baseDiagnostics,
            authentication: authenticationMetrics,
            validationCache: cacheStats,
          });
        },
      ),
  );
}
