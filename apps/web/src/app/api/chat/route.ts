import { runRegulatoryAnalysis } from '@e2b-auditor/core';

const DISCLAIMER =
  'This copilot performs regulatory research using a graph of laws and benefits. It is not legal, tax, or welfare advice. Confirm important decisions with qualified professionals.';

export async function POST(request: Request) {
  try {
    const { messages, profile, jurisdictions } = await request.json();

    if (!messages || messages.length === 0) {
      return new Response('No messages provided', { status: 400 });
    }

    const result = await runRegulatoryAnalysis({
      messages,
      profile,
      jurisdictions,
      referenceDate: new Date(),
    });

    const referenced = result.referencedNodes.length
      ? `\nReferenced graph nodes: ${result.referencedNodes.join(', ')}`
      : '';
    const notes = result.notes?.length ? `\nNotes: ${result.notes.join('; ')}` : '';
    const uncertainty = result.uncertaintyLevel ? `\nUncertainty: ${result.uncertaintyLevel}` : '';
    const responseText = `${result.answer}${notes}${referenced}${uncertainty}\n\n${DISCLAIMER}`;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`0:${JSON.stringify(responseText)}\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('[API] Chat error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(`Error: ${message}`, { status: 500 });
  }
}
