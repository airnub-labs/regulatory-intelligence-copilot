/**
 * Graph API endpoint - Initial snapshot
 *
 * Returns an initial subgraph snapshot based on user profile and jurisdictions.
 * Used in conjunction with /api/graph/stream for incremental updates.
 *
 * Per v0.3 architecture (docs/architecture/archive/architecture_v_0_3.md Section 9):
 * - REST endpoint returns initial snapshot (bounded to avoid overwhelming the UI)
 * - WebSocket endpoint (/api/graph/stream) sends incremental patches
 */

import {
  createGraphClient,
  hasActiveSandbox,
  getMcpGatewayUrl,
  normalizeProfileType,
  type GraphContext,
  type GraphNode,
  type ProfileId,
} from '@reg-copilot/reg-intel-core';
import { createLogger, requestContext, withSpan } from '@reg-copilot/reg-intel-observability';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth/options';
import { getTenantContext } from '@/lib/auth/tenantContext';
import type { ExtendedSession } from '@/types/auth';
const logger = createLogger('GraphApiRoute');

const MAX_INITIAL_NODES = 250;
const MAX_INITIAL_EDGES = 500;
const MAX_LOOKUP_IDS = 25;

function escapeCypherValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function parseNodes(result: unknown): GraphNode[] {
  const nodes: GraphNode[] = [];
  const seenNodes = new Set<string>();

  if (!result || !Array.isArray(result)) {
    return nodes;
  }

  for (const row of result) {
    if (!row || typeof row !== 'object') continue;

    for (const [, value] of Object.entries(row as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;

      if (v.id && v.labels && Array.isArray(v.labels)) {
        const props = (v.properties || {}) as Record<string, unknown>;
        const nodeId = (props.id as string) || String(v.id);
        if (seenNodes.has(nodeId)) continue;
        seenNodes.add(nodeId);
        nodes.push({
          id: nodeId,
          label: (props.label as string) || (props.name as string) || String(v.labels[0]),
          type: v.labels[0] as GraphNode['type'],
          properties: props,
        });
      }
    }
  }

  return nodes;
}

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
  try {
    const session = await getServerSession(authOptions) as ExtendedSession | null;
    const { userId, tenantId } = await getTenantContext(session);

    return requestContext.run({ tenantId, userId }, () =>
      withSpan(
        'api.graph.snapshot',
        {
          'app.route': '/api/graph',
          'app.tenant.id': tenantId,
          'app.user.id': userId,
        },
        async () => {
          const { searchParams } = new URL(request.url);
          const idsParam = searchParams.get('ids');

          if (idsParam) {
            if (!hasActiveSandbox() || !getMcpGatewayUrl()) {
              return Response.json({
                type: 'node_lookup',
                nodes: [],
                metadata: {
                  message: 'Graph is empty. Interact with the chat to populate the knowledge graph.',
                },
              });
            }

            const ids = Array.from(
              new Set(
                idsParam
                  .split(',')
                  .map((id) => id.trim())
                  .filter(Boolean)
              )
            ).slice(0, MAX_LOOKUP_IDS);

            if (ids.length === 0) {
              return Response.json({ type: 'node_lookup', nodes: [] });
            }

            // SEC.4: Validate node ID format to prevent injection attacks
            const isValidNodeId = (id: string) => /^[a-zA-Z0-9_-]+$/.test(id) && id.length < 256;
            if (!ids.every(isValidNodeId)) {
              return Response.json(
                { type: 'error', error: 'Invalid node ID format' },
                { status: 400 }
              );
            }

            const graphClient = createGraphClient();
            const query = `
              MATCH (n)
              WHERE n.id IN [${ids.map((id) => `'${escapeCypherValue(id)}'`).join(', ')}]
              RETURN n
            `;

            const result = await graphClient.executeCypher(query);
            const nodes = parseNodes(result);

            return Response.json({
              type: 'node_lookup',
              nodes,
              metadata: {
                requested: ids.length,
              },
            });
          }

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

          // Get query parameters
          const jurisdictions = searchParams.get('jurisdictions')?.split(',') || ['IE'];
          const profileType: ProfileId = normalizeProfileType(searchParams.get('profileType'));
          const keyword = searchParams.get('keyword') || undefined;

          const scopedLogger = logger.child({ jurisdictions, profileType, keyword, tenantId, userId });
          scopedLogger.info('Fetching initial graph snapshot');

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

          scopedLogger.info(
            {
              nodeCount: boundedNodes.length,
              edgeCount: boundedEdges.length,
              truncated,
            },
            'Returning graph snapshot'
          );

          // Return v0.3 format snapshot
          return Response.json({
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
          });
        },
      ),
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Request failed';
    logger.error({ error }, 'Request failed');
    return Response.json(
      { error: errorMessage },
      { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
