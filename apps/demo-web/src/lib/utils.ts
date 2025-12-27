import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Export scroll utilities for Phase 4 breadcrumb navigation
export {
  scrollToMessage,
  highlightMessage,
  cancelHighlight,
  messageExists,
  type ScrollToMessageOptions,
} from './utils/scroll-to-message';
