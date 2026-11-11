import { CRATES } from '../data/catalog';
import { RARITY_ORDER } from '../data/rarities';
import {
  CrateDefinition,
  InventoryItem,
  RarityId,
  SkinDefinition,
} from '../types/casino';
import { randomFloat } from './rng';

export const TRADE_UP_REQUIRED_COUNT = 5;

export const TRADE_UP_INPUT_RARITIES: RarityId[] = [
  'commune',
  'rare',
  'mythique',
  'legendaire',
];

export interface TradeUpCandidate {
  crate: CrateDefinition;
  skin: SkinDefinition;
  probability: number; // Percentage 0..100
}

export interface CrateWeightSummary {
  crate: CrateDefinition;
  count: number;
  probability: number; // Percentage 0..100
}

/**
 * Returns the next rarity tier up, or null when the rarity is already 'secret'.
 */
export function getNextRarity(rarity: RarityId): RarityId | null {
  const idx = RARITY_ORDER.indexOf(rarity);
  if (idx === -1 || idx >= RARITY_ORDER.length - 1) return null;
  return RARITY_ORDER[idx + 1];
}

/**
 * Validates whether a selection of items forms a legal 5-for-1 trade-up contract.
 */
export function canExecuteContract(selectedItems: InventoryItem[]): boolean {
  if (selectedItems.length !== TRADE_UP_REQUIRED_COUNT) return false;
  const uniqueIds = new Set(selectedItems.map((it) => it.instanceId));
  if (uniqueIds.size !== TRADE_UP_REQUIRED_COUNT) return false;

  const baseRarity = selectedItems[0].rarity;
  if (!getNextRarity(baseRarity)) return false;

  if (!selectedItems.every((it) => !it.locked && it.rarity === baseRarity)) {
    return false;
  }

  return getTradeUpPool(selectedItems).length > 0;
}

/**
 * Summarizes the weight (in %) contributed by each crate represented in the selection.
 */
export function getTradeUpCrateBreakdown(
  selectedItems: InventoryItem[]
): CrateWeightSummary[] {
  if (selectedItems.length === 0) return [];
  const baseRarity = selectedItems[0].rarity;
  if (!getNextRarity(baseRarity)) return [];
  if (!selectedItems.every((it) => it.rarity === baseRarity)) return [];

  const counts = new Map<string, number>();
  for (const item of selectedItems) {
    counts.set(item.crateId, (counts.get(item.crateId) ?? 0) + 1);
  }

  const total = selectedItems.length;
  const summaries: CrateWeightSummary[] = [];

  for (const [crateId, count] of counts.entries()) {
    const crate = CRATES.find((c) => c.id === crateId);
    if (!crate) continue;
    summaries.push({
      crate,
      count,
      probability: (count / total) * 100,
    });
  }

  return summaries.sort((a, b) => b.probability - a.probability || b.crate.price - a.crate.price);
}

/**
 * Computes all possible next-rarity skins and their exact drop probabilities
 * based on the crates of the selected input items.
 */
export function getTradeUpPool(selectedItems: InventoryItem[]): TradeUpCandidate[] {
  if (selectedItems.length === 0) return [];
  const inputRarity = selectedItems[0].rarity;
  const targetRarity = getNextRarity(inputRarity);
  if (!targetRarity) return [];
  if (!selectedItems.every((it) => it.rarity === inputRarity)) return [];

  const breakdown = getTradeUpCrateBreakdown(selectedItems);
  const pool: TradeUpCandidate[] = [];

  for (const { crate, probability: cratePct } of breakdown) {
    const matchingSkins = crate.skins.filter((s) => s.rarity === targetRarity);
    if (matchingSkins.length === 0) continue;

    const perSkinPct = cratePct / matchingSkins.length;
    for (const skin of matchingSkins) {
      pool.push({
        crate,
        skin,
        probability: perSkinPct,
      });
    }
  }

  return pool.sort(
    (a, b) => b.probability - a.probability || b.skin.baseValue - a.skin.baseValue
  );
}

/**
 * Randomly selects one outcome skin from the contract pool using exact crate weights.
 */
export function rollTradeUpOutcome(
  selectedItems: InventoryItem[]
): { crate: CrateDefinition; skin: SkinDefinition } | null {
  if (!canExecuteContract(selectedItems)) return null;
  const pool = getTradeUpPool(selectedItems);
  if (pool.length === 0) return null;

  const roll = randomFloat() * 100;
  let cumulative = 0;
  for (const entry of pool) {
    cumulative += entry.probability;
    if (roll < cumulative) {
      return { crate: entry.crate, skin: entry.skin };
    }
  }

  const last = pool[pool.length - 1];
  return { crate: last.crate, skin: last.skin };
}

/**
 * Builds a roulette strip containing ONLY skins of the contract's target rarity
 * from the selected crates, placing `winningSkin` strictly at `winningIndex`.
 */
