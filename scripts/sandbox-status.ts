import { getSandboxStatus } from '../packages/reg-intel-core/src/sandboxManager.js';
import { createLogger } from '../packages/reg-intel-core/src/logger.js';
import { runWithContext } from '../packages/reg-intel-core/src/observability/requestContext.js';

const logger = createLogger({ component: 'SandboxStatusCLI' });

async function main(): Promise<void> {
  await runWithContext({ correlationId: `sandbox-status-${Date.now()}` }, async () => {
    const status = await getSandboxStatus();
    logger.info('Sandbox status diagnostics', { status });
    console.log(JSON.stringify(status, null, 2));
  });
}

main().catch((error) => {
  logger.error('Failed to collect sandbox status', { error });
  process.exit(1);
});
