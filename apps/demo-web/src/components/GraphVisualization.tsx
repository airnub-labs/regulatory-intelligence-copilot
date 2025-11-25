'use client';

/**
 * GraphVisualization Component
 *
 * Interactive force-directed graph visualization for the regulatory knowledge graph.
 * Loads initial snapshot from GET /api/graph and subscribes to incremental updates
 * via GET /api/graph/stream (SSE).
 *
 * Features:
 * - Force-directed graph layout
 * - Real-time updates via SSE
 * - Jurisdiction and profile filtering
 * - Node and edge styling by type
 * - Interactive tooltips and selection
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  ),
});

interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  type: string;
  properties?: Record<string, unknown>;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphEdge[]; // ForceGraph2D expects 'links' not 'edges'
}

interface GraphPatch {
  type: 'graph_patch';
  timestamp: string;
  nodes_added?: GraphNode[];
  nodes_updated?: GraphNode[];
  nodes_removed?: string[];
  edges_added?: GraphEdge[];
  edges_removed?: Array<{ source: string; target: string; type: string }>;
}

interface GraphVisualizationProps {
  jurisdictions?: string[];
  profileType?: string;
  keyword?: string;
}

export function GraphVisualization({
  jurisdictions = ['IE'],
  profileType = 'single_director',
  keyword,
}: GraphVisualizationProps) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const eventSourceRef = useRef<EventSource | null>(null);
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Node colors by type
  const getNodeColor = (node: GraphNode) => {
    const colors: Record<string, string> = {
      Jurisdiction: '#3b82f6', // blue
      Region: '#8b5cf6', // purple
      Agreement: '#10b981', // green
      Regime: '#f59e0b', // amber
      Benefit: '#ec4899', // pink
      Relief: '#ef4444', // red
      Condition: '#6366f1', // indigo
      Timeline: '#14b8a6', // teal
      Section: '#8b5cf6', // violet
      Rule: '#f97316', // orange
      ProfileTag: '#06b6d4', // cyan
    };
    return colors[node.type] || '#6b7280'; // gray default
  };

  // Handle window resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Load initial graph snapshot
  const loadInitialGraph = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        jurisdictions: jurisdictions.join(','),
        profileType,
        ...(keyword && { keyword }),
      });

      const response = await fetch(`/api/graph?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to load graph: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.type === 'error') {
        throw new Error(data.error);
      }

      // Transform edges to links with id (required by force-graph)
      const transformedLinks = (data.edges || []).map((edge: GraphEdge) => ({
        ...edge,
        id: `${edge.source}-${edge.type}-${edge.target}`,
      }));

      setGraphData({
        nodes: data.nodes || [],
        links: transformedLinks,
      });
      setLastUpdate(data.timestamp);
      setLoading(false);
    } catch (err) {
      console.error('Error loading graph:', err);
      setError(err instanceof Error ? err.message : 'Failed to load graph');
      setLoading(false);
    }
  }, [jurisdictions, profileType, keyword]);

  // Apply graph patch
  const applyPatch = useCallback((patch: GraphPatch) => {
    setGraphData((prev) => {
      let newNodes = [...prev.nodes];
      let newLinks = [...prev.links];

      // Remove nodes (also removes associated edges)
      if (patch.nodes_removed && patch.nodes_removed.length > 0) {
        const removedIds = new Set(patch.nodes_removed);
        newNodes = newNodes.filter((n) => !removedIds.has(n.id));
        newLinks = newLinks.filter(
          (e) => !removedIds.has(e.source as string) && !removedIds.has(e.target as string)
        );
      }

      // Add nodes
      if (patch.nodes_added && patch.nodes_added.length > 0) {
        for (const node of patch.nodes_added) {
          if (!newNodes.find((n) => n.id === node.id)) {
            newNodes.push(node);
          }
        }
      }

      // Update nodes
      if (patch.nodes_updated && patch.nodes_updated.length > 0) {
        for (const update of patch.nodes_updated) {
          const index = newNodes.findIndex((n) => n.id === update.id);
          if (index !== -1) {
            newNodes[index] = { ...newNodes[index], ...update };
          }
        }
      }

      // Remove edges
      if (patch.edges_removed && patch.edges_removed.length > 0) {
        for (const edge of patch.edges_removed) {
          const index = newLinks.findIndex(
            (e) => e.source === edge.source && e.target === edge.target && e.type === edge.type
          );
          if (index !== -1) {
            newLinks.splice(index, 1);
          }
        }
      }

      // Add edges
      if (patch.edges_added && patch.edges_added.length > 0) {
        for (const edge of patch.edges_added) {
          const edgeWithId = { ...edge, id: `${edge.source}-${edge.type}-${edge.target}` };
          if (!newLinks.find((e) => (e as any).id === edgeWithId.id)) {
            newLinks.push(edgeWithId);
          }
        }
      }

      return { nodes: newNodes, links: newLinks };
    });
    setLastUpdate(patch.timestamp);
  }, []);

  // Connect to SSE stream
  const connectToStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const params = new URLSearchParams({
      jurisdictions: jurisdictions.join(','),
      profileType,
    });

    const eventSource = new EventSource(`/api/graph/stream?${params}`);

    eventSource.onopen = () => {
      console.log('[GraphVisualization] SSE connected');
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'connected') {
          console.log('[GraphVisualization] Stream connected:', data.message);
        } else if (data.type === 'graph_patch') {
          console.log('[GraphVisualization] Received patch:', data);
          applyPatch(data);
        }
      } catch (err) {
        console.error('[GraphVisualization] Error parsing SSE message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[GraphVisualization] SSE error:', err);
      setConnected(false);
      eventSource.close();

      // Reconnect after 5 seconds
      setTimeout(() => {
        console.log('[GraphVisualization] Reconnecting to stream...');
        connectToStream();
      }, 5000);
    };

    eventSourceRef.current = eventSource;
  }, [jurisdictions, profileType, applyPatch]);

  // Initialize
  useEffect(() => {
    loadInitialGraph();
    connectToStream();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [loadInitialGraph, connectToStream]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading regulatory graph...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="text-red-600 text-xl mb-2">⚠️ Error</div>
          <p className="text-gray-700 mb-4">{error}</p>
          <button
            onClick={loadInitialGraph}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-semibold mb-2">Graph is Empty</h3>
          <p className="text-gray-600 mb-4">
            The regulatory knowledge graph has no data yet. To populate it:
          </p>
          <ol className="text-left text-sm text-gray-700 space-y-2 mb-4">
            <li>1. Start Memgraph: <code className="bg-gray-100 px-1">docker run -p 7687:7687 memgraph/memgraph-platform</code></li>
            <li>2. Seed the graph: <code className="bg-gray-100 px-1">pnpm seed:all</code></li>
            <li>3. Refresh this page</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Status bar */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur rounded-lg shadow-lg p-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-sm font-medium">
            {connected ? 'Live Updates' : 'Disconnected'}
          </span>
        </div>
        <div className="text-xs text-gray-600">
          <div>Nodes: {graphData.nodes.length}</div>
          <div>Links: {graphData.links.length}</div>
          {lastUpdate && <div>Updated: {new Date(lastUpdate).toLocaleTimeString()}</div>}
        </div>
      </div>

      {/* Legend */}
      <div className="absolute top-4 right-4 z-10 bg-white/90 backdrop-blur rounded-lg shadow-lg p-4">
        <h4 className="text-sm font-semibold mb-2">Node Types</h4>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {['Jurisdiction', 'Region', 'Agreement', 'Regime', 'Benefit', 'Relief', 'Condition', 'Timeline'].map(
            (type) => (
              <div key={type} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getNodeColor({ type } as GraphNode) }}
                ></div>
                <span>{type}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Graph */}
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        nodeLabel={(node: any) => `${node.label || node.id}\n(${node.type})`}
        nodeColor={(node: any) => getNodeColor(node)}
        nodeRelSize={6}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.label || node.id;
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = getNodeColor(node);

          // Draw node circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
          ctx.fill();

          // Draw label
          ctx.fillStyle = '#333';
          ctx.fillText(label, node.x, node.y + 12);
        }}
        linkLabel={(link: any) => link.type}
        linkColor={() => '#94a3b8'}
        linkWidth={1.5}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.1}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        cooldownTicks={100}
        onNodeClick={(node: any) => {
          console.log('Node clicked:', node);
        }}
      />
    </div>
  );
}
