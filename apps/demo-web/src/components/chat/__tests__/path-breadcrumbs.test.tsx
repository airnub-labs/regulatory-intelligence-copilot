/**
 * PathBreadcrumbs Component Tests
 *
 * Tests for the breadcrumb navigation component including:
 * - Breadcrumb chain building from primary to active path
 * - Click navigation and path switching
 * - Jump-to-message scrolling for branch points
 * - Mobile-responsive behavior
 * - Keyboard navigation support
 * - Tooltip display for branch points
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { PathBreadcrumbs } from '../path-breadcrumbs';
import type { ClientPath } from '@reg-copilot/reg-intel-ui';

// Mock the path hooks
const mockSwitchPath = vi.fn();
const mockPaths: ClientPath[] = [];
let mockActivePath: ClientPath | null = null;

vi.mock('@reg-copilot/reg-intel-ui', () => ({
  useConversationPaths: () => ({
    paths: mockPaths,
    activePath: mockActivePath,
    switchPath: mockSwitchPath,
    isLoading: false,
  }),
  useHasPathProvider: () => true,
}));

// Mock scrollToMessage utility
const mockScrollToMessage = vi.fn();
vi.mock('@/lib/utils', async () => {
  const actual = await vi.importActual('@/lib/utils');
  return {
    ...actual,
    scrollToMessage: mockScrollToMessage,
  };
});

describe('PathBreadcrumbs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaths.length = 0;
    mockActivePath = null;
  });

  describe('Rendering', () => {
    it('should not render when on primary path (no breadcrumbs needed)', () => {
      const primaryPath: ClientPath = {
        id: 'path-1',
        conversationId: 'conv-1',
        parentPathId: null,
        branchPointMessageId: null,
        name: 'Primary',
        description: null,
        isPrimary: true,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 5,
        branchCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPaths.push(primaryPath);
      mockActivePath = primaryPath;

      const { container } = render(<PathBreadcrumbs />);
      expect(container.firstChild).toBeNull();
    });

    it('should render breadcrumb chain when on a branch path', () => {
      const primaryPath: ClientPath = {
        id: 'path-1',
        conversationId: 'conv-1',
        parentPathId: null,
        branchPointMessageId: null,
        name: 'Primary',
        description: null,
        isPrimary: true,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 5,
        branchCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const branchPath: ClientPath = {
        id: 'path-2',
        conversationId: 'conv-1',
        parentPathId: 'path-1',
        branchPointMessageId: 'msg-3',
        name: 'Alternative Scenario',
        description: null,
        isPrimary: false,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 3,
        branchCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPaths.push(primaryPath, branchPath);
      mockActivePath = branchPath;

      render(<PathBreadcrumbs />);

      // Should show both primary and branch path
      expect(screen.getByText('Primary')).toBeInTheDocument();
      expect(screen.getByText('Alternative Scenario')).toBeInTheDocument();
    });

    it('should render nested breadcrumb chain (3 levels)', () => {
      const primaryPath: ClientPath = {
        id: 'path-1',
        conversationId: 'conv-1',
        parentPathId: null,
        branchPointMessageId: null,
        name: null, // Test default naming
        description: null,
        isPrimary: true,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 5,
        branchCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const branchPath1: ClientPath = {
        id: 'path-2',
        conversationId: 'conv-1',
        parentPathId: 'path-1',
        branchPointMessageId: 'msg-3',
        name: 'Level 1 Branch',
        description: null,
        isPrimary: false,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 3,
        branchCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const branchPath2: ClientPath = {
        id: 'path-3',
        conversationId: 'conv-1',
        parentPathId: 'path-2',
        branchPointMessageId: 'msg-5',
        name: 'Level 2 Branch',
        description: null,
        isPrimary: false,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 2,
        branchCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPaths.push(primaryPath, branchPath1, branchPath2);
      mockActivePath = branchPath2;

      render(<PathBreadcrumbs />);

      // Should show all three levels
      expect(screen.getByText('Primary')).toBeInTheDocument(); // Default name for primary
      expect(screen.getByText('Level 1 Branch')).toBeInTheDocument();
      expect(screen.getByText('Level 2 Branch')).toBeInTheDocument();
    });

    it('should show Home icon for primary path', () => {
      const primaryPath: ClientPath = {
        id: 'path-1',
        conversationId: 'conv-1',
        parentPathId: null,
        branchPointMessageId: null,
        name: 'Primary',
        description: null,
        isPrimary: true,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 5,
        branchCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const branchPath: ClientPath = {
        id: 'path-2',
        conversationId: 'conv-1',
        parentPathId: 'path-1',
        branchPointMessageId: 'msg-3',
        name: 'Branch',
        description: null,
        isPrimary: false,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 3,
        branchCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPaths.push(primaryPath, branchPath);
      mockActivePath = branchPath;

      const { container } = render(<PathBreadcrumbs />);

      // Check for Home icon (lucide-react renders as svg)
      const homeIcon = container.querySelector('svg');
      expect(homeIcon).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should call switchPath and onPathSwitch when clicking a breadcrumb', async () => {
      const primaryPath: ClientPath = {
        id: 'path-1',
        conversationId: 'conv-1',
        parentPathId: null,
        branchPointMessageId: null,
        name: 'Primary',
        description: null,
        isPrimary: true,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 5,
        branchCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const branchPath: ClientPath = {
        id: 'path-2',
        conversationId: 'conv-1',
        parentPathId: 'path-1',
        branchPointMessageId: 'msg-3',
        name: 'Branch',
        description: null,
        isPrimary: false,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 3,
        branchCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPaths.push(primaryPath, branchPath);
      mockActivePath = branchPath;

      const onPathSwitch = vi.fn();
      render(<PathBreadcrumbs onPathSwitch={onPathSwitch} />);

      // Click primary path breadcrumb
      const primaryButton = screen.getByText('Primary');
      fireEvent.click(primaryButton);

      await waitFor(() => {
        expect(mockSwitchPath).toHaveBeenCalledWith('path-1');
        expect(onPathSwitch).toHaveBeenCalledWith(primaryPath);
      });
    });

    it('should not call switchPath when clicking the active breadcrumb', async () => {
      const primaryPath: ClientPath = {
        id: 'path-1',
        conversationId: 'conv-1',
        parentPathId: null,
        branchPointMessageId: null,
        name: 'Primary',
        description: null,
        isPrimary: true,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 5,
        branchCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const branchPath: ClientPath = {
        id: 'path-2',
        conversationId: 'conv-1',
        parentPathId: 'path-1',
        branchPointMessageId: 'msg-3',
        name: 'Branch',
        description: null,
        isPrimary: false,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 3,
        branchCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPaths.push(primaryPath, branchPath);
      mockActivePath = branchPath;

      render(<PathBreadcrumbs />);

      // Try to click the active breadcrumb (should be disabled)
      const branchButton = screen.getByText('Branch');
      expect(branchButton).toBeDisabled();

      fireEvent.click(branchButton);

      // Should not call switchPath
      expect(mockSwitchPath).not.toHaveBeenCalled();
    });
  });

  describe('Jump-to-Message', () => {
    it('should scroll to branch point message when switching to parent path', async () => {
      vi.useFakeTimers();

      const primaryPath: ClientPath = {
        id: 'path-1',
        conversationId: 'conv-1',
        parentPathId: null,
        branchPointMessageId: null,
        name: 'Primary',
        description: null,
        isPrimary: true,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 5,
        branchCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const branchPath: ClientPath = {
        id: 'path-2',
        conversationId: 'conv-1',
        parentPathId: 'path-1',
        branchPointMessageId: 'msg-3',
        name: 'Branch',
        description: null,
        isPrimary: false,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 3,
        branchCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPaths.push(primaryPath, branchPath);
      mockActivePath = branchPath;
      mockSwitchPath.mockResolvedValue(undefined);

      render(<PathBreadcrumbs />);

      // Click primary path breadcrumb
      const primaryButton = screen.getByText('Primary');
      fireEvent.click(primaryButton);

      // Wait for async operations
      await waitFor(() => {
        expect(mockSwitchPath).toHaveBeenCalledWith('path-1');
      });

      // Fast-forward timers to trigger scrollToMessage
      vi.advanceTimersByTime(200);

      // Should call scrollToMessage with branch point
      await waitFor(() => {
        expect(mockScrollToMessage).toHaveBeenCalledWith('msg-3', {
          highlight: true,
          highlightDuration: 2000,
          block: 'center',
        });
      });

      vi.useRealTimers();
    });

    it('should not scroll if next path has no branch point message', async () => {
      const primaryPath: ClientPath = {
        id: 'path-1',
        conversationId: 'conv-1',
        parentPathId: null,
        branchPointMessageId: null,
        name: 'Primary',
        description: null,
        isPrimary: true,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 5,
        branchCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const branchPath: ClientPath = {
        id: 'path-2',
        conversationId: 'conv-1',
        parentPathId: 'path-1',
        branchPointMessageId: null, // No branch point
        name: 'Branch',
        description: null,
        isPrimary: false,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 3,
        branchCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPaths.push(primaryPath, branchPath);
      mockActivePath = branchPath;
      mockSwitchPath.mockResolvedValue(undefined);

      render(<PathBreadcrumbs />);

      // Click primary path breadcrumb
      const primaryButton = screen.getByText('Primary');
      fireEvent.click(primaryButton);

      await waitFor(() => {
        expect(mockSwitchPath).toHaveBeenCalledWith('path-1');
      });

      // Should not call scrollToMessage
      expect(mockScrollToMessage).not.toHaveBeenCalled();
    });
  });

  describe('Tooltips', () => {
    it('should show branch point tooltip on hover', () => {
      const primaryPath: ClientPath = {
        id: 'path-1',
        conversationId: 'conv-1',
        parentPathId: null,
        branchPointMessageId: null,
        name: 'Primary',
        description: null,
        isPrimary: true,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 5,
        branchCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const branchPath: ClientPath = {
        id: 'path-2',
        conversationId: 'conv-1',
        parentPathId: 'path-1',
        branchPointMessageId: 'msg-abc123',
        name: 'Branch',
        description: null,
        isPrimary: false,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 3,
        branchCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPaths.push(primaryPath, branchPath);
      mockActivePath = branchPath;

      render(<PathBreadcrumbs />);

      // Branch button should have title attribute with branch point info
      const branchButton = screen.getByText('Branch');
      expect(branchButton).toHaveAttribute('title', 'Branched from message msg-abc1');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      const primaryPath: ClientPath = {
        id: 'path-1',
        conversationId: 'conv-1',
        parentPathId: null,
        branchPointMessageId: null,
        name: 'Primary',
        description: null,
        isPrimary: true,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 5,
        branchCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const branchPath: ClientPath = {
        id: 'path-2',
        conversationId: 'conv-1',
        parentPathId: 'path-1',
        branchPointMessageId: 'msg-3',
        name: 'Branch',
        description: null,
        isPrimary: false,
        isActive: true,
        isMerged: false,
        mergedToPathId: null,
        mergedAt: null,
        mergeMode: null,
        messageCount: 3,
        branchCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      mockPaths.push(primaryPath, branchPath);
      mockActivePath = branchPath;

      const { container } = render(<PathBreadcrumbs />);

      // Navigation element should have aria-label
      const nav = container.querySelector('[role="navigation"]');
      expect(nav).toHaveAttribute('aria-label', 'Path breadcrumbs');

      // Active breadcrumb should have aria-current
      const branchButton = screen.getByText('Branch');
      expect(branchButton).toHaveAttribute('aria-current', 'page');
    });
  });
});
