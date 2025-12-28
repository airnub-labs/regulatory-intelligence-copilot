/**
 * Tests for PathBreadcrumbs component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PathBreadcrumbs } from '../PathBreadcrumbs';
import type { ClientPath, PathMessage } from '../../types';

describe('PathBreadcrumbs', () => {
  const mockOnNavigate = vi.fn();

  const primaryPath: ClientPath = {
    id: 'path-primary',
    conversationId: 'conv-1',
    parentPathId: null,
    branchPointMessageId: null,
    name: null,
    isPrimary: true,
    isActive: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const branchPath1: ClientPath = {
    id: 'path-branch-1',
    conversationId: 'conv-1',
    parentPathId: 'path-primary',
    branchPointMessageId: 'msg-branch-1',
    name: 'Alternative Scenario',
    isPrimary: false,
    isActive: false,
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02'),
  };

  const branchPath2: ClientPath = {
    id: 'path-branch-2',
    conversationId: 'conv-1',
    parentPathId: 'path-branch-1',
    branchPointMessageId: 'msg-branch-2',
    name: 'Edit: What about Germany?',
    isPrimary: false,
    isActive: true,
    createdAt: new Date('2024-01-03'),
    updatedAt: new Date('2024-01-03'),
  };

  const messages: PathMessage[] = [
    {
      id: 'msg-branch-1',
      conversationId: 'conv-1',
      pathId: 'path-primary',
      role: 'user',
      content: 'What are the tax rules for Ireland?',
      metadata: {},
      sequenceInPath: 1,
      effectiveSequence: 1,
      isBranchPoint: true,
      branchedToPaths: ['path-branch-1'],
      messageType: 'user',
      createdAt: '2024-01-01T10:00:00Z',
    },
    {
      id: 'msg-branch-2',
      conversationId: 'conv-1',
      pathId: 'path-branch-1',
      role: 'user',
      content: 'What about corporate tax in Germany? This is a very long message that should be truncated in the preview.',
      metadata: {},
      sequenceInPath: 2,
      effectiveSequence: 2,
      isBranchPoint: true,
      branchedToPaths: ['path-branch-2'],
      messageType: 'user',
      createdAt: '2024-01-02T10:00:00Z',
    },
  ];

  beforeEach(() => {
    mockOnNavigate.mockClear();
  });

  describe('Rendering', () => {
    it('should hide when only primary path exists (auto-hide)', () => {
      const { container } = render(
        <PathBreadcrumbs
          activePath={primaryPath}
          paths={[primaryPath]}
          onNavigate={mockOnNavigate}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render breadcrumb chain for nested paths', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      expect(screen.getByText('Primary')).toBeInTheDocument();
      expect(screen.getByText('Alternative Scenario')).toBeInTheDocument();
      expect(screen.getByText('Edit: What about Germany?')).toBeInTheDocument();
    });

    it('should render correct number of separators', () => {
      const { container } = render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      // Should have 2 ChevronRight separators for 3 breadcrumbs
      const separators = container.querySelectorAll('svg[class*="lucide-chevron-right"]');
      expect(separators).toHaveLength(2);
    });

    it('should show MessageCircle icon for paths with branch points', () => {
      const { container } = render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          messages={messages}
          onNavigate={mockOnNavigate}
        />
      );

      // Primary and branchPath1 have children, so should show icons
      const messageIcons = container.querySelectorAll('svg[class*="lucide-message-circle"]');
      expect(messageIcons).toHaveLength(2);
    });

    it('should apply smart truncation with max-width', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button.className).toContain('max-w-[200px]');
      });
    });
  });

  describe('Navigation', () => {
    it('should call onNavigate when clicking non-active breadcrumb', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const primaryButton = screen.getByText('Primary');
      fireEvent.click(primaryButton);

      expect(mockOnNavigate).toHaveBeenCalledWith('path-primary', {
        scrollToMessage: 'msg-branch-1',
        highlightMessage: true,
      });
    });

    it('should not call onNavigate when clicking active breadcrumb', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const activeButton = screen.getByText('Edit: What about Germany?');
      fireEvent.click(activeButton);

      expect(mockOnNavigate).not.toHaveBeenCalled();
    });

    it('should disable active breadcrumb button', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const activeButton = screen.getByText('Edit: What about Germany?') as HTMLButtonElement;
      expect(activeButton.disabled).toBe(true);
    });

    it('should pass branch point message ID for jump-to-message', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          messages={messages}
          onNavigate={mockOnNavigate}
        />
      );

      const branchButton = screen.getByText('Alternative Scenario');
      fireEvent.click(branchButton);

      expect(mockOnNavigate).toHaveBeenCalledWith('path-branch-1', {
        scrollToMessage: 'msg-branch-2',
        highlightMessage: true,
      });
    });
  });

  describe('Keyboard Navigation', () => {
    it('should move focus to next breadcrumb on ArrowRight', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const primaryButton = screen.getByText('Primary');
      const branchButton = screen.getByText('Alternative Scenario');

      primaryButton.focus();
      expect(document.activeElement).toBe(primaryButton);

      fireEvent.keyDown(primaryButton, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(branchButton);
    });

    it('should move focus to previous breadcrumb on ArrowLeft', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const primaryButton = screen.getByText('Primary');
      const branchButton = screen.getByText('Alternative Scenario');

      branchButton.focus();
      expect(document.activeElement).toBe(branchButton);

      fireEvent.keyDown(branchButton, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(primaryButton);
    });

    it('should jump to first breadcrumb on Home key', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const primaryButton = screen.getByText('Primary');
      const branchButton = screen.getByText('Alternative Scenario');

      branchButton.focus();
      fireEvent.keyDown(branchButton, { key: 'Home' });
      expect(document.activeElement).toBe(primaryButton);
    });

    it('should jump to last breadcrumb on End key', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const primaryButton = screen.getByText('Primary');
      const activeButton = screen.getByText('Edit: What about Germany?');

      primaryButton.focus();
      fireEvent.keyDown(primaryButton, { key: 'End' });
      expect(document.activeElement).toBe(activeButton);
    });

    it('should not move focus beyond first breadcrumb on ArrowLeft', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const primaryButton = screen.getByText('Primary');

      primaryButton.focus();
      fireEvent.keyDown(primaryButton, { key: 'ArrowLeft' });
      expect(document.activeElement).toBe(primaryButton); // Should stay on first
    });

    it('should not move focus beyond last breadcrumb on ArrowRight', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const activeButton = screen.getByText('Edit: What about Germany?');

      activeButton.focus();
      fireEvent.keyDown(activeButton, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(activeButton); // Should stay on last
    });
  });

  describe('Tooltips', () => {
    it('should show branch point message preview in tooltip', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          messages={messages}
          onNavigate={mockOnNavigate}
        />
      );

      const primaryButton = screen.getByText('Primary');
      expect(primaryButton.title).toContain('What are the tax rules for Ireland?');
    });

    it('should truncate long message previews to 80 characters', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          messages={messages}
          onNavigate={mockOnNavigate}
        />
      );

      const branchButton = screen.getByText('Alternative Scenario');
      expect(branchButton.title).toContain('What about corporate tax in Germany? This is a very long message that should');
      expect(branchButton.title).toContain('...');
    });

    it('should show default tooltip for paths without messages', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const activeButton = screen.getByText('Edit: What about Germany?');
      expect(activeButton.title).toBe('Edit: What about Germany?');
    });
  });

  describe('Accessibility', () => {
    it('should have navigation role', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
      expect(nav).toHaveAttribute('aria-label', 'Path breadcrumb navigation');
    });

    it('should mark active breadcrumb with aria-current', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const activeButton = screen.getByText('Edit: What about Germany?');
      expect(activeButton).toHaveAttribute('aria-current', 'page');
    });

    it('should have descriptive aria-labels', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const primaryButton = screen.getByText('Primary');
      expect(primaryButton).toHaveAttribute('aria-label');
      expect(primaryButton.getAttribute('aria-label')).toContain('Navigate to Primary path');
    });

    it('should set tabIndex=-1 for active breadcrumb', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const activeButton = screen.getByText('Edit: What about Germany?');
      expect(activeButton).toHaveAttribute('tabIndex', '-1');
    });

    it('should set tabIndex=0 for inactive breadcrumbs', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          onNavigate={mockOnNavigate}
        />
      );

      const primaryButton = screen.getByText('Primary');
      expect(primaryButton).toHaveAttribute('tabIndex', '0');
    });

    it('should hide decorative icons from screen readers', () => {
      const { container } = render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          messages={messages}
          onNavigate={mockOnNavigate}
        />
      );

      const chevrons = container.querySelectorAll('svg[class*="lucide-chevron-right"]');
      chevrons.forEach(chevron => {
        expect(chevron).toHaveAttribute('aria-hidden', 'true');
      });

      const messageIcons = container.querySelectorAll('svg[class*="lucide-message-circle"]');
      messageIcons.forEach(icon => {
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null activePath gracefully', () => {
      const { container } = render(
        <PathBreadcrumbs
          activePath={null}
          paths={[primaryPath, branchPath1]}
          onNavigate={mockOnNavigate}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should handle empty paths array', () => {
      const { container } = render(
        <PathBreadcrumbs
          activePath={primaryPath}
          paths={[]}
          onNavigate={mockOnNavigate}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should handle missing branch point message gracefully', () => {
      render(
        <PathBreadcrumbs
          activePath={branchPath2}
          paths={[primaryPath, branchPath1, branchPath2]}
          messages={[]} // Empty messages array
          onNavigate={mockOnNavigate}
        />
      );

      const primaryButton = screen.getByText('Primary');
      fireEvent.click(primaryButton);

      expect(mockOnNavigate).toHaveBeenCalledWith('path-primary', {
        scrollToMessage: 'msg-branch-1',
        highlightMessage: true,
      });
    });

    it('should render custom path names', () => {
      const customPath: ClientPath = {
        ...branchPath1,
        name: 'My Custom Branch Name',
      };

      render(
        <PathBreadcrumbs
          activePath={customPath}
          paths={[primaryPath, customPath]}
          onNavigate={mockOnNavigate}
        />
      );

      expect(screen.getByText('My Custom Branch Name')).toBeInTheDocument();
    });

    it('should fallback to "Branch {id}" for unnamed non-primary paths', () => {
      const unnamedPath: ClientPath = {
        ...branchPath1,
        name: null,
        isPrimary: false,
      };

      render(
        <PathBreadcrumbs
          activePath={unnamedPath}
          paths={[primaryPath, unnamedPath]}
          onNavigate={mockOnNavigate}
        />
      );

      expect(screen.getByText(`Branch ${unnamedPath.id.slice(0, 6)}`)).toBeInTheDocument();
    });
  });
});
