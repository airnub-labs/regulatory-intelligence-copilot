/**
 * Scroll to Message Utilities
 *
 * Provides utilities for scrolling to specific messages and highlighting them.
 * Used by breadcrumb navigation (Phase 4) to jump to branch point messages.
 */

export interface ScrollToMessageOptions {
  /** Scroll behavior (default: 'smooth') */
  behavior?: ScrollBehavior;
  /** Vertical alignment (default: 'center') */
  block?: ScrollLogicalPosition;
  /** Horizontal alignment (default: 'nearest') */
  inline?: ScrollLogicalPosition;
  /** Whether to highlight the message after scrolling (default: false) */
  highlight?: boolean;
  /** Duration of highlight in milliseconds (default: 2000) */
  highlightDuration?: number;
}

/**
 * Scrolls to a message by its ID and optionally highlights it.
 *
 * @param messageId - The ID of the message to scroll to
 * @param options - Scroll and highlight options
 * @returns true if message was found and scrolled to, false otherwise
 *
 * @example
 * ```typescript
 * // Scroll to message with smooth animation
 * scrollToMessage('msg-123');
 *
 * // Scroll and highlight for 3 seconds
 * scrollToMessage('msg-123', {
 *   highlight: true,
 *   highlightDuration: 3000
 * });
 * ```
 */
export function scrollToMessage(
  messageId: string,
  options: ScrollToMessageOptions = {}
): boolean {
  const {
    behavior = 'smooth',
    block = 'center',
    inline = 'nearest',
    highlight = false,
    highlightDuration = 2000,
  } = options;

  const messageElement = document.getElementById(`message-${messageId}`);

  if (!messageElement) {
    console.warn(`Message element not found: ${messageId}`);
    return false;
  }

  // Scroll to the message
  messageElement.scrollIntoView({
    behavior,
    block,
    inline,
  });

  // Optionally highlight the message
  if (highlight) {
    highlightMessage(messageElement, highlightDuration);
  }

  return true;
}

/**
 * Highlights a message element with a ring animation.
 *
 * @param element - The DOM element to highlight
 * @param duration - How long to show the highlight (default: 2000ms)
 *
 * @example
 * ```typescript
 * const messageEl = document.getElementById('message-123');
 * if (messageEl) {
 *   highlightMessage(messageEl, 3000);
 * }
 * ```
 */
export function highlightMessage(
  element: HTMLElement,
  duration: number = 2000
): void {
  // Add highlight classes
  element.classList.add(
    'ring-2',
    'ring-primary',
    'ring-offset-2',
    'transition-all',
    'duration-300'
  );

  // Store a reference to the timeout so we can clean it up if needed
  const timeoutId = setTimeout(() => {
    element.classList.remove(
      'ring-2',
      'ring-primary',
      'ring-offset-2'
    );
  }, duration);

  // Store timeout ID on the element for potential cleanup
  (element as any).__highlightTimeoutId = timeoutId;
}

/**
 * Cancels any active highlight on a message element.
 *
 * @param element - The DOM element to cancel highlight for
 *
 * @example
 * ```typescript
 * const messageEl = document.getElementById('message-123');
 * if (messageEl) {
 *   cancelHighlight(messageEl);
 * }
 * ```
 */
export function cancelHighlight(element: HTMLElement): void {
  const timeoutId = (element as any).__highlightTimeoutId;

  if (timeoutId) {
    clearTimeout(timeoutId);
    delete (element as any).__highlightTimeoutId;
  }

  element.classList.remove(
    'ring-2',
    'ring-primary',
    'ring-offset-2'
  );
}

/**
 * Checks if a message element exists in the DOM.
 *
 * @param messageId - The ID of the message to check
 * @returns true if the message element exists, false otherwise
 *
 * @example
 * ```typescript
 * if (messageExists('msg-123')) {
 *   scrollToMessage('msg-123');
 * }
 * ```
 */
export function messageExists(messageId: string): boolean {
  return document.getElementById(`message-${messageId}`) !== null;
}
