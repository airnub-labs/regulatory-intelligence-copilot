/**
 * Graph API endpoint - Initial snapshot
 *
 * Returns an initial subgraph snapshot based on user profile and jurisdictions.
 * Used in conjunction with /api/graph/stream for incremental updates.
 *
 * Per v0.3 architecture (docs/architecture_v_0_3.md Section 9):
 * - REST endpoint returns initial snapshot (bounded to avoid overwhelming the UI)
 * - WebSocket endpoint (/api/graph/stream) sends incremental patches
 */

import {
  createGraphClient,
  hasActiveSandbox,
  getMcpGatewayUrl,
  normalizeProfileType,
  createLogger,
  runWithContext,
  type GraphContext,
  type ProfileId,
} from '@reg-copilot/reg-intel-core';
import { randomUUID } from 'node:crypto';

const MAX_INITIAL_NODES = 250;
const MAX_INITIAL_EDGES = 500;

const logger = createLogger({ component: 'GraphRoute' });

function boundGraphContext(graphContext: GraphContext) {
  const boundedNodes = graphContext.nodes.slice(0, MAX_INITIAL_NODES);
  const nodeSet = new Set(boundedNodes.map((node) => node.id));

  const boundedEdges = graphContext.edges
    .filter(
      (edge) => nodeSet.has(edge.source as string) && nodeSet.has(edge.target as string)
    )
    .slice(0, MAX_INITIAL_EDGES);

  const truncated =
    boundedNodes.length < graphContext.nodes.length || boundedEdges.length < graphContext.edges.length;

  return { boundedNodes, boundedEdges, truncated };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jurisdictions = searchParams.get('jurisdictions')?.split(',') || ['IE'];
  const profileType: ProfileId = normalizeProfileType(searchParams.get('profileType'));
  const keyword = searchParams.get('keyword') || undefined;
  const correlationId = request.headers.get('x-correlation-id') || randomUUID();

  const context = {
    correlationId,
    tenantId: 'default',
    profileType,
    jurisdictions,
  };

  return runWithContext(context, async () => {
    try {
      // Check if MCP gateway is configured (only available after sandbox is active)
      if (!hasActiveSandbox() || !getMcpGatewayUrl()) {
        // Return empty graph - this is normal before first interaction
        return Response.json(
          {
            type: 'graph_snapshot',
            timestamp: new Date().toISOString(),
            nodes: [],
            edges: [],
            metadata: {
              nodeCount: 0,
              edgeCount: 0,
              message: 'Graph is empty. Interact with the chat to populate the knowledge graph.',
            },
          },
          { headers: { 'x-correlation-id': correlationId } }
        );
      }

      logger.info('Fetching initial graph snapshot', {
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
        const nodeMap = new Map<string, GraphContext['nodes'][number]>();
        const edgeSet = new Set<string>();
        const mergedEdges: GraphContext['edges'] = [];

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

      const { boundedNodes, boundedEdges, truncated } = boundGraphContext(graphContext);

      logger.info('Returning snapshot', {
        nodeCount: boundedNodes.length,
        edgeCount: boundedEdges.length,
        truncated,
      });

      // Return v0.3 format snapshot
      return Response.json(
        {
          type: 'graph_snapshot',
          timestamp: new Date().toISOString(),
          jurisdictions,
          profileType,
          nodes: boundedNodes,
          edges: boundedEdges,
          metadata: {
            nodeCount: boundedNodes.length,
            edgeCount: boundedEdges.length,
            truncated,
            limits: {
              nodes: MAX_INITIAL_NODES,
              edges: MAX_INITIAL_EDGES,
            },
          },
        },
        { headers: { 'x-correlation-id': correlationId } }
      );
    } catch (error) {
      logger.error('Graph snapshot error', { error: error as Error });
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
        { status: 500, headers: { 'x-correlation-id': correlationId } }
      );
    }
  });
}
