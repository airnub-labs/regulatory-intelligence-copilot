'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full">Loading graph...</div>,
});

interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
}

interface GraphLink {
  source: string;
  target: string;
  type: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// Color map for different node types
const nodeColors: Record<string, string> = {
  RFC: '#3b82f6',      // blue
  OWASP: '#ef4444',    // red
  Endpoint: '#10b981', // green
  Finding: '#f59e0b',  // amber
  unknown: '#6b7280',  // gray
};

export default function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const fetchGraph = useCallback(async () => {
    try {
      const response = await fetch('/api/graph');
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setGraphData(data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch graph');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchGraph();

    if (autoRefresh) {
      const interval = setInterval(fetchGraph, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    }
  }, [fetchGraph, autoRefresh]);

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

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Knowledge Graph Viewer</h1>
          <p className="text-sm text-gray-400">
            {graphData.nodes.length} nodes, {graphData.links.length} relationships
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (5s)
          </label>
          <button
            onClick={fetchGraph}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm"
          >
            Refresh Now
          </button>
          <a
            href="/"
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
          >
            Back to Chat
          </a>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-2 border-b border-gray-700 flex gap-4 text-sm">
        {Object.entries(nodeColors).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span>{type}</span>
          </div>
        ))}
      </div>

      {/* Graph Container */}
      <div ref={containerRef} className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-lg">Loading graph...</div>
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-4 right-4 p-4 bg-red-900/50 border border-red-700 rounded">
            <p className="text-red-300">Error: {error}</p>
            <p className="text-sm text-gray-400 mt-1">
              Make sure the audit has been run to populate the graph.
            </p>
          </div>
        )}

        {!loading && graphData.nodes.length === 0 && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-gray-400">Graph is empty</p>
              <p className="text-sm text-gray-500 mt-2">
                Run an audit from the chat to populate the knowledge graph.
              </p>
            </div>
          </div>
        )}

        {graphData.nodes.length > 0 && (
          <ForceGraph2D
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            nodeLabel={(node: GraphNode) => `${node.label}\n(${node.type})`}
            nodeColor={(node: GraphNode) => nodeColors[node.type] || nodeColors.unknown}
            nodeRelSize={6}
            linkLabel={(link: GraphLink) => link.type}
            linkColor={() => '#4b5563'}
            linkWidth={1}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            onNodeClick={handleNodeClick}
            backgroundColor="#111827"
          />
        )}

        {/* Selected Node Info */}
        {selectedNode && (
          <div className="absolute bottom-4 left-4 right-4 p-4 bg-gray-800 border border-gray-700 rounded max-w-md">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold">{selectedNode.label}</h3>
                <p className="text-sm text-gray-400">Type: {selectedNode.type}</p>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>
            {Object.keys(selectedNode.properties).length > 0 && (
              <div className="mt-2 text-sm">
                <p className="text-gray-400 mb-1">Properties:</p>
                <pre className="text-xs bg-gray-900 p-2 rounded overflow-auto max-h-32">
                  {JSON.stringify(selectedNode.properties, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
