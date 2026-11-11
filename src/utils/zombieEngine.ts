import { InventoryItem, RarityId, WeaponClass } from '../types/casino';
import { resolveWeaponArchetype, WeaponArchetype } from './weapon3dBuilder';

export type ZombieTier = 'standard' | 'rapide' | 'colosse';

export interface ZombieTierMeta {
  tier: ZombieTier;
  label: string;
  maxHp: number;
  speed: number;
  scale: number;
  color: string;
  headColor: string;
  accentColor: string;
  minReward: number;
  maxReward: number;
  spawnWeight: number;
}

export const ZOMBIE_TIERS: Record<ZombieTier, ZombieTierMeta> = {
  standard: {
    tier: 'standard',
    label: 'Marcheur',
    maxHp: 90,
    speed: 2.3,
    scale: 1.0,
    color: '#22c55e',
    headColor: '#4ade80',
    accentColor: '#166534',
    minReward: 10,
    maxReward: 16,
    spawnWeight: 0.62,
  },
  rapide: {
    tier: 'rapide',
    label: 'Rôdeur',
    maxHp: 70,
    speed: 4.1,
    scale: 0.92,
    color: '#f59e0b',
    headColor: '#fbbf24',
    accentColor: '#92400e',
    minReward: 20,
    maxReward: 32,
    spawnWeight: 0.26,
  },
  colosse: {
    tier: 'colosse',
    label: 'Colosse Rare',
    maxHp: 220,
    speed: 1.65,
    scale: 1.28,
    color: '#ec4899',
    headColor: '#f472b6',
    accentColor: '#831843',
    minReward: 40,
    maxReward: 50,
    spawnWeight: 0.12,
  },
};

export interface WeaponCombatProfile {
  archetype: WeaponArchetype;
  automatic: boolean;
  damage: number;
  headshotMult: number;
  fireRateMs: number;
  magSize: number; // 0 = melee unlimited
  reloadMs: number;
  spreadRad: number;
  recoilKick: number;
  range: number;
  isMelee: boolean;
  suppressed: boolean;
  isSniper: boolean;
}

export function getWeaponCombatProfile(
  weaponClass: WeaponClass,
  weaponName: string,
  rarity: RarityId = 'commune'
): WeaponCombatProfile {
  const archetype = resolveWeaponArchetype(weaponClass, weaponName);
  const rarityDamageBonus =
    rarity === 'secret'
      ? 1.18
      : rarity === 'legendaire'
      ? 1.12
      : rarity === 'mythique'
      ? 1.08
      : rarity === 'rare'
      ? 1.04
      : 1.0;

  if (archetype === 'couteau' || archetype === 'karambit') {
    return {
      archetype,
      automatic: false,
      damage: Math.round(95 * rarityDamageBonus),
      headshotMult: 1.8,
      fireRateMs: archetype === 'karambit' ? 320 : 380,
      magSize: 0,
      reloadMs: 0,
      spreadRad: 0,
      recoilKick: 0.14,
      range: 4.6,
      isMelee: true,
      suppressed: false,
      isSniper: false,
    };
  }

  if (archetype === 'awp') {
    return {
      archetype,
      automatic: false,
      damage: Math.round(165 * rarityDamageBonus),
      headshotMult: 2.2,
      fireRateMs: 920,
      magSize: 10,
      reloadMs: 1450,
      spreadRad: 0.002,
      recoilKick: 0.22,
      range: 95,
      isMelee: false,
      suppressed: false,
      isSniper: true,
    };
  }

  if (archetype === 'pistolet') {
    return {
      archetype,
      automatic: false,
      damage: Math.round(46 * rarityDamageBonus),
      headshotMult: 2.1,
      fireRateMs: 210,
      magSize: 12,
      reloadMs: 950,
      spreadRad: 0.008,
      recoilKick: 0.12,
      range: 70,
      isMelee: false,
      suppressed: false,
      isSniper: false,
    };
  }

  if (archetype === 'mac10') {
    return {
      archetype,
      automatic: true,
      damage: Math.round(24 * rarityDamageBonus),
      headshotMult: 1.8,
      fireRateMs: 88,
      magSize: 32,
      reloadMs: 1100,
      spreadRad: 0.024,
      recoilKick: 0.065,
      range: 55,
      isMelee: false,
      suppressed: false,
      isSniper: false,
    };
  }

  if (archetype === 'ak47') {
    return {
      archetype,
      automatic: true,
      damage: Math.round(38 * rarityDamageBonus),
      headshotMult: 2.0,
      fireRateMs: 118,
      magSize: 30,
      reloadMs: 1250,
      spreadRad: 0.012,
      recoilKick: 0.105,
      range: 85,
      isMelee: false,
      suppressed: false,
      isSniper: false,
    };
  }

  // ar15 / ar15_sil
  return {
    archetype,
    automatic: true,
    damage: Math.round(33 * rarityDamageBonus),
    headshotMult: 1.95,
    fireRateMs: 102,
    magSize: 30,
    reloadMs: 1150,
    spreadRad: archetype === 'ar15_sil' ? 0.007 : 0.01,
    recoilKick: archetype === 'ar15_sil' ? 0.075 : 0.09,
    range: 85,
    isMelee: false,
    suppressed: archetype === 'ar15_sil',
    isSniper: false,
  };
}

