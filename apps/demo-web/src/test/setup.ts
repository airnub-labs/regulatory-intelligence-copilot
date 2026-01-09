/**
 * Vitest setup file
 * Runs before all tests
 */

import { vi } from 'vitest';

// Mock the component that imports browser metrics to avoid module resolution issues
// This is needed because @reg-copilot/reg-intel-observability/browser subpath export
// cannot be resolved in the test environment
vi.mock('@/components/chat/path-breadcrumb-nav', () => ({
  PathBreadcrumbNav: () => null,
}));

// Mock theme components to avoid ThemeProvider requirement in tests
vi.mock('@/components/theme/theme-toggle', () => ({
  ThemeToggle: () => null,
}));

// Mock TenantSwitcher to avoid Supabase dependency in tests
vi.mock('@/components/TenantSwitcher', () => ({
  default: () => null,
  TenantSwitcher: () => null,
}));

// Mock client telemetry to provide both createClientTelemetry and useClientTelemetry
vi.mock('@/lib/clientTelemetry', () => {
  const mockTelemetry = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    withRequest: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
    newRequestId: vi.fn(() => 'test-request-id'),
  };
  return {
    createClientTelemetry: () => mockTelemetry,
    useClientTelemetry: () => mockTelemetry,
  };
});
