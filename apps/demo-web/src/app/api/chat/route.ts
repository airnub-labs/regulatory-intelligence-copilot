/**
 * Chat API endpoint for Regulatory Intelligence Copilot
 *
 * Handles conversational queries about tax, welfare, pensions, and regulatory compliance.
 * Uses provider-agnostic ComplianceEngine via Next.js adapter.
 */

import { createChatRouteHandler } from '@reg-copilot/reg-intel-next-adapter';

// Mark route as dynamic (don't pre-render during build)
export const dynamic = 'force-dynamic';

export const POST = createChatRouteHandler();
