import type { Method } from '../calculations/profit.ts';

export const skillNames = [
  'Attack', 'Defence', 'Strength', 'Hitpoints', 'Ranged', 'Prayer', 'Magic',
  'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting',
  'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer', 'Farming',
  'Runecraft', 'Hunter', 'Construction', 'Sailing',
] as const;
export type SkillName = (typeof skillNames)[number];
export type SkillLevels = Partial<Record<SkillName, number>>;

export interface PlayerProfile {
  username: string;
  displayName: string;
  levels: SkillLevels;
  snapshotAt: string;
  fetchedAt: number;
}

export const playerStorageKey = 'afk-player-v1';
export interface SavedPlayer {
  version: 1;
  profile: PlayerProfile;
  enabled: boolean;
}

export function normalizeRsn(value: string): string {
  return value.replace(/_/g, ' ').trim();
}

export function isValidRsn(value: string): boolean {
  return /^[a-zA-Z0-9 -]{1,12}$/.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function readPlayerResponse(value: unknown, username: string, fetchedAt: number): PlayerProfile {
  if (!isRecord(value) || typeof value.username !== 'string'
    || normalizeRsn(value.username).toLowerCase() !== username
    || typeof value.displayName !== 'string' || !isValidRsn(value.displayName)
    || normalizeRsn(value.displayName).toLowerCase() !== username
    || !isRecord(value.latestSnapshot) || !validDate(value.latestSnapshot.createdAt)
    || !isRecord(value.latestSnapshot.data) || !isRecord(value.latestSnapshot.data.skills)) {
    throw new Error('No usable levels were returned for this player. They may be unranked or unavailable on the hiscores.');
  }
  const skills = value.latestSnapshot.data.skills;
  const levels: SkillLevels = {};
  for (const skill of skillNames) {
    const entry = skills[skill === 'Runecraft' ? 'runecrafting' : skill.toLowerCase()];
    if (isRecord(entry) && typeof entry.level === 'number' && Number.isInteger(entry.level)
      && entry.level >= 1 && entry.level <= 126) levels[skill] = Math.min(entry.level, 99);
  }
  if (Object.keys(levels).length === 0) throw new Error('This player has no usable hiscores levels yet. Try again after logging out of OSRS.');
  return { username, displayName: value.displayName, levels, snapshotAt: value.latestSnapshot.createdAt, fetchedAt };
}

export function readSavedPlayer(value: unknown): SavedPlayer | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.enabled !== 'boolean' || !isRecord(value.profile)) return null;
  const profile = value.profile;
  if (typeof profile.username !== 'string' || !isValidRsn(profile.username)
    || normalizeRsn(profile.username).toLowerCase() !== profile.username
    || typeof profile.displayName !== 'string' || !isValidRsn(profile.displayName)
    || normalizeRsn(profile.displayName).toLowerCase() !== profile.username
    || !validDate(profile.snapshotAt) || typeof profile.fetchedAt !== 'number'
    || !Number.isFinite(profile.fetchedAt) || profile.fetchedAt < 0 || !isRecord(profile.levels)) return null;
  const levels: SkillLevels = {};
  for (const skill of skillNames) {
    const level = profile.levels[skill];
    if (level === undefined) continue;
    if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 99) return null;
    levels[skill] = level;
  }
  if (Object.keys(levels).length === 0) return null;
  return {
    version: 1, enabled: value.enabled,
    profile: { username: profile.username, displayName: profile.displayName, levels, snapshotAt: profile.snapshotAt, fetchedAt: profile.fetchedAt },
  };
}

export function meetsSkillRequirements(method: Method, levels: SkillLevels): boolean {
  // The existing Combat 1 category has no meaningful skill-level gate.
  if (method.skill !== 'Combat' || method.level > 1) {
    const level = levels[method.skill as SkillName];
    if (level !== undefined && level < method.level) return false;
  }
  return Object.entries(method.additionalSkillRequirements ?? {}).every(([skill, required]) => {
    const level = levels[skill as SkillName];
    return level === undefined || level >= required;
  });
}
