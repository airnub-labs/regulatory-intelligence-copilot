/**
 * Public, browser-safe exports from reg-intel-core.
 *
 * These utilities avoid server-only dependencies so they can be safely imported
 * from client-side bundles (e.g., Next.js app router pages/components).
 */
export { DEFAULT_PROFILE_ID } from './profiles.js';
export { PROFILE_IDS, type ProfileId } from './types.js';
export { DEFAULT_JURISDICTION, SUPPORTED_JURISDICTIONS } from './constants.js';
