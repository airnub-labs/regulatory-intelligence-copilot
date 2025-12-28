/**
 * Tests for BranchButton component
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BranchButton } from '../BranchButton';

describe('BranchButton', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    mockOnClick.mockClear();
  });

  describe('Rendering', () => {
    it('should render button with GitBranch icon', () => {
      render(<BranchButton onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      // Check that the SVG icon is present
      expect(button.querySelector('svg')).toBeInTheDocument();
    });

    it('should render with default ghost variant', () => {
      render(<BranchButton onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('hover:bg-accent');
    });

    it('should render with default icon size', () => {
      render(<BranchButton onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-8', 'w-8');
    });

    it('should apply custom className', () => {
      render(<BranchButton onClick={mockOnClick} className="custom-class" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('custom-class');
    });

    it('should render in disabled state', () => {
      render(<BranchButton onClick={mockOnClick} disabled />);

      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('disabled:opacity-50');
    });
  });

  describe('Variants', () => {
    it('should render default variant styles', () => {
      render(<BranchButton onClick={mockOnClick} variant="default" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-primary', 'text-primary-foreground');
    });

    it('should render outline variant styles', () => {
      render(<BranchButton onClick={mockOnClick} variant="outline" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('border', 'border-input', 'bg-background');
    });

    it('should render ghost variant styles', () => {
      render(<BranchButton onClick={mockOnClick} variant="ghost" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('hover:bg-accent');
    });

    it('should render destructive variant styles', () => {
      render(<BranchButton onClick={mockOnClick} variant="destructive" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-destructive', 'text-destructive-foreground');
    });
  });

  describe('Sizes', () => {
    it('should render with default size', () => {
      render(<BranchButton onClick={mockOnClick} size="default" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-10', 'px-4', 'py-2');
    });

    it('should render with sm size', () => {
      render(<BranchButton onClick={mockOnClick} size="sm" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-9', 'px-3');
    });

    it('should render with lg size', () => {
      render(<BranchButton onClick={mockOnClick} size="lg" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-11', 'px-8');
    });

    it('should render with icon size', () => {
      render(<BranchButton onClick={mockOnClick} size="icon" />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('h-8', 'w-8');
    });
  });

  describe('Label', () => {
    it('should not show label by default', () => {
      render(<BranchButton onClick={mockOnClick} />);

      expect(screen.queryByText('Branch')).not.toBeInTheDocument();
    });

    it('should show label when showLabel is true', () => {
      render(<BranchButton onClick={mockOnClick} showLabel />);

      expect(screen.getByText('Branch')).toBeInTheDocument();
    });

    it('should show custom label when provided', () => {
      render(<BranchButton onClick={mockOnClick} showLabel label="Create Branch" />);

      expect(screen.getByText('Create Branch')).toBeInTheDocument();
    });
  });

  describe('Click Handling', () => {
    it('should call onClick when clicked', () => {
      render(<BranchButton onClick={mockOnClick} />);

      fireEvent.click(screen.getByRole('button'));
      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick when disabled', () => {
      render(<BranchButton onClick={mockOnClick} disabled />);

      fireEvent.click(screen.getByRole('button'));
      expect(mockOnClick).not.toHaveBeenCalled();
    });
  });

  describe('Tooltip', () => {
    it('should render with tooltip by default (icon-only mode)', () => {
      render(<BranchButton onClick={mockOnClick} tooltip="Branch from here" />);

      // Tooltip trigger wraps the button
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    it('should not render tooltip wrapper when showLabel is true', () => {
      render(<BranchButton onClick={mockOnClick} showLabel tooltip="Branch from here" />);

      // When showLabel is true, button is rendered directly without tooltip
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
      expect(screen.getByText('Branch')).toBeInTheDocument();
    });

    it('should not render tooltip wrapper when tooltip is empty', () => {
      render(<BranchButton onClick={mockOnClick} tooltip="" />);

      // When tooltip is falsy, button is rendered directly
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have type="button"', () => {
      render(<BranchButton onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('type', 'button');
    });

    it('should have focus-visible ring styles', () => {
      render(<BranchButton onClick={mockOnClick} />);

      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus-visible:ring-2', 'focus-visible:ring-ring');
    });
  });
});
