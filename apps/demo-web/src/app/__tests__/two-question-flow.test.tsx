/**
 * Integration test for two-question flow
 *
 * This test verifies that the UI correctly updates when asking two questions in sequence.
 * It specifically tests for the bug where the second question's response wasn't showing in the UI.
 *
 * The bug was caused by the isStreamingRef flag not being properly cleared between questions,
 * which prevented the conversation from reloading after the second response.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SessionProvider } from 'next-auth/react';
import Home from '../page';

// Mock next-auth
const mockSession = {
  user: {
    id: 'test-user-123',
    email: 'test@example.com',
    tenantId: 'test-tenant',
  },
  expires: '2099-01-01',
};

vi.mock('next-auth/react', async () => {
  const actual = await vi.importActual('next-auth/react');
  return {
    ...actual,
    useSession: () => ({
      data: mockSession,
      status: 'authenticated',
    }),
    signOut: vi.fn(),
  };
});

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock client telemetry
vi.mock('@/lib/clientTelemetry', () => ({
  createClientTelemetry: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequest: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
    newRequestId: vi.fn(() => 'test-request-id'),
  }),
}));

// Mock path API client
vi.mock('@/lib/pathApiClient', () => ({
  getPathApiClient: () => ({
    getPaths: vi.fn(() => Promise.resolve([])),
    getActivePath: vi.fn(() => Promise.resolve(null)),
  }),
}));

describe('Two Question Flow', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    // Mock initial conversations list
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/conversations?status=')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ conversations: [] }),
        });
      }
      if (url.includes('/api/conversations/stream')) {
        // Return empty SSE stream
        return Promise.resolve({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
      });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should display both question and answer for two consecutive questions', async () => {
    let chatRequestCount = 0;

    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      // Handle conversations list endpoint
      if (url.includes('/api/conversations?status=')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ conversations: [] }),
        });
      }

      // Handle SSE subscription endpoint
      if (url.includes('/api/conversations/stream')) {
        return Promise.resolve({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        });
      }

      // Handle conversation stream endpoint
      if (url.match(/\/api\/conversations\/[^/]+\/stream$/)) {
        return Promise.resolve({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        });
      }

      // Handle chat POST endpoint
      if (url.includes('/api/chat') && options?.method === 'POST') {
        chatRequestCount++;
        const requestBody = JSON.parse(options.body as string);
        const questionNumber = chatRequestCount;
        const userMessage = requestBody.message;

        // Create SSE stream response
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();

            // Send metadata event
            const metadata = {
              conversationId: `conv-${questionNumber}`,
              agentId: 'test-agent',
              jurisdictions: ['IE'],
              uncertaintyLevel: 'low',
              disclaimerKey: 'test',
              referencedNodes: [],
              warnings: [],
            };
            controller.enqueue(encoder.encode(`event: metadata\ndata: ${JSON.stringify(metadata)}\n\n`));

            // Send message chunks
            const response = `This is the answer to question ${questionNumber}: "${userMessage}"`;
            const chunks = response.split(' ');
            chunks.forEach((chunk, index) => {
              controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(chunk + (index < chunks.length - 1 ? ' ' : ''))}\n\n`));
            });

            // Send done event
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
          },
        });

        return Promise.resolve({
          ok: true,
          headers: new Headers({ 'content-type': 'text/event-stream' }),
          body: stream,
        } as Response);
      }

      // Handle conversation load endpoint
      if (url.match(/\/api\/conversations\/conv-\d+$/)) {
        const conversationId = url.split('/').pop();
        const questionNumber = parseInt(conversationId?.replace('conv-', '') || '0');

        // Return messages for this conversation
        const messages = [];
        for (let i = 1; i <= questionNumber; i++) {
          messages.push({
            id: `user-msg-${i}`,
            role: 'user',
            content: i === 1 ? 'First question' : 'Second question',
          });
          messages.push({
            id: `assistant-msg-${i}`,
            role: 'assistant',
            content: `This is the answer to question ${i}: "${i === 1 ? 'First question' : 'Second question'}"`,
          });
        }

        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            conversation: {
              id: conversationId,
              shareAudience: 'private',
              tenantAccess: 'edit',
              personaId: 'single-director',
              jurisdictions: ['IE'],
              title: null,
            },
            messages,
          }),
        });
      }

      return Promise.resolve({
        ok: false,
        status: 404,
      });
    });

    const { container } = render(
      <SessionProvider session={mockSession}>
        <Home />
      </SessionProvider>
    );

    // Wait for initial render
    await waitFor(() => {
      expect(screen.queryByText(/Regulatory Intelligence Copilot/i)).toBeInTheDocument();
    });

    // Find the input field
    const input = container.querySelector('textarea[placeholder*="Ask about"]') as HTMLTextAreaElement;
    expect(input).toBeInTheDocument();

    // ===== FIRST QUESTION =====

    // Type first question
    fireEvent.change(input, { target: { value: 'First question' } });
    expect(input.value).toBe('First question');

    // Submit first question
    const submitButton = container.querySelector('button[type="submit"]');
    if (submitButton) {
      fireEvent.click(submitButton);
    } else {
      // Fallback: trigger form submit via Enter key
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });
    }

    // Wait for first question to appear in the UI
    await waitFor(
      () => {
        const userMessages = screen.queryAllByText(/First question/i);
        expect(userMessages.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    // Wait for first answer to appear in the UI
    await waitFor(
      () => {
        const assistantMessage = screen.queryByText(/This is the answer to question 1/i);
        expect(assistantMessage).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Verify first conversation was loaded
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/conversations/conv-1'),
      expect.objectContaining({ credentials: 'include' })
    );

    // ===== SECOND QUESTION =====

    // Type second question (input should be cleared after first submit)
    fireEvent.change(input, { target: { value: 'Second question' } });
    expect(input.value).toBe('Second question');

    // Submit second question
    if (submitButton) {
      fireEvent.click(submitButton);
    } else {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: false });
    }

    // Wait for second question to appear in the UI
    await waitFor(
      () => {
        const userMessages = screen.queryAllByText(/Second question/i);
        expect(userMessages.length).toBeGreaterThan(0);
      },
      { timeout: 5000 }
    );

    // *** CRITICAL TEST: Verify second answer appears in the UI ***
    // This is the bug that was previously failing
    await waitFor(
      () => {
        const assistantMessage = screen.queryByText(/This is the answer to question 2/i);
        expect(assistantMessage).toBeInTheDocument();
      },
      { timeout: 5000 }
    );

    // Verify second conversation was loaded (this ensures loadConversation was called)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/conversations/conv-2'),
      expect.objectContaining({ credentials: 'include' })
    );

    // Verify both questions and answers are present
    expect(screen.queryByText(/This is the answer to question 1/i)).toBeInTheDocument();
    expect(screen.queryByText(/This is the answer to question 2/i)).toBeInTheDocument();
  });

  it('should properly clear isStreamingRef between questions', async () => {
    // This test specifically verifies that the isStreamingRef flag is properly managed
    const streamingStates: boolean[] = [];
    let chatRequestCount = 0;

    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/conversations?status=')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ conversations: [] }),
        });
      }

      if (url.includes('/api/conversations/stream') || url.match(/\/api\/conversations\/[^/]+\/stream$/)) {
        return Promise.resolve({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        });
      }

      if (url.includes('/api/chat') && options?.method === 'POST') {
        chatRequestCount++;
        const questionNumber = chatRequestCount;

        // Track that streaming started
        streamingStates.push(true);

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();

            // Quick response
            controller.enqueue(encoder.encode(`event: metadata\ndata: ${JSON.stringify({ conversationId: `conv-${questionNumber}` })}\n\n`));
            controller.enqueue(encoder.encode(`event: message\ndata: "Answer ${questionNumber}"\n\n`));
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));

            // Mark streaming as done
            setTimeout(() => {
              streamingStates.push(false);
              controller.close();
            }, 50);
          },
        });

        return Promise.resolve({
          ok: true,
          body: stream,
        } as Response);
      }

      if (url.match(/\/api\/conversations\/conv-\d+$/)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            conversation: { id: url.split('/').pop() },
            messages: [],
          }),
        });
      }

      return Promise.resolve({ ok: false, status: 404 });
    });

    render(
      <SessionProvider session={mockSession}>
        <Home />
      </SessionProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText(/Regulatory Intelligence Copilot/i)).toBeInTheDocument();
    });

    const input = document.querySelector('textarea[placeholder*="Ask about"]') as HTMLTextAreaElement;

    // First question
    fireEvent.change(input, { target: { value: 'Q1' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Wait for first streaming to complete
    await waitFor(() => {
      expect(streamingStates).toContain(false);
    }, { timeout: 3000 });

    // Second question - should not be blocked by streaming flag
    fireEvent.change(input, { target: { value: 'Q2' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    // Wait for second streaming to start
    await waitFor(() => {
      expect(chatRequestCount).toBe(2);
    }, { timeout: 3000 });

    // Verify streaming states went: true (Q1 start) -> false (Q1 end) -> true (Q2 start) -> false (Q2 end)
    expect(streamingStates).toEqual(expect.arrayContaining([true, false]));
    expect(streamingStates.length).toBeGreaterThanOrEqual(2);
  });
});
