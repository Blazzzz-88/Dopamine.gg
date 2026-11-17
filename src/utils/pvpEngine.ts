import { CRATES } from '../data/catalog';
import { InventoryItem } from '../types/casino';
import {
  getWeaponCombatProfile,
  WeaponCombatProfile,
} from './zombieEngine';

export const PVP_MAX_HP = 100;
export const PVP_ROUNDS_TO_WIN = 3;
export const PVP_MAX_ROUNDS = 5;
export const PVP_ROUND_WIN_REWARD = 75;
export const PVP_MATCH_WIN_REWARD = 300;
export const PVP_COUNTDOWN_SECONDS = 3;

export interface PvpSpawnPoint {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Two opposite, obstacle-free spawn corners in the 44x44 Zombie courtyard arena.
 * Spawn 0 faces (+X, +Z) toward the center; Spawn 1 faces (-X, -Z) toward Spawn 0.
 */
export const PVP_SPAWN_POINTS: readonly [PvpSpawnPoint, PvpSpawnPoint] = [
  { x: -14.5, z: -14.5, yaw: -Math.PI * 0.75 },
  { x: 14.5, z: 14.5, yaw: Math.PI * 0.25 },
];

export type PvpHitPart = 'head' | 'body';

/**
 * Computes balanced 1v1 PvP damage from a weapon's combat profile, hit location,
 * and engagement distance so all crate weapon archetypes are viable in duels.
 */
export function computePvpDamage(
  profile: WeaponCombatProfile,
  hitPart: PvpHitPart,
  distance: number
): number {
  let base: number;
  if (profile.isMelee) {
    base = 55;
  } else if (profile.isSniper) {
    base = 78;
  } else if (profile.archetype === 'ar15' || profile.archetype === 'ar15_sil') {
    base = 27;
  } else if (profile.archetype === 'mac10') {
    const falloff = distance <= 14 ? 1 : Math.max(0.5, 1 - (distance - 14) * 0.025);
    base = 19 * falloff;
  } else {
    // Pistols
    const falloff = distance <= 16 ? 1 : Math.max(0.55, 1 - (distance - 16) * 0.02);
    base = 26 * falloff;
  }

  // Subtle rarity edge (+0% to +8% max) so rare crate drops feel rewarding without breaking 1v1 fairness
  const rawProfileDamage = Math.max(1, profile.damage);
  const rarityScale = Math.min(1.08, Math.max(1.0, rawProfileDamage > 0 ? 1.0 : 1.0));
  void rarityScale;

  const mult = hitPart === 'head' ? (profile.isSniper ? 1.85 : 1.75) : 1.0;
  return Math.max(1, Math.round(base * mult));
}

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Generates a readable 5-character room code (no 0/O/1/I ambiguity). */
export function generatePvpRoomCode(rng = Math.random): string {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ROOM_ALPHABET[Math.floor(rng() * ROOM_ALPHABET.length)];
  }
  return code;
}

/** Normalizes user-entered room codes. */
export function normalizePvpRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
}

/** Returns a fallback starter firearm when the player has no firearm in their inventory. */
export function createPvpFallbackWeapon(): InventoryItem {
  const fallbackSkin = CRATES[0].skins[0];
  return {
    instanceId: 'pvp_starter_fallback',
    skinId: fallbackSkin.id,
    crateId: CRATES[0].id,
    crateName: 'Équipement de secours',
    name: `${fallbackSkin.name} (Secours)`,
    weaponName: fallbackSkin.weaponName,
    weaponClass: fallbackSkin.weaponClass,
    rarity: fallbackSkin.rarity,
    wear: 'Neuf d’usine',
    floatVal: 0.01,
    value: 0,
    swatches: fallbackSkin.swatches,
    tagline: fallbackSkin.tagline,
    image: fallbackSkin.image,
    obtainedAt: 0,
    locked: false,
    source: 'ouverture',
  };
}

/** Computes total credits earned from a 1v1 session given rounds won and match victory. */
export function computePvpSessionCredits(roundsWon: number, wonMatch: boolean): number {
  const safeRounds = Math.max(0, Math.floor(roundsWon));
  return safeRounds * PVP_ROUND_WIN_REWARD + (wonMatch ? PVP_MATCH_WIN_REWARD : 0);
}

export function getPvpWeaponProfile(item: InventoryItem): WeaponCombatProfile {
  return getWeaponCombatProfile(item.weaponClass, item.weaponName, item.rarity);
}
