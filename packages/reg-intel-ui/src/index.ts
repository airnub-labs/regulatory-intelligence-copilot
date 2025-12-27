/**
 * @reg-copilot/reg-intel-ui
 *
 * Reusable React UI components for conversation paths, branching, and merging.
 * Designed to be consumed by any Next.js application.
 *
 * @example
 * ```tsx
 * import {
 *   ConversationPathProvider,
 *   useConversationPaths,
 *   PathSelector,
 *   BranchButton,
 *   BranchDialog,
 *   MergeDialog,
 * } from '@reg-copilot/reg-intel-ui';
 *
 * function App() {
 *   return (
 *     <ConversationPathProvider
 *       conversationId="conv-123"
 *       apiClient={myApiClient}
 *     >
 *       <PathSelector />
 *       <MessageList />
 *     </ConversationPathProvider>
 *   );
 * }
 * ```
 */

// Hooks and Providers
export {
  ConversationPathProvider,
  useConversationPaths,
  useHasPathProvider,
  type ConversationPathProviderProps,
} from './hooks/index.js';

// Components
export {
  PathSelector,
  PathBreadcrumbs,
  BranchButton,
  BranchDialog,
  MergeDialog,
  VersionNavigator,
  type PathSelectorProps,
  type PathBreadcrumbsProps,
  type NavigateOptions,
  type BranchButtonProps,
  type BranchDialogProps,
  type MergeDialogProps,
  type VersionNavigatorProps,
} from './components/index.js';

// Types
export type {
  PathApiClient,
  PathState,
  PathActions,
  PathContextValue,
  CreatePathInput,
  UpdatePathInput,
  BranchInput,
  BranchResult,
  MergeInput,
  MergeResult,
  MergePreview,
  PreviewMergeInput,
  PathMessage,
  ClientPath,
  MergeMode,
  PathSelectorVariant,
  ButtonVariant,
  ButtonSize,
  BaseComponentProps,
} from './types.js';

// Utilities
export { cn, formatRelativeDate, truncate, stringToColor, buildPathTree, flattenPathTree } from './utils.js';

// Scroll to Message Utilities (Phase 3)
export {
  scrollToMessage,
  highlightMessage,
  cancelHighlight,
  messageExists,
  type ScrollToMessageOptions,
} from './utils/scroll-to-message.js';
