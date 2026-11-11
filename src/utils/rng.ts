import { CRATES } from '../data/catalog';
import { RARITIES, RARITY_ORDER } from '../data/rarities';
import {
  CrateDefinition,
  DropHistoryItem,
  InventoryItem,
  RarityId,
  SkinDefinition,
  WearTier,
} from '../types/casino';

export function randomFloat(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] / 4294967296;
  }
  return Math.random();
}

export function randomId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(randomFloat() * 1e8).toString(36)}`;
}

export function generateSeedHash(): string {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(randomFloat() * chars.length)];
  }
  return out;
}

export function rollRarity(): RarityId {
  const roll = randomFloat() * 100;
  let cumulative = 0;
  for (const rarityId of RARITY_ORDER) {
    cumulative += RARITIES[rarityId].probability;
    if (roll < cumulative) {
      return rarityId;
    }
  }
  return 'commune';
}

export function rollSkinFromCrate(crate: CrateDefinition): SkinDefinition {
  const targetRarity = rollRarity();
  const candidates = crate.skins.filter((s) => s.rarity === targetRarity);
  if (candidates.length === 0) {
    return crate.skins[Math.floor(randomFloat() * crate.skins.length)];
  }
  return candidates[Math.floor(randomFloat() * candidates.length)];
}

export function generateWearAndFloat(): {
  wear: WearTier;
  floatVal: number;
  multiplier: number;
} {
  const f = Number((0.005 + randomFloat() * 0.89).toFixed(4));
  if (f < 0.08) {
    return { wear: 'Neuf d’usine', floatVal: f, multiplier: 1.22 };
  }
  if (f < 0.25) {
    return { wear: 'Très peu usé', floatVal: f, multiplier: 1.08 };
  }
  if (f < 0.58) {
    return { wear: 'Testé sur le terrain', floatVal: f, multiplier: 1.0 };
  }
  return { wear: 'Marqué par les combats', floatVal: f, multiplier: 0.88 };
}

export function createInventoryItem(
  crate: CrateDefinition,
  skin: SkinDefinition,
  source: 'ouverture' | 'upgrade' | 'contrat' = 'ouverture'
): InventoryItem {
  const { wear, floatVal, multiplier } = generateWearAndFloat();
  const value = Math.max(5, Math.round(skin.baseValue * multiplier));
  return {
    instanceId: randomId('skin'),
    skinId: skin.id,
    crateId: crate.id,
    crateName: crate.name,
    name: skin.name,
    weaponName: skin.weaponName,
    weaponClass: skin.weaponClass,
    rarity: skin.rarity,
    wear,
    floatVal,
    value,
    swatches: skin.swatches,
    tagline: skin.tagline,
    image: skin.image,
    obtainedAt: Date.now(),
    locked: false,
    source,
  };
}

/**
 * Generates a visual roulette strip where `winningIndex` is guaranteed to hold `winningSkin`.
 * Filler items use display-friendly weights (still predominantly Commune/Rare, with occasional
 * high-tier glimpses so the strip conveys the full crate spectrum).
 */
export function buildReelStrip(
  crate: CrateDefinition,
  winningSkin: SkinDefinition,
  stripLength = 54,
  winningIndex = 42
): SkinDefinition[] {
  const byRarity: Record<RarityId, SkinDefinition[]> = {
    commune: crate.skins.filter((s) => s.rarity === 'commune'),
    rare: crate.skins.filter((s) => s.rarity === 'rare'),
    mythique: crate.skins.filter((s) => s.rarity === 'mythique'),
    legendaire: crate.skins.filter((s) => s.rarity === 'legendaire'),
    secret: crate.skins.filter((s) => s.rarity === 'secret'),
  };

  const pickDisplaySkin = (): SkinDefinition => {
    const r = randomFloat() * 100;
    let bucket: RarityId = 'commune';
    if (r < 54) bucket = 'commune';
    else if (r < 80) bucket = 'rare';
    else if (r < 92) bucket = 'mythique';
    else if (r < 98.2) bucket = 'legendaire';
    else bucket = 'secret';

    const list = byRarity[bucket];
    if (!list.length) return crate.skins[0];
    return list[Math.floor(randomFloat() * list.length)];
  };

  const strip: SkinDefinition[] = [];
  for (let i = 0; i < stripLength; i++) {
    if (i === winningIndex) {
      strip.push(winningSkin);
    } else {
      strip.push(pickDisplaySkin());
    }
  }
  return strip;
}

const FICTIONAL_PLAYERS = [
  'Kaito_V',
  'NoxEmeraude',
  'Sora_94',
  'ValkyrFR',
  'JadeRunner',
  'Lumen_X',
  'Zephyr77',
  'MantisZero',
  'Lyra_K',
  'Orion_Bot',
  'Aether_22',
  'Boreal_S',
];

export function generateSimulatedDrop(): DropHistoryItem {
  const crate = CRATES[Math.floor(randomFloat() * CRATES.length)];
  // Slightly weighted toward interesting visible ticker drops, still mostly common/rare
  const skin = rollSkinFromCrate(crate);
  const playerName = FICTIONAL_PLAYERS[Math.floor(randomFloat() * FICTIONAL_PLAYERS.length)];
  return {
    id: randomId('drop'),
    playerName,
    isPlayer: false,
    crateName: crate.name,
    skinName: skin.name,
    weaponName: skin.weaponName,
    weaponClass: skin.weaponClass,
    rarity: skin.rarity,
    value: skin.baseValue,
    timestamp: Date.now(),
    seedHash: generateSeedHash(),
  };
}

export function formatCredits(amount: number): string {
  return `${Math.round(amount).toLocaleString('fr-FR')} CR`;
}

export function formatProbability(probability: number): string {
  if (Math.abs(Math.round(probability * 100) - probability * 100) < 1e-6) {
    return `${probability.toFixed(2)}%`;
  }
  if (Math.abs(Math.round(probability * 1000) - probability * 1000) < 1e-6) {
    return `${probability.toFixed(3)}%`;
  }
  return `${probability.toFixed(4)}%`;
}

export function getSkinProbabilityInCrate(crate: CrateDefinition, skin: SkinDefinition): number {
  const sameTierCount = crate.skins.filter((s) => s.rarity === skin.rarity).length || 1;
  return RARITIES[skin.rarity].probability / sameTierCount;
}
