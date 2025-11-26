import { PROFILE_IDS, type ProfileId } from './types.js';

export const DEFAULT_PROFILE_ID: ProfileId = 'single-director';

export function normalizeProfileType(profileType?: string | null): ProfileId {
  if (!profileType) return DEFAULT_PROFILE_ID;

  const normalized = profileType.trim().toLowerCase().replace(/[_\s]+/g, '-');

  return (PROFILE_IDS as readonly string[]).includes(normalized)
    ? (normalized as ProfileId)
    : DEFAULT_PROFILE_ID;
}
