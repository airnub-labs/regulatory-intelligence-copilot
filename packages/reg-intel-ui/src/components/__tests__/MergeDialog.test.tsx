/**
 * Tests for MergeDialog component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MergeDialog } from '../MergeDialog';
import type { ClientPath, MergePreview, MergeResult } from '../../types';

// Mock the useConversationPaths hook
vi.mock('../../hooks/useConversationPaths.js', () => ({
  useConversationPaths: vi.fn(),
}));

import { useConversationPaths } from '../../hooks/useConversationPaths.js';

const mockUseConversationPaths = vi.mocked(useConversationPaths);

describe('MergeDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnMergeComplete = vi.fn();
  const mockMergePath = vi.fn();
  const mockPreviewMerge = vi.fn();

  const primaryPath: ClientPath = {
    id: 'path-primary',
    conversationId: 'conv-1',
    parentPathId: null,
    branchPointMessageId: null,
    name: null,
    isPrimary: true,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const sourcePath: ClientPath = {
    id: 'path-source',
    conversationId: 'conv-1',
    parentPathId: 'path-primary',
    branchPointMessageId: 'msg-1',
    name: 'Feature Branch',
    isPrimary: false,
    isActive: true,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  };

  const anotherBranch: ClientPath = {
    id: 'path-another',
    conversationId: 'conv-1',
    parentPathId: 'path-primary',
    branchPointMessageId: 'msg-2',
    name: 'Another Branch',
    isPrimary: false,
    isActive: true,
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
  };

  const mockPreview: MergePreview = {
    messagesToMerge: [],
    generatedSummary: 'This is a generated summary of the branch content.',
    targetPath: primaryPath,
    sourcePath: sourcePath,
    estimatedMessageCount: 5,
  };

  const mockMergeResult: MergeResult = {
    success: true,
    targetPath: primaryPath,
    sourcePath: sourcePath,
    mergedMessageIds: ['msg-1', 'msg-2'],
  };

  beforeEach(() => {
    mockOnOpenChange.mockClear();
    mockOnMergeComplete.mockClear();
    mockMergePath.mockClear();
    mockPreviewMerge.mockClear();
    mockMergePath.mockResolvedValue(mockMergeResult);
    mockPreviewMerge.mockResolvedValue(mockPreview);

    mockUseConversationPaths.mockReturnValue({
      paths: [primaryPath, sourcePath, anotherBranch],
      activePath: primaryPath,
      messages: [],
      isLoading: false,
      isLoadingMessages: false,
      isBranching: false,
      isMerging: false,
      error: null,
      conversationId: 'conv-1',
      switchPath: vi.fn(),
      refreshPaths: vi.fn(),
      createBranch: vi.fn(),
      mergePath: mockMergePath,
      previewMerge: mockPreviewMerge,
      updatePath: vi.fn(),
      deletePath: vi.fn(),
    });
  });

  describe('Rendering', () => {
    it('should render when open is true', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByText('Merge Branch')).toBeInTheDocument();
    });

    it('should not render when open is false', () => {
      render(
        <MergeDialog
          open={false}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.queryByText('Merge Branch')).not.toBeInTheDocument();
    });

    it('should render dialog description with source path name', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByText(/Feature Branch/)).toBeInTheDocument();
    });

    it('should handle unnamed source path', () => {
      const unnamedPath: ClientPath = { ...sourcePath, name: null };

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={unnamedPath}
        />
      );

      expect(screen.getByText(/Unnamed Branch/)).toBeInTheDocument();
    });
  });

  describe('Target Path Selection', () => {
    it('should render target path dropdown', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByText('Merge into')).toBeInTheDocument();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should show available target paths (excluding source)', async () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      // Should have options for primary and another branch (not the source)
      await waitFor(() => {
        expect(screen.getByText('Main (primary)')).toBeInTheDocument();
        expect(screen.getByText('Another Branch')).toBeInTheDocument();
      });
    });

    it('should pre-select primary path by default', async () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      await waitFor(() => {
        const select = screen.getByRole('combobox') as HTMLSelectElement;
        expect(select.value).toBe('path-primary');
      });
    });
  });

  describe('Merge Mode Selection', () => {
    it('should render all merge mode options', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByText('Summary')).toBeInTheDocument();
      expect(screen.getByText('Full merge')).toBeInTheDocument();
      expect(screen.getByText('Selective')).toBeInTheDocument();
    });

    it('should show merge mode descriptions', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByText('AI summarizes key findings into a single message')).toBeInTheDocument();
      expect(screen.getByText('All messages from branch added to main')).toBeInTheDocument();
      expect(screen.getByText('Choose specific messages to include')).toBeInTheDocument();
    });

    it('should have summary mode selected by default', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      // Find the radio input by its value
      const radios = screen.getAllByRole('radio');
      const summaryRadio = radios.find(r => (r as HTMLInputElement).value === 'summary');
      expect(summaryRadio).toBeChecked();
    });

    it('should allow changing merge mode', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      // Find the radio input by its value
      const radios = screen.getAllByRole('radio');
      const fullMergeRadio = radios.find(r => (r as HTMLInputElement).value === 'full');
      await user.click(fullMergeRadio!);

      expect(fullMergeRadio).toBeChecked();
    });
  });

  describe('Summary Prompt', () => {
    it('should show summary prompt input when summary mode is selected', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByLabelText(/Summarization instructions/)).toBeInTheDocument();
    });

    it('should hide summary prompt when full merge mode is selected', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      const radios = screen.getAllByRole('radio');
      const fullMergeRadio = radios.find(r => (r as HTMLInputElement).value === 'full');
      await user.click(fullMergeRadio!);

      expect(screen.queryByLabelText(/Summarization instructions/)).not.toBeInTheDocument();
    });

    it('should allow typing summary instructions', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      const promptInput = screen.getByLabelText(/Summarization instructions/);
      await user.type(promptInput, 'Focus on regulatory requirements');

      expect(promptInput).toHaveValue('Focus on regulatory requirements');
    });
  });

  describe('Preview Loading', () => {
    it('should load preview when dialog opens', async () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      await waitFor(() => {
        expect(mockPreviewMerge).toHaveBeenCalled();
      });
    });

    it('should display preview when loaded', async () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeInTheDocument();
        expect(screen.getByText('5 messages will be merged')).toBeInTheDocument();
      });
    });

    it('should display generated summary in preview', async () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Generated summary:')).toBeInTheDocument();
        expect(screen.getByText('This is a generated summary of the branch content.')).toBeInTheDocument();
      });
    });

    it('should reload preview when merge mode changes', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      await waitFor(() => {
        expect(mockPreviewMerge).toHaveBeenCalledTimes(1);
      });

      const radios = screen.getAllByRole('radio');
      const fullMergeRadio = radios.find(r => (r as HTMLInputElement).value === 'full');
      await user.click(fullMergeRadio!);

      await waitFor(() => {
        expect(mockPreviewMerge).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Archive Option', () => {
    it('should render archive checkbox', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByText('Archive branch after merge')).toBeInTheDocument();
    });

    it('should have archive checked by default', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();
    });

    it('should allow unchecking archive option', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      const checkbox = screen.getByRole('checkbox');
      await user.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });
  });

  describe('Form Submission', () => {
    it('should call mergePath when form is submitted', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
          onMergeComplete={mockOnMergeComplete}
        />
      );

      // Wait for preview to load
      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /^Merge$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockMergePath).toHaveBeenCalledWith('path-source', {
          targetPathId: 'path-primary',
          mergeMode: 'summary',
          archiveSource: true,
          summaryPrompt: undefined,
        });
      });
    });

    it('should include summary prompt when provided', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
          onMergeComplete={mockOnMergeComplete}
        />
      );

      // Wait for preview to load
      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeInTheDocument();
      });

      const promptInput = screen.getByLabelText(/Summarization instructions/);
      await user.type(promptInput, 'Focus on PRSI rules');

      const submitButton = screen.getByRole('button', { name: /^Merge$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockMergePath).toHaveBeenCalledWith('path-source', expect.objectContaining({
          summaryPrompt: 'Focus on PRSI rules',
        }));
      });
    });

    it('should call onMergeComplete callback after successful merge', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
          onMergeComplete={mockOnMergeComplete}
        />
      );

      // Wait for preview to load
      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /^Merge$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnMergeComplete).toHaveBeenCalledWith(mockMergeResult);
      });
    });

    it('should close dialog after successful merge', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
          onMergeComplete={mockOnMergeComplete}
        />
      );

      // Wait for preview to load
      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /^Merge$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should disable submit button when no target paths available', () => {
      // Mock with no available target paths (only source path)
      mockUseConversationPaths.mockReturnValue({
        paths: [sourcePath], // Only source, no valid targets
        activePath: sourcePath,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: vi.fn(),
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: mockMergePath,
        previewMerge: mockPreviewMerge,
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      // Submit button should be disabled because no target path is selected
      const submitButton = screen.getByRole('button', { name: /^Merge$/i });
      expect(submitButton).toBeDisabled();
    });

    it('should display error when merge fails', async () => {
      const user = userEvent.setup();
      mockMergePath.mockRejectedValue(new Error('Merge conflict detected'));

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      // Wait for preview to load
      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeInTheDocument();
      });

      const submitButton = screen.getByRole('button', { name: /^Merge$/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Merge conflict detected')).toBeInTheDocument();
      });
    });

    it('should display error when preview fails', async () => {
      mockPreviewMerge.mockRejectedValue(new Error('Failed to generate preview'));

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to generate preview')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading state while merging', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [primaryPath, sourcePath],
        activePath: primaryPath,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: true,
        error: null,
        conversationId: 'conv-1',
        switchPath: vi.fn(),
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: mockMergePath,
        previewMerge: mockPreviewMerge,
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByText('Merging...')).toBeInTheDocument();
    });

    it('should disable all inputs while merging', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [primaryPath, sourcePath],
        activePath: primaryPath,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: true,
        error: null,
        conversationId: 'conv-1',
        switchPath: vi.fn(),
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: mockMergePath,
        previewMerge: mockPreviewMerge,
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByRole('combobox')).toBeDisabled();
      expect(screen.getByRole('checkbox')).toBeDisabled();
      // Radio buttons should also be disabled
      const radios = screen.getAllByRole('radio');
      radios.forEach((radio) => {
        expect(radio).toBeDisabled();
      });
    });

    it('should disable buttons while merging', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [primaryPath, sourcePath],
        activePath: primaryPath,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: true,
        error: null,
        conversationId: 'conv-1',
        switchPath: vi.fn(),
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: mockMergePath,
        previewMerge: mockPreviewMerge,
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByRole('button', { name: /Cancel/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Merging.../i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Close/i })).toBeDisabled();
    });
  });

  describe('Dialog Close', () => {
    it('should call onOpenChange(false) when Cancel is clicked', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should call onOpenChange(false) when X button is clicked', async () => {
      const user = userEvent.setup();

      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      const closeButton = screen.getByRole('button', { name: /Close/i });
      await user.click(closeButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('should reset form when dialog is closed and reopened', async () => {
      const user = userEvent.setup();
      let open = true;

      const { rerender } = render(
        <MergeDialog
          open={open}
          onOpenChange={(newOpen) => {
            open = newOpen;
            mockOnOpenChange(newOpen);
          }}
          sourcePath={sourcePath}
        />
      );

      // Wait for preview
      await waitFor(() => {
        expect(screen.getByText('Preview')).toBeInTheDocument();
      });

      // Change merge mode
      let radios = screen.getAllByRole('radio');
      const fullMergeRadio = radios.find(r => (r as HTMLInputElement).value === 'full');
      await user.click(fullMergeRadio!);
      expect(fullMergeRadio).toBeChecked();

      // Close dialog
      const cancelButton = screen.getByRole('button', { name: /Cancel/i });
      await user.click(cancelButton);

      // Reopen dialog
      open = true;
      rerender(
        <MergeDialog
          open={open}
          onOpenChange={(newOpen) => {
            open = newOpen;
            mockOnOpenChange(newOpen);
          }}
          sourcePath={sourcePath}
        />
      );

      // Should be reset to summary mode
      radios = screen.getAllByRole('radio');
      const summaryRadio = radios.find(r => (r as HTMLInputElement).value === 'summary');
      expect(summaryRadio).toBeChecked();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible form labels', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByText('Merge into')).toBeInTheDocument();
      expect(screen.getByText('Merge mode')).toBeInTheDocument();
    });

    it('should have sr-only text for close button', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      expect(screen.getByText('Close')).toHaveClass('sr-only');
    });

    it('should have accessible radio group', () => {
      render(
        <MergeDialog
          open={true}
          onOpenChange={mockOnOpenChange}
          sourcePath={sourcePath}
        />
      );

      const radios = screen.getAllByRole('radio');
      expect(radios.length).toBe(3);
    });
  });
});
