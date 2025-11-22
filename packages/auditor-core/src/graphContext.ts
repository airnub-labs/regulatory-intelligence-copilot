/**
 * Graph context module - manages RFC/OWASP spec discovery and Memgraph operations
 *
 * This module handles:
 * 1. Discovering relevant RFCs and OWASP categories from HTTP exchanges
 * 2. Storing specs in the Memgraph knowledge graph
 * 3. Fetching related context for compliance analysis
 */

import type {
  DiscoveryContext,
  EnrichedSpec,
  GraphContext,
  SanitizedHttpExchange,
} from './types.js';
import {
  callPerplexityMcp,
  callMemgraphMcp,
  isMcpGatewayConfigured,
} from './mcpClient.js';
import { ensureMcpGatewayConfigured } from './sandboxManager.js';
import {
  getOwaspCategories,
  getOwaspVersion,
  findOwaspCategoriesByKeyword,
} from './config/owaspCategories.js';

/**
 * Discover relevant specs from HTTP exchanges using Perplexity MCP
 */
async function discoverRelevantSpecs(
  exchanges: SanitizedHttpExchange[],
  userQuestion?: string
): Promise<EnrichedSpec[]> {
  // Build context from sanitized exchanges
  const exchangeSummary = exchanges.map(ex => {
    return `${ex.request.method} ${ex.request.urlTemplate} -> ${ex.response.statusCode} ${ex.response.statusMessage}
    Response preview: ${ex.response.bodyPreview}`;
  }).join('\n\n');

  const query = `Given these HTTP API exchanges:

${exchangeSummary}

${userQuestion ? `User question: ${userQuestion}` : ''}

Identify relevant:
1. HTTP RFCs (RFC 7230-7235, RFC 9110-9114, etc.) for protocol compliance
2. OWASP Top 10:2021 categories for security issues
3. Any other relevant security or API standards

Return a structured list of spec IDs and their relevance to the observed issues.`;

  const perplexityResult = await callPerplexityMcp(query);

  // Parse the result to extract spec information
  const specs = parseSpecsFromPerplexityResult(perplexityResult);

  return specs;
}

/**
 * Parse Perplexity result to extract specs
 *
 * Extracts RFC numbers and OWASP categories mentioned in the Perplexity response.
 */
function parseSpecsFromPerplexityResult(result: unknown): EnrichedSpec[] {
  // Convert result to string - handle various MCP response formats
  let text: string;
  if (typeof result === 'string') {
    text = result;
  } else if (result && typeof result === 'object') {
    // Handle object formats like { content: [...] } or { text: "..." }
    const obj = result as Record<string, unknown>;
    if (Array.isArray(obj.content)) {
      text = obj.content
        .map((item: unknown) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'text' in item) {
            return (item as { text: string }).text;
          }
          return JSON.stringify(item);
        })
        .join('\n');
    } else if (typeof obj.text === 'string') {
      text = obj.text;
    } else if (typeof obj.content === 'string') {
      text = obj.content;
    } else {
      text = JSON.stringify(result);
    }
  } else {
    text = String(result || '');
  }

  const specs: EnrichedSpec[] = [];

  // Extract RFC mentions using regex
  const rfcSpecs = extractRfcSpecs(text);
  specs.push(...rfcSpecs);

  // Extract OWASP categories using centralized config
  const owaspSpecs = extractOwaspSpecs(text);
  specs.push(...owaspSpecs);

  return specs;
}

/**
 * Extract RFC specifications from text
 */
function extractRfcSpecs(text: string): EnrichedSpec[] {
  const rfcMatches = text.matchAll(/RFC\s*(\d+)/gi);
  const rfcSet = new Set<string>();

  for (const match of rfcMatches) {
    rfcSet.add(match[1]);
  }

  return Array.from(rfcSet).map(rfcNum => ({
    type: 'rfc' as const,
    id: `RFC${rfcNum}`,
    title: `RFC ${rfcNum}`,
    sections: [],
  }));
}

/**
 * Extract OWASP categories from text using dynamic categories
 */
function extractOwaspSpecs(text: string): EnrichedSpec[] {
  const specs: EnrichedSpec[] = [];
  const addedIds = new Set<string>();
  const categories = getOwaspCategories();
  const version = getOwaspVersion();

  // Check for explicit OWASP pattern matches
  for (const category of categories) {
    if (category.pattern.test(text) && !addedIds.has(category.id)) {
      specs.push({
        type: 'owasp',
        id: category.id,
        title: category.title,
        version,
      });
      addedIds.add(category.id);
    }
  }

  // Also check for keyword matches
  const keywordMatches = findOwaspCategoriesByKeyword(text);
  for (const category of keywordMatches) {
    if (!addedIds.has(category.id)) {
      specs.push({
        type: 'owasp',
        id: category.id,
        title: category.title,
        version,
      });
      addedIds.add(category.id);
    }
  }

  return specs;
}

/**
 * Escape string for Cypher query to prevent injection
 */
