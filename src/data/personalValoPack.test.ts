// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildPersonalValoItems, mergePersonalValoInventory } from './personalValoPack';
import { createInitialState, loadPersistedState } from '../utils/storage';

describe('Pack personnel des 20 skins Valorant (hors .zip)', () => {
  it('construit exactement les 20 skins uniques des deux caisses Valorant en Neuf d’usine', () => {
    const items = buildPersonalValoItems(1700000000000);
    expect(items).toHaveLength(20);
    expect(items.filter((i) => i.crateId === 'protocole-radiant')).toHaveLength(10);
    expect(items.filter((i) => i.crateId === 'pantheon-champions')).toHaveLength(10);
    expect(new Set(items.map((i) => i.skinId)).size).toBe(20);
    expect(new Set(items.map((i) => i.instanceId)).size).toBe(20);
    expect(items.every((i) => i.wear === 'Neuf d’usine' && Boolean(i.image))).toBe(true);
  });

  it('fusionne sans doublon dans l’inventaire existant et élargit la capacité si besoin', () => {
    const freshMerge = mergePersonalValoInventory([], 25, 5, 1700000000000);
    expect(freshMerge.addedCount).toBe(20);
    expect(freshMerge.inventory).toHaveLength(20);
    expect(freshMerge.inventoryCapacity).toBe(25);

    // Re-running is idempotent
    const secondPass = mergePersonalValoInventory(
      freshMerge.inventory,
      freshMerge.inventoryCapacity,
      5
    );
    expect(secondPass.addedCount).toBe(0);
    expect(secondPass.inventory).toHaveLength(20);

    // Preserves pre-existing skins and bumps capacity in multiples of 5
    const sampleExisting = Array.from({ length: 8 }, (_, idx) => ({
      ...freshMerge.inventory[0],
      instanceId: `existing_${idx}`,
      skinId: `other_skin_${idx}`,
    }));
    const expanded = mergePersonalValoInventory(sampleExisting, 25, 5, 1700000000000);
    expect(expanded.addedCount).toBe(20);
    expect(expanded.inventory).toHaveLength(28);
    expect(expanded.inventoryCapacity).toBe(30);
  });

  it('laisse l’état initial standard (build / .zip) vierge avec 0 skin et 3 000 CR', () => {
    localStorage.clear();
    const initial = createInitialState();
    expect(initial.balance).toBe(3000);
    expect(initial.inventory).toEqual([]);

    const loaded = loadPersistedState();
    expect(loaded.balance).toBe(3000);
    expect(loaded.inventory).toEqual([]);
  });
});
