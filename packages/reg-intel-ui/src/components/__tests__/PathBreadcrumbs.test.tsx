/**
 * PathBreadcrumbs Component Tests
 *
 * Regression tests for breadcrumb navigation functionality
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PathBreadcrumbs } from '../PathBreadcrumbs';
import type { ClientPath } from '../types';

const mockPaths: ClientPath[] = [
  {
    id: 'main-path',
    name: 'Main',
    isPrimary: true,
    isActive: true,
    isMerged: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'branch-1',
    name: 'Branch 1',
    parentPathId: 'main-path',
    branchPointMessageId: 'msg-1',
    isPrimary: false,
    isActive: true,
    isMerged: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'branch-2',
    name: 'Branch 2',
    parentPathId: 'branch-1',
    branchPointMessageId: 'msg-2',
    isPrimary: false,
    isActive: true,
    isMerged: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe('PathBreadcrumbs', () => {
  describe('Visibility', () => {
    it('should render breadcrumbs when on main path (regression test for enhancement)', () => {
      const onNavigate = vi.fn();
      const mainPath = mockPaths[0];

      render(
        <PathBreadcrumbs
          activePath={mainPath}
          paths={mockPaths}
          onNavigate={onNavigate}
        />
      );

      // Should show breadcrumb navigation even on main path
      const breadcrumbNav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(breadcrumbNav).toBeInTheDocument();

      // Should show "Main" breadcrumb
      const mainButton = screen.getByRole('button', { name: /Navigate to Main/i });
      expect(mainButton).toBeInTheDocument();
      expect(mainButton).toBeDisabled(); // Current path should be disabled
    });

    it('should render full breadcrumb chain when on nested branch', () => {
      const onNavigate = vi.fn();
      const nestedBranch = mockPaths[2]; // Branch 2

      render(
        <PathBreadcrumbs
          activePath={nestedBranch}
          paths={mockPaths}
          onNavigate={onNavigate}
        />
      );

      // Should show: Main > Branch 1 > Branch 2
      const mainButton = screen.getByRole('button', { name: /Navigate to Main/i });
      const branch1Button = screen.getByRole('button', { name: /Navigate to Branch 1/i });
      const branch2Button = screen.getByRole('button', { name: /Navigate to Branch 2/i });

      expect(mainButton).toBeInTheDocument();
      expect(branch1Button).toBeInTheDocument();
      expect(branch2Button).toBeInTheDocument();

      // Only the active path should be disabled
      expect(mainButton).not.toBeDisabled();
      expect(branch1Button).not.toBeDisabled();
      expect(branch2Button).toBeDisabled();
    });

    it('should not render when there are no paths', () => {
      const onNavigate = vi.fn();

      const { container } = render(
        <PathBreadcrumbs
          activePath={null}
          paths={[]}
          onNavigate={onNavigate}
        />
      );

      // Should not render anything
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Navigation', () => {
    it('should call onNavigate when clicking parent path breadcrumb', () => {
      const onNavigate = vi.fn();
      const nestedBranch = mockPaths[2]; // Branch 2

      render(
        <PathBreadcrumbs
          activePath={nestedBranch}
          paths={mockPaths}
          onNavigate={onNavigate}
        />
      );

      // Click on Main breadcrumb
      const mainButton = screen.getByRole('button', { name: /Navigate to Main/i });
      fireEvent.click(mainButton);

      // Should call onNavigate with main path ID and scroll options
      // When navigating from Branch 2 to Main, should scroll to Branch 1's branch point (msg-1)
      // since Branch 1 is the next path in the chain after Main
      expect(onNavigate).toHaveBeenCalledWith(
        'main-path',
        expect.objectContaining({
          scrollToMessage: 'msg-1', // Branch point message of Branch 1 (next in chain after Main)
          highlightMessage: true,
        })
      );
    });

    it('should call onNavigate when clicking middle path in chain', () => {
      const onNavigate = vi.fn();
      const nestedBranch = mockPaths[2]; // Branch 2

      render(
        <PathBreadcrumbs
          activePath={nestedBranch}
          paths={mockPaths}
          onNavigate={onNavigate}
        />
      );

      // Click on Branch 1 breadcrumb
      const branch1Button = screen.getByRole('button', { name: /Navigate to Branch 1/i });
      fireEvent.click(branch1Button);

      // Should call onNavigate with branch 1 path ID
      expect(onNavigate).toHaveBeenCalledWith(
        'branch-1',
        expect.objectContaining({
          scrollToMessage: 'msg-2', // Branch point message of Branch 2
          highlightMessage: true,
        })
      );
    });

    it('should not call onNavigate when clicking active (disabled) breadcrumb', () => {
      const onNavigate = vi.fn();
      const activePath = mockPaths[1]; // Branch 1

      render(
        <PathBreadcrumbs
          activePath={activePath}
          paths={mockPaths}
          onNavigate={onNavigate}
        />
      );

      // Click on the active breadcrumb (should be disabled)
      const activeButton = screen.getByRole('button', { name: /Navigate to Branch 1/i });
      expect(activeButton).toBeDisabled();

      fireEvent.click(activeButton);

      // Should not call onNavigate
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should move focus to next breadcrumb on ArrowRight', () => {
      const onNavigate = vi.fn();
      const nestedBranch = mockPaths[2];

      render(
        <PathBreadcrumbs
          activePath={nestedBranch}
          paths={mockPaths}
          onNavigate={onNavigate}
        />
      );

      const mainButton = screen.getByRole('button', { name: /Navigate to Main/i });
      const branch1Button = screen.getByRole('button', { name: /Navigate to Branch 1/i });

      // Focus main button and press ArrowRight
      mainButton.focus();
      fireEvent.keyDown(mainButton, { key: 'ArrowRight' });

      // Branch 1 should now have focus
      expect(branch1Button).toHaveFocus();
    });

    it('should move focus to previous breadcrumb on ArrowLeft', () => {
      const onNavigate = vi.fn();
      const nestedBranch = mockPaths[2];

      render(
        <PathBreadcrumbs
          activePath={nestedBranch}
          paths={mockPaths}
          onNavigate={onNavigate}
        />
      );

      const mainButton = screen.getByRole('button', { name: /Navigate to Main/i });
      const branch1Button = screen.getByRole('button', { name: /Navigate to Branch 1/i });

      // Focus branch 1 button and press ArrowLeft
      branch1Button.focus();
      fireEvent.keyDown(branch1Button, { key: 'ArrowLeft' });

      // Main should now have focus
      expect(mainButton).toHaveFocus();
    });

    it('should jump to first breadcrumb on Home key', () => {
      const onNavigate = vi.fn();
      const nestedBranch = mockPaths[2];

      render(
        <PathBreadcrumbs
          activePath={nestedBranch}
          paths={mockPaths}
          onNavigate={onNavigate}
        />
      );

      const mainButton = screen.getByRole('button', { name: /Navigate to Main/i });
      const branch2Button = screen.getByRole('button', { name: /Navigate to Branch 2/i });

      // Focus last button and press Home
      branch2Button.focus();
      fireEvent.keyDown(branch2Button, { key: 'Home' });

      // First breadcrumb should now have focus
      expect(mainButton).toHaveFocus();
    });

    it('should jump to last breadcrumb on End key', () => {
      const onNavigate = vi.fn();
      const nestedBranch = mockPaths[2];

      render(
        <PathBreadcrumbs
          activePath={nestedBranch}
          paths={mockPaths}
          onNavigate={onNavigate}
        />
      );

      const mainButton = screen.getByRole('button', { name: /Navigate to Main/i });
      const branch2Button = screen.getByRole('button', { name: /Navigate to Branch 2/i });

      // Focus first button and press End
      mainButton.focus();
      fireEvent.keyDown(mainButton, { key: 'End' });

      // Last breadcrumb should now have focus
      expect(branch2Button).toHaveFocus();
    });
  });

  describe('Branch Point Messages', () => {
    it('should include branch point message in tooltip', () => {
      const onNavigate = vi.fn();
      const branch1 = mockPaths[1];

      const messagesWithContent = [
        {
          id: 'msg-1',
          role: 'user' as const,
          content: 'This is the branch point message content for testing tooltip display',
          pathId: 'main-path',
          createdAt: new Date().toISOString(),
        },
      ];

      render(
        <PathBreadcrumbs
          activePath={branch1}
          paths={mockPaths}
          messages={messagesWithContent}
          onNavigate={onNavigate}
        />
      );

      // Main breadcrumb should have tooltip indicating branch point
      const mainButton = screen.getByRole('button', { name: /Navigate to Main/i });

      expect(mainButton).toHaveAttribute(
        'title',
        expect.stringContaining('This is the branch point message content')
      );
    });
  });
});
