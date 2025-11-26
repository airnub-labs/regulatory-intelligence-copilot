/**
 * Chat API endpoint for Regulatory Intelligence Copilot
 *
 * Handles conversational queries about tax, welfare, pensions, and regulatory compliance.
 * Uses provider-agnostic ComplianceEngine via Next.js adapter.
 */

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { createChatRouteHandler } = await import('@reg-copilot/reg-intel-next-adapter');
  return createChatRouteHandler()(request);
}
