import { callMemgraphMcp, getMcpGatewayUrl, hasActiveSandbox } from '@e2b-auditor/core';

function normalizeMemgraphRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) {
    return result as Array<Record<string, unknown>>;
  }

  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;

    // Handle Memgraph formats like { columns: [...], data: [[...], ...] }
    if (Array.isArray(obj.data) && Array.isArray(obj.columns)) {
      const columns = obj.columns as string[];
      return (obj.data as Array<unknown>).map(row => {
        if (Array.isArray(row)) {
          const mapped: Record<string, unknown> = {};
          columns.forEach((col, idx) => {
            mapped[col] = (row as Array<unknown>)[idx];
          });
          return mapped;
        }
        return row as Record<string, unknown>;
      });
    }

    if (Array.isArray(obj.data)) return obj.data as Array<Record<string, unknown>>;
    if (Array.isArray(obj.rows)) return obj.rows as Array<Record<string, unknown>>;
    if (Array.isArray(obj.records)) return obj.records as Array<Record<string, unknown>>;
    if (Array.isArray(obj.result)) return obj.result as Array<Record<string, unknown>>;
  }

  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      return normalizeMemgraphRows(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

export async function GET() {
  try {
    // Check if MCP gateway is configured (only available after running an audit)
    if (!hasActiveSandbox() || !getMcpGatewayUrl()) {
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
    type MemgraphNode = { id?: unknown; properties?: Record<string, unknown>; labels?: string[] };
    type MemgraphRelationship = { type?: string };

    const nodes = new Map<string, { id: string; label: string; type: string; properties: Record<string, unknown> }>();
    const links: { source: string; target: string; type: string }[] = [];

    const rows = normalizeMemgraphRows(result);
    for (const record of rows) {
      const row = record as Record<string, MemgraphNode | MemgraphRelationship | undefined>;

      const extractNodeId = (node: MemgraphNode, fallbackIndex: number): string => {
        const directId = typeof node.id === 'string' ? node.id : undefined;
        const propId = typeof node.properties?.id === 'string' ? (node.properties.id as string) : undefined;
        return directId || propId || `node-${fallbackIndex}`;
      };

      const addNode = (node: MemgraphNode | undefined): void => {
        if (!node) return;
        const id = extractNodeId(node, nodes.size);
        if (nodes.has(id)) return;

        const labelValue = node.properties?.title || node.properties?.name || node.labels?.[0] || id;
        const label = typeof labelValue === 'string' ? labelValue : String(labelValue ?? id);
        const type = Array.isArray(node.labels) && typeof node.labels[0] === 'string'
          ? node.labels[0]
          : 'unknown';

        nodes.set(id, {
          id,
          label,
          type,
          properties: node.properties || {},
        });
      };

      addNode(row.n as MemgraphNode | undefined);
      addNode(row.m as MemgraphNode | undefined);

      // Handle relationship 'r'
      if (row.r && row.n && row.m) {
        const sourceId = extractNodeId(row.n as MemgraphNode, nodes.size);
        const targetId = extractNodeId(row.m as MemgraphNode, nodes.size);

        if (sourceId && targetId) {
          const relType = (row.r as MemgraphRelationship).type || 'RELATED_TO';
          links.push({
            source: sourceId,
            target: targetId,
            type: relType,
          });
        }
      }
    }

    return Response.json({
      nodes: Array.from(nodes.values()),
      links,
    });
  } catch (error) {
    console.error('[API] Graph fetch error:', error);
    let errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.toLowerCase().includes('sandbox')) {
      errorMessage = 'Knowledge graph sandbox is unavailable or expired. Run a new audit to rehydrate Memgraph.';
    }

    return Response.json({ error: errorMessage, nodes: [], links: [] }, { status: 500 });
  }
}
