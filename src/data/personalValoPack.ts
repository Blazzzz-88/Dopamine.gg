import { CRATES } from './catalog';
import { InventoryItem } from '../types/casino';

export const PERSONAL_VALO_GRANT_KEY = 'dopamine_gg_personal_valo20_v1';
const PERSONAL_VALO_CRATE_IDS = ['protocole-radiant', 'pantheon-champions'] as const;

/**
 * Builds the 20 Valorant collection skins in Factory New condition for local dev sessions.
 */
export function buildPersonalValoItems(now = Date.now()): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const crateId of PERSONAL_VALO_CRATE_IDS) {
    const crate = CRATES.find((c) => c.id === crateId);
    if (!crate) continue;
    for (const skin of crate.skins) {
      items.push({
        instanceId: `personal_valo_${skin.id}`,
        skinId: skin.id,
        crateId: crate.id,
        crateName: crate.name,
        name: skin.name,
        weaponName: skin.weaponName,
        weaponClass: skin.weaponClass,
        rarity: skin.rarity,
        wear: 'Neuf d’usine',
        floatVal: 0.01,
        value: Math.max(5, Math.round(skin.baseValue * 1.22)),
        swatches: skin.swatches,
        tagline: skin.tagline,
        image: skin.image,
        obtainedAt: now + items.length,
        locked: false,
        source: 'ouverture',
      });
    }
  }
  return items;
}

/**
 * Merges any missing skins from the 20 Valorant skins into the given inventory
 * and expands inventoryCapacity cleanly in upgrade steps if needed.
 */
export function mergePersonalValoInventory(
  existingInventory: InventoryItem[],
  currentCapacity: number,
  upgradeStep = 5,
  now = Date.now()
): { inventory: InventoryItem[]; inventoryCapacity: number; addedCount: number } {
  const existingSkinIds = new Set(existingInventory.map((item) => item.skinId));
  const missingItems = buildPersonalValoItems(now).filter(
    (item) => !existingSkinIds.has(item.skinId)
  );
  if (missingItems.length === 0) {
    return {
      inventory: existingInventory,
      inventoryCapacity: currentCapacity,
      addedCount: 0,
    };
  }

  const nextInventory = [...missingItems, ...existingInventory];
  const minRequiredCapacity =
    nextInventory.length <= currentCapacity
      ? currentCapacity
      : Math.ceil(nextInventory.length / upgradeStep) * upgradeStep;

  return {
    inventory: nextInventory,
    inventoryCapacity: Math.max(currentCapacity, minRequiredCapacity),
    addedCount: missingItems.length,
  };
}
