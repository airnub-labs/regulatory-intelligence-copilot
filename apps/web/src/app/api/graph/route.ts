import {
  callMemgraphMcp,
  ensureMcpGatewayConfiguredFromEnv,
  getMcpGatewayUrl,
} from '@e2b-auditor/core';

export async function GET() {
  try {
    // Attempt to configure MCP gateway from environment for chat-driven graph updates
    ensureMcpGatewayConfiguredFromEnv();

    // Check if MCP gateway is configured (only available after running an audit)
    if (!getMcpGatewayUrl()) {
      // Return empty graph - this is normal before first audit
      return Response.json({
        nodes: [],
        links: [],
        message: 'Graph is empty. Run an audit to populate the knowledge graph.',
      });
    }

    // Fetch all nodes and relationships from the graph
    const result = await callMemgraphMcp(`
      MATCH (n)
      OPTIONAL MATCH (n)-[r]->(m)
      RETURN n, r, m
    `);

    // Parse the result into nodes and links for force-graph
    const nodes = new Map<string, { id: string; label: string; type: string; properties: Record<string, unknown> }>();
    const links: { source: string; target: string; type: string }[] = [];

    if (Array.isArray(result)) {
      for (const record of result) {
        // Handle node 'n'
        if (record.n) {
          const node = record.n;
          const id = node.id || node.properties?.id || `node-${nodes.size}`;
          if (!nodes.has(id)) {
            nodes.set(id, {
              id,
              label: node.properties?.title || node.properties?.name || node.labels?.[0] || id,
              type: node.labels?.[0] || 'unknown',
              properties: node.properties || {},
            });
          }
        }

        // Handle node 'm' (target)
        if (record.m) {
          const node = record.m;
          const id = node.id || node.properties?.id || `node-${nodes.size}`;
          if (!nodes.has(id)) {
            nodes.set(id, {
              id,
              label: node.properties?.title || node.properties?.name || node.labels?.[0] || id,
              type: node.labels?.[0] || 'unknown',
              properties: node.properties || {},
            });
          }
        }

        // Handle relationship 'r'
        if (record.r && record.n && record.m) {
          const sourceId = record.n.id || record.n.properties?.id;
          const targetId = record.m.id || record.m.properties?.id;
          if (sourceId && targetId) {
            links.push({
              source: sourceId,
              target: targetId,
              type: record.r.type || 'RELATED_TO',
            });
          }
        }
      }
    }

    return Response.json({
      nodes: Array.from(nodes.values()),
      links,
    });
  } catch (error) {
    console.error('[API] Graph fetch error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errorMessage, nodes: [], links: [] }, { status: 500 });
  }
}
