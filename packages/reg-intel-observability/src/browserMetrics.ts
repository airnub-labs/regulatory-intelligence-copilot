/**
 * Browser-Safe Metrics - Client-side metric recording
 *
 * This module provides UI/UX metrics that are safe to use in browser/client components.
 * It only imports from @opentelemetry/api which is browser-compatible.
 *
 * IMPORTANT: This file should NOT import any Node.js-specific modules or files that use them.
 */

// Re-export only the UI metric recording functions (no server-side dependencies)
export {
  initUiMetrics,
  recordBreadcrumbNavigate,
  recordBranchCreate,
  recordPathSwitch,
  recordMergeExecute,
  recordMergePreview,
  recordMessageScroll,
  recordMessageEdit,
} from './uiMetrics.js';
