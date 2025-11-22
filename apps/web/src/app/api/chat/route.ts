import { createGroq } from '@ai-sdk/groq';
import { streamText, StreamData, streamToResponse } from 'ai';
import {
  runAuditOnSampleApi,
  reportToSummary,
  AUDIT_TRIGGER,
  callMemgraphMcp,
  getMemgraphSchema,
  extractAndUpsertSpecsFromText,
  ensureMcpGatewayConfiguredFromEnv,
  type ComplianceReport,
  type GraphContext,
} from '@e2b-auditor/core';

// Store last audit's graph context for follow-up questions
let lastGraphContext: GraphContext | undefined;

// System prompt for the RFC/OWASP auditor
const SYSTEM_PROMPT = `You are an expert RFC and OWASP Top 10 compliance auditor for HTTP APIs.

Your role is to:
1. Answer questions about HTTP RFC compliance and OWASP Top 10 security standards
2. Explain best practices for API security and HTTP semantics
3. Help developers understand how to fix compliance issues

You have deep knowledge of:
- HTTP/1.1 RFCs (7230-7235) and HTTP/2 (RFC 9110-9114)
- OWASP Top 10:2021 security risks
- API security best practices
- Common security vulnerabilities and how to prevent them

Be concise, specific, and reference relevant RFC sections or OWASP categories when applicable.`;

export async function POST(request: Request) {
  try {
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      const message = 'GROQ_API_KEY is missing. Add it to apps/web/.env.local or export it in your shell before running pnpm dev.';
      console.error(`[API] ${message}`);
      return new Response(message, {
        status: 500,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // Initialize Groq client lazily so we can validate the API key first
    const groq = createGroq({
      apiKey: groqApiKey,
    });

    const { messages } = await request.json();

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

    // Ensure MCP gateway is configured before any graph operations triggered by chat
    ensureMcpGatewayConfiguredFromEnv();

    // Get the last user message
    const lastMessage = messages[messages.length - 1];

    // Check if this is an audit request
    if (lastMessage.role === 'user' && lastMessage.content.includes(AUDIT_TRIGGER)) {
      console.log('[API] Running audit on sample API...');

      try {
        // Run the audit
        const report: ComplianceReport = await runAuditOnSampleApi();

        // Store graph context for follow-up questions
        lastGraphContext = report.graphContext;

        // Convert to chat summary
        const summary = reportToSummary(report);

        // Embed report data in hidden comment for client to extract
        const responseWithReport = `${summary}\n\n<!--REPORT:${JSON.stringify(report)}:REPORT-->`;

        // Return as a streaming response that AI SDK's useChat can handle
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            // Format as AI SDK data stream
            controller.enqueue(encoder.encode(`0:${JSON.stringify(responseWithReport)}\n`));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
          },
        });
      } catch (error) {
        console.error('[API] Audit error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(`Error running audit: ${errorMessage}`, {
          status: 500,
          headers: {
            'Content-Type': 'text/plain',
          },
        });
      }
    }

    // Check if user wants to view the knowledge graph
    const graphViewKeywords = ['show graph', 'view graph', 'display graph', 'see graph'];
    const graphQueryKeywords = ['query graph', 'what rfcs', 'which rfcs', 'list rfcs', 'graph schema', 'show schema', 'cypher'];
    const lastContent = lastMessage.content.toLowerCase();
    const isGraphView = graphViewKeywords.some(kw => lastContent.includes(kw));
    const isGraphQuery = graphQueryKeywords.some(kw => lastContent.includes(kw));

    if (isGraphView || isGraphQuery) {
      console.log('[API] Detected graph request');

      try {
        let graphResult;

        if (lastContent.includes('schema')) {
          graphResult = await getMemgraphSchema();
        } else {
          // Default query to get all nodes and relationships
          const cypherQuery = lastContent.includes('cypher:')
            ? lastContent.split('cypher:')[1].trim()
            : 'MATCH (n) OPTIONAL MATCH (n)-[r]->(m) RETURN n, r, m';

          graphResult = await callMemgraphMcp(cypherQuery);
        }

        // For graph view requests, format as inline graph data
        if (isGraphView) {
          // Parse result into nodes and links for force-graph
          const nodes = new Map<string, { id: string; label: string; type: string; properties: Record<string, unknown> }>();
          const links: { source: string; target: string; type: string }[] = [];

          if (Array.isArray(graphResult)) {
            for (const record of graphResult) {
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

          const graphData = {
            nodes: Array.from(nodes.values()),
            links,
          };

          const graphResponseText = `Here's the current knowledge graph (${graphData.nodes.length} nodes, ${graphData.links.length} relationships):<!--GRAPH:${JSON.stringify(graphData)}:GRAPH-->`;

          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`0:${JSON.stringify(graphResponseText)}\n`));
              controller.close();
            },
          });
          return new Response(stream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        // For query requests, return JSON
        const resultSummary = JSON.stringify(graphResult, null, 2);
        const graphResponseText = `Here are the results from the knowledge graph:\n\n\`\`\`json\n${resultSummary}\n\`\`\``;

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`0:${JSON.stringify(graphResponseText)}\n`));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      } catch (error) {
        console.error('[API] Graph query error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return new Response(`Error querying graph: ${errorMessage}`, { status: 500 });
      }
    }

    // Build system prompt with graph context if available
    let systemPrompt = SYSTEM_PROMPT;
    if (lastGraphContext && (lastGraphContext.nodes.length > 0 || lastGraphContext.edges.length > 0)) {
      const graphSummary = lastGraphContext.nodes
        .map(n => `- ${n.type.toUpperCase()}: ${n.id} (${n.properties.title || ''})`)
        .join('\n');
      systemPrompt += `\n\nRelevant standards from the last audit (use these to inform your answers):\n${graphSummary}`;
    }

    // For normal chat, use AI SDK with Groq for streaming
    const result = await streamText({
      model: groq('compound-beta'),
      system: systemPrompt,
      messages,
      temperature: 0.3,
      maxTokens: 2048,
      onFinish: async ({ text }) => {
        // Extract specs from assistant response to populate graph
        try {
          await extractAndUpsertSpecsFromText(text);
        } catch (err) {
          console.log('[API] Graph population from response failed:', err);
        }
      },
    });

    // Return the stream response
    return result.toDataStreamResponse();
  } catch (error) {
    console.error('[API] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(`Error: ${errorMessage}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain',
      },
    });
  }
}
