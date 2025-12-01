/**
 * Graph Visualization Page
 *
 * Interactive regulatory knowledge graph visualization.
 * Displays force-directed graph with real-time SSE updates.
 */

import { AppHeader } from '@/components/layout/app-header';
import { GraphVisualization } from '@/components/GraphVisualization';
import { DEFAULT_PROFILE_ID } from '@reg-copilot/reg-intel-core';

export default function GraphPage() {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.18),transparent_32%),radial-gradient(circle_at_85%_10%,rgba(14,165,233,0.2),transparent_35%)] blur-3xl" />
      <AppHeader
        subtitle="Interactive visualization of regulatory relationships and cross-border frameworks"
        primaryAction={{ label: 'Back to chat', href: '/', variant: 'outline' }}
      />

      <main className="mx-auto flex h-[calc(100vh-5rem)] w-full max-w-6xl flex-col gap-4 px-4 pb-6 pt-4">
        <div className="rounded-3xl border bg-card/90 px-6 py-4 shadow-lg backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Regulatory Knowledge Graph</h1>
              <p className="text-sm text-muted-foreground">
                Explore graph edges, contexts, and cross-border rules live while the copilot reasons over them.
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden rounded-3xl border bg-card/95 shadow-xl backdrop-blur">
          <GraphVisualization
            jurisdictions={['IE', 'UK', 'IM', 'EU']}
            profileType={DEFAULT_PROFILE_ID}
          />
        </div>
      </main>
    </div>
  );
}
