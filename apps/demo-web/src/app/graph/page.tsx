/**
 * Graph Visualization Page
 *
 * Interactive regulatory knowledge graph visualization.
 * Displays force-directed graph with real-time SSE updates.
 */

import { GraphVisualization } from '@/components/GraphVisualization';

export default function GraphPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Regulatory Knowledge Graph</h1>
        <p className="mt-1 text-sm text-gray-600">
          Interactive visualization of regulatory relationships and cross-border frameworks
        </p>
      </header>

      <div className="flex-1">
        <GraphVisualization
          jurisdictions={['IE', 'UK', 'NI', 'IM', 'EU']}
          profileType="single_director"
        />
      </div>
    </main>
  );
}
