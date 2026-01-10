/**
 * E2E Test Fixtures Index
 *
 * Central export point for all test fixtures and helpers.
 * Import from here for cleaner imports in test files.
 *
 * @example
 * import { login, createConsoleCapture, DATATECH_USERS } from './fixtures';
 */

// Auth fixtures and helpers
export {
  login,
  loginWithRetry,
  logout,
  isAuthenticated,
  getCurrentUserName,
  getCurrentTenantName,
  navigateAsUser,
  clearSession,
  TEST_USERS,
  DATATECH_USERS,
  EMERALD_USERS,
  PERSONAL_USERS,
  ADMIN_USERS,
  type TestUser,
} from './auth';

// Console capture utilities
export {
  ConsoleCapture,
  createConsoleCapture,
  type CapturedConsoleMessage,
  type CapturedNetworkRequest,
  type ServerLogEntry,
} from './console-capture';

// Test helper functions
export {
  // Chat helpers
  getChatInput,
  sendChatMessage,
  sendFollowUpMessage,
  getAllMessages,
  assertResponseContains,
  getReferencedNodes,

  // Branching helpers
  editMessageToCreateBranch,
  getConversationPaths,
  switchToPath,
  getMessageCount,

  // Workspace helpers
  getWorkspaces,
  switchWorkspace,
  getCurrentWorkspaceName,

  // Cost analytics helpers
  goToCostAnalytics,
  getCostMetrics,
  assertWithinQuota,

  // Graph visualization helpers
  goToGraphVisualization,
  getHighlightedNodes,
  searchGraphNodes,

  // Multi-tenant helpers
  testDataTechAccess,
  testTenantIsolation,

  // Irish tax queries
  IRISH_TAX_QUERIES,
  testTaxQuery,

  // User shortcuts
  USERS_BY_TIER,
  USERS_BY_ROLE,

  // Wait helpers
  waitForPageReady,
  waitForChatReady,
  waitForAIResponse,

  // Assertions
  assertOnPage,
  assertErrorDisplayed,
  assertNoErrorDisplayed,
} from './test-helpers';
