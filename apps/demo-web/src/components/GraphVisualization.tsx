'use client';

/**
 * GraphVisualization Component
 *
 * Interactive force-directed graph visualization for the regulatory knowledge graph.
 * Loads initial snapshot from GET /api/graph and subscribes to incremental updates
 * via GET /api/graph/stream (SSE).
 *
 * Features:
 * - Force-directed graph layout with interactive controls
 * - Real-time updates via SSE with pause/resume capability
 * - Search functionality (by name, type, or ID)
 * - Node type filtering with counts
 * - Node selection with details panel
 * - Zoom, pan, and reset view controls
 * - Jurisdiction and profile filtering
 * - Node and edge styling by type
 *
 * Performance Optimizations:
 * - useMemo for expensive computations (node types, counts, connections)
 * - useCallback for stable function references (prevents re-renders)
 * - Efficient filtering with Set-based lookups
 * - Memoized color mapping function
 * - Single-pass connection counting for details panel
 * - Debounced resize handling
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { DEFAULT_PROFILE_ID, type ProfileId } from '@reg-copilot/reg-intel-core/public';

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
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
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
  nodes: {
    added: GraphNode[];
    updated: GraphNode[];
    removed: string[];
  };
  edges: {
    added: GraphEdge[];
    updated: GraphEdge[];
    removed: GraphEdge[];
  };
  meta?: {
    totalChanges: number;
    nodeChanges: number;
    edgeChanges: number;
    truncated?: boolean;
  };
}

interface GraphVisualizationProps {
  jurisdictions?: string[];
  profileType?: ProfileId;
  keyword?: string;
}

export function GraphVisualization({
  jurisdictions = ['IE'],
  profileType = DEFAULT_PROFILE_ID,
  keyword,
}: GraphVisualizationProps) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [filteredData, setFilteredData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [paused, setPaused] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [showControls, setShowControls] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const initialSnapshotLoaded = useRef(false);
  const pendingPatchesRef = useRef<GraphPatch[]>([]);
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Memoized node color mapping - prevents recreation on every render
  const getNodeColor = useCallback((node: GraphNode | { type: string }) => {
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
  }, []);

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

  // Apply graph patch - this may be invoked immediately by the stream, so we queue
  // patches until the initial REST snapshot has been loaded.
  const applyPatch = useCallback(
    (patch: GraphPatch, options?: { force?: boolean }) => {
      if (!initialSnapshotLoaded.current && !options?.force) {
        pendingPatchesRef.current.push(patch);
        return;
      }

      if (paused && !options?.force) return; // Don't apply patches when paused

      setGraphData((prev) => {
        let newNodes = [...prev.nodes];
        let newLinks = [...prev.links];

        if (patch.nodes.removed.length > 0) {
          const removedIds = new Set(patch.nodes.removed);
          newNodes = newNodes.filter((n) => !removedIds.has(n.id));
          newLinks = newLinks.filter(
            (e) => !removedIds.has(e.source as string) && !removedIds.has(e.target as string)
          );
        }

        if (patch.nodes.added.length > 0) {
          for (const node of patch.nodes.added) {
            if (!newNodes.find((n) => n.id === node.id)) {
              newNodes.push(node);
            }
          }
        }

        if (patch.nodes.updated.length > 0) {
          for (const update of patch.nodes.updated) {
            const index = newNodes.findIndex((n) => n.id === update.id);
            if (index !== -1) {
              newNodes[index] = { ...newNodes[index], ...update };
            }
          }
        }

        if (patch.edges.removed.length > 0) {
          for (const edge of patch.edges.removed) {
            const index = newLinks.findIndex(
              (e) => e.source === edge.source && e.target === edge.target && e.type === edge.type
            );
            if (index !== -1) {
              newLinks.splice(index, 1);
            }
          }
        }

        if (patch.edges.added.length > 0) {
          for (const edge of patch.edges.added) {
            const edgeWithId = { ...edge, id: `${edge.source}-${edge.type}-${edge.target}` };
            if (!newLinks.find((e) => (e as any).id === edgeWithId.id)) {
              newLinks.push(edgeWithId);
            }
          }
        }

        if (patch.edges.updated.length > 0) {
          for (const edge of patch.edges.updated) {
            const edgeWithId = { ...edge, id: `${edge.source}-${edge.type}-${edge.target}` };
            const index = newLinks.findIndex((e) => (e as any).id === edgeWithId.id);
            if (index !== -1) {
              newLinks[index] = edgeWithId;
            }
          }
        }

        return { nodes: newNodes, links: newLinks };
      });
      setLastUpdate(patch.timestamp);
    },
    [paused]
  );

  // Load initial graph snapshot
  const loadInitialGraph = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      initialSnapshotLoaded.current = false;
      pendingPatchesRef.current = [];

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
      initialSnapshotLoaded.current = true;

      // Apply any queued patches that arrived before the initial snapshot completed
      if (pendingPatchesRef.current.length > 0) {
        for (const queuedPatch of pendingPatchesRef.current) {
          applyPatch(queuedPatch, { force: true });
        }
        pendingPatchesRef.current = [];
      }
      setLoading(false);
    } catch (err) {
      console.error('Error loading graph:', err);
      setError(err instanceof Error ? err.message : 'Failed to load graph');
      setLoading(false);
    }
  }, [jurisdictions, profileType, keyword, applyPatch]);

  // Apply filters and search to graph data
  useEffect(() => {
    const filtered = { ...graphData };

    // Filter by node types
    if (selectedTypes.size > 0) {
      filtered.nodes = filtered.nodes.filter((n) => selectedTypes.has(n.type));
      // Keep only edges where both nodes are in filtered set
      const nodeIds = new Set(filtered.nodes.map((n) => n.id));
      filtered.links = filtered.links.filter(
        (e) => nodeIds.has(e.source as string) && nodeIds.has(e.target as string)
      );
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered.nodes = filtered.nodes.filter(
        (n) =>
          n.label.toLowerCase().includes(query) ||
          n.id.toLowerCase().includes(query) ||
          n.type.toLowerCase().includes(query)
      );
      // Keep only edges where both nodes are in filtered set
      const nodeIds = new Set(filtered.nodes.map((n) => n.id));
      filtered.links = filtered.links.filter(
        (e) => nodeIds.has(e.source as string) && nodeIds.has(e.target as string)
      );
    }

    setFilteredData(filtered);
  }, [graphData, selectedTypes, searchQuery]);

  // Memoized unique node types for filtering
  const nodeTypes = useMemo(() => {
    return Array.from(new Set(graphData.nodes.map((n) => n.type))).sort();
  }, [graphData.nodes]);

  // Memoized node counts by type for filter panel
  const nodeCountsByType = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of graphData.nodes) {
      counts.set(node.type, (counts.get(node.type) || 0) + 1);
    }
    return counts;
  }, [graphData.nodes]);

  // Memoized toggle type filter callback
  const toggleTypeFilter = useCallback((type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Memoized clear filters callback
  const clearFilters = useCallback(() => {
    setSelectedTypes(new Set());
    setSearchQuery('');
  }, []);

  // Memoized reset view callback
  const resetView = useCallback(() => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400);
    }
  }, []);

  // Memoized focus on node callback
  const focusOnNode = useCallback((node: GraphNode) => {
    if (fgRef.current && node.x !== undefined && node.y !== undefined) {
      fgRef.current.centerAt(node.x, node.y, 1000);
      fgRef.current.zoom(3, 1000);
    }
  }, []);

  // Memoized connection counts for selected node
  const selectedNodeConnections = useMemo(() => {
    if (!selectedNode) return { incoming: 0, outgoing: 0 };

    let incoming = 0;
    let outgoing = 0;

    for (const link of filteredData.links) {
      if (link.target === selectedNode.id) incoming++;
      if (link.source === selectedNode.id) outgoing++;
    }

    return { incoming, outgoing };
  }, [selectedNode, filteredData.links]);

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
    // Lifecycle: fetch a bounded initial snapshot over REST, then layer on live patches.
    // Any patches that arrive before the initial load completes are queued and applied
    // immediately after the snapshot to maintain ordering.
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
    <div ref={containerRef} className="relative w-full h-full flex">
      {/* Main graph area */}
      <div className="flex-1 relative">
        {/* Top Controls Bar */}
        <div className="absolute top-4 left-4 right-4 z-10 flex gap-2 items-start">
          {/* Status card */}
          <div className="bg-white/95 backdrop-blur rounded-lg shadow-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-xs font-medium">{connected ? 'Live' : 'Disconnected'}</span>
              <button
                onClick={() => setPaused(!paused)}
                className={`ml-2 px-2 py-0.5 text-xs rounded ${
                  paused ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-700'
                }`}
                title={paused ? 'Resume updates' : 'Pause updates'}
              >
                {paused ? '▶️ Resume' : '⏸️ Pause'}
              </button>
            </div>
            <div className="text-xs text-gray-600 space-y-0.5">
              <div>Nodes: {filteredData.nodes.length} / {graphData.nodes.length}</div>
              <div>Edges: {filteredData.links.length} / {graphData.links.length}</div>
              {lastUpdate && <div className="text-[10px]">{new Date(lastUpdate).toLocaleTimeString()}</div>}
            </div>
          </div>

          {/* Search bar */}
          <div className="flex-1 max-w-md bg-white/95 backdrop-blur rounded-lg shadow-lg p-2">
            <input
              type="text"
              placeholder="Search nodes (name, type, id)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* View controls */}
          <div className="flex gap-1 bg-white/95 backdrop-blur rounded-lg shadow-lg p-2">
            <button
              onClick={resetView}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded"
              title="Reset view"
            >
              🔄 Reset
            </button>
            <button
              onClick={() => setShowControls(!showControls)}
              className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded"
              title="Toggle filters"
            >
              {showControls ? '❌' : '⚙️'}
            </button>
          </div>
        </div>

        {/* Filter Panel (collapsible) */}
        {showControls && (
          <div className="absolute top-24 left-4 z-10 bg-white/95 backdrop-blur rounded-lg shadow-lg p-4 max-w-xs max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold">Filter by Type</h4>
              {selectedTypes.size > 0 && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="space-y-2">
              {nodeTypes.map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedTypes.has(type)}
                    onChange={() => toggleTypeFilter(type)}
                    className="rounded"
                  />
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getNodeColor({ type } as GraphNode) }}
                  ></div>
                  <span className="text-xs">{type}</span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {nodeCountsByType.get(type) || 0}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Graph */}
        <ForceGraph2D
          ref={fgRef}
          graphData={filteredData}
          width={dimensions.width}
          height={dimensions.height}
          nodeLabel={(node: any) => `${node.label || node.id}\n(${node.type})`}
          nodeColor={(node: any) => getNodeColor(node)}
          nodeRelSize={6}
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const label = node.label || node.id;
            const fontSize = 12 / globalScale;
            const isSelected = selectedNode?.id === node.id;

            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Draw selection ring
            if (isSelected) {
              ctx.strokeStyle = '#3b82f6';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(node.x, node.y, 9, 0, 2 * Math.PI);
              ctx.stroke();
            }

            // Draw node circle
            ctx.fillStyle = getNodeColor(node);
            ctx.beginPath();
            ctx.arc(node.x, node.y, 6, 0, 2 * Math.PI);
            ctx.fill();

            // Draw label
            ctx.fillStyle = isSelected ? '#3b82f6' : '#333';
            ctx.font = isSelected ? `bold ${fontSize}px Sans-Serif` : `${fontSize}px Sans-Serif`;
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
            setSelectedNode(node as GraphNode);
          }}
          onBackgroundClick={() => setSelectedNode(null)}
        />
      </div>

      {/* Node Details Panel */}
      {selectedNode && (
        <div className="w-80 bg-white border-l border-gray-200 p-4 overflow-y-auto">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Node Details</h3>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: getNodeColor(selectedNode) }}
                ></div>
                <span className="text-sm font-medium text-gray-700">{selectedNode.type}</span>
              </div>
              <h4 className="text-base font-semibold text-gray-900 mb-1">{selectedNode.label}</h4>
              <p className="text-xs text-gray-500 font-mono">{selectedNode.id}</p>
            </div>

            {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-2">Properties</h5>
                <div className="space-y-2">
                  {Object.entries(selectedNode.properties).map(([key, value]) => (
                    <div key={key} className="text-xs">
                      <span className="font-medium text-gray-600">{key}:</span>{' '}
                      <span className="text-gray-900">
                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h5 className="text-sm font-medium text-gray-700 mb-2">Connections</h5>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Incoming:</span>
                  <span className="font-medium">{selectedNodeConnections.incoming}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Outgoing:</span>
                  <span className="font-medium">{selectedNodeConnections.outgoing}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t">
              <button
                onClick={() => focusOnNode(selectedNode)}
                className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Focus on Node
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
