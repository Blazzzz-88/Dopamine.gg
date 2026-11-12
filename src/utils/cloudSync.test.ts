import { describe, expect, it } from 'vitest';
import { CRATES } from '../data/catalog';
import { createInventoryItem } from './rng';
import { createInitialState } from './storage';
import {
  buildCloudBaseline,
  hasCloudSyncedDiff,
  mergeServerEditsIntoLocalState,
  parseSafeCloudNumber,
} from './cloudSync';

describe('cloudSync', () => {
  it('parseSafeCloudNumber gère nombres et chaînes bigint', () => {
    expect(parseSafeCloudNumber(50000, 3000)).toBe(50000);
    expect(parseSafeCloudNumber('75000', 3000)).toBe(75000);
    expect(parseSafeCloudNumber(0, 3000)).toBe(0);
    expect(parseSafeCloudNumber(null, 3000)).toBe(3000);
    expect(parseSafeCloudNumber(undefined, 3000)).toBe(3000);
  });

  it('hasCloudSyncedDiff détecte uniquement les changements cloud', () => {
    const baseState = createInitialState();
    const baseline = buildCloudBaseline(baseState);

    expect(hasCloudSyncedDiff(baseState, baseline)).toBe(false);

    // Un changement de thème local ne déclenche pas de sauvegarde cloud inutile
    const themeChanged = { ...baseState, themeId: 'ambre' as const };
    expect(hasCloudSyncedDiff(themeChanged, baseline)).toBe(false);

    // Un changement de solde déclenche la sauvegarde
    const balanceChanged = { ...baseState, balance: 2500 };
    expect(hasCloudSyncedDiff(balanceChanged, baseline)).toBe(true);
  });

  it('conserve les crédits ajoutés par l admin quand le joueur n a rien dépensé', () => {
    const baseState = createInitialState();
    const baseline = buildCloudBaseline(baseState);

    const merged = mergeServerEditsIntoLocalState(baseState, baseline, {
      id: 'u1',
      credits: '50000',
      inventory: [],
      drop_history: [],
      stats: {},
      storage_limit: 25,
    });

    expect(merged.adminChanged).toBe(true);
    expect(merged.creditsDeltaFromAdmin).toBe(47000);
    expect(merged.nextState.balance).toBe(50000);
  });

  it('fusionne les crédits ajoutés par l admin avec les dépenses locales du joueur', () => {
    const baseState = { ...createInitialState(), balance: 10000 };
    const baseline = buildCloudBaseline(baseState);

    // Le joueur ouvre une caisse à 500 CR en local
    const localAfterSpend = { ...baseState, balance: 9500 };

    // Pendant ce temps, l'admin ajoute +20 000 CR dans Supabase (10 000 -> 30 000)
    const merged = mergeServerEditsIntoLocalState(localAfterSpend, baseline, {
      id: 'u1',
      credits: 30000,
      inventory: [],
      drop_history: [],
      stats: {},
      storage_limit: 25,
    });

    expect(merged.nextState.balance).toBe(29500);
    expect(merged.creditsDeltaFromAdmin).toBe(20000);
  });

  it('fusionne ajouts et suppressions de skins admin avec les drops locaux', () => {
    const skinA = createInventoryItem(CRATES[0], CRATES[0].skins[0], 'ouverture');
    const skinB = createInventoryItem(CRATES[0], CRATES[0].skins[1], 'ouverture');
    const skinAdminAdded = createInventoryItem(CRATES[0], CRATES[0].skins[2], 'ouverture');
    const skinPlayerDropped = createInventoryItem(CRATES[0], CRATES[0].skins[3], 'ouverture');

    const baseState = {
      ...createInitialState(),
      inventory: [skinA, skinB],
      equippedWeaponId: skinB.instanceId,
    };
    const baseline = buildCloudBaseline(baseState);

    // En local le joueur drop skinPlayerDropped
    const localState = {
      ...baseState,
      inventory: [skinPlayerDropped, skinA, skinB],
    };

    // Dans Supabase l'admin supprime skinB et ajoute skinAdminAdded
    const merged = mergeServerEditsIntoLocalState(localState, baseline, {
      id: 'u1',
      credits: 3000,
      inventory: [skinA, skinAdminAdded],
      drop_history: [],
      stats: {},
      storage_limit: 25,
    });

    const ids = merged.nextState.inventory.map((i) => i.instanceId);
    expect(ids).toContain(skinAdminAdded.instanceId);
    expect(ids).toContain(skinPlayerDropped.instanceId);
    expect(ids).toContain(skinA.instanceId);
    expect(ids).not.toContain(skinB.instanceId);
    expect(merged.nextState.equippedWeaponId).toBeNull();
  });
});
