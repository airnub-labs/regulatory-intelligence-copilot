'use client';

import { useChat } from 'ai/react';
import { useRef, useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import ForceGraph2D to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-48 bg-gray-800 rounded">Loading graph...</div>,
});

interface GraphNode {
  id: string;
  type: string;
  properties: Record<string, string>;
}

interface InlineGraphData {
  nodes: Array<{ id: string; label: string; type: string; properties: Record<string, unknown> }>;
  links: Array<{ source: string; target: string; type: string }>;
}

// Color map for different node types
const nodeColors: Record<string, string> = {
  RFC: '#3b82f6',
  OWASP: '#ef4444',
  Endpoint: '#10b981',
  Finding: '#f59e0b',
  unknown: '#6b7280',
};

interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

interface Report {
  summary: string;
  overallHealth: string;
  endpoints: Array<{
    endpoint: string;
    method: string;
    status: string;
    issues: Array<{
      severity: string;
      description: string;
      rfcReferences: string[];
      owaspReferences: string[];
    }>;
    suggestions: string[];
  }>;
  rfcsCited: string[];
  owaspCited: string[];
  graphContext?: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
}

const AUDIT_TRIGGER = '__RUN_SAMPLE_AUDIT__';

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit, append, isLoading } = useChat({
    api: '/api/chat',
  });
  const [report, setReport] = useState<Report | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Only scroll when a new message is added, not during streaming updates
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      scrollToBottom();
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Check for report data in the last assistant message
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.content) {
      // Try to extract report JSON if present
      try {
        const match = lastMessage.content.match(/<!--REPORT:([\s\S]*?):REPORT-->/);
        if (match) {
          const reportData = JSON.parse(match[1]);
          setReport(reportData);
        }
      } catch {
        // No report data in message
      }
    }
  }, [messages]);

  const runAudit = () => {
    append({
      role: 'user',
      content: `Run audit on sample API ${AUDIT_TRIGGER}`,
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant':
      case 'healthy':
        return 'text-green-400';
      case 'warning':
      case 'degraded':
        return 'text-yellow-400';
      case 'critical':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      low: 'bg-blue-900 text-blue-300',
      medium: 'bg-yellow-900 text-yellow-300',
      high: 'bg-orange-900 text-orange-300',
      critical: 'bg-red-900 text-red-300',
    };
    return colors[severity] || 'bg-gray-900 text-gray-300';
  };

  // Clean message content by removing audit trigger, report data, and graph data
  const cleanContent = (content: string) => {
    return content
      .replace(AUDIT_TRIGGER, '')
      .replace(/<!--REPORT:.*?:REPORT-->/s, '')
      .replace(/<!--GRAPH:.*?:GRAPH-->/s, '')
      .trim();
  };

  // Extract inline graph data from message
  const extractGraphData = (content: string): InlineGraphData | null => {
    try {
      const match = content.match(/<!--GRAPH:([\s\S]*?):GRAPH-->/);
      if (match) {
        return JSON.parse(match[1]);
      }
    } catch {
      // No valid graph data
    }
    return null;
  };

  // Inline Graph Viewer Component
  const InlineGraphViewer = ({ data }: { data: InlineGraphData }) => {
    if (data.nodes.length === 0) {
      return (
        <div className="h-48 bg-gray-800 rounded flex items-center justify-center text-gray-400">
          Graph is empty. Run an audit to populate it.
        </div>
      );
    }

    return (
      <div className="h-64 bg-gray-800 rounded overflow-hidden">
        <ForceGraph2D
          graphData={data}
          width={400}
          height={256}
          nodeLabel={(node) => {
            const n = node as { label?: string; type?: string };
            return `${n.label || ''}\n(${n.type || ''})`;
          }}
          nodeColor={(node) => {
            const n = node as { type?: string };
            return nodeColors[n.type || 'unknown'] || nodeColors.unknown;
          }}
          nodeRelSize={5}
          linkColor={() => '#4b5563'}
          linkWidth={1}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          backgroundColor="#1f2937"
        />
      </div>
    );
  };

  return (
    <main className="flex min-h-screen flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 p-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">E2B RFC/OWASP Auditor</h1>
          <p className="text-sm text-gray-400">
            Audit HTTP APIs for RFC compliance and security issues
          </p>
        </div>
        <a
          href="/graph"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium"
        >
          View Graph
        </a>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat Section */}
        <div className="flex flex-1 flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-8">
                <p>Welcome! Click "Run Audit" to analyze the sample API,</p>
                <p>or ask a question about RFC/OWASP compliance.</p>
              </div>
            )}

            {messages.map((message) => {
              const graphData = message.role === 'assistant' ? extractGraphData(message.content) : null;
              const cleanedContent = cleanContent(message.content);

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600'
                        : 'bg-gray-800'
                    }`}
                  >
                    {cleanedContent && (
                      <pre className="whitespace-pre-wrap font-sans text-sm">
                        {cleanedContent}
                      </pre>
                    )}
                    {graphData && (
                      <div className={cleanedContent ? 'mt-3' : ''}>
                        <InlineGraphViewer data={graphData} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-lg p-3">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100" />
                    <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-800 p-4">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={handleInputChange}
                placeholder="Ask about RFC/OWASP compliance..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
              >
                Send
              </button>
              <button
                type="button"
                onClick={runAudit}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
              >
                Run Audit
              </button>
            </form>
          </div>
        </div>

        {/* Report Panel */}
        {report && (
          <div className="w-96 border-l border-gray-800 overflow-y-auto p-4">
            <h2 className="text-lg font-bold mb-4">Audit Report</h2>

            <div className="mb-4">
              <span className="text-sm text-gray-400">Overall Health: </span>
              <span className={`font-bold ${getStatusColor(report.overallHealth)}`}>
                {report.overallHealth.toUpperCase()}
              </span>
            </div>

            {report.endpoints.map((endpoint, idx) => (
              <div key={idx} className="mb-4 p-3 bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-gray-700 px-2 py-1 rounded">
                    {endpoint.method}
                  </span>
                  <span className="text-sm font-mono">{endpoint.endpoint}</span>
                </div>
                <div className={`text-sm ${getStatusColor(endpoint.status)}`}>
                  {endpoint.status}
                </div>

                {endpoint.issues.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {endpoint.issues.map((issue, issueIdx) => (
                      <div key={issueIdx} className="text-xs">
                        <span className={`px-1.5 py-0.5 rounded ${getSeverityBadge(issue.severity)}`}>
                          {issue.severity}
                        </span>
                        <p className="mt-1 text-gray-300">{issue.description}</p>
                        {issue.rfcReferences.length > 0 && (
                          <p className="text-gray-500">
                            RFC: {issue.rfcReferences.join(', ')}
                          </p>
                        )}
                        {issue.owaspReferences.length > 0 && (
                          <p className="text-gray-500">
                            OWASP: {issue.owaspReferences.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {(report.rfcsCited.length > 0 || report.owaspCited.length > 0) && (
              <div className="mt-4 p-3 bg-gray-800 rounded-lg">
                <h3 className="text-sm font-bold mb-2">Standards Referenced</h3>
                {report.rfcsCited.length > 0 && (
                  <p className="text-xs text-gray-400">
                    RFCs: {report.rfcsCited.join(', ')}
                  </p>
                )}
                {report.owaspCited.length > 0 && (
                  <p className="text-xs text-gray-400">
                    OWASP: {report.owaspCited.join(', ')}
                  </p>
                )}
              </div>
            )}

            {/* Graph Context Visualization */}
            {report.graphContext && report.graphContext.nodes.length > 0 && (
              <div className="mt-4 p-3 bg-gray-800 rounded-lg">
                <h3 className="text-sm font-bold mb-2">Knowledge Graph</h3>
                <div className="space-y-2">
                  {report.graphContext.nodes.map((node, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        node.type === 'rfc' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'
                      }`}>
                        {node.type.toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-300">{node.id}</span>
                      {node.properties.title && (
                        <span className="text-xs text-gray-500 truncate">{node.properties.title}</span>
                      )}
                    </div>
                  ))}
                </div>
                {report.graphContext.edges.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-700">
                    <p className="text-xs text-gray-500 mb-1">Relationships:</p>
                    {report.graphContext.edges.map((edge, idx) => (
                      <p key={idx} className="text-xs text-gray-400">
                        {edge.source} → {edge.type} → {edge.target}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
