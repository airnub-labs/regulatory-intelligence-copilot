import { createGroq } from '@ai-sdk/groq';
import { streamText, StreamData, streamToResponse } from 'ai';
import {
  runAuditOnSampleApi,
  reportToSummary,
  AUDIT_TRIGGER,
  queryMemgraphLocal,
  getMemgraphSchemaLocal,
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

// Initialize Groq client
const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function POST(request: Request) {
  try {
    const { messages } = await request.json();

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

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

    // Check if user wants to query the knowledge graph
    const graphQueryKeywords = ['query graph', 'show graph', 'what rfcs', 'which rfcs', 'list rfcs', 'graph schema', 'show schema', 'cypher'];
    const lastContent = lastMessage.content.toLowerCase();
    const isGraphQuery = graphQueryKeywords.some(kw => lastContent.includes(kw));

    if (isGraphQuery) {
      console.log('[API] Detected graph query request');

      try {
        let graphResult;

        if (lastContent.includes('schema')) {
          graphResult = await getMemgraphSchemaLocal();
        } else {
          // Default query to get all RFCs and their relationships
          const cypherQuery = lastContent.includes('cypher:')
            ? lastContent.split('cypher:')[1].trim()
            : 'MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 50';

          graphResult = await queryMemgraphLocal(cypherQuery);
        }

        if (graphResult.error) {
          const errorResponse = `Error querying graph: ${graphResult.error}`;
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`0:${JSON.stringify(errorResponse)}\n`));
              controller.close();
            },
          });
          return new Response(stream, {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }

        // Format results for display
        const resultSummary = JSON.stringify(graphResult.records, null, 2);
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
