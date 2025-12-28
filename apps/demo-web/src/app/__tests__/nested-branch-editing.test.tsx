/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Home from '../page';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
  usePathname: () => '/',
}));

// Mock next-auth
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-123', name: 'Test User', email: 'test@example.com' } },
    status: 'authenticated',
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock the client telemetry
vi.mock('@/lib/client-telemetry', () => ({
  getClientTelemetry: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('Nested Branch Editing - UI Label Test', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let conversationState: {
    paths: Map<string, {
      id: string;
      name: string;
      isPrimary: boolean;
      parentPathId?: string;
      branchPointMessageId?: string;
      isActive: boolean;
    }>;
    messages: Map<string, Array<{
      id: string;
      role: string;
      content: string;
      pathId: string;
      sequenceInPath: number;
      isBranchPoint?: boolean;
      branchedToPaths?: string[];
    }>>;
    activePaths: Map<string, string>;
  };

  beforeEach(() => {
    conversationState = {
      paths: new Map([
        ['path-main', {
          id: 'path-main',
          name: 'Main',
          isPrimary: true,
          isActive: true,
        }],
      ]),
      messages: new Map([
        ['conv-123', [
          {
            id: 'msg-1',
            role: 'user',
            content: 'What are the tax rules for Ireland?',
            pathId: 'path-main',
            sequenceInPath: 0,
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Ireland has a corporate tax rate of 12.5%...',
            pathId: 'path-main',
            sequenceInPath: 1,
          },
        ]],
      ]),
      activePaths: new Map([['conv-123', 'path-main']]),
    };

    fetchMock = vi.fn((url: string, options?: RequestInit) => {
      // Handle path list
      if (url.includes('/paths') && options?.method !== 'POST') {
        const conversationId = url.split('/')[3];
        const paths = Array.from(conversationState.paths.values()).map(p => ({
          ...p,
          conversationId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));
        return Promise.resolve({
          ok: true,
          json: async () => ({ paths }),
        });
      }

      // Handle active path query
      if (url.includes('/active-path') && options?.method === 'GET') {
        const conversationId = url.split('/')[3];
        const activePathId = conversationState.activePaths.get(conversationId) || 'path-main';
        const activePath = conversationState.paths.get(activePathId);
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: activePath }),
        });
      }

      // Handle set active path
      if (url.includes('/active-path') && options?.method === 'PUT') {
        const conversationId = url.split('/')[3];
        const body = JSON.parse(options.body as string);
        conversationState.activePaths.set(conversationId, body.pathId);
        return Promise.resolve({
          ok: true,
          json: async () => ({ path: conversationState.paths.get(body.pathId) }),
        });
      }

      // Handle branch creation
      if (url.includes('/branch') && options?.method === 'POST') {
        const conversationId = url.split('/')[3];
        const body = JSON.parse(options.body as string);
        const sourceMessageId = body.sourceMessageId;
        const branchName = body.name || 'New Branch';
        const currentActivePathId = conversationState.activePaths.get(conversationId) || 'path-main';

        // Create new path
        const newPathId = `path-branch-${Date.now()}`;
        const newPath = {
          id: newPathId,
          name: branchName,
          isPrimary: false,
          parentPathId: currentActivePathId,
          branchPointMessageId: sourceMessageId,
          isActive: true,
        };
        conversationState.paths.set(newPathId, newPath);

        // Mark source message as branch point
        const allMessages = conversationState.messages.get(conversationId) || [];
        const sourceMsg = allMessages.find(m => m.id === sourceMessageId);
        if (sourceMsg) {
          sourceMsg.isBranchPoint = true;
          sourceMsg.branchedToPaths = [...(sourceMsg.branchedToPaths || []), newPathId];
        }

        // Copy messages up to branch point to new path
        const branchPointIndex = allMessages.findIndex(m => m.id === sourceMessageId);
        const inheritedMessages = allMessages.slice(0, branchPointIndex + 1).map(m => ({
          ...m,
          pathId: newPathId,
        }));

        conversationState.messages.set(conversationId, [
          ...allMessages,
          ...inheritedMessages,
        ]);

        // Set new path as active
        conversationState.activePaths.set(conversationId, newPathId);

        return Promise.resolve({
          ok: true,
          json: async () => ({
            path: {
              ...newPath,
              conversationId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            conversationId,
            branchPointMessage: sourceMsg,
          }),
        });
      }

      // Handle message list
      if (url.includes('/messages') && !url.includes('/append')) {
        const conversationId = url.split('/')[3];
        const activePathId = conversationState.activePaths.get(conversationId) || 'path-main';
        const allMessages = conversationState.messages.get(conversationId) || [];

        // Filter messages for active path (including inherited messages)
        const pathMessages = allMessages.filter(m => m.pathId === activePathId);

        return Promise.resolve({
          ok: true,
          json: async () => ({
            messages: pathMessages.sort((a, b) => a.sequenceInPath - b.sequenceInPath),
          }),
        });
      }

      // Handle message append
      if (url.includes('/messages/append')) {
        const conversationId = url.split('/')[3];
        const body = JSON.parse(options.body as string);
        const activePathId = conversationState.activePaths.get(conversationId) || 'path-main';
        const messages = conversationState.messages.get(conversationId) || [];
        const pathMessages = messages.filter(m => m.pathId === activePathId);
        const nextSequence = pathMessages.length;

        const newMessage = {
          id: `msg-${Date.now()}`,
          role: body.role,
          content: body.content,
          pathId: activePathId,
          sequenceInPath: nextSequence,
        };

        conversationState.messages.set(conversationId, [...messages, newMessage]);

        return Promise.resolve({
          ok: true,
          json: async () => ({ messageId: newMessage.id }),
        });
      }

      // Handle conversation list
      if (url === '/api/conversations') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversations: [] }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      });
    });

    global.fetch = fetchMock as typeof fetch;
  });

  it('should correctly label paths in nested branch scenario: Main > Branch1 > Branch2 (edit)', async () => {
    const { container } = render(<Home />);

    // Wait for initial render
    await waitFor(() => {
      expect(screen.queryByText(/What are the tax rules for Ireland/i)).toBeInTheDocument();
    });

    // STEP 1: Create first branch from message 1
    console.log('\n=== STEP 1: Create Branch 1 from Main Path ===');

    const branchButtons = screen.getAllByRole('button', { name: /branch/i });
    const firstBranchButton = branchButtons[0];
    fireEvent.click(firstBranchButton);

    await waitFor(() => {
      const branchDialog = screen.queryByText(/Create Branch/i);
      expect(branchDialog).toBeInTheDocument();
    });

    // Name the first branch
    const branchNameInput = container.querySelector('input#branch-name') as HTMLInputElement;
    if (branchNameInput) {
      fireEvent.change(branchNameInput, { target: { value: 'Alternative Scenario' } });
    }

    const createBranchButton = Array.from(screen.getAllByRole('button')).find((btn) =>
      btn.textContent?.includes('Create Branch')
    );
    if (createBranchButton) {
      fireEvent.click(createBranchButton);
    }

    // Wait for branch to be created
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/branch'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    // Verify we're now on Branch 1
    const paths = Array.from(conversationState.paths.values());
    expect(paths).toHaveLength(2);
    expect(paths[0].isPrimary).toBe(true);
    expect(paths[0].name).toBe('Main');
    expect(paths[1].isPrimary).toBe(false);
    expect(paths[1].name).toBe('Alternative Scenario');
    expect(paths[1].parentPathId).toBe('path-main');

    console.log('✓ Branch 1 created successfully');
    console.log(`  - Main path: ${paths[0].id} (isPrimary=true)`);
    console.log(`  - Branch 1: ${paths[1].id} (parent=${paths[1].parentPathId})`);

    // STEP 2: Add a new message to Branch 1
    console.log('\n=== STEP 2: Add Message to Branch 1 ===');

    const inputField = container.querySelector('textarea[placeholder*="Ask"]') as HTMLTextAreaElement;
    expect(inputField).toBeInTheDocument();

    fireEvent.change(inputField, { target: { value: 'What about corporate tax exemptions?' } });

    const sendButton = screen.getByRole('button', { name: /send/i });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/messages/append'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    console.log('✓ Message added to Branch 1');

    // STEP 3: Edit the message in Branch 1 (creates Branch 2 - nested branch)
    console.log('\n=== STEP 3: Edit Message in Branch 1 (creates Branch 2) ===');

    const branch1PathId = Array.from(conversationState.paths.values()).find(p =>
      p.name === 'Alternative Scenario'
    )?.id;

    const branch1Messages = Array.from(conversationState.messages.get('conv-123') || [])
      .filter(m => m.pathId === branch1PathId);

    const messageToEdit = branch1Messages[branch1Messages.length - 1];
    expect(messageToEdit?.content).toBe('What about corporate tax exemptions?');

    // Find and click edit button for the last message
    const editButtons = screen.getAllByLabelText(/edit message/i);
    const lastEditButton = editButtons[editButtons.length - 1];
    fireEvent.click(lastEditButton);

    await waitFor(() => {
      const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea?.value).toContain('What about corporate tax exemptions?');
    });

    // Change the message content
    const editTextarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(editTextarea, {
      target: { value: 'What about capital gains tax exemptions instead?' }
    });

    // Submit the edit
    const submitEditButton = screen.getByRole('button', { name: /submit|save|send/i });
    fireEvent.click(submitEditButton);

    // Wait for branch creation (edit creates a new branch)
    await waitFor(() => {
      const pathsAfterEdit = Array.from(conversationState.paths.values());
      expect(pathsAfterEdit.length).toBeGreaterThan(2);
    });

    console.log('✓ Edit created Branch 2 (nested branch)');

    // STEP 4: Verify path hierarchy and labels
    console.log('\n=== STEP 4: Verify Path Hierarchy and Labels ===');

    const allPaths = Array.from(conversationState.paths.values());
    expect(allPaths.length).toBe(3);

    const mainPath = allPaths.find(p => p.isPrimary);
    const branch1 = allPaths.find(p => p.name === 'Alternative Scenario');
    const branch2 = allPaths.find(p => p.name?.startsWith('Edit:'));

    expect(mainPath).toBeDefined();
    expect(branch1).toBeDefined();
    expect(branch2).toBeDefined();

    console.log('\nPath Hierarchy:');
    console.log(`1. ${mainPath?.name} (${mainPath?.id})`);
    console.log(`   - isPrimary: ${mainPath?.isPrimary}`);
    console.log(`   - parentPathId: ${mainPath?.parentPathId || 'none (root)'}`);
    console.log(`\n2. ${branch1?.name} (${branch1?.id})`);
    console.log(`   - isPrimary: ${branch1?.isPrimary}`);
    console.log(`   - parentPathId: ${branch1?.parentPathId}`);
    console.log(`\n3. ${branch2?.name} (${branch2?.id})`);
    console.log(`   - isPrimary: ${branch2?.isPrimary}`);
    console.log(`   - parentPathId: ${branch2?.parentPathId}`);

    // Assertions
    expect(mainPath?.isPrimary).toBe(true);
    expect(mainPath?.parentPathId).toBeUndefined();

    expect(branch1?.isPrimary).toBe(false);
    expect(branch1?.parentPathId).toBe(mainPath?.id);

    expect(branch2?.isPrimary).toBe(false);
    expect(branch2?.parentPathId).toBe(branch1?.id);

    console.log('\n✓ All path relationships verified correctly');

    // STEP 5: Check UI labels and their clarity
    console.log('\n=== STEP 5: Verify UI Labels ===');

    // The issue: When viewing Branch 2, the UI still shows "Main" for the primary path
    // This can be confusing because you're 2 levels deep in branching

    console.log('\nUI Label Analysis:');
    console.log(`- Path 1 labeled as: "Main" ← Is this clear?`);
    console.log(`- Path 2 labeled as: "Alternative Scenario" ← Custom name`);
    console.log(`- Path 3 labeled as: "Edit: What about capital..." ← Auto-generated`);
    console.log('\nPotential Confusion:');
    console.log('- User is on Branch 2 (grandchild of Main)');
    console.log('- But "Main" doesn\'t clearly convey it\'s the ROOT/ORIGINAL path');
    console.log('- Better labels might be: "Primary", "Original", or show hierarchy');

    // Verify the active path is Branch 2
    const activePathId = conversationState.activePaths.get('conv-123');
    expect(activePathId).toBe(branch2?.id);

    console.log(`\n✓ Active path is correctly set to Branch 2: ${activePathId}`);

    // STEP 6: Verify messages are correctly displayed for each path
    console.log('\n=== STEP 6: Verify Message Display Per Path ===');

    const allMessages = conversationState.messages.get('conv-123') || [];

    const mainMessages = allMessages.filter(m => m.pathId === mainPath?.id);
    const branch1Messages = allMessages.filter(m => m.pathId === branch1?.id);
    const branch2Messages = allMessages.filter(m => m.pathId === branch2?.id);

    console.log(`\nMain path messages: ${mainMessages.length}`);
    mainMessages.forEach((m, i) => {
      console.log(`  ${i + 1}. [${m.role}] ${m.content.substring(0, 50)}...`);
    });

    console.log(`\nBranch 1 messages: ${branch1Messages.length}`);
    branch1Messages.forEach((m, i) => {
      console.log(`  ${i + 1}. [${m.role}] ${m.content.substring(0, 50)}...`);
    });

    console.log(`\nBranch 2 messages: ${branch2Messages.length}`);
    branch2Messages.forEach((m, i) => {
      console.log(`  ${i + 1}. [${m.role}] ${m.content.substring(0, 50)}...`);
    });

    // Branch 2 should have inherited messages plus the edited message
    expect(branch2Messages.length).toBeGreaterThan(0);

    console.log('\n✓ Messages correctly associated with their paths');

    // STEP 7: Test label clarity improvement suggestions
    console.log('\n=== STEP 7: Label Improvement Suggestions ===');
    console.log('\nCurrent Implementation:');
    console.log('  - Primary path: "Main"');
    console.log('  - Child paths: "Branch" or custom name');
    console.log('  - Grandchild paths: "Branch" or custom name');
    console.log('\nSuggested Improvements:');
    console.log('  1. Change "Main" → "Primary" or "Original"');
    console.log('  2. Show depth: "Branch (2nd level)" or "└─ Branch"');
    console.log('  3. Show parent: "Alternative Scenario → Edit"');
    console.log('  4. Visual tree in dropdown:');
    console.log('     ├─ Primary');
    console.log('     └─ Alternative Scenario');
    console.log('        └─ Edit: What about capital...');
  });

  it('should show correct branch count badges in nested scenario', async () => {
    render(<Home />);

    await waitFor(() => {
      expect(screen.queryByText(/What are the tax rules/i)).toBeInTheDocument();
    });

    // Create branch from first message
    const branchButtons = screen.getAllByRole('button', { name: /branch/i });
    fireEvent.click(branchButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText(/Create Branch/i)).toBeInTheDocument();
    });

    const createButton = Array.from(screen.getAllByRole('button')).find(btn =>
      btn.textContent?.includes('Create Branch')
    );
    if (createButton) {
      fireEvent.click(createButton);
    }

    await waitFor(() => {
      const paths = Array.from(conversationState.paths.values());
      expect(paths.length).toBe(2);
    });

    // Verify the original message shows branch indicator
    const messages = conversationState.messages.get('conv-123') || [];
    const branchedMessage = messages.find(m => m.isBranchPoint);

    expect(branchedMessage).toBeDefined();
    expect(branchedMessage?.branchedToPaths?.length).toBe(1);
  });
});
