export type ProfileId = string;

export const DEFAULT_PROFILE_ID: ProfileId = 'single-director';

export function normalizeProfileType(profileType?: string | null): ProfileId {
  if (!profileType) return DEFAULT_PROFILE_ID;

  const normalized = profileType.trim().toLowerCase().replace(/[_\s]+/g, '-');
  return normalized || DEFAULT_PROFILE_ID;
}
