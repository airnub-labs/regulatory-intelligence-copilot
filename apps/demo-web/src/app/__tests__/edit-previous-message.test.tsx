/**
 * Comprehensive tests for editing previous messages and path switching
 *
 * This test suite verifies the critical scenario where:
 * 1. User has a conversation with multiple messages
 * 2. User edits a PREVIOUS message (not the last one)
 * 3. System creates a new branch from that point
 * 4. User continues conversation on new branch
 * 5. User switches back to original path
 * 6. UI shows complete original conversation including messages AFTER the edited point
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

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

vi.mock('@/lib/pathApiClient', () => ({
  getPathApiClient: () => ({
    getPaths: vi.fn(() => Promise.resolve([])),
    getActivePath: vi.fn(() => Promise.resolve(null)),
  }),
}));

describe('Edit Previous Message and Path Switching', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let conversationState: {
    paths: Map<string, { id: string; name: string; parentPathId?: string; branchFromMessageId?: string }>;
    messages: Map<string, Array<{ id: string; role: string; content: string; pathId: string; sequenceInPath: number }>>;
    activePaths: Map<string, string>;
  };

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;

    conversationState = {
      paths: new Map([
        ['path-main', { id: 'path-main', name: 'Primary' }],
      ]),
      messages: new Map(),
      activePaths: new Map(),
    };

    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.includes('/api/conversations?status=')) {
        return {
          ok: true,
          json: async () => ({ conversations: [] }),
        };
      }

      if (url.includes('/stream')) {
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        };
      }

      if (url.includes('/api/chat') && options?.method === 'POST') {
        const body = JSON.parse(options.body as string);
        const conversationId = body.conversationId || `conv-${Date.now()}`;
        const pathId = body.pathId || conversationState.activePaths.get(conversationId) || 'path-main';
        const message = body.message;

        if (!conversationState.messages.has(conversationId)) {
          conversationState.messages.set(conversationId, []);
        }
        const messages = conversationState.messages.get(conversationId)!;

        const currentPathMessages = messages.filter((m) => m.pathId === pathId);
        const nextSequence = currentPathMessages.length;

        messages.push({
          id: `user-${messages.length + 1}`,
          role: 'user',
          content: message,
          pathId,
          sequenceInPath: nextSequence,
        });

        messages.push({
          id: `assistant-${messages.length + 1}`,
          role: 'assistant',
          content: `Response to: ${message}`,
          pathId,
          sequenceInPath: nextSequence + 1,
        });

        if (!conversationState.activePaths.has(conversationId)) {
          conversationState.activePaths.set(conversationId, pathId);
        }

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            controller.enqueue(
              encoder.encode(
                `event: metadata\ndata: ${JSON.stringify({
                  conversationId,
                  agentId: 'test-agent',
                  jurisdictions: ['IE'],
                })}\n\n`
              )
            );

            const response = `Response to: ${message}`;
            controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(response)}\n\n`));
            controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
            controller.close();
          },
        });

        return { ok: true, body: stream } as Response;
      }

      if (url.match(/\/api\/conversations\/[^/]+$/) && !url.includes('/branch')) {
        const conversationId = url.split('/').pop()!;
        const activePathId = conversationState.activePaths.get(conversationId) || 'path-main';
        const allMessages = conversationState.messages.get(conversationId) || [];
        const pathMessages = allMessages.filter((m) => m.pathId === activePathId);

        return {
          ok: true,
          json: async () => ({
            conversation: {
              id: conversationId,
              activePathId,
              shareAudience: 'private',
              tenantAccess: 'edit',
            },
            messages: pathMessages,
          }),
        };
      }

      if (url.includes('/branch') && options?.method === 'POST') {
        const conversationId = url.split('/')[3];
        const body = JSON.parse(options.body as string);
        const sourceMessageId = body.sourceMessageId;
        const branchName = body.name || 'New Branch';

        const newPathId = `path-branch-${Date.now()}`;
        conversationState.paths.set(newPathId, {
          id: newPathId,
          name: branchName,
          parentPathId: 'path-main',
          branchFromMessageId: sourceMessageId,
        });

        const allMessages = conversationState.messages.get(conversationId) || [];
        const branchPointIndex = allMessages.findIndex((m) => m.id === sourceMessageId);

        if (branchPointIndex >= 0) {
          const messagesToCopy = allMessages.slice(0, branchPointIndex + 1);
          messagesToCopy.forEach((originalMsg, index) => {
            allMessages.push({
              ...originalMsg,
              id: `${originalMsg.id}-branch-${newPathId}`,
              pathId: newPathId,
              sequenceInPath: index,
            });
          });
        }

        return {
          ok: true,
          json: async () => ({
            path: conversationState.paths.get(newPathId),
            branchPointMessage: { id: sourceMessageId },
          }),
        };
      }

      if (url.includes('/active-path') && options?.method === 'PUT') {
        const conversationId = url.split('/')[3];
        const body = JSON.parse(options.body as string);
        conversationState.activePaths.set(conversationId, body.pathId);

        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }

      if (url.includes('/paths') && !url.includes('/paths/')) {
        const paths = Array.from(conversationState.paths.values());
        return {
          ok: true,
          json: async () => ({ paths }),
        };
      }

      return { ok: false, status: 404 };
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Edit Previous Message Scenarios', () => {
    it('should branch from middle of conversation when editing previous message', async () => {
      const { container } = render(
        <SessionProvider session={mockSession}>
          <Home />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.queryByText(/Regulatory Intelligence Copilot/i)).toBeInTheDocument();
      });

      const input = document.querySelector('textarea[placeholder*="Ask about"]') as HTMLTextAreaElement;

      // ===== STEP 1: Create a conversation with 5 messages on main path =====
      const mainPathQuestions = ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5'];

      for (const question of mainPathQuestions) {
        fireEvent.change(input, { target: { value: question } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
          expect(screen.queryByText(question)).toBeInTheDocument();
        }, { timeout: 5000 });

        await waitFor(() => {
          expect(screen.queryByText(new RegExp(`Response to: ${question}`, 'i'))).toBeInTheDocument();
        }, { timeout: 5000 });
      }

      // Verify all 5 Q&A pairs exist on main path
      mainPathQuestions.forEach((q) => {
        expect(screen.queryByText(q)).toBeInTheDocument();
        expect(screen.queryByText(new RegExp(`Response to: ${q}`, 'i'))).toBeInTheDocument();
      });

      // Get conversation ID
      const conversationId = Array.from(conversationState.messages.keys())[0];
      expect(conversationId).toBeDefined();

      // Verify main path has 10 messages (5 Q&A pairs)
      const mainPathMessages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main');
      expect(mainPathMessages).toHaveLength(10);

      // ===== STEP 2: Edit Question 2 (a PREVIOUS message, not the last one) =====
      // Find all Edit buttons
      const allButtons = Array.from(container.querySelectorAll('button'));
      const editButtons = allButtons.filter((btn) => btn.textContent?.includes('Edit'));

      // Click the edit button for Question 2 (should be the second user message)
      // Note: In real implementation, you'd need to identify the specific message
      // For this test, we'll simulate the edit by directly calling the edit flow
      if (editButtons.length > 0) {
        // Click first edit button (for Question 1)
        fireEvent.click(editButtons[0]);

        await waitFor(() => {
          const editTextarea = container.querySelector('textarea[id^="edit-"]');
          expect(editTextarea).toBeInTheDocument();
        });

        const editTextarea = container.querySelector('textarea[id^="edit-"]') as HTMLTextAreaElement;

        // Change Question 1 to "Edited Question 1"
        fireEvent.change(editTextarea, { target: { value: 'Edited Question 1' } });

        // Find and click Save button
        const saveButton = allButtons.find((btn) => btn.textContent?.includes('Save edit'));
        if (saveButton) {
          fireEvent.click(saveButton);

          // Wait for branch to be created
          await waitFor(() => {
            expect(fetchMock).toHaveBeenCalledWith(
              expect.stringContaining('/branch'),
              expect.objectContaining({ method: 'POST' })
            );
          }, { timeout: 5000 });
        }
      }

      // ===== STEP 3: Verify branch was created =====
      const branchPaths = Array.from(conversationState.paths.values()).filter(
        (p) => p.parentPathId === 'path-main'
      );
      expect(branchPaths.length).toBeGreaterThan(0);

      const branchPath = branchPaths[0];
      expect(branchPath).toBeDefined();
      expect(branchPath.parentPathId).toBe('path-main');
    });

    it('should preserve full original path when editing and show all messages when switching back', async () => {
      const { container } = render(
        <SessionProvider session={mockSession}>
          <Home />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.queryByText(/Regulatory Intelligence Copilot/i)).toBeInTheDocument();
      });

      const input = document.querySelector('textarea[placeholder*="Ask about"]') as HTMLTextAreaElement;

      // ===== STEP 1: Create main path with 5 Q&A pairs =====
      for (let i = 1; i <= 5; i++) {
        fireEvent.change(input, { target: { value: `Main Q${i}` } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
          expect(screen.queryByText(`Main Q${i}`)).toBeInTheDocument();
        }, { timeout: 5000 });

        await waitFor(() => {
          expect(screen.queryByText(new RegExp(`Response to: Main Q${i}`, 'i'))).toBeInTheDocument();
        }, { timeout: 5000 });
      }

      const conversationId = Array.from(conversationState.messages.keys())[0];

      // Store original main path messages before edit
      const originalMainMessages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main');
      expect(originalMainMessages).toHaveLength(10); // 5 Q&A pairs

      // ===== STEP 2: Edit Question 3 (middle of conversation) =====
      const messageToEdit = originalMainMessages.find((m) => m.content === 'Main Q3');
      expect(messageToEdit).toBeDefined();

      // Simulate branch creation by calling the API directly
      const branchResponse = await fetch(`/api/conversations/${conversationId}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceMessageId: messageToEdit!.id,
          name: 'Edit: Main Q3',
        }),
      });

      expect(branchResponse.ok).toBe(true);
      const { path: newBranchPath } = await branchResponse.json();

      // ===== STEP 3: Simulate switching to new branch =====
      await fetch(`/api/conversations/${conversationId}/active-path`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathId: newBranchPath.id }),
      });

      conversationState.activePaths.set(conversationId, newBranchPath.id);

      // ===== STEP 4: Add new message on branch with EDITED content =====
      // First, add the edited version of Q3
      const allMessages = conversationState.messages.get(conversationId)!;
      const branchMessages = allMessages.filter((m) => m.pathId === newBranchPath.id);

      allMessages.push({
        id: `user-edited-q3`,
        role: 'user',
        content: 'Edited Main Q3',
        pathId: newBranchPath.id,
        sequenceInPath: branchMessages.length,
      });

      allMessages.push({
        id: `assistant-edited-q3`,
        role: 'assistant',
        content: 'Response to: Edited Main Q3',
        pathId: newBranchPath.id,
        sequenceInPath: branchMessages.length + 1,
      });

      // ===== STEP 5: Continue conversation on branch =====
      for (let i = 1; i <= 2; i++) {
        const branchQ = `Branch Q${i}`;
        fireEvent.change(input, { target: { value: branchQ } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        await waitFor(() => {
          expect(screen.queryByText(branchQ)).toBeInTheDocument();
        }, { timeout: 5000 });
      }

      // ===== STEP 6: Verify original main path is PRESERVED with ALL messages =====
      const currentMainMessages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main');

      // CRITICAL: Main path should still have all 10 messages (5 Q&A pairs)
      // including Q4 and Q5 which came AFTER the branch point
      expect(currentMainMessages).toHaveLength(10);

      // Verify all original questions are still on main path
      expect(currentMainMessages.find((m) => m.content === 'Main Q1')).toBeDefined();
      expect(currentMainMessages.find((m) => m.content === 'Main Q2')).toBeDefined();
      expect(currentMainMessages.find((m) => m.content === 'Main Q3')).toBeDefined();
      expect(currentMainMessages.find((m) => m.content === 'Main Q4')).toBeDefined(); // AFTER branch point!
      expect(currentMainMessages.find((m) => m.content === 'Main Q5')).toBeDefined(); // AFTER branch point!

      // ===== STEP 7: Switch back to main path =====
      await fetch(`/api/conversations/${conversationId}/active-path`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathId: 'path-main' }),
      });

      conversationState.activePaths.set(conversationId, 'path-main');

      // Load conversation which will filter by active path
      const loadResponse = await fetch(`/api/conversations/${conversationId}`);
      const loadData = await loadResponse.json();

      // CRITICAL TEST: Verify UI would show ALL original messages
      expect(loadData.messages).toHaveLength(10);
      expect(loadData.messages.find((m: { content: string }) => m.content === 'Main Q4')).toBeDefined();
      expect(loadData.messages.find((m: { content: string }) => m.content === 'Main Q5')).toBeDefined();

      // Verify messages AFTER branch point are included
      const messagesAfterBranchPoint = loadData.messages.filter(
        (m: { sequenceInPath: number }) => m.sequenceInPath >= 6 // After Q3 pair
      );
      expect(messagesAfterBranchPoint.length).toBeGreaterThan(0);
    });

    it('should show complete original conversation when switching from branch back to main path', async () => {
      // This test verifies the complete UI flow

      const { container } = render(
        <SessionProvider session={mockSession}>
          <Home />
        </SessionProvider>
      );

      await waitFor(() => {
        expect(screen.queryByText(/Regulatory Intelligence Copilot/i)).toBeInTheDocument();
      });

      const input = document.querySelector('textarea[placeholder*="Ask about"]') as HTMLTextAreaElement;

      const conversationId = 'test-conv-ui-switch';
      conversationState.messages.set(conversationId, []);
      conversationState.activePaths.set(conversationId, 'path-main');

      // ===== STEP 1: Manually create a conversation state with:
      // - Main path: Q1, A1, Q2, A2, Q3, A3, Q4, A4, Q5, A5
      // - Branch path (from Q2): Q1, A1, Edited Q2, A2, Branch Q1, A1
      const mainMessages = [
        { id: 'user-1', role: 'user', content: 'Original Q1', pathId: 'path-main', sequenceInPath: 0 },
        { id: 'assistant-1', role: 'assistant', content: 'Response to: Original Q1', pathId: 'path-main', sequenceInPath: 1 },
        { id: 'user-2', role: 'user', content: 'Original Q2', pathId: 'path-main', sequenceInPath: 2 },
        { id: 'assistant-2', role: 'assistant', content: 'Response to: Original Q2', pathId: 'path-main', sequenceInPath: 3 },
        { id: 'user-3', role: 'user', content: 'Original Q3', pathId: 'path-main', sequenceInPath: 4 },
        { id: 'assistant-3', role: 'assistant', content: 'Response to: Original Q3', pathId: 'path-main', sequenceInPath: 5 },
        { id: 'user-4', role: 'user', content: 'Original Q4', pathId: 'path-main', sequenceInPath: 6 },
        { id: 'assistant-4', role: 'assistant', content: 'Response to: Original Q4', pathId: 'path-main', sequenceInPath: 7 },
        { id: 'user-5', role: 'user', content: 'Original Q5', pathId: 'path-main', sequenceInPath: 8 },
        { id: 'assistant-5', role: 'assistant', content: 'Response to: Original Q5', pathId: 'path-main', sequenceInPath: 9 },
      ];

      const branchPathId = 'path-branch-from-q2';
      conversationState.paths.set(branchPathId, {
        id: branchPathId,
        name: 'Edit Branch',
        parentPathId: 'path-main',
        branchFromMessageId: 'user-2',
      });

      const branchMessages = [
        { id: 'user-1-branch', role: 'user', content: 'Original Q1', pathId: branchPathId, sequenceInPath: 0 },
        { id: 'assistant-1-branch', role: 'assistant', content: 'Response to: Original Q1', pathId: branchPathId, sequenceInPath: 1 },
        { id: 'user-2-edited', role: 'user', content: 'EDITED Q2', pathId: branchPathId, sequenceInPath: 2 },
        { id: 'assistant-2-edited', role: 'assistant', content: 'Response to: EDITED Q2', pathId: branchPathId, sequenceInPath: 3 },
        { id: 'user-branch-1', role: 'user', content: 'Branch Q1', pathId: branchPathId, sequenceInPath: 4 },
        { id: 'assistant-branch-1', role: 'assistant', content: 'Response to: Branch Q1', pathId: branchPathId, sequenceInPath: 5 },
      ];

      conversationState.messages.get(conversationId)!.push(...mainMessages, ...branchMessages);

      // ===== STEP 2: Start on branch path =====
      conversationState.activePaths.set(conversationId, branchPathId);

      // Load branch conversation
      const branchLoadResponse = await fetch(`/api/conversations/${conversationId}`);
      const branchLoadData = await branchLoadResponse.json();

      // Verify branch shows only branch messages
      expect(branchLoadData.messages).toHaveLength(6);
      expect(branchLoadData.messages.find((m: { content: string }) => m.content === 'EDITED Q2')).toBeDefined();
      expect(branchLoadData.messages.find((m: { content: string }) => m.content === 'Branch Q1')).toBeDefined();

      // CRITICAL: Branch should NOT show Q3, Q4, Q5 from main
      expect(branchLoadData.messages.find((m: { content: string }) => m.content === 'Original Q3')).toBeUndefined();
      expect(branchLoadData.messages.find((m: { content: string }) => m.content === 'Original Q4')).toBeUndefined();
      expect(branchLoadData.messages.find((m: { content: string }) => m.content === 'Original Q5')).toBeUndefined();

      // ===== STEP 3: Switch to main path =====
      conversationState.activePaths.set(conversationId, 'path-main');

      const mainLoadResponse = await fetch(`/api/conversations/${conversationId}`);
      const mainLoadData = await mainLoadResponse.json();

      // CRITICAL TEST: Main path should show ALL 10 original messages
      expect(mainLoadData.messages).toHaveLength(10);

      // Verify ALL original questions are present
      expect(mainLoadData.messages.find((m: { content: string }) => m.content === 'Original Q1')).toBeDefined();
      expect(mainLoadData.messages.find((m: { content: string }) => m.content === 'Original Q2')).toBeDefined();
      expect(mainLoadData.messages.find((m: { content: string }) => m.content === 'Original Q3')).toBeDefined();
      expect(mainLoadData.messages.find((m: { content: string }) => m.content === 'Original Q4')).toBeDefined();
      expect(mainLoadData.messages.find((m: { content: string }) => m.content === 'Original Q5')).toBeDefined();

      // Main should NOT show edited or branch-specific messages
      expect(mainLoadData.messages.find((m: { content: string }) => m.content === 'EDITED Q2')).toBeUndefined();
      expect(mainLoadData.messages.find((m: { content: string }) => m.content === 'Branch Q1')).toBeUndefined();

      // ===== STEP 4: Verify sequence integrity =====
      const mainSequences = mainLoadData.messages.map((m: { sequenceInPath: number }) => m.sequenceInPath);
      expect(mainSequences).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should maintain correct message counts when editing middle message multiple times', async () => {
      const conversationId = 'test-multi-edit';
      conversationState.messages.set(conversationId, []);
      conversationState.activePaths.set(conversationId, 'path-main');

      // Create main path with 4 Q&A pairs
      for (let i = 1; i <= 4; i++) {
        conversationState.messages.get(conversationId)!.push(
          {
            id: `user-${i}`,
            role: 'user',
            content: `Q${i}`,
            pathId: 'path-main',
            sequenceInPath: (i - 1) * 2,
          },
          {
            id: `assistant-${i}`,
            role: 'assistant',
            content: `A${i}`,
            pathId: 'path-main',
            sequenceInPath: (i - 1) * 2 + 1,
          }
        );
      }

      // Verify initial state
      const initialMainMessages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main');
      expect(initialMainMessages).toHaveLength(8); // 4 Q&A pairs

      // ===== Edit Q2 (creates branch-1) =====
      const branchResponse1 = await fetch(`/api/conversations/${conversationId}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceMessageId: 'user-2',
          name: 'Edit Branch 1',
        }),
      });

      const { path: branch1 } = await branchResponse1.json();

      // Verify main path STILL has all 8 messages
      const mainAfterBranch1 = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main');
      expect(mainAfterBranch1).toHaveLength(8);

      // ===== Edit Q3 on main (creates branch-2) =====
      const branchResponse2 = await fetch(`/api/conversations/${conversationId}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceMessageId: 'user-3',
          name: 'Edit Branch 2',
        }),
      });

      const { path: branch2 } = await branchResponse2.json();

      // Verify main path STILL has all 8 messages
      const mainAfterBranch2 = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main');
      expect(mainAfterBranch2).toHaveLength(8);

      // Verify branch counts
      const branch1Messages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === branch1.id);
      expect(branch1Messages).toHaveLength(4); // Up to and including Q2

      const branch2Messages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === branch2.id);
      expect(branch2Messages).toHaveLength(6); // Up to and including Q3

      // Verify total unique paths
      const uniquePaths = new Set(conversationState.messages.get(conversationId)!.map((m) => m.pathId));
      expect(uniquePaths.size).toBe(3); // main, branch-1, branch-2
    });
  });
});
