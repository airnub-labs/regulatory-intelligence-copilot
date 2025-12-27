import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Re-export scroll utilities from reg-intel-ui package for backwards compatibility
// Note: Prefer importing directly from '@reg-copilot/reg-intel-ui' in new code
export {
  scrollToMessage,
  highlightMessage,
  cancelHighlight,
  messageExists,
  type ScrollToMessageOptions,
} from '@reg-copilot/reg-intel-ui';
