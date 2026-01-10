/**
 * E2E Test Fixtures Index for Copilot Admin
 *
 * Central export point for all test fixtures and helpers.
 */

// Auth fixtures and helpers
export {
  login,
  loginWithRetry,
  logout,
  isAuthenticated,
  getCurrentUserName,
  clearSession,
  navigateAsUser,
  ADMIN_USERS,
  USERS_BY_ROLE,
  USERS_BY_LOCATION,
  ALL_ADMIN_USERS,
  type TestAdminUser,
} from './auth';

// Console capture utilities
export {
  ConsoleCapture,
  createConsoleCapture,
  type CapturedConsoleMessage,
  type CapturedNetworkRequest,
} from './console-capture';