export function rollZombieTier(wave = 1, rng = Math.random): ZombieTier {
  const rareBoost = Math.min(0.14, (wave - 1) * 0.02);
  const wColosse = ZOMBIE_TIERS.colosse.spawnWeight + rareBoost;
  const wRapide = ZOMBIE_TIERS.rapide.spawnWeight + rareBoost * 0.5;
  const wStd = Math.max(0.3, ZOMBIE_TIERS.standard.spawnWeight - rareBoost * 1.5);
  const total = wColosse + wRapide + wStd;
  const r = rng() * total;
  if (r < wColosse) return 'colosse';
  if (r < wColosse + wRapide) return 'rapide';
  return 'standard';
}

/**
 * Computes integer credit reward strictly within [10, 50] depending on zombie rarity.
 */
export function computeZombieReward(tier: ZombieTier, rng = Math.random): number {
  const meta = ZOMBIE_TIERS[tier];
  const raw = Math.round(meta.minReward + rng() * (meta.maxReward - meta.minReward));
  return Math.max(10, Math.min(50, raw));
}

/**
 * Returns credits awarded to the casino balance upon leaving the Zombie FPS run.
 * If the player dies during the run, all farmed session loot is lost (0 CR).
 */
export function resolveZombieExitPayout(isDead: boolean, sessionEarned: number): number {
  if (isDead) return 0;
  return Math.max(0, Math.round(sessionEarned));
}

export type ZombieSlot = 1 | 2;

export interface ZombieLoadout {
  primary: InventoryItem;
  knife: InventoryItem | null;
  initialSlot: ZombieSlot;
}

/**
 * Resolves the 2-slot Zombie FPS loadout:
 * - Slot 1 (key 1): equipped primary firearm (or first owned firearm, else fallback starter)
 * - Slot 2 (key 2): equipped knife if the player selected one (optional)
 */
export function resolveZombieLoadout(
  inventory: InventoryItem[],
  equippedWeaponId: string | null | undefined,
  equippedKnifeId: string | null | undefined,
  fallbackPrimary: InventoryItem
): ZombieLoadout {
  const weaponMatch = equippedWeaponId
    ? inventory.find((it) => it.instanceId === equippedWeaponId) ?? null
    : null;
  const knifeMatch = equippedKnifeId
    ? inventory.find((it) => it.instanceId === equippedKnifeId && it.weaponClass === 'lame') ?? null
    : null;

  const explicitPrimary =
    weaponMatch && weaponMatch.weaponClass !== 'lame' ? weaponMatch : null;
  const legacyKnife =
    weaponMatch && weaponMatch.weaponClass === 'lame' ? weaponMatch : null;
  const knife = knifeMatch ?? legacyKnife ?? null;

  const primary =
    explicitPrimary ?? inventory.find((it) => it.weaponClass !== 'lame') ?? fallbackPrimary;

  // Start on knife (Slot 2) only if player equipped a knife without choosing a primary firearm
  const initialSlot: ZombieSlot = !explicitPrimary && knife ? 2 : 1;

  return { primary, knife, initialSlot };
}