function escapeCypher(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * Validate spec ID to ensure it's safe for use in queries
 */
function isValidSpecId(id: string): boolean {
  // Only allow alphanumeric characters, hyphens, and underscores
  return /^[A-Za-z0-9_-]+$/.test(id);
}

/**
 * Upsert specs into Memgraph
 */
async function upsertSpecsToMemgraph(specs: EnrichedSpec[]): Promise<void> {
  await ensureMcpGatewayConfigured();

  if (!isMcpGatewayConfigured()) {
    throw new Error('MCP gateway is not configured; cannot persist specs to Memgraph.');
  }

  console.log(`[Graph] Upserting ${specs.length} specs to Memgraph knowledge graph...`);
  for (const spec of specs) {
    // Validate spec ID to prevent injection
    if (!isValidSpecId(spec.id)) {
      console.warn(`[GraphContext] Skipping invalid spec ID: ${spec.id}`);
      continue;
    }

    if (spec.type === 'rfc') {
      const safeTitle = escapeCypher(spec.title);
      const query = `
        MERGE (r:RFC {id: '${spec.id}'})
        SET r.title = '${safeTitle}'
        RETURN r
      `;
      console.log(`[Graph]   → Upserting RFC node: ${spec.id}`);
      await callMemgraphMcp(query);
    } else if (spec.type === 'owasp') {
      const safeTitle = escapeCypher(spec.title);
      const safeVersion = escapeCypher(spec.version || '2021');
      const query = `
        MERGE (o:OWASP {id: '${spec.id}'})
        SET o.title = '${safeTitle}',
            o.version = '${safeVersion}'
        RETURN o
      `;
      console.log(`[Graph]   → Upserting OWASP node: ${spec.id}`);
      await callMemgraphMcp(query);
    }
  }

  // Create relationships between related specs
  for (const spec of specs) {
    if (spec.relationships) {
      for (const rel of spec.relationships) {
        // Validate target ID
        if (!isValidSpecId(rel.targetId)) {
          console.warn(`[GraphContext] Skipping invalid target ID: ${rel.targetId}`);
          continue;
        }
        // Validate relationship type (should be alphanumeric with underscores)
        if (!/^[A-Z_]+$/.test(rel.type)) {
          console.warn(`[GraphContext] Skipping invalid relationship type: ${rel.type}`);
          continue;
        }
        const query = `
          MATCH (a {id: '${spec.id}'}), (b {id: '${rel.targetId}'})
          MERGE (a)-[:${rel.type}]->(b)
        `;
        await callMemgraphMcp(query);
      }
    }
  }
}

/**
 * Discover and upsert specs based on discovery context
 */
export async function discoverAndUpsertSpecs(
  context: DiscoveryContext
): Promise<EnrichedSpec[]> {
  // Discover relevant specs using Perplexity MCP
  const specs = await discoverRelevantSpecs(
    context.sanitizedExchanges,
    context.userQuestion
  );

  // Upsert to Memgraph
  await upsertSpecsToMemgraph(specs);

  return specs;
}

/**
 * Extract and upsert specs from chat text
 * Used for populating the graph during normal chat conversations
 */
export async function extractAndUpsertSpecsFromText(
  text: string
): Promise<EnrichedSpec[]> {
  const specs: EnrichedSpec[] = [];

  // Extract RFC mentions
  const rfcSpecs = extractRfcSpecs(text);
  specs.push(...rfcSpecs);

  // Extract OWASP categories
  const owaspSpecs = extractOwaspSpecs(text);
  specs.push(...owaspSpecs);

  // Upsert to Memgraph if we found any specs
  if (specs.length > 0) {
    await upsertSpecsToMemgraph(specs);
  }

  return specs;
}

/**
 * Fetch graph context from Memgraph for findings
 */
export async function fetchGraphContextForFindings(
  specs: EnrichedSpec[]
): Promise<GraphContext> {
  console.log('[Graph] Querying Memgraph for related specs and relationships...');
  const nodes: GraphContext['nodes'] = [];
  const edges: GraphContext['edges'] = [];

  await ensureMcpGatewayConfigured();

  if (!isMcpGatewayConfigured()) {
    throw new Error('MCP gateway is not configured; cannot fetch graph context.');
  }

  // Query for each spec and its relationships
  const specIds = specs.map(s => `'${s.id}'`).join(', ');

  if (specIds) {
    // Get all spec nodes
    const nodeQuery = `
      MATCH (n)
      WHERE n.id IN [${specIds}]
      RETURN n.id as id, labels(n)[0] as type, properties(n) as props
    `;

    try {
      const nodeResult = await callMemgraphMcp(nodeQuery) as Array<{
        id: string;
        type: string;
        props: Record<string, string>;
      }>;

      if (Array.isArray(nodeResult)) {
        for (const row of nodeResult) {
          nodes.push({
            id: row.id,
            type: row.type.toLowerCase() as 'rfc' | 'owasp' | 'section' | 'concept',
            properties: row.props,
          });
        }
      }
    } catch {
      // Graph may be empty initially
    }

    // Get relationships
    const edgeQuery = `
      MATCH (a)-[r]->(b)
      WHERE a.id IN [${specIds}] OR b.id IN [${specIds}]
      RETURN a.id as source, b.id as target, type(r) as relType
    `;

    try {
      const edgeResult = await callMemgraphMcp(edgeQuery) as Array<{
        source: string;
        target: string;
        relType: string;
      }>;

      if (Array.isArray(edgeResult)) {
        for (const row of edgeResult) {
          edges.push({
            source: row.source,
            target: row.target,
            type: row.relType,
          });
        }
      }
    } catch {
      // Graph may be empty initially
    }
  }

  return { nodes, edges };
}
