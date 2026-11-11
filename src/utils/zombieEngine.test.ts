import { describe, expect, it } from 'vitest';
import { CRATES } from '../data/catalog';
import { createInventoryItem } from './rng';
import {
  applyFpsMouseDelta,
  computeShotSpreadNDC,
  computeZombieReward,
  FPS_PITCH_LIMIT,
  getWeaponCombatProfile,
  pickInitialEquippedWeapon,
  resolveZombieExitPayout,
  resolveZombieLoadout,
  rollZombieTier,
} from './zombieEngine';

describe('Logique du mode Zombie FPS', () => {
  it('attribue entre 10 et 50 crédits par zombie selon sa rareté', () => {
    for (let i = 0; i < 300; i++) {
      const rStd = computeZombieReward('standard');
      const rRap = computeZombieReward('rapide');
      const rCol = computeZombieReward('colosse');
      expect(rStd).toBeGreaterThanOrEqual(10);
      expect(rStd).toBeLessThanOrEqual(50);
      expect(rRap).toBeGreaterThanOrEqual(10);
      expect(rRap).toBeLessThanOrEqual(50);
      expect(rCol).toBeGreaterThanOrEqual(40);
      expect(rCol).toBeLessThanOrEqual(50);
    }

    const tiers = new Set<string>();
    for (let i = 0; i < 200; i++) tiers.add(rollZombieTier(3));
    expect(tiers.has('standard')).toBe(true);
    expect(tiers.has('colosse')).toBe(true);
  });

  it('fournit des profils FPS adaptés aux armes à feu, snipers et couteaux', () => {
    const ak = getWeaponCombatProfile('fusil', 'AK-47', 'legendaire');
    const sil = getWeaponCombatProfile('fusil', 'AR-15 Silencieux', 'rare');
    const awp = getWeaponCombatProfile('sniper', 'AWP', 'secret');
    const karambit = getWeaponCombatProfile('lame', 'Karambit', 'secret');

    expect(ak.automatic).toBe(true);
    expect(sil.suppressed).toBe(true);
    expect(awp.isSniper).toBe(true);
    expect(awp.damage).toBeGreaterThan(ak.damage);
    expect(karambit.isMelee).toBe(true);
    expect(karambit.magSize).toBe(0);
  });

  it('sélectionne en priorité l’arme équipée depuis l’inventaire et annule les gains en cas de mort', () => {
    const knife = CRATES[0].skins.find((s) => s.weaponClass === 'lame')!;
    const rifle = CRATES[0].skins.find((s) => s.weaponClass === 'fusil')!;
    const knifeItem = createInventoryItem(CRATES[0], knife, 'ouverture');
    const rifleItem = createInventoryItem(CRATES[0], rifle, 'ouverture');
    const inv = [knifeItem, rifleItem];

    expect(pickInitialEquippedWeapon(inv)?.weaponClass).toBe('fusil');
    expect(pickInitialEquippedWeapon(inv, knifeItem.instanceId)?.instanceId).toBe(
      knifeItem.instanceId
    );
    expect(pickInitialEquippedWeapon([])).toBeNull();

    // Mort pendant la partie = perte totale du farm (0 CR), retour vivant = crédit conservé
    expect(resolveZombieExitPayout(true, 185)).toBe(0);
    expect(resolveZombieExitPayout(false, 185)).toBe(185);

    // Loadout 2 slots : arme principale (touche 1) + couteau optionnel (touche 2)
    const fallback = createInventoryItem(CRATES[0], rifle, 'ouverture');
    const both = resolveZombieLoadout(inv, rifleItem.instanceId, knifeItem.instanceId, fallback);
    expect(both.initialSlot).toBe(1);
    expect(both.primary.instanceId).toBe(rifleItem.instanceId);
    expect(both.knife?.instanceId).toBe(knifeItem.instanceId);

    const onlyFirearm = resolveZombieLoadout(inv, rifleItem.instanceId, null, fallback);
    expect(onlyFirearm.initialSlot).toBe(1);
    expect(onlyFirearm.knife).toBeNull();

    const onlyKnife = resolveZombieLoadout(inv, null, knifeItem.instanceId, fallback);
    expect(onlyKnife.initialSlot).toBe(2);
    expect(onlyKnife.knife?.instanceId).toBe(knifeItem.instanceId);
    expect(onlyKnife.primary.instanceId).toBe(rifleItem.instanceId);
  });

  it('filtre les sauts de souris anormaux et maintient une vue FPS stable lors des grands coups de souris', () => {
    // Normal rapid flick turns cleanly and wraps yaw cleanly within [-PI, PI]
    const flick = applyFpsMouseDelta(Math.PI - 0.05, 0.1, -180, -90, 62);
    expect(flick.ignoredSpike).toBe(false);
    expect(flick.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(flick.yaw).toBeLessThanOrEqual(Math.PI);
    expect(flick.pitch).toBeLessThanOrEqual(FPS_PITCH_LIMIT);

    // Chromium/Windows pointer-lock warp spike (> 650 px in a single event) is discarded cleanly
    const glitch = applyFpsMouseDelta(0.4, 0.2, 1280, -850, 62);
    expect(glitch.ignoredSpike).toBe(true);
    expect(glitch.yaw).toBe(0.4);
    expect(glitch.pitch).toBe(0.2);

    // Vertical look strictly avoids gimbal inversion and ADS zoom proportionally slows sensitivity
    const pitchClamped = applyFpsMouseDelta(0, 1.3, 0, -500, 62);
    expect(pitchClamped.pitch).toBe(FPS_PITCH_LIMIT);
    const hipStep = Math.abs(applyFpsMouseDelta(0, 0, 100, 0, 62).yaw);
    const adsStep = Math.abs(applyFpsMouseDelta(0, 0, 100, 0, 26).yaw);
    expect(adsStep).toBeLessThan(hipStep);
  });

  it('tire exactement au centre (0, 0) en AWP immobile en visée et disperse devant en mouvement', () => {
    const awp = getWeaponCombatProfile('sniper', 'AWP', 'legendaire');

    // Immobile + visée => exactement au centre du réticule
    for (let i = 0; i < 20; i++) {
      const stillAim = computeShotSpreadNDC({
        profile: awp,
        isAiming: true,
        isMoving: false,
        isAirborne: false,
        aspect: 16 / 9,
      });
      expect(stillAim.rx).toBe(0);
      expect(stillAim.ry).toBe(0);
    }

    // En mouvement => dispersion aléatoire en face dans le cône de visée
    const offsets = Array.from({ length: 40 }, () =>
      computeShotSpreadNDC({
        profile: awp,
        isAiming: true,
        isMoving: true,
        isAirborne: false,
        aspect: 16 / 9,
      })
    );
    const nonZero = offsets.filter((o) => Math.hypot(o.rx, o.ry) > 0.02);
    expect(nonZero.length).toBe(offsets.length);
    for (const o of offsets) {
      expect(Math.abs(o.rx)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(o.ry)).toBeLessThanOrEqual(0.5);
    }
    const distinctX = new Set(offsets.map((o) => o.rx.toFixed(4)));
    expect(distinctX.size).toBeGreaterThan(25);
  });
});
