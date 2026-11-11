import { CRATES } from '../data/catalog';
import { InventoryItem } from '../types/casino';

/**
 * Creates starter knives requested by the player:
 * - 1 Karambit Fade (Dégradé Impérial) equipped by default
 * - 1 of each knife skin defined across all cases (Karambit & Couteau Baïonnette)
 */
export function getStarterKnives(): InventoryItem[] {
  const items: InventoryItem[] = [];
  const seen = new Set<string>();

  // Ensure Karambit Fade (Dégradé Impérial) is the first item
  const fadeCrate = CRATES.find((c) => c.id === 'empire-dor');
  const fadeSkin = fadeCrate?.skins.find(
    (s) => s.weaponName === 'Karambit' && s.name === 'Dégradé Impérial'
  );

  if (fadeCrate && fadeSkin) {
    seen.add('Karambit | Dégradé Impérial');
    items.push({
      instanceId: 'starter_knife_karambit_fade',
      skinId: fadeSkin.id,
      crateId: fadeCrate.id,
      crateName: fadeCrate.name,
      name: fadeSkin.name,
      weaponName: fadeSkin.weaponName,
      weaponClass: 'lame',
      rarity: fadeSkin.rarity,
      wear: 'Neuf d’usine',
      floatVal: 0.0124,
      value: Math.round(fadeSkin.baseValue * 1.22),
      swatches: fadeSkin.swatches,
      tagline: fadeSkin.tagline,
      image: fadeSkin.image,
      obtainedAt: Date.now(),
      locked: false,
      source: 'ouverture',
    });
  }

  // Add 1 of each other knife skin
  for (const crate of CRATES) {
    for (const skin of crate.skins) {
      if (skin.weaponClass === 'lame') {
        const key = `${skin.weaponName} | ${skin.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          items.push({
            instanceId: `starter_knife_${skin.id}`,
            skinId: skin.id,
            crateId: crate.id,
            crateName: crate.name,
            name: skin.name,
            weaponName: skin.weaponName,
            weaponClass: 'lame',
            rarity: skin.rarity,
            wear: 'Neuf d’usine',
            floatVal: 0.015,
            value: Math.round(skin.baseValue * 1.22),
            swatches: skin.swatches,
            tagline: skin.tagline,
            image: skin.image,
            obtainedAt: Date.now(),
            locked: false,
            source: 'ouverture',
          });
        }
      }
    }
  }

  return items;
}
