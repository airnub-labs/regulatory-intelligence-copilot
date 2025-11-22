/**
 * Groq LLM client with aspect wrapping for sanitization and system prompts
 */

import type { ChatMessage, GroqChatRequest, GroqChatResponse } from './types.js';
import { applyAspects, type Aspect } from './aspects/applyAspects.js';
import { sanitizeTextForEgress } from './aspects/egressGuard.js';

// Groq configuration
const GROQ_API_URL = process.env.GROQ_API_URL || 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'compound-beta';

// System prompt for the RFC/OWASP auditor
const AUDITOR_SYSTEM_PROMPT = `You are an expert RFC and OWASP Top 10 compliance auditor for HTTP APIs.

Your role is to:
1. Analyze HTTP API exchanges for compliance with relevant RFCs (HTTP/1.1, HTTP/2, etc.)
2. Identify security vulnerabilities based on OWASP Top 10:2021 and other security standards
3. Provide specific, actionable recommendations for fixing issues
4. Reference specific RFC sections and OWASP categories in your analysis

Important context:
- All data you receive has been sanitized to remove PII and sensitive information
- You should focus on structural and security issues, not the content of sanitized fields
- Be specific about which RFC sections or OWASP categories apply to each finding
- Provide severity ratings: critical, high, medium, low

When analyzing endpoints, consider:
- HTTP semantics (status codes, methods, headers)
- Security headers (CORS, CSP, etc.)
- Error handling (information disclosure)
- Input validation (injection risks)
- Data exposure (PII, internal details)

Format your responses as structured JSON when producing compliance reports.`;

/**
 * Base Groq chat function
 */
async function baseGroqChat(request: GroqChatRequest): Promise<GroqChatResponse> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: request.model || GROQ_MODEL,
      messages: request.messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.max_tokens ?? 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as {
    choices: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };

  return {
    content: result.choices[0]?.message?.content || '',
    usage: result.usage,
  };
}

/**
 * LLM system prompt aspect - prepends the auditor system prompt
 */
const llmSystemPromptAspect: Aspect<GroqChatRequest, GroqChatResponse> = async (req, next) => {
  // Check if system prompt already exists
  const hasSystemPrompt = req.messages.some(m => m.role === 'system');

  const messagesWithSystem: ChatMessage[] = hasSystemPrompt
    ? req.messages
    : [
        { role: 'system', content: AUDITOR_SYSTEM_PROMPT },
        ...req.messages,
      ];

  return next({
    ...req,
    messages: messagesWithSystem,
  });
};

/**
 * LLM sanitization aspect - sanitizes outbound messages
 */
const llmSanitizationAspect: Aspect<GroqChatRequest, GroqChatResponse> = async (req, next) => {
  const sanitizedMessages = req.messages.map(msg => ({
    ...msg,
    content: sanitizeTextForEgress(msg.content),
  }));

  return next({
    ...req,
    messages: sanitizedMessages,
  });
};

/**
 * Aspect-wrapped Groq chat function
 */
export const groqChat = applyAspects(baseGroqChat, [
  llmSystemPromptAspect,
  llmSanitizationAspect,
]);

/**
 * Analyze compliance with Groq
 */
export async function analyzeComplianceWithGroq(input: {
  probes: import('./types.js').SanitizedHttpExchange[];
  specs: import('./types.js').EnrichedSpec[];
  graphContext: import('./types.js').GraphContext;
}): Promise<import('./types.js').ComplianceReport> {
  const { probes, specs, graphContext } = input;

  // Build the analysis prompt
  const probesSummary = probes.map((probe, idx) => `
Endpoint ${idx + 1}: ${probe.request.method} ${probe.request.urlTemplate}
- Status: ${probe.response.statusCode} ${probe.response.statusMessage}
- Response Headers: ${probe.response.headerNames.join(', ')}
- Body Type: ${probe.response.bodyKind}
- Body Preview: ${probe.response.bodyPreview}
`).join('\n');

  const specsSummary = specs.map(spec =>
    `${spec.type.toUpperCase()}: ${spec.id} - ${spec.title}`
  ).join('\n');

  const graphSummary = graphContext.nodes.length > 0
    ? `Related specs in knowledge graph: ${graphContext.nodes.map(n => n.id).join(', ')}`
    : 'No existing graph context';

  const analysisPrompt = `Analyze these HTTP API endpoints for RFC compliance and OWASP Top 10:2021 security issues:

${probesSummary}

Relevant standards identified:
${specsSummary}

${graphSummary}

Provide a detailed compliance report in this exact JSON format:
{
  "summary": "Brief overall assessment",
  "overallHealth": "healthy|degraded|critical",
  "endpoints": [
    {
      "endpoint": "/path",
      "method": "GET",
      "status": "compliant|warning|critical",
      "issues": [
        {
          "severity": "low|medium|high|critical",
          "description": "Issue description",
          "rfcReferences": ["RFC7231 Section 6.5"],
          "owaspReferences": ["A03:2021"]
        }
      ],
      "suggestions": ["Actionable suggestion"]
    }
  ],
  "rfcsCited": ["RFC7231"],
  "owaspCited": ["A03:2021"]
}`;

  const response = await groqChat({
    messages: [
      { role: 'user', content: analysisPrompt },
    ],
  });

  // Parse the JSON response
  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    let jsonStr = response.content;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const report = JSON.parse(jsonStr.trim());

    return {
      ...report,
      graphContext,
      timestamp: new Date().toISOString(),
    };
  } catch {
    // If parsing fails, create a basic report from the text
    return {
      summary: response.content,
      overallHealth: 'degraded',
      endpoints: [],
      rfcsCited: specs.filter(s => s.type === 'rfc').map(s => s.id),
      owaspCited: specs.filter(s => s.type === 'owasp').map(s => s.id),
      graphContext,
      timestamp: new Date().toISOString(),
    };
  }
}
