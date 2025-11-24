import { callMemgraphMcp } from '../mcpClient.js';
import { sanitizeObjectForEgress } from '../aspects/egressGuard.js';
import type { GraphClient, GraphSlice, GraphNode, GraphEdge, TimelineNode } from './types.js';

function normalizeNode(raw: any): GraphNode {
  return {
    id: raw.id ?? raw.properties?.id ?? raw.properties?.identifier ?? JSON.stringify(raw.properties ?? raw),
    labels: raw.labels ?? [],
    properties: raw.properties ?? {},
  };
}

function normalizeEdge(raw: any): GraphEdge {
  return {
    id: raw.id,
    type: raw.type ?? raw.label ?? 'RELATED_TO',
    source: raw.start ?? raw.source ?? raw.outV ?? '',
    target: raw.end ?? raw.target ?? raw.inV ?? '',
    properties: raw.properties ?? {},
  };
}

async function safeQuery<T>(query: string, fallback: T): Promise<T> {
  try {
    const result = await callMemgraphMcp(query);
    if (!Array.isArray(result)) return fallback;
    return result as T;
  } catch (error) {
    console.warn('[GraphClient] Memgraph query failed, returning fallback.', error);
    return fallback;
  }
}

export class MemgraphGraphClient implements GraphClient {
  async getRulesForProfileAndJurisdiction(profileId?: string, jurisdictionId?: string, keyword?: string): Promise<GraphSlice> {
    const conditions: string[] = [];
    if (profileId) conditions.push(`(tag:ProfileTag {id: '${profileId}'})`);
    if (keyword) conditions.push(`(rule.title CONTAINS '${keyword}' OR rule.summary CONTAINS '${keyword}')`);

    const jurisdictionFilter = jurisdictionId ? `-[:IN_JURISDICTION]->(:Jurisdiction {id: '${jurisdictionId}'})` : '';
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      MATCH (rule)
      ${jurisdictionFilter ? jurisdictionFilter : ''}
      OPTIONAL MATCH (rule)-[:TAGGED_WITH]->(tag:ProfileTag)
      OPTIONAL MATCH (rule)-[rel]->(other)
      ${whereClause}
      RETURN rule, rel, other
      LIMIT 50
    `;

    const raw = await safeQuery<any[]>(query, []);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const row of raw) {
      if (row.rule) nodes.push(normalizeNode(row.rule));
      if (row.other) nodes.push(normalizeNode(row.other));
      if (row.rel) edges.push(normalizeEdge(row.rel));
    }

    return { nodes: dedupeNodes(nodes), edges: dedupeEdges(edges) };
  }

  async getNeighbourhood(nodeId: string): Promise<GraphSlice> {
    const query = `MATCH (n {id: '${nodeId}'})-[r]-(m) RETURN n, r, m LIMIT 50`;
    const raw = await safeQuery<any[]>(query, []);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const row of raw) {
      if (row.n) nodes.push(normalizeNode(row.n));
      if (row.m) nodes.push(normalizeNode(row.m));
      if (row.r) edges.push(normalizeEdge(row.r));
    }

    return { nodes: dedupeNodes(nodes), edges: dedupeEdges(edges) };
  }

  async getMutualExclusions(nodeId: string): Promise<GraphSlice> {
    const query = `MATCH (n {id: '${nodeId}'})-[r:MUTUALLY_EXCLUSIVE_WITH]-(m) RETURN n, r, m`;
    return this.getNeighbourhoodWithQuery(query);
  }

  async getNeighbourhoodWithQuery(query: string): Promise<GraphSlice> {
    const raw = await safeQuery<any[]>(query, []);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const row of raw) {
      if (row.n) nodes.push(normalizeNode(row.n));
      if (row.m) nodes.push(normalizeNode(row.m));
      if (row.r) edges.push(normalizeEdge(row.r));
    }

    return { nodes: dedupeNodes(nodes), edges: dedupeEdges(edges) };
  }

  async getTimelines(nodeId: string): Promise<TimelineNode[]> {
    const query = `MATCH (n {id: '${nodeId}'})-[:LOOKBACK_WINDOW|:LOCKS_IN_FOR_PERIOD]->(t:Timeline) RETURN t`;
    const raw = await safeQuery<any[]>(query, []);
    return raw.map(row => row.t?.properties).filter(Boolean) as TimelineNode[];
  }

  async getCrossBorderSlice(jurisdictionIds: string[]): Promise<GraphSlice> {
    const ids = jurisdictionIds.map(id => `'${id}'`).join(', ');
    const query = `
      MATCH (j:Jurisdiction)-[:OVERLAPS|:HAS_EQUIVALENT_RULE|:IN_JURISDICTION]-(rule)
      WHERE j.id IN [${ids}]
      OPTIONAL MATCH (rule)-[r]->(other)
      RETURN j, rule, r, other
      LIMIT 100
    `;

    const raw = await safeQuery<any[]>(query, []);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const row of raw) {
      if (row.j) nodes.push(normalizeNode(row.j));
      if (row.rule) nodes.push(normalizeNode(row.rule));
      if (row.other) nodes.push(normalizeNode(row.other));
      if (row.r) edges.push(normalizeEdge(row.r));
    }

    return { nodes: dedupeNodes(nodes), edges: dedupeEdges(edges) };
  }
}

function dedupeNodes(nodes: GraphNode[]): GraphNode[] {
  const seen = new Map<string, GraphNode>();
  for (const node of nodes) {
    const id = String(node.id);
    if (!seen.has(id)) {
      seen.set(id, sanitizeObjectForEgress(node));
    }
  }
  return Array.from(seen.values());
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  const result: GraphEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.source}->${edge.type}->${edge.target}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(sanitizeObjectForEgress(edge));
    }
  }
  return result;
}