export function pickInitialEquippedWeapon(
  inventory: InventoryItem[],
  equippedWeaponId?: string | null,
  equippedKnifeId?: string | null
): InventoryItem | null {
  if (inventory.length === 0) return null;
  const weaponMatch = equippedWeaponId
    ? inventory.find((it) => it.instanceId === equippedWeaponId) ?? null
    : null;
  const knifeMatch = equippedKnifeId
    ? inventory.find((it) => it.instanceId === equippedKnifeId && it.weaponClass === 'lame') ?? null
    : null;
  if (weaponMatch && weaponMatch.weaponClass !== 'lame') return weaponMatch;
  if (knifeMatch) return knifeMatch;
  if (weaponMatch) return weaponMatch;
  // Prefer firearms first for FPS comfort if no explicit Inventory selection was made
  const firearm = inventory.find((it) => it.weaponClass !== 'lame');
  return firearm ?? inventory[0];
}

export const FPS_PITCH_LIMIT = 1.35;
export const FPS_BASE_FOV = 62;
export const FPS_MOUSE_SENSITIVITY = 0.0021;
export const FPS_MAX_EVENT_DELTA_PX = 220;
export const FPS_GLITCH_SPIKE_PX = 650;

export function wrapYawAngle(yaw: number): number {
  const twoPi = Math.PI * 2;
  let wrapped = (yaw + Math.PI) % twoPi;
  if (wrapped < 0) wrapped += twoPi;
  return wrapped - Math.PI;
}

export interface FpsMouseDeltaResult {
  yaw: number;
  pitch: number;
  ignoredSpike: boolean;
}

/**
 * Applies FPS mouse deltas safely during rapid flicks:
 * rejects browser cursor-warp teleport spikes (> 650 px in a single event),
 * clamps large raw steps smoothly, scales sensitivity to active FOV, and avoids gimbal lock.
 */
export function applyFpsMouseDelta(
  currentYaw: number,
  currentPitch: number,
  rawDx: number,
  rawDy: number,
  activeFov = FPS_BASE_FOV,
  sensitivity = FPS_MOUSE_SENSITIVITY,
  spikeLimitPx = FPS_GLITCH_SPIKE_PX
): FpsMouseDeltaResult {
  if (!Number.isFinite(rawDx) || !Number.isFinite(rawDy)) {
    return { yaw: currentYaw, pitch: currentPitch, ignoredSpike: true };
  }
  if (Math.abs(rawDx) > spikeLimitPx || Math.abs(rawDy) > spikeLimitPx) {
    return { yaw: currentYaw, pitch: currentPitch, ignoredSpike: true };
  }

  const dx = Math.max(-FPS_MAX_EVENT_DELTA_PX, Math.min(FPS_MAX_EVENT_DELTA_PX, rawDx));
  const dy = Math.max(-FPS_MAX_EVENT_DELTA_PX, Math.min(FPS_MAX_EVENT_DELTA_PX, rawDy));
  const fovScale = Math.max(0.25, Math.min(1.5, activeFov / FPS_BASE_FOV));
  const step = sensitivity * fovScale;

  const nextYaw = wrapYawAngle(currentYaw - dx * step);
  const nextPitch = Math.max(
    -FPS_PITCH_LIMIT,
    Math.min(FPS_PITCH_LIMIT, currentPitch - dy * step)
  );

  return { yaw: nextYaw, pitch: nextPitch, ignoredSpike: false };
}
