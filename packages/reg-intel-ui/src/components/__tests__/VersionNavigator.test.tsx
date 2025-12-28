/**
 * Tests for VersionNavigator component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VersionNavigator } from '../VersionNavigator';

describe('VersionNavigator', () => {
  const mockOnPrevious = vi.fn();
  const mockOnNext = vi.fn();

  beforeEach(() => {
    mockOnPrevious.mockClear();
    mockOnNext.mockClear();
  });

  describe('Rendering', () => {
    it('should render version counter', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      expect(screen.getByText('2 / 3')).toBeInTheDocument();
    });

    it('should render previous and next buttons', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      expect(screen.getByLabelText('Previous version')).toBeInTheDocument();
      expect(screen.getByLabelText('Next version')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={2}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          className="custom-class"
        />
      );

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('custom-class');
    });

    it('should render with muted background', () => {
      const { container } = render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={2}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('bg-muted/50');
    });
  });

  describe('Navigation State', () => {
    it('should disable previous button at first version', () => {
      render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      const prevButton = screen.getByLabelText('Previous version');
      expect(prevButton).toBeDisabled();
    });

    it('should enable previous button when not at first version', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      const prevButton = screen.getByLabelText('Previous version');
      expect(prevButton).not.toBeDisabled();
    });

    it('should disable next button at last version', () => {
      render(
        <VersionNavigator
          currentIndex={2}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      const nextButton = screen.getByLabelText('Next version');
      expect(nextButton).toBeDisabled();
    });

    it('should enable next button when not at last version', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      const nextButton = screen.getByLabelText('Next version');
      expect(nextButton).not.toBeDisabled();
    });

    it('should handle single version (both buttons disabled)', () => {
      render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={1}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      expect(screen.getByLabelText('Previous version')).toBeDisabled();
      expect(screen.getByLabelText('Next version')).toBeDisabled();
      expect(screen.getByText('1 / 1')).toBeInTheDocument();
    });
  });

  describe('Click Handling', () => {
    it('should call onPrevious when previous button is clicked', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      fireEvent.click(screen.getByLabelText('Previous version'));
      expect(mockOnPrevious).toHaveBeenCalledTimes(1);
    });

    it('should call onNext when next button is clicked', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      fireEvent.click(screen.getByLabelText('Next version'));
      expect(mockOnNext).toHaveBeenCalledTimes(1);
    });

    it('should not call onPrevious when disabled', () => {
      render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      fireEvent.click(screen.getByLabelText('Previous version'));
      expect(mockOnPrevious).not.toHaveBeenCalled();
    });

    it('should not call onNext when disabled', () => {
      render(
        <VersionNavigator
          currentIndex={2}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      fireEvent.click(screen.getByLabelText('Next version'));
      expect(mockOnNext).not.toHaveBeenCalled();
    });
  });

  describe('Timestamp Display', () => {
    it('should show "Original" for first version when isOriginal is true', () => {
      render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={3}
          currentTimestamp={new Date('2024-01-01')}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          isOriginal
        />
      );

      expect(screen.getByText('Original')).toBeInTheDocument();
    });

    it('should show "Latest" for last version when isLatest is true', () => {
      render(
        <VersionNavigator
          currentIndex={2}
          totalVersions={3}
          currentTimestamp={new Date('2024-01-03')}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          isLatest
        />
      );

      expect(screen.getByText('Latest')).toBeInTheDocument();
    });

    it('should not show timestamp when currentTimestamp is not provided', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      expect(screen.queryByText('Original')).not.toBeInTheDocument();
      expect(screen.queryByText('Latest')).not.toBeInTheDocument();
    });

    it('should not show timestamp label in sm size even with timestamp', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          currentTimestamp={new Date('2024-01-02')}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          size="sm"
          isOriginal
        />
      );

      // In sm size, timestamp labels are hidden
      expect(screen.queryByText('Original')).not.toBeInTheDocument();
    });
  });

  describe('Sizes', () => {
    it('should render with default size', () => {
      render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={2}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      const prevButton = screen.getByLabelText('Previous version');
      expect(prevButton).toHaveClass('h-7', 'w-7');
    });

    it('should render with sm size', () => {
      render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={2}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          size="sm"
        />
      );

      const prevButton = screen.getByLabelText('Previous version');
      expect(prevButton).toHaveClass('h-5', 'w-5');
    });

    it('should show smaller version counter in sm size', () => {
      render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={2}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          size="sm"
        />
      );

      const versionText = screen.getByText('1 / 2');
      expect(versionText).toHaveClass('text-xs');
    });

    it('should show regular version counter in default size', () => {
      render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={2}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          size="default"
        />
      );

      const versionText = screen.getByText('1 / 2');
      expect(versionText).toHaveClass('text-sm');
    });
  });

  describe('Accessibility', () => {
    it('should have aria-labels on navigation buttons', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      expect(screen.getByLabelText('Previous version')).toBeInTheDocument();
      expect(screen.getByLabelText('Next version')).toBeInTheDocument();
    });

    it('should have type="button" on both buttons', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      expect(screen.getByLabelText('Previous version')).toHaveAttribute('type', 'button');
      expect(screen.getByLabelText('Next version')).toHaveAttribute('type', 'button');
    });

    it('should have focus-visible styles on buttons', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      const prevButton = screen.getByLabelText('Previous version');
      expect(prevButton).toHaveClass('focus-visible:ring-2');
    });

    it('should use tabular-nums for version counter', () => {
      render(
        <VersionNavigator
          currentIndex={1}
          totalVersions={3}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      const versionText = screen.getByText('2 / 3');
      expect(versionText).toHaveClass('tabular-nums');
    });
  });

  describe('Edge Cases', () => {
    it('should handle large version numbers', () => {
      render(
        <VersionNavigator
          currentIndex={99}
          totalVersions={100}
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
        />
      );

      expect(screen.getByText('100 / 100')).toBeInTheDocument();
    });

    it('should handle string timestamp', () => {
      render(
        <VersionNavigator
          currentIndex={0}
          totalVersions={2}
          currentTimestamp="2024-01-01T12:00:00Z"
          onPrevious={mockOnPrevious}
          onNext={mockOnNext}
          isOriginal
        />
      );

      expect(screen.getByText('Original')).toBeInTheDocument();
    });
  });
});
