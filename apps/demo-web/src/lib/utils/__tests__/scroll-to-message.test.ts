/**
 * Tests for scroll-to-message utilities
 */

import {
  scrollToMessage,
  highlightMessage,
  cancelHighlight,
  messageExists,
} from '../scroll-to-message';

describe('scroll-to-message utilities', () => {
  let mockElement: HTMLElement;

  beforeEach(() => {
    // Create a mock message element
    mockElement = document.createElement('div');
    mockElement.id = 'message-test-123';
    mockElement.scrollIntoView = jest.fn();
    document.body.appendChild(mockElement);
  });

  afterEach(() => {
    // Clean up
    document.body.innerHTML = '';
    jest.clearAllTimers();
  });

  describe('scrollToMessage', () => {
    it('should scroll to an existing message', () => {
      const result = scrollToMessage('test-123');

      expect(result).toBe(true);
      expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      });
    });

    it('should return false for non-existent message', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = scrollToMessage('non-existent');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Message element not found: non-existent'
      );

      consoleSpy.mockRestore();
    });

    it('should use custom scroll options', () => {
      scrollToMessage('test-123', {
        behavior: 'auto',
        block: 'start',
        inline: 'start',
      });

      expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'auto',
        block: 'start',
        inline: 'start',
      });
    });

    it('should highlight message when highlight option is true', () => {
      jest.useFakeTimers();

      scrollToMessage('test-123', { highlight: true });

      // Check that highlight classes are added
      expect(mockElement.classList.contains('ring-2')).toBe(true);
      expect(mockElement.classList.contains('ring-primary')).toBe(true);
      expect(mockElement.classList.contains('ring-offset-2')).toBe(true);

      // Fast-forward time
      jest.advanceTimersByTime(2000);

      // Check that highlight classes are removed
      expect(mockElement.classList.contains('ring-2')).toBe(false);
      expect(mockElement.classList.contains('ring-primary')).toBe(false);
      expect(mockElement.classList.contains('ring-offset-2')).toBe(false);

      jest.useRealTimers();
    });

    it('should use custom highlight duration', () => {
      jest.useFakeTimers();

      scrollToMessage('test-123', {
        highlight: true,
        highlightDuration: 5000,
      });

      // Check highlight is active
      expect(mockElement.classList.contains('ring-2')).toBe(true);

      // Advance less than duration
      jest.advanceTimersByTime(3000);
      expect(mockElement.classList.contains('ring-2')).toBe(true);

      // Advance to full duration
      jest.advanceTimersByTime(2000);
      expect(mockElement.classList.contains('ring-2')).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('highlightMessage', () => {
    it('should add highlight classes to element', () => {
      highlightMessage(mockElement);

      expect(mockElement.classList.contains('ring-2')).toBe(true);
      expect(mockElement.classList.contains('ring-primary')).toBe(true);
      expect(mockElement.classList.contains('ring-offset-2')).toBe(true);
      expect(mockElement.classList.contains('transition-all')).toBe(true);
      expect(mockElement.classList.contains('duration-300')).toBe(true);
    });

    it('should remove highlight classes after duration', () => {
      jest.useFakeTimers();

      highlightMessage(mockElement, 3000);

      expect(mockElement.classList.contains('ring-2')).toBe(true);

      jest.advanceTimersByTime(3000);

      expect(mockElement.classList.contains('ring-2')).toBe(false);
      expect(mockElement.classList.contains('ring-primary')).toBe(false);
      expect(mockElement.classList.contains('ring-offset-2')).toBe(false);

      jest.useRealTimers();
    });

    it('should store timeout ID on element', () => {
      jest.useFakeTimers();

      highlightMessage(mockElement);

      expect((mockElement as any).__highlightTimeoutId).toBeDefined();

      jest.useRealTimers();
    });
  });

  describe('cancelHighlight', () => {
    it('should remove highlight classes immediately', () => {
      jest.useFakeTimers();

      highlightMessage(mockElement, 5000);
      expect(mockElement.classList.contains('ring-2')).toBe(true);

      cancelHighlight(mockElement);
      expect(mockElement.classList.contains('ring-2')).toBe(false);
      expect(mockElement.classList.contains('ring-primary')).toBe(false);
      expect(mockElement.classList.contains('ring-offset-2')).toBe(false);

      jest.useRealTimers();
    });

    it('should clear the timeout', () => {
      jest.useFakeTimers();

      highlightMessage(mockElement, 5000);
      const timeoutId = (mockElement as any).__highlightTimeoutId;
      expect(timeoutId).toBeDefined();

      cancelHighlight(mockElement);
      expect((mockElement as any).__highlightTimeoutId).toBeUndefined();

      // Verify timeout was cleared (classes shouldn't be removed again)
      jest.advanceTimersByTime(5000);
      // If timeout wasn't cleared, classes would try to be removed again
      // but since they're already removed, there should be no error

      jest.useRealTimers();
    });

    it('should handle elements without active highlight', () => {
      // Should not throw error
      expect(() => cancelHighlight(mockElement)).not.toThrow();
    });
  });

  describe('messageExists', () => {
    it('should return true for existing message', () => {
      expect(messageExists('test-123')).toBe(true);
    });

    it('should return false for non-existent message', () => {
      expect(messageExists('non-existent')).toBe(false);
    });
  });

  describe('multiple highlights', () => {
    it('should handle multiple highlights in sequence', () => {
      jest.useFakeTimers();

      const element1 = document.createElement('div');
      element1.id = 'message-msg1';
      document.body.appendChild(element1);

      const element2 = document.createElement('div');
      element2.id = 'message-msg2';
      document.body.appendChild(element2);

      highlightMessage(element1, 2000);
      highlightMessage(element2, 2000);

      expect(element1.classList.contains('ring-2')).toBe(true);
      expect(element2.classList.contains('ring-2')).toBe(true);

      jest.advanceTimersByTime(2000);

      expect(element1.classList.contains('ring-2')).toBe(false);
      expect(element2.classList.contains('ring-2')).toBe(false);

      jest.useRealTimers();
    });

    it('should handle re-highlighting the same element', () => {
      jest.useFakeTimers();

      highlightMessage(mockElement, 2000);
      expect(mockElement.classList.contains('ring-2')).toBe(true);

      // Re-highlight before first timeout completes
      jest.advanceTimersByTime(1000);
      highlightMessage(mockElement, 2000);

      // Should still be highlighted
      expect(mockElement.classList.contains('ring-2')).toBe(true);

      // Advance past first timeout (would have removed highlight)
      jest.advanceTimersByTime(1000);
      expect(mockElement.classList.contains('ring-2')).toBe(true);

      // Advance past second timeout
      jest.advanceTimersByTime(1000);
      expect(mockElement.classList.contains('ring-2')).toBe(false);

      jest.useRealTimers();
    });
  });
});
