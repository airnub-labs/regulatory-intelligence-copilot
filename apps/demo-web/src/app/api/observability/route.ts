import { getObservabilityDiagnostics, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';

export const dynamic = 'force-dynamic';

export async function GET() {
  return requestContext.run(
    { tenantId: 'system', userId: 'observability' },
    () =>
      withSpan(
        'api.observability.diagnostics',
        { 'app.route': '/api/observability', 'app.tenant.id': 'system', 'app.user.id': 'observability' },
        () => Response.json(getObservabilityDiagnostics()),
      ),
  );
}
