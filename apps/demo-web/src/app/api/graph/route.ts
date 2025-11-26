/**
 * Graph API endpoint - Initial snapshot
 *
 * Returns an initial subgraph snapshot based on user profile and jurisdictions.
 * Used in conjunction with /api/graph/stream for incremental updates.
 *
 * Per v0.3 architecture (docs/architecture_v_0_3.md Section 9):
 * - REST endpoint returns initial snapshot
 * - WebSocket endpoint (/api/graph/stream) sends incremental patches
 */

import {
  createGraphClient,
  hasActiveSandbox,
  getMcpGatewayUrl,
} from '@reg-copilot/reg-intel-core';

export async function GET(request: Request) {
  try {
    // Check if MCP gateway is configured (only available after sandbox is active)
    if (!hasActiveSandbox() || !getMcpGatewayUrl()) {
      // Return empty graph - this is normal before first interaction
      return Response.json({
        type: 'graph_snapshot',
        timestamp: new Date().toISOString(),
        nodes: [],
        edges: [],
        metadata: {
          nodeCount: 0,
          edgeCount: 0,
          message: 'Graph is empty. Interact with the chat to populate the knowledge graph.',
        },
      });
    }

    const { searchParams } = new URL(request.url);

    // Get query parameters
    const jurisdictions = searchParams.get('jurisdictions')?.split(',') || ['IE'];
    const profileType = searchParams.get('profileType') || 'single_director';
    const keyword = searchParams.get('keyword') || undefined;

    console.log('[API/graph] Fetching initial graph snapshot:', {
      jurisdictions,
      profileType,
      keyword,
    });

    // Create graph client
    const graphClient = createGraphClient();

    // Build profile-based query - get rules for the primary jurisdiction
    const primaryJurisdiction = jurisdictions[0];
    const graphContext = await graphClient.getRulesForProfileAndJurisdiction(
      profileType,
      primaryJurisdiction,
      keyword
    );

    // If multiple jurisdictions, also get cross-border slice
    if (jurisdictions.length > 1) {
      const crossBorderContext = await graphClient.getCrossBorderSlice(jurisdictions);

      // Merge contexts (deduplicate nodes and edges)
      const nodeMap = new Map<string, typeof graphContext.nodes[0]>();
      const edgeSet = new Set<string>();
      const mergedEdges: typeof graphContext.edges = [];

      // Add nodes from both contexts
      for (const node of [...graphContext.nodes, ...crossBorderContext.nodes]) {
        if (!nodeMap.has(node.id)) {
          nodeMap.set(node.id, node);
        }
      }

      // Add edges from both contexts
      for (const edge of [...graphContext.edges, ...crossBorderContext.edges]) {
        const edgeKey = `${edge.source}-${edge.type}-${edge.target}`;
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          mergedEdges.push(edge);
        }
      }

      graphContext.nodes = Array.from(nodeMap.values());
      graphContext.edges = mergedEdges;
    }

    console.log(
      `[API/graph] Returning snapshot: ${graphContext.nodes.length} nodes, ${graphContext.edges.length} edges`
    );

    // Return v0.3 format snapshot
    return Response.json({
      type: 'graph_snapshot',
      timestamp: new Date().toISOString(),
      jurisdictions,
      profileType,
      nodes: graphContext.nodes,
      edges: graphContext.edges,
      metadata: {
        nodeCount: graphContext.nodes.length,
        edgeCount: graphContext.edges.length,
      },
    });
  } catch (error) {
    console.error('[API/graph] Error:', error);
    let errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.toLowerCase().includes('sandbox')) {
      errorMessage =
        'Knowledge graph sandbox is unavailable or expired. Interact with the chat to rehydrate Memgraph.';
    }

    return Response.json(
      {
        type: 'error',
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
