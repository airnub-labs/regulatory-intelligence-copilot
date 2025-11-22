'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useChat } from 'ai/react';
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
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  // Chat functionality
  const { messages, input, handleInputChange, handleSubmit, isLoading: chatLoading } = useChat({
    api: '/api/chat',
  });

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Refresh graph when new assistant messages arrive
  useEffect(() => {
    const currentMessageCount = messages.filter(m => m.role === 'assistant').length;
    if (currentMessageCount > prevMessageCountRef.current) {
      // New assistant message received, refresh graph after a short delay
      // to allow backend to populate the graph
      setTimeout(() => {
        fetch('/api/graph')
          .then(res => res.json())
          .then(data => {
            if (!data.error) {
              setGraphData(data);
              setError(null);
            }
          })
          .catch(() => {});
      }, 500);
      prevMessageCountRef.current = currentMessageCount;
    }
  }, [messages]);

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
            Main Chat
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

      {/* Main Content - Graph and Chat */}
      <div className="flex-1 flex overflow-hidden">
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
                  Ask questions about RFC or OWASP to populate the graph.
                </p>
              </div>
            </div>
          )}

          {graphData.nodes.length > 0 && (
            <ForceGraph2D
              graphData={graphData}
              width={dimensions.width}
              height={dimensions.height}
              nodeLabel={(node) => `${(node as GraphNode).label}\n(${(node as GraphNode).type})`}
              nodeColor={(node) => nodeColors[(node as GraphNode).type] || nodeColors.unknown}
              nodeRelSize={6}
              linkLabel={(link) => (link as GraphLink).type}
              linkColor={() => '#4b5563'}
              linkWidth={1}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={1}
              onNodeClick={(node) => handleNodeClick(node as GraphNode)}
              backgroundColor="#111827"
            />
          )}

          {/* Selected Node Info */}
          {selectedNode && (
            <div className="absolute bottom-4 left-4 p-4 bg-gray-800 border border-gray-700 rounded max-w-md">
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

        {/* Chat Sidebar */}
        <div className="w-96 border-l border-gray-700 flex flex-col bg-gray-800">
          <div className="p-3 border-b border-gray-700">
            <h2 className="font-semibold text-sm">Ask about RFC & OWASP</h2>
            <p className="text-xs text-gray-400 mt-1">
              Questions populate the graph in real-time
            </p>
          </div>

          {/* Chat Messages */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-3 space-y-3"
          >
            {messages.length === 0 && (
              <div className="text-sm text-gray-500 text-center py-4">
                <p>Ask about RFC standards or OWASP vulnerabilities</p>
                <p className="text-xs mt-2">Examples:</p>
                <ul className="text-xs mt-1 space-y-1">
                  <li>&quot;What is RFC 7231?&quot;</li>
                  <li>&quot;Explain OWASP A01 Broken Access Control&quot;</li>
                  <li>&quot;How do RFC 9110 and RFC 7230 relate?&quot;</li>
                </ul>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`text-sm ${
                  message.role === 'user'
                    ? 'bg-blue-900/30 rounded p-2'
                    : 'bg-gray-700/50 rounded p-2'
                }`}
              >
                <div className="text-xs text-gray-400 mb-1">
                  {message.role === 'user' ? 'You' : 'Assistant'}
                </div>
                <div className="whitespace-pre-wrap text-xs">
                  {message.content.replace(/<!--[\s\S]*?-->/g, '').trim()}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="text-sm text-gray-400 animate-pulse">
                Thinking...
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Ask about RFC or OWASP..."
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm focus:outline-none focus:border-blue-500"
                disabled={chatLoading}
              />
              <button
                type="submit"
                disabled={chatLoading || !input.trim()}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
