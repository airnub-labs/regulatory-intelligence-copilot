export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') return;

  // Use dynamic import to avoid bundling Node.js-only code for Edge Runtime
  const { initObservability } = await import('@reg-copilot/reg-intel-observability');
  const { initializePricingService } = await import('./src/lib/pricingInit');

  const envSamplingRatio = process.env.OTEL_TRACES_SAMPLING_RATIO
    ? Number(process.env.OTEL_TRACES_SAMPLING_RATIO)
    : undefined;

  await initObservability({
    serviceName: process.env.OTEL_SERVICE_NAME ?? '@reg-copilot/demo-web',
    serviceVersion: process.env.npm_package_version,
    environment: process.env.NODE_ENV,
    traceExporter: {
      url:
        process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    metricsExporter: {
      url:
        process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    },
    logsExporter: {
      // Enable OTEL logs by default in production (unless explicitly disabled)
      // In development, only enable if explicitly set to 'true'
      enabled:
        process.env.OTEL_LOGS_ENABLED === 'true' ||
        (process.env.NODE_ENV === 'production' && process.env.OTEL_LOGS_ENABLED !== 'false'),
      url:
        process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      useBatchProcessor: process.env.NODE_ENV === 'production',
    },
    traceSampling: {
      parentBasedRatio: Number.isFinite(envSamplingRatio) ? envSamplingRatio : undefined,
      alwaysSampleErrors: process.env.OTEL_TRACES_ALWAYS_SAMPLE_ERRORS !== 'false',
    },
  });

  // Initialize dynamic pricing service with Supabase
  initializePricingService();

  // Initialize cost tracking systems
  console.log('[Instrumentation] Initializing cost tracking...');
  try {
    // Initialize LLM cost tracking
    const { initializeCostTracking } = await import('./src/lib/costTracking');
    initializeCostTracking();
    console.log('[Instrumentation] LLM cost tracking initialized successfully');

    // Initialize E2B cost tracking
    const { initializeE2BCostTracking } = await import('./src/lib/e2bCostTracking');
    initializeE2BCostTracking();
    console.log('[Instrumentation] E2B cost tracking initialized successfully');

    console.log('[Instrumentation] All cost tracking systems initialized');
  } catch (error) {
    console.error('[Instrumentation] Failed to initialize cost tracking:', error);
  }

  // Initialize compaction system with snapshot support
  console.log('[Instrumentation] Initializing compaction system...');
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('[Instrumentation] Supabase credentials not found, skipping compaction system initialization');
    } else {
      const { createClient } = await import('@supabase/supabase-js');
      const { SupabaseSnapshotStorage } = await import('@reg-copilot/reg-intel-conversations/compaction');
      const { initializeCompactionSystem } = await import('./src/lib/compactionInit');

      // Create Supabase client for snapshot storage
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: 'copilot_internal' },
      });

      // Create snapshot storage provider
      const snapshotStorage = new SupabaseSnapshotStorage(supabase as any);

      // Initialize compaction system
      await initializeCompactionSystem({
        snapshotStorage,
        snapshotTTLHours: 24, // Snapshots expire after 24 hours
      });

      console.log('[Instrumentation] Compaction system initialized successfully');
    }
  } catch (error) {
    console.error('[Instrumentation] Failed to initialize compaction system:', error);
  }
}
