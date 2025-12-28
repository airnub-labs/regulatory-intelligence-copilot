/**
 * Vitest setup file for reg-intel-ui tests
 */

import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
// Using type assertion because @testing-library/jest-dom matchers are compatible
// with Vitest but the type signatures differ slightly. The two-step assertion
// (via unknown) is necessary because the types don't perfectly overlap.
expect.extend(matchers as unknown as Parameters<typeof expect.extend>[0]);

// Cleanup after each test
afterEach(() => {
  cleanup();
});
