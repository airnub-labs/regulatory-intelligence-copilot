import { getObservabilityDiagnostics } from '@reg-copilot/reg-intel-observability';

export const dynamic = 'force-dynamic';

export async function GET() {
  const diagnostics = getObservabilityDiagnostics();
  return Response.json(diagnostics);
}