export function buildContractReelStrip(
  pool: TradeUpCandidate[],
  winningSkin: SkinDefinition,
  stripLength = 54,
  winningIndex = 42
): SkinDefinition[] {
  if (pool.length === 0) {
    return Array.from({ length: stripLength }, () => winningSkin);
  }

  const uniqueSkinCount = new Set(pool.map((c) => c.skin.id)).size;

  const pickWeightedSkin = (avoidSkinId?: string): SkinDefinition => {
    let chosen = pool[pool.length - 1].skin;
    const maxAttempts = uniqueSkinCount > 1 ? 4 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const r = randomFloat() * 100;
      let cumulative = 0;
      for (const entry of pool) {
        cumulative += entry.probability;
        if (r < cumulative) {
          chosen = entry.skin;
          break;
        }
      }
      if (chosen.id !== avoidSkinId) break;
    }
    return chosen;
  };

  const strip: SkinDefinition[] = [];
  for (let i = 0; i < stripLength; i++) {
    if (i === winningIndex) {
      strip.push(winningSkin);
    } else {
      strip.push(pickWeightedSkin(strip[i - 1]?.id));
    }
  }

  if (uniqueSkinCount > 1) {
    if (winningIndex > 0 && strip[winningIndex - 1]?.id === winningSkin.id) {
      strip[winningIndex - 1] = pickWeightedSkin(winningSkin.id);
    }
    if (winningIndex + 1 < stripLength && strip[winningIndex + 1]?.id === winningSkin.id) {
      strip[winningIndex + 1] = pickWeightedSkin(winningSkin.id);
    }
  }

  return strip;
}

/**
 * Builds an idle preview strip strictly containing skins of `targetRarity` across the catalog.
 */
export function buildDefaultRarityPreviewStrip(
  targetRarity: RarityId,
  stripLength = 54
): SkinDefinition[] {
  const candidates = CRATES.flatMap((crate) =>
    crate.skins.filter((skin) => skin.rarity === targetRarity)
  );
  if (candidates.length === 0) return [];
  return Array.from(
    { length: stripLength },
    (_, idx) => candidates[idx % candidates.length]
  );
}

/**
 * Auto-selects up to 5 unlocked items of `inputRarity`, prioritizing items from the same crate.
 */
export function autoPickContractItemIds(
  unlockedItems: InventoryItem[],
  inputRarity: RarityId,
  currentSelectedIds: string[],
  crateFilterId: string | 'all' = 'all'
): string[] {
  const eligible = unlockedItems.filter(
    (it) =>
      !it.locked &&
      it.rarity === inputRarity &&
      (crateFilterId === 'all' || it.crateId === crateFilterId)
  );

  const eligibleById = new Map(eligible.map((it) => [it.instanceId, it]));
  const pickedIds: string[] = [];
  const pickedSet = new Set<string>();

  for (const id of currentSelectedIds) {
    if (pickedIds.length >= TRADE_UP_REQUIRED_COUNT) break;
    if (eligibleById.has(id) && !pickedSet.has(id)) {
      pickedIds.push(id);
      pickedSet.add(id);
    }
  }

  if (pickedIds.length >= TRADE_UP_REQUIRED_COUNT) return pickedIds;

  // Determine preferred crate (already picked crate or crate with most available items)
  let preferredCrateId: string | null =
    crateFilterId !== 'all' ? crateFilterId : null;

  if (!preferredCrateId && pickedIds.length > 0) {
    preferredCrateId = eligibleById.get(pickedIds[0])?.crateId ?? null;
  }

  if (!preferredCrateId && eligible.length > 0) {
    const counts = new Map<string, number>();
    for (const item of eligible) {
      counts.set(item.crateId, (counts.get(item.crateId) ?? 0) + 1);
    }
    let bestCount = -1;
    for (const [cid, count] of counts.entries()) {
      if (count > bestCount) {
        bestCount = count;
        preferredCrateId = cid;
      }
    }
  }

  // First pass: fill from preferred crate
  if (preferredCrateId) {
    for (const item of eligible) {
      if (pickedIds.length >= TRADE_UP_REQUIRED_COUNT) break;
      if (item.crateId === preferredCrateId && !pickedSet.has(item.instanceId)) {
        pickedIds.push(item.instanceId);
        pickedSet.add(item.instanceId);
      }
    }
  }

  // Second pass: fill remaining slots from any crate if needed
  if (crateFilterId === 'all') {
    for (const item of eligible) {
      if (pickedIds.length >= TRADE_UP_REQUIRED_COUNT) break;
      if (!pickedSet.has(item.instanceId)) {
        pickedIds.push(item.instanceId);
        pickedSet.add(item.instanceId);
      }
    }
  }

  return pickedIds;
}
