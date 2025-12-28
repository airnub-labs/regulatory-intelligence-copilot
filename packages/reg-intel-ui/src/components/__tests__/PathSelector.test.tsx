/**
 * Tests for PathSelector component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PathSelector } from '../PathSelector';
import type { ClientPath } from '../../types';

// Mock the useConversationPaths hook
vi.mock('../../hooks/useConversationPaths.js', () => ({
  useConversationPaths: vi.fn(),
}));

import { useConversationPaths } from '../../hooks/useConversationPaths.js';

const mockUseConversationPaths = vi.mocked(useConversationPaths);

describe('PathSelector', () => {
  const mockSwitchPath = vi.fn();
  const mockOnRename = vi.fn();
  const mockOnMerge = vi.fn();
  const mockOnDelete = vi.fn();

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

  const branchPath: ClientPath = {
    id: 'path-branch',
    conversationId: 'conv-1',
    parentPathId: 'path-primary',
    branchPointMessageId: 'msg-1',
    name: 'Alternative Scenario',
    isPrimary: false,
    isActive: true,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  };

  const mergedPath: ClientPath = {
    id: 'path-merged',
    conversationId: 'conv-1',
    parentPathId: 'path-primary',
    branchPointMessageId: 'msg-2',
    name: 'Merged Branch',
    isPrimary: false,
    isActive: true,
    isMerged: true,
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
  };

  const archivedPath: ClientPath = {
    id: 'path-archived',
    conversationId: 'conv-1',
    parentPathId: 'path-primary',
    branchPointMessageId: 'msg-3',
    name: 'Archived Branch',
    isPrimary: false,
    isActive: false,
    createdAt: new Date('2024-01-04'),
    updatedAt: new Date('2024-01-04'),
  };

  beforeEach(() => {
    mockSwitchPath.mockClear();
    mockOnRename.mockClear();
    mockOnMerge.mockClear();
    mockOnDelete.mockClear();

    // Default mock implementation
    mockUseConversationPaths.mockReturnValue({
      paths: [primaryPath, branchPath],
      activePath: primaryPath,
      messages: [],
      isLoading: false,
      isLoadingMessages: false,
      isBranching: false,
      isMerging: false,
      error: null,
      conversationId: 'conv-1',
      switchPath: mockSwitchPath,
      refreshPaths: vi.fn(),
      createBranch: vi.fn(),
      mergePath: vi.fn(),
      previewMerge: vi.fn(),
      updatePath: vi.fn(),
      deletePath: vi.fn(),
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator when isLoading is true', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [],
        activePath: null,
        messages: [],
        isLoading: true,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: mockSwitchPath,
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(<PathSelector />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should have animate-pulse class when loading', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [],
        activePath: null,
        messages: [],
        isLoading: true,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: mockSwitchPath,
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      const { container } = render(<PathSelector />);

      expect(container.firstChild).toHaveClass('animate-pulse');
    });
  });

  describe('Empty State', () => {
    it('should return null when no active path', () => {
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
        switchPath: mockSwitchPath,
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      const { container } = render(<PathSelector />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Rendering', () => {
    it('should render trigger button with active path name', () => {
      render(<PathSelector />);

      expect(screen.getByText('Main')).toBeInTheDocument();
    });

    it('should show custom path name if provided', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [primaryPath, branchPath],
        activePath: branchPath,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: mockSwitchPath,
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(<PathSelector />);

      expect(screen.getByText('Alternative Scenario')).toBeInTheDocument();
    });

    it('should show branch count badge when showBranchCount is true and multiple paths exist', () => {
      render(<PathSelector showBranchCount />);

      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('should hide branch count badge when only one path exists', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [primaryPath],
        activePath: primaryPath,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: mockSwitchPath,
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(<PathSelector showBranchCount />);

      expect(screen.queryByText('1')).not.toBeInTheDocument();
    });

    it('should hide branch count badge when showBranchCount is false', () => {
      render(<PathSelector showBranchCount={false} />);

      expect(screen.queryByText('2')).not.toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<PathSelector className="custom-class" />);

      // The trigger button should have the custom class
      const trigger = container.querySelector('button');
      expect(trigger).toHaveClass('custom-class');
    });
  });

  describe('Variants', () => {
    it('should render with default variant styles', () => {
      const { container } = render(<PathSelector variant="default" />);

      const trigger = container.querySelector('button');
      expect(trigger).toHaveClass('border', 'border-input', 'bg-background');
    });

    it('should render with minimal variant styles', () => {
      const { container } = render(<PathSelector variant="minimal" />);

      const trigger = container.querySelector('button');
      expect(trigger).toHaveClass('border-0', 'bg-transparent');
    });

    it('should render with compact variant styles', () => {
      const { container } = render(<PathSelector variant="compact" />);

      const trigger = container.querySelector('button');
      expect(trigger).toHaveClass('text-sm');
    });
  });

  describe('Disabled State', () => {
    it('should disable trigger when disabled prop is true', () => {
      const { container } = render(<PathSelector disabled />);

      const trigger = container.querySelector('button');
      expect(trigger).toBeDisabled();
    });
  });

  describe('Dropdown Behavior', () => {
    // Note: Radix UI dropdown portals don't work correctly in jsdom environment
    // These tests verify the trigger button works correctly and has proper aria attributes

    it('should have proper aria attributes on trigger', () => {
      render(<PathSelector />);

      const trigger = screen.getByText('Main').closest('button');
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('should have data-state attribute for dropdown state', () => {
      render(<PathSelector />);

      const trigger = screen.getByText('Main').closest('button');
      // Radix uses data-state attribute for dropdown state
      expect(trigger).toHaveAttribute('data-state', 'closed');
    });

    it('should accept paths with merged status', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [primaryPath, mergedPath],
        activePath: primaryPath,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: mockSwitchPath,
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      expect(() => render(<PathSelector />)).not.toThrow();
    });

    it('should accept paths with archived status', () => {
      mockUseConversationPaths.mockReturnValue({
        paths: [primaryPath, archivedPath],
        activePath: primaryPath,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: mockSwitchPath,
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      expect(() => render(<PathSelector />)).not.toThrow();
    });
  });

  describe('Path Selection', () => {
    // Note: Full path selection testing requires portal support
    // The switchPath function is mocked and verified in hook tests

    it('should provide switchPath from hook context', () => {
      render(<PathSelector />);

      // Verify the hook was called to get switchPath
      expect(mockUseConversationPaths).toHaveBeenCalled();
    });
  });

  describe('Message Count', () => {
    it('should accept showMessageCount prop', () => {
      // The showMessageCount prop is accepted and would display message counts
      // when the paths have messageCount property set.
      // This verifies the prop is accepted without errors.
      expect(() => {
        render(<PathSelector showMessageCount />);
      }).not.toThrow();
    });
  });

  describe('Action Callbacks', () => {
    // Note: These tests verify the callbacks are properly passed to the component
    // The actual action buttons only appear on hover in the real component
    // Testing the callback props are accepted without errors

    it('should accept onRename callback', () => {
      expect(() => {
        render(<PathSelector onRename={mockOnRename} />);
      }).not.toThrow();
    });

    it('should accept onMerge callback', () => {
      expect(() => {
        render(<PathSelector onMerge={mockOnMerge} />);
      }).not.toThrow();
    });

    it('should accept onDelete callback', () => {
      expect(() => {
        render(<PathSelector onDelete={mockOnDelete} />);
      }).not.toThrow();
    });
  });

  describe('Unnamed Paths', () => {
    it('should show "Unnamed Branch" for non-primary paths without names', async () => {
      const unnamedBranch: ClientPath = {
        ...branchPath,
        name: null,
      };

      mockUseConversationPaths.mockReturnValue({
        paths: [primaryPath, unnamedBranch],
        activePath: unnamedBranch,
        messages: [],
        isLoading: false,
        isLoadingMessages: false,
        isBranching: false,
        isMerging: false,
        error: null,
        conversationId: 'conv-1',
        switchPath: mockSwitchPath,
        refreshPaths: vi.fn(),
        createBranch: vi.fn(),
        mergePath: vi.fn(),
        previewMerge: vi.fn(),
        updatePath: vi.fn(),
        deletePath: vi.fn(),
      });

      render(<PathSelector />);

      expect(screen.getByText('Unnamed Branch')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have focus-visible ring styles on trigger', () => {
      const { container } = render(<PathSelector />);

      const trigger = container.querySelector('button');
      expect(trigger).toHaveClass('focus:ring-2', 'focus:ring-ring');
    });

    it('should have disabled styles when disabled', () => {
      const { container } = render(<PathSelector disabled />);

      const trigger = container.querySelector('button');
      expect(trigger).toHaveClass('disabled:opacity-50', 'disabled:pointer-events-none');
    });
  });
});
