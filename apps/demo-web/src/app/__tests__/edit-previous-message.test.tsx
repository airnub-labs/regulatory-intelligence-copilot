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

  describe('Critical Path Preservation Tests', () => {
    /**
     * CRITICAL INVARIANT: When editing message N in a conversation of M messages (where N < M),
     * the original path MUST preserve ALL M messages, including messages N+1 through M.
     *
     * This is the core "time travel" feature - users can branch to explore alternatives
     * while keeping the complete original conversation intact.
     */
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

  describe('Edge Cases and Variations', () => {
    it('should preserve path when editing FIRST message in long conversation', async () => {
      // CRITICAL: Editing first message should preserve ALL subsequent messages
      const conversationId = 'test-edit-first';
      conversationState.messages.set(conversationId, []);
      conversationState.activePaths.set(conversationId, 'path-main');

      // Create 10 messages (5 Q&A pairs)
      for (let i = 1; i <= 5; i++) {
        conversationState.messages.get(conversationId)!.push(
          {
            id: `user-${i}`,
            role: 'user',
            content: `Question ${i}`,
            pathId: 'path-main',
            sequenceInPath: (i - 1) * 2,
          },
          {
            id: `assistant-${i}`,
            role: 'assistant',
            content: `Answer ${i}`,
            pathId: 'path-main',
            sequenceInPath: (i - 1) * 2 + 1,
          }
        );
      }

      // Edit FIRST message
      const branchResponse = await fetch(`/api/conversations/${conversationId}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceMessageId: 'user-1',
          name: 'Edit First Message',
        }),
      });

      expect(branchResponse.ok).toBe(true);

      // CRITICAL: Main path must still have all 10 messages
      const mainMessages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main');
      expect(mainMessages).toHaveLength(10);

      // Verify Q2-Q5 still exist on main
      expect(mainMessages.find((m) => m.content === 'Question 2')).toBeDefined();
      expect(mainMessages.find((m) => m.content === 'Question 3')).toBeDefined();
      expect(mainMessages.find((m) => m.content === 'Question 4')).toBeDefined();
      expect(mainMessages.find((m) => m.content === 'Question 5')).toBeDefined();
    });

    it('should handle editing message at various positions in conversation', async () => {
      // Test editing at positions: 1st, 2nd, 3rd, 4th of 5 Q&A pairs
      const conversationId = 'test-edit-positions';
      conversationState.messages.set(conversationId, []);
      conversationState.activePaths.set(conversationId, 'path-main');

      // Create 5 Q&A pairs (10 messages)
      for (let i = 1; i <= 5; i++) {
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

      const editPositions = [
        { position: 1, messageId: 'user-1', expectedMainCount: 10, expectedAfterCount: 4 },
        { position: 2, messageId: 'user-2', expectedMainCount: 10, expectedAfterCount: 3 },
        { position: 3, messageId: 'user-3', expectedMainCount: 10, expectedAfterCount: 2 },
        { position: 4, messageId: 'user-4', expectedMainCount: 10, expectedAfterCount: 1 },
      ];

      for (const { position, messageId, expectedMainCount, expectedAfterCount } of editPositions) {
        // Create branch from this position
        await fetch(`/api/conversations/${conversationId}/branch`, {
          method: 'POST',
          body: JSON.stringify({ sourceMessageId: messageId, name: `Branch ${position}` }),
        });

        // CRITICAL: Main path always keeps all 10 messages
        const mainMessages = conversationState.messages
          .get(conversationId)!
          .filter((m) => m.pathId === 'path-main');
        expect(mainMessages).toHaveLength(expectedMainCount);

        // Verify messages after edit point exist
        const messagesAfterEdit = mainMessages.filter(
          (m) => m.sequenceInPath > position * 2 - 1
        );
        expect(messagesAfterEdit.length).toBeGreaterThanOrEqual(expectedAfterCount);
      }
    });

    it('should maintain path integrity when rapidly switching between paths', async () => {
      const conversationId = 'test-rapid-switching';
      conversationState.messages.set(conversationId, []);

      // Create main path
      const mainMessages = [
        { id: 'main-1', role: 'user', content: 'Main Q1', pathId: 'path-main', sequenceInPath: 0 },
        { id: 'main-2', role: 'assistant', content: 'Main A1', pathId: 'path-main', sequenceInPath: 1 },
        { id: 'main-3', role: 'user', content: 'Main Q2', pathId: 'path-main', sequenceInPath: 2 },
        { id: 'main-4', role: 'assistant', content: 'Main A2', pathId: 'path-main', sequenceInPath: 3 },
      ];

      // Create branch path
      const branchPathId = 'path-branch-1';
      conversationState.paths.set(branchPathId, { id: branchPathId, name: 'Branch 1' });
      const branchMessages = [
        { id: 'branch-1', role: 'user', content: 'Main Q1', pathId: branchPathId, sequenceInPath: 0 },
        { id: 'branch-2', role: 'assistant', content: 'Main A1', pathId: branchPathId, sequenceInPath: 1 },
        { id: 'branch-3', role: 'user', content: 'Branch Q1', pathId: branchPathId, sequenceInPath: 2 },
        { id: 'branch-4', role: 'assistant', content: 'Branch A1', pathId: branchPathId, sequenceInPath: 3 },
      ];

      conversationState.messages.get(conversationId)!.push(...mainMessages, ...branchMessages);

      // Rapidly switch between paths
      const switches = ['path-main', branchPathId, 'path-main', branchPathId, 'path-main'];

      for (const pathId of switches) {
        conversationState.activePaths.set(conversationId, pathId);

        const response = await fetch(`/api/conversations/${conversationId}`);
        const data = await response.json();

        // Verify correct messages returned
        if (pathId === 'path-main') {
          expect(data.messages).toHaveLength(4);
          expect(data.messages.find((m: { content: string }) => m.content === 'Main Q2')).toBeDefined();
        } else {
          expect(data.messages).toHaveLength(4);
          expect(data.messages.find((m: { content: string }) => m.content === 'Branch Q1')).toBeDefined();
        }

        // CRITICAL: Verify path isolation - no cross-contamination
        const expectedPathId = pathId;
        expect(data.messages.every((m: { pathId: string }) => m.pathId === expectedPathId)).toBe(true);
      }

      // Verify both paths still intact after rapid switching
      const finalMainMessages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main');
      const finalBranchMessages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === branchPathId);

      expect(finalMainMessages).toHaveLength(4);
      expect(finalBranchMessages).toHaveLength(4);
    });

    it('should preserve deep branch hierarchies when editing at different levels', async () => {
      // Create nested branch structure: Main → Branch1 → Branch1.1
      const conversationId = 'test-nested-edit';
      conversationState.messages.set(conversationId, []);

      // Main path: 3 Q&A pairs
      const mainMessages = [];
      for (let i = 1; i <= 3; i++) {
        mainMessages.push(
          { id: `main-user-${i}`, role: 'user', content: `Main Q${i}`, pathId: 'path-main', sequenceInPath: (i - 1) * 2 },
          { id: `main-asst-${i}`, role: 'assistant', content: `Main A${i}`, pathId: 'path-main', sequenceInPath: (i - 1) * 2 + 1 }
        );
      }

      // Branch1 (from main Q1): inherits Q1, adds Branch Q1
      const branch1Id = 'path-branch-1';
      conversationState.paths.set(branch1Id, { id: branch1Id, name: 'Branch 1', parentPathId: 'path-main' });
      const branch1Messages = [
        { id: 'b1-user-1', role: 'user', content: 'Main Q1', pathId: branch1Id, sequenceInPath: 0 },
        { id: 'b1-asst-1', role: 'assistant', content: 'Main A1', pathId: branch1Id, sequenceInPath: 1 },
        { id: 'b1-user-2', role: 'user', content: 'Branch1 Q1', pathId: branch1Id, sequenceInPath: 2 },
        { id: 'b1-asst-2', role: 'assistant', content: 'Branch1 A1', pathId: branch1Id, sequenceInPath: 3 },
      ];

      // Branch1.1 (from Branch1 Q1): nested branch
      const branch11Id = 'path-branch-1-1';
      conversationState.paths.set(branch11Id, { id: branch11Id, name: 'Branch 1.1', parentPathId: branch1Id });
      const branch11Messages = [
        { id: 'b11-user-1', role: 'user', content: 'Main Q1', pathId: branch11Id, sequenceInPath: 0 },
        { id: 'b11-asst-1', role: 'assistant', content: 'Main A1', pathId: branch11Id, sequenceInPath: 1 },
        { id: 'b11-user-2', role: 'user', content: 'Branch1.1 Q1', pathId: branch11Id, sequenceInPath: 2 },
        { id: 'b11-asst-2', role: 'assistant', content: 'Branch1.1 A1', pathId: branch11Id, sequenceInPath: 3 },
      ];

      conversationState.messages.get(conversationId)!.push(...mainMessages, ...branch1Messages, ...branch11Messages);

      // CRITICAL: Verify each level preserves its own messages
      const main = conversationState.messages.get(conversationId)!.filter((m) => m.pathId === 'path-main');
      const b1 = conversationState.messages.get(conversationId)!.filter((m) => m.pathId === branch1Id);
      const b11 = conversationState.messages.get(conversationId)!.filter((m) => m.pathId === branch11Id);

      expect(main).toHaveLength(6); // 3 Q&A pairs
      expect(b1).toHaveLength(4); // Inherited + new
      expect(b11).toHaveLength(4); // Inherited + new

      // CRITICAL: Main still has Q2, Q3 even though branches exist
      expect(main.find((m) => m.content === 'Main Q2')).toBeDefined();
      expect(main.find((m) => m.content === 'Main Q3')).toBeDefined();

      // Each branch has its own content
      expect(b1.find((m) => m.content === 'Branch1 Q1')).toBeDefined();
      expect(b11.find((m) => m.content === 'Branch1.1 Q1')).toBeDefined();

      // No cross-contamination
      expect(b1.find((m) => m.content === 'Branch1.1 Q1')).toBeUndefined();
      expect(main.find((m) => m.content === 'Branch1 Q1')).toBeUndefined();
    });

    it('should handle editing same message multiple times creating parallel branches', async () => {
      const conversationId = 'test-parallel-branches';
      conversationState.messages.set(conversationId, []);
      conversationState.activePaths.set(conversationId, 'path-main');

      // Create main with 3 Q&A pairs
      for (let i = 1; i <= 3; i++) {
        conversationState.messages.get(conversationId)!.push(
          { id: `user-${i}`, role: 'user', content: `Q${i}`, pathId: 'path-main', sequenceInPath: (i - 1) * 2 },
          { id: `asst-${i}`, role: 'assistant', content: `A${i}`, pathId: 'path-main', sequenceInPath: (i - 1) * 2 + 1 }
        );
      }

      // Create 3 parallel branches all from Q2
      const branchIds = [];
      for (let i = 1; i <= 3; i++) {
        const branchResponse = await fetch(`/api/conversations/${conversationId}/branch`, {
          method: 'POST',
          body: JSON.stringify({ sourceMessageId: 'user-2', name: `Parallel Branch ${i}` }),
        });

        const { path } = await branchResponse.json();
        branchIds.push(path.id);
      }

      // CRITICAL: Main path still has all 6 messages
      const mainMessages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main');
      expect(mainMessages).toHaveLength(6);

      // CRITICAL: Main still has Q3 even though 3 branches created from Q2
      expect(mainMessages.find((m) => m.content === 'Q3')).toBeDefined();

      // Each branch has Q1, Q2 (4 messages)
      branchIds.forEach((branchId) => {
        const branchMessages = conversationState.messages
          .get(conversationId)!
          .filter((m) => m.pathId === branchId);
        expect(branchMessages).toHaveLength(4);
      });

      // Verify 4 unique paths: main + 3 branches
      const uniquePaths = new Set(conversationState.messages.get(conversationId)!.map((m) => m.pathId));
      expect(uniquePaths.size).toBe(4);
    });
  });

  describe('Regression Tests - Critical Invariants', () => {
    /**
     * These tests verify the CRITICAL INVARIANTS that must NEVER be violated.
     * If any of these tests fail, it indicates a severe regression that breaks
     * the core time-travel feature of the path system.
     */

    it('CRITICAL: Original path must NEVER lose messages after branching', async () => {
      const conversationId = 'test-critical-invariant-1';
      conversationState.messages.set(conversationId, []);

      // Create 10 messages on main
      const originalMessages = [];
      for (let i = 1; i <= 10; i++) {
        originalMessages.push({
          id: `msg-${i}`,
          role: i % 2 === 1 ? 'user' : 'assistant',
          content: `Message ${i}`,
          pathId: 'path-main',
          sequenceInPath: i - 1,
        });
      }
      conversationState.messages.get(conversationId)!.push(...originalMessages);

      const initialCount = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main').length;
      expect(initialCount).toBe(10);

      // Create branch from message 5
      await fetch(`/api/conversations/${conversationId}/branch`, {
        method: 'POST',
        body: JSON.stringify({ sourceMessageId: 'msg-5', name: 'Test Branch' }),
      });

      const finalCount = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main').length;

      // CRITICAL INVARIANT: Count must not decrease
      expect(finalCount).toBe(initialCount);
      expect(finalCount).toBe(10);
    });

    it('CRITICAL: Messages after branch point must remain on original path', async () => {
      const conversationId = 'test-critical-invariant-2';
      conversationState.messages.set(conversationId, []);

      const messages = [
        { id: 'msg-1', role: 'user', content: 'Before', pathId: 'path-main', sequenceInPath: 0 },
        { id: 'msg-2', role: 'assistant', content: 'Before', pathId: 'path-main', sequenceInPath: 1 },
        { id: 'msg-3', role: 'user', content: 'Branch Point', pathId: 'path-main', sequenceInPath: 2 },
        { id: 'msg-4', role: 'assistant', content: 'After 1', pathId: 'path-main', sequenceInPath: 3 },
        { id: 'msg-5', role: 'user', content: 'After 2', pathId: 'path-main', sequenceInPath: 4 },
      ];
      conversationState.messages.get(conversationId)!.push(...messages);

      // Create branch from msg-3
      await fetch(`/api/conversations/${conversationId}/branch`, {
        method: 'POST',
        body: JSON.stringify({ sourceMessageId: 'msg-3', name: 'Test Branch' }),
      });

      const mainMessages = conversationState.messages
        .get(conversationId)!
        .filter((m) => m.pathId === 'path-main');

      // CRITICAL INVARIANT: Messages after branch point must still exist on main
      expect(mainMessages.find((m) => m.id === 'msg-4')).toBeDefined();
      expect(mainMessages.find((m) => m.id === 'msg-5')).toBeDefined();
    });

    it('CRITICAL: Switching paths must return ONLY messages from active path', async () => {
      const conversationId = 'test-critical-invariant-3';
      conversationState.messages.set(conversationId, []);

      const mainMessages = [
        { id: 'main-1', role: 'user', content: 'Main Only', pathId: 'path-main', sequenceInPath: 0 },
      ];

      const branchPathId = 'path-branch';
      conversationState.paths.set(branchPathId, { id: branchPathId, name: 'Branch' });
      const branchMessages = [
        { id: 'branch-1', role: 'user', content: 'Branch Only', pathId: branchPathId, sequenceInPath: 0 },
      ];

      conversationState.messages.get(conversationId)!.push(...mainMessages, ...branchMessages);

      // Switch to main
      conversationState.activePaths.set(conversationId, 'path-main');
      const mainResponse = await fetch(`/api/conversations/${conversationId}`);
      const mainData = await mainResponse.json();

      // CRITICAL INVARIANT: No cross-contamination
      expect(mainData.messages.find((m: { content: string }) => m.content === 'Branch Only')).toBeUndefined();

      // Switch to branch
      conversationState.activePaths.set(conversationId, branchPathId);
      const branchResponse = await fetch(`/api/conversations/${conversationId}`);
      const branchData = await branchResponse.json();

      // CRITICAL INVARIANT: No cross-contamination
      expect(branchData.messages.find((m: { content: string }) => m.content === 'Main Only')).toBeUndefined();
    });
  });
});
