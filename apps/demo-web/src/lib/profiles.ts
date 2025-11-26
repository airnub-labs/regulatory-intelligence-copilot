export const DEFAULT_PROFILE_ID = 'single-director';

export function normalizeProfileType(profileType?: string) {
  return (profileType || DEFAULT_PROFILE_ID).replace('_', '-');
}
