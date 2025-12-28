import { getObservabilityDiagnostics, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/options';

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
        () => Response.json(getObservabilityDiagnostics()),
      ),
  );
}
