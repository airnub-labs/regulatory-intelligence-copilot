/**
 * Tests for BranchDialog component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BranchDialog } from '../BranchDialog';
import type { ClientPath } from '../../types';

// Mock the useConversationPaths hook
vi.mock('../../hooks/useConversationPaths.js', () => ({
  useConversationPaths: vi.fn(),
}));

import { useConversationPaths } from '../../hooks/useConversationPaths.js';

const mockUseConversationPaths = vi.mocked(useConversationPaths);

describe('BranchDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnBranchCreated = vi.fn();
  const mockCreateBranch = vi.fn();

  const createdPath: ClientPath = {
    id: 'path-new',
    conversationId: 'conv-1',
    parentPathId: 'path-primary',
    branchPointMessageId: 'msg-123',
    name: 'New Branch',
    isPrimary: false,
    isActive: true,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  };

  beforeEach(() => {
    mockOnOpenChange.mockClear();
    mockOnBranchCreated.mockClear();
    mockCreateBranch.mockClear();
    mockCreateBranch.mockResolvedValue(createdPath);

    mockUseConversationPaths.mockReturnValue({
      paths: [],
      activePath: null,
      messages: [],
      isLoading: false,
      isLoadingMessages: false,
      isBranching: false,
      isMerging: false,
      error: null,
      conversationId: 'conv-1',
      switchPath: vi.fn(),
      refreshPaths: vi.fn(),
      createBranch: mockCreateBranch,
      mergePath: vi.fn(),
      previewMerge: vi.fn(),
      updatePath: vi.fn(),
      deletePath: vi.fn(),
    });
  });

  describe('Rendering', () => {
    it('should render when open is true', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      // Check for dialog description text which is unique
      expect(screen.getByText(/Create a new conversation branch/)).toBeInTheDocument();
    });

    it('should not render when open is false', () => {
      render(
        <BranchDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.queryByText(/Create a new conversation branch/)).not.toBeInTheDocument();
    });

    it('should render dialog title with GitBranch icon', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      // Find the heading element (dialog title)
      const title = screen.getByRole('heading', { name: /Create Branch/i });
      expect(title).toBeInTheDocument();
      // Check that a GitBranch icon SVG is present
      expect(title.parentElement?.querySelector('svg') || title.querySelector('svg')).toBeTruthy();
    });

    it('should render dialog description', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.getByText(/Create a new conversation branch/)).toBeInTheDocument();
    });

    it('should render message preview when provided', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
          messagePreview="What are the tax rules for Ireland?"
        />
      );

      expect(screen.getByText('Branching from:')).toBeInTheDocument();
      expect(screen.getByText('What are the tax rules for Ireland?')).toBeInTheDocument();
    });

    it('should truncate long message previews', () => {
      const longMessage = 'A'.repeat(200);
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
          messagePreview={longMessage}
        />
      );

      // The truncate function should limit to 150 characters
      const previewText = screen.getByText(/^A+/);
      expect(previewText.textContent!.length).toBeLessThan(200);
    });

    it('should not render message preview section when not provided', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.queryByText('Branching from:')).not.toBeInTheDocument();
    });
  });

  describe('Form Fields', () => {
    it('should render branch name input', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.getByLabelText(/Branch name/)).toBeInTheDocument();
    });

    it('should render description textarea', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    });

    it('should show optional hints for both fields', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      const optionalHints = screen.getAllByText('(optional)');
      expect(optionalHints.length).toBe(2);
    });

    it('should allow typing in name input', async () => {
      const user = userEvent.setup();

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      const nameInput = screen.getByLabelText(/Branch name/);
      await user.type(nameInput, 'PRSI Deep Dive');

      expect(nameInput).toHaveValue('PRSI Deep Dive');
    });

    it('should allow typing in description textarea', async () => {
      const user = userEvent.setup();

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      const descriptionInput = screen.getByLabelText(/Description/);
      await user.type(descriptionInput, 'Exploring PRSI obligations');

      expect(descriptionInput).toHaveValue('Exploring PRSI obligations');
    });
  });

  describe('Buttons', () => {
    it('should render Cancel and Create Branch buttons', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create Branch/i })).toBeInTheDocument();
    });

    it('should render close button (X)', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.getByRole('button', { name: /Close/i })).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should call createBranch with messageId when form is submitted', async () => {
      const user = userEvent.setup();

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
          onBranchCreated={mockOnBranchCreated}
        />
      );

      const submitButton = screen.getByRole('button', { name: /Create Branch/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateBranch).toHaveBeenCalledWith('msg-123', undefined, undefined);
      });
    });

    it('should call createBranch with name and description when provided', async () => {
      const user = userEvent.setup();

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
          onBranchCreated={mockOnBranchCreated}
        />
      );

      const nameInput = screen.getByLabelText(/Branch name/);
      const descriptionInput = screen.getByLabelText(/Description/);

      await user.type(nameInput, 'PRSI Branch');
      await user.type(descriptionInput, 'Exploring PRSI');

      const submitButton = screen.getByRole('button', { name: /Create Branch/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateBranch).toHaveBeenCalledWith('msg-123', 'PRSI Branch', 'Exploring PRSI');
      });
    });

    it('should call onBranchCreated callback after successful creation', async () => {
      const user = userEvent.setup();

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
          onBranchCreated={mockOnBranchCreated}
        />
      );

      const submitButton = screen.getByRole('button', { name: /Create Branch/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnBranchCreated).toHaveBeenCalledWith(createdPath);
      });
    });

    it('should close dialog after successful creation', async () => {
      const user = userEvent.setup();

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
          onBranchCreated={mockOnBranchCreated}
        />
      );

      const submitButton = screen.getByRole('button', { name: /Create Branch/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('should trim whitespace from name and description', async () => {
      const user = userEvent.setup();

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
          onBranchCreated={mockOnBranchCreated}
        />
      );

      const nameInput = screen.getByLabelText(/Branch name/);
      const descriptionInput = screen.getByLabelText(/Description/);

      await user.type(nameInput, '  PRSI Branch  ');
      await user.type(descriptionInput, '  Exploring PRSI  ');

      const submitButton = screen.getByRole('button', { name: /Create Branch/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateBranch).toHaveBeenCalledWith('msg-123', 'PRSI Branch', 'Exploring PRSI');
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when createBranch fails', async () => {
      const user = userEvent.setup();
      mockCreateBranch.mockRejectedValue(new Error('Failed to create branch'));

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      const submitButton = screen.getByRole('button', { name: /Create Branch/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to create branch')).toBeInTheDocument();
      });
    });

    it('should display generic error for non-Error exceptions', async () => {
      const user = userEvent.setup();
      mockCreateBranch.mockRejectedValue('Unknown error');

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      const submitButton = screen.getByRole('button', { name: /Create Branch/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to create branch')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading state while branching', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [],
        activePath: null,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: true,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: vi.fn(),
        refreshPaths: vi.fn(),
        createBranch: mockCreateBranch,
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.getByText('Creating...')).toBeInTheDocument();
    });

    it('should disable inputs while branching', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [],
        activePath: null,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: true,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: vi.fn(),
        refreshPaths: vi.fn(),
        createBranch: mockCreateBranch,
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.getByLabelText(/Branch name/)).toBeDisabled();
      expect(screen.getByLabelText(/Description/)).toBeDisabled();
    });

    it('should disable all buttons while branching', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [],
        activePath: null,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: true,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: vi.fn(),
        refreshPaths: vi.fn(),
        createBranch: mockCreateBranch,
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Creating.../i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Close/i })).toBeDisabled();
    });
  });

  describe('Dialog Close', () => {
    it('should call onOpenChange(false) when Cancel is clicked', async () => {
      const user = userEvent.setup();

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should call onOpenChange(false) when X button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      const closeButton = screen.getByRole('button', { name: /Close/i });
      await user.click(closeButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should reset form when dialog is closed', async () => {
      const user = userEvent.setup();
      let open = true;
      const onOpenChange = (newOpen: boolean) => {
        open = newOpen;
        mockOnOpenChange(newOpen);
      };

      const { rerender } = render(
        <BranchDialog
          open={open}
          onOpenChange={onOpenChange}
          messageId="msg-123"
        />
      );

      // Type something
      const nameInput = screen.getByLabelText(/Branch name/);
      await user.type(nameInput, 'Test Branch');
      expect(nameInput).toHaveValue('Test Branch');

      // Close the dialog
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      // Reopen the dialog
      open = true;
      rerender(
        <BranchDialog
          open={open}
          onOpenChange={onOpenChange}
          messageId="msg-123"
        />
      );

      // Form should be reset
      const newNameInput = screen.getByLabelText(/Branch name/);
      expect(newNameInput).toHaveValue('');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible form labels', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.getByLabelText(/Branch name/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Description/)).toBeInTheDocument();
    });

    it('should have sr-only text for close button', () => {
      render(
        <BranchDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          messageId="msg-123"
        />
      );

      expect(screen.getByText('Close')).toHaveClass('sr-only');
    });
  });
});
