import { describe, expect, it } from 'vitest';
import { CRATES } from '../data/catalog';
import { createInventoryItem } from './rng';
import {
  autoPickContractItemIds,
  buildContractReelStrip,
  buildDefaultRarityPreviewStrip,
  canExecuteContract,
  getNextRarity,
  getTradeUpCrateBreakdown,
  getTradeUpPool,
  rollTradeUpOutcome,
  TRADE_UP_INPUT_RARITIES,
  TRADE_UP_REQUIRED_COUNT,
} from './tradeUp';

describe('Système de Contrat d’Échange (Trade-Up)', () => {
  it('fait progresser chaque rareté sauf Secret', () => {
    expect(getNextRarity('commune')).toBe('rare');
    expect(getNextRarity('rare')).toBe('mythique');
    expect(getNextRarity('mythique')).toBe('legendaire');
    expect(getNextRarity('legendaire')).toBe('secret');
    expect(getNextRarity('secret')).toBeNull();
  });

  it('exige exactement 5 skins déverrouillés, uniques, de même rareté et non Secret', () => {
    const crate = CRATES[0];
    const mythSkin = crate.skins.find((s) => s.rarity === 'mythique')!;
    const rareSkin = crate.skins.find((s) => s.rarity === 'rare')!;
    const secretSkin = crate.skins.find((s) => s.rarity === 'secret')!;

    const fiveMythics = Array.from({ length: TRADE_UP_REQUIRED_COUNT }, (_, i) => ({
      ...createInventoryItem(crate, mythSkin, 'ouverture'),
      instanceId: `myth_${i}`,
    }));
    expect(canExecuteContract(fiveMythics)).toBe(true);

    // Moins de 5 skins -> refusé
    expect(canExecuteContract(fiveMythics.slice(0, 4))).toBe(false);

    // Doublon d'instanceId -> refusé
    expect(canExecuteContract([...fiveMythics.slice(0, 4), fiveMythics[0]])).toBe(false);

    // Skin verrouillé -> refusé
    expect(
      canExecuteContract([
        ...fiveMythics.slice(0, 4),
        { ...fiveMythics[4], locked: true },
      ])
    ).toBe(false);

    // Raretés mélangées -> refusé
    expect(
      canExecuteContract([
        ...fiveMythics.slice(0, 4),
        { ...createInventoryItem(crate, rareSkin, 'ouverture'), instanceId: 'rare_1' },
      ])
    ).toBe(false);

    // Rareté Secret -> refusée
    const fiveSecrets = Array.from({ length: 5 }, (_, i) => ({
      ...createInventoryItem(crate, secretSkin, 'ouverture'),
      instanceId: `sec_${i}`,
    }));
    expect(canExecuteContract(fiveSecrets)).toBe(false);
  });

  it('attribue 100% à la caisse unique pour 5 skins de la même caisse sur toutes les caisses et raretés éligibles', () => {
    for (const crate of CRATES) {
      for (const inputRarity of TRADE_UP_INPUT_RARITIES) {
        const nextRarity = getNextRarity(inputRarity)!;
        const inputSkin = crate.skins.find((s) => s.rarity === inputRarity)!;
        const items = Array.from({ length: 5 }, (_, i) => ({
          ...createInventoryItem(crate, inputSkin, 'ouverture'),
          instanceId: `${crate.id}_${inputRarity}_${i}`,
        }));

        const pool = getTradeUpPool(items);
        const expectedTargetSkins = crate.skins.filter((s) => s.rarity === nextRarity);
        expect(pool).toHaveLength(expectedTargetSkins.length);
        expect(pool.every((entry) => entry.crate.id === crate.id)).toBe(true);
        expect(pool.every((entry) => entry.skin.rarity === nextRarity)).toBe(true);

        const totalPct = pool.reduce((sum, entry) => sum + entry.probability, 0);
        expect(totalPct).toBeCloseTo(100, 6);

        const outcome = rollTradeUpOutcome(items);
        expect(outcome).not.toBeNull();
        expect(outcome!.crate.id).toBe(crate.id);
        expect(outcome!.skin.rarity).toBe(nextRarity);
      }
    }
  });

  it('pondère les caisses proportionnellement lorsque plusieurs caisses sont combinées', () => {
    const c1 = CRATES[0]; // Ombre Boréale (3 légendaires)
    const c2 = CRATES[1]; // Protocole Cobalt (3 légendaires)
    const m1 = c1.skins.find((s) => s.rarity === 'mythique')!;
    const m2 = c2.skins.find((s) => s.rarity === 'mythique')!;

    const mixed = [
      ...Array.from({ length: 3 }, (_, i) => ({
        ...createInventoryItem(c1, m1, 'ouverture'),
        instanceId: `c1_${i}`,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        ...createInventoryItem(c2, m2, 'ouverture'),
        instanceId: `c2_${i}`,
      })),
    ];

    const breakdown = getTradeUpCrateBreakdown(mixed);
    expect(breakdown).toHaveLength(2);
    expect(breakdown[0].crate.id).toBe(c1.id);
    expect(breakdown[0].probability).toBeCloseTo(60, 6);
    expect(breakdown[1].crate.id).toBe(c2.id);
    expect(breakdown[1].probability).toBeCloseTo(40, 6);

    const pool = getTradeUpPool(mixed);
    expect(pool.every((p) => p.skin.rarity === 'legendaire')).toBe(true);
    expect(pool.reduce((s, p) => s + p.probability, 0)).toBeCloseTo(100, 6);

    const allowedIds = new Set(pool.map((p) => p.skin.id));
    for (let i = 0; i < 60; i++) {
      const outcome = rollTradeUpOutcome(mixed);
      expect(outcome).not.toBeNull();
      expect(allowedIds.has(outcome!.skin.id)).toBe(true);
      expect(outcome!.skin.rarity).toBe('legendaire');
    }
  });

  it('génère une bande de roulette contenant uniquement la rareté cible et le gagnant à winningIndex', () => {
    const crate = CRATES[0];
    const mythSkin = crate.skins.find((s) => s.rarity === 'mythique')!;
    const items = Array.from({ length: 5 }, (_, i) => ({
      ...createInventoryItem(crate, mythSkin, 'ouverture'),
      instanceId: `m_${i}`,
    }));
    const pool = getTradeUpPool(items);
    const winningSkin = pool[1].skin;
    const allowedIds = new Set(pool.map((p) => p.skin.id));

    const strip = buildContractReelStrip(pool, winningSkin, 54, 42);
    expect(strip).toHaveLength(54);
    expect(strip[42].id).toBe(winningSkin.id);
    expect(strip.every((s) => s.rarity === 'legendaire')).toBe(true);
    expect(strip.every((s) => allowedIds.has(s.id))).toBe(true);

    const defaultPreview = buildDefaultRarityPreviewStrip('secret', 54);
    expect(defaultPreview).toHaveLength(54);
    expect(defaultPreview.every((s) => s.rarity === 'secret')).toBe(true);
  });

  it('auto-sélectionne en priorité 5 skins de la même caisse', () => {
    const c1 = CRATES[0];
    const c2 = CRATES[1];
    const c1Commune = c1.skins.find((s) => s.rarity === 'commune')!;
    const c2Commune = c2.skins.find((s) => s.rarity === 'commune')!;

    const inventory = [
      ...Array.from({ length: 2 }, (_, i) => ({
        ...createInventoryItem(c1, c1Commune, 'ouverture'),
        instanceId: `c1_${i}`,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        ...createInventoryItem(c2, c2Commune, 'ouverture'),
        instanceId: `c2_${i}`,
      })),
    ];

    const picked = autoPickContractItemIds(inventory, 'commune', [], 'all');
    expect(picked).toHaveLength(5);
    expect(picked.every((id) => id.startsWith('c2_'))).toBe(true);
  });
});
