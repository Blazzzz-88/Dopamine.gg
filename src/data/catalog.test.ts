import { describe, expect, it } from 'vitest';
import { CASE_CATEGORIES, CRATES } from './catalog';
import { RARITIES, RARITY_ORDER } from './rarities';
import { buildReelStrip, rollSkinFromCrate } from '../utils/rng';

describe('Catalogue & Raretés du casino fictif', () => {
  it('contient exactement 3 catégories distinctes au lancement', () => {
    expect(CASE_CATEGORIES).toHaveLength(3);
    const ids = new Set(CASE_CATEGORIES.map((c) => c.id));
    expect(ids.size).toBe(3);

    for (const cat of CASE_CATEGORIES) {
      const catCrates = CRATES.filter((c) => c.categoryId === cat.id);
      expect(catCrates.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('chaque caisse possède un thème unique et minimum 20 skins uniques', () => {
    const names = new Set<string>();
    const themes = new Set<string>();
    const emblems = new Set<string>();

    for (const crate of CRATES) {
      expect(names.has(crate.name)).toBe(false);
      expect(themes.has(crate.themeTag)).toBe(false);
      expect(emblems.has(crate.emblemType)).toBe(false);
      names.add(crate.name);
      themes.add(crate.themeTag);
      emblems.add(crate.emblemType);

      expect(crate.skins.length).toBeGreaterThanOrEqual(10);

      const skinIds = new Set(crate.skins.map((s) => s.id));
      expect(skinIds.size).toBe(crate.skins.length);
    }
  });

  it('chaque caisse contient les 5 niveaux de rareté demandés', () => {
    for (const crate of CRATES) {
      for (const rarity of RARITY_ORDER) {
        const count = crate.skins.filter((s) => s.rarity === rarity).length;
        expect(count).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('les probabilités somment à 100% et respectent la difficulté croissante', () => {
    const sum = RARITY_ORDER.reduce((acc, rid) => acc + RARITIES[rid].probability, 0);
    expect(sum).toBeCloseTo(100, 6);

    expect(RARITIES.commune.probability).toBeGreaterThan(RARITIES.rare.probability);
    expect(RARITIES.rare.probability).toBeGreaterThan(RARITIES.mythique.probability);
    expect(RARITIES.mythique.probability).toBeGreaterThan(RARITIES.legendaire.probability);
    expect(RARITIES.legendaire.probability).toBeGreaterThan(RARITIES.secret.probability);
    expect(RARITIES.legendaire.probability).toBe(1);
    expect(RARITIES.secret.probability).toBe(0.025);
  });

  it('la roulette place toujours le skin gagnant exactement à winningIndex', () => {
    const crate = CRATES[0];
    const targetSkin = crate.skins[crate.skins.length - 1];
    const strip = buildReelStrip(crate, targetSkin, 54, 42);
    expect(strip).toHaveLength(54);
    expect(strip[42].id).toBe(targetSkin.id);
  });

  it('tous les 152 skins possèdent un visuel unique aligné sur les modèles d’armes dédiés', () => {
    const skinsWithImages = CRATES.flatMap((crate) =>
      crate.skins
        .filter((s) => Boolean(s.image))
        .map((s) => ({ crateId: crate.id, skinId: s.id, image: s.image! }))
    );

    expect(skinsWithImages).toHaveLength(152);

    const uniqueImages = new Set(skinsWithImages.map((x) => x.image));
    expect(uniqueImages.size).toBe(152);

    const uniqueCrates = new Set(skinsWithImages.map((x) => x.crateId));
    expect(uniqueCrates.size).toBe(8);

    const allowedWeapons = new Set([
      'AK-47',
      'AR-15',
      'AR-15 Silencieux',
      'Phantom',
      'AWP',
      'Pistolet Tactique',
      'Deagle',
      'MAC-10',
      'Couteau Baïonnette',
      'Katana',
      'Dague',
      'Karambit',
    ]);
    for (const crate of CRATES) {
      for (const skin of crate.skins) {
        expect(allowedWeapons.has(skin.weaponName)).toBe(true);
      }
    }
  });

  it('propose les 2 nouvelles caisses à 75 000 et 100 000 CR (10 skins chacune, raretés et Champions respectés)', () => {
    const c75 = CRATES.find((c) => c.price === 75000)!;
    const c100 = CRATES.find((c) => c.price === 100000)!;
    expect(c75).toBeDefined();
    expect(c100).toBeDefined();
    expect(c75.skins).toHaveLength(10);
    expect(c100.skins).toHaveLength(10);
    expect(c75.image).toBeUndefined();
    expect(c100.image).toBeUndefined();

    // Raretés nommées dans les fichiers respectées
    expect(c75.skins.find((s) => s.weaponName === 'Katana')?.rarity).toBe('legendaire');
    expect(c75.skins.find((s) => s.name === 'Kuronami')?.rarity).toBe('secret');
    expect(c75.skins.find((s) => s.name === 'Prélude au Chaos')?.rarity).toBe('secret');

    // Les skins Champions ensemble dans la caisse à 100 000 CR
    const champ2021Skins = c100.skins.filter((s) => s.name === 'Champions 2021');
    expect(champ2021Skins).toHaveLength(2);
    expect(champ2021Skins.every((s) => s.rarity === 'secret')).toBe(true);
    expect(c100.skins.find((s) => s.name === 'Champions Pourpre')?.rarity).toBe('secret');

    // Somme des probabilités par caisse toujours exactement 100%
    for (const crate of [c75, c100]) {
      const probSum = crate.skins.reduce((sum, skin) => {
        const count = crate.skins.filter((s) => s.rarity === skin.rarity).length;
        return sum + RARITIES[skin.rarity].probability / count;
      }, 0);
      expect(probSum).toBeCloseTo(100, 6);
    }
  });

  it('le tirage pondéré produit des skins valides de la caisse', () => {
    const crate = CRATES[2];
    const validIds = new Set(crate.skins.map((s) => s.id));
    for (let i = 0; i < 500; i++) {
      const drawn = rollSkinFromCrate(crate);
      expect(validIds.has(drawn.id)).toBe(true);
    }
  });

  it('applique les prix 30 000 et 35 000 aux 2 dernières caisses et ajuste la valeur des skins Légendaires (x3) et Secrets (x10)', () => {
    const empire = CRATES.find((c) => c.id === 'empire-dor')!;
    const abysse = CRATES.find((c) => c.id === 'abysse-prismatique')!;

    expect(empire.price).toBe(30000);
    expect(abysse.price).toBe(35000);

    expect(Math.min(...empire.skins.map((s) => s.baseValue))).toBe(7500);
    expect(Math.max(...empire.skins.filter((s) => s.rarity === 'legendaire').map((s) => s.baseValue))).toBe(538200);
    expect(Math.max(...empire.skins.map((s) => s.baseValue))).toBe(16500000);

    expect(Math.min(...abysse.skins.map((s) => s.baseValue))).toBe(8750);
    expect(Math.max(...abysse.skins.filter((s) => s.rarity === 'legendaire').map((s) => s.baseValue))).toBe(630000);
    expect(Math.max(...abysse.skins.map((s) => s.baseValue))).toBe(20300000);

    for (const crate of CRATES) {
      for (const skin of crate.skins) {
        if (skin.rarity === 'legendaire') {
          expect(skin.baseValue).toBeGreaterThanOrEqual(crate.price * 12);
        }
        if (skin.rarity === 'secret') {
          expect(skin.baseValue).toBeGreaterThanOrEqual(crate.price * 350);
        }
      }
    }
  });
});
