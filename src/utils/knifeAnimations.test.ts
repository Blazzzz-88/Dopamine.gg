import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFPSHands, getFPSWeaponViewConfig } from './fpsHandsBuilder';
import {
  alignBladeWeaponToFist,
  applyKnifeAnimPose,
  captureKnifeRigRestData,
  createKnifeAnimator,
  KnifeType,
  resolveKnifeType,
} from './knifeAnimations';
import { buildSculptedMeshData, getWeaponMuzzleSide, WeaponGripMeta } from './weapon3dBuilder';

describe('knifeAnimations — échelle normale, personnalité par couteau et absence de dérive', () => {
  it('distingue correctement karambit, baïonnette et couteau classique', () => {
    expect(resolveKnifeType('Karambit')).toBe('karambit');
    expect(resolveKnifeType('Couteau Baïonnette')).toBe('baionnette');
    expect(resolveKnifeType('Baionnette M9')).toBe('baionnette');
    expect(resolveKnifeType('Couteau Tactique')).toBe('couteau');
  });

  it('aligne tous les ratios de karambit et baïonnette exactement dans le creux et l’axe du poing droit', () => {
    const karambitSkins: Array<{ label: string; meta: WeaponGripMeta; ring: [number, number, number]; bolster: [number, number, number]; tip: [number, number, number] }> = [
      {
        label: 'Karambit.png (ratio 1.50)',
        meta: {
          gripLocalPos: [0.68, 1.04, 0],
          handleAxis: [0.99, -0.14, 0],
          bladeDir: [-0.14, -0.99, 0],
        },
        ring: [1.60, 0.85, 0],
        bolster: [-0.20, 0.69, 0],
        tip: [-1.80, -0.97, 0],
      },
      {
        label: 'karambit_fade.png (ratio 2.78)',
        meta: {
          gripLocalPos: [0.68, 0.30, 0],
          handleAxis: [0.92, -0.39, 0],
          bladeDir: [-0.39, -0.92, 0],
        },
        ring: [1.60, -0.16, 0],
        bolster: [-0.20, 0.28, 0],
        tip: [-1.80, -0.44, 0],
      },
    ];

    for (const skin of karambitSkins) {
      const cfg = getFPSWeaponViewConfig('karambit');
      const hands = createFPSHands('#38bdf8');
      hands.applyPose('karambit');
      hands.group.updateMatrixWorld(true);

      const weaponGroup = new THREE.Group();
      alignBladeWeaponToFist(weaponGroup, 'karambit', hands, cfg, skin.meta);
      weaponGroup.updateMatrixWorld(true);

      const rest = captureKnifeRigRestData('karambit', cfg, hands, weaponGroup, skin.meta);
      const gripWorld = new THREE.Vector3(...skin.meta.gripLocalPos).applyMatrix4(weaponGroup.matrixWorld);
      const ringWorld = new THREE.Vector3(...skin.ring).applyMatrix4(weaponGroup.matrixWorld);
      const bolsterWorld = new THREE.Vector3(...skin.bolster).applyMatrix4(weaponGroup.matrixWorld);
      const tipWorld = new THREE.Vector3(...skin.tip).applyMatrix4(weaponGroup.matrixWorld);

      // Manche exactement centré dans le creux du poing (< 2 mm)
      expect(gripWorld.distanceTo(rest.gripPivot)).toBeLessThan(0.002);
      // Anneau en haut au-dessus du poing, lame sortant par le bas et courbée vers l'avant-gauche
      expect(ringWorld.y).toBeGreaterThan(rest.gripPivot.y + 0.02);
      expect(tipWorld.x).toBeLessThan(bolsterWorld.x - 0.05);
      expect(tipWorld.z).toBeLessThan(bolsterWorld.z - 0.05);

      hands.dispose();
    }

    // Baïonnette droite & inclinée
    for (const bMeta of [
      { gripLocalPos: [-1.15, -0.06, 0], handleAxis: [1, 0, 0], bladeDir: [0, 1, 0] } as WeaponGripMeta,
      { gripLocalPos: [-1.10, -0.18, 0], handleAxis: [0.97, 0.24, 0], bladeDir: [-0.24, 0.97, 0] } as WeaponGripMeta,
    ]) {
      const cfg = getFPSWeaponViewConfig('couteau');
      const hands = createFPSHands('#38bdf8');
      hands.applyPose('couteau');
      hands.group.updateMatrixWorld(true);

      const weaponGroup = new THREE.Group();
      alignBladeWeaponToFist(weaponGroup, 'couteau', hands, cfg, bMeta);
      weaponGroup.updateMatrixWorld(true);

      const rest = captureKnifeRigRestData('couteau', cfg, hands, weaponGroup, bMeta);
      const gripWorld = new THREE.Vector3(...bMeta.gripLocalPos).applyMatrix4(weaponGroup.matrixWorld);
      expect(gripWorld.distanceTo(rest.gripPivot)).toBeLessThan(0.002);
      hands.dispose();
    }
  });

  it('extrait automatiquement gripMeta depuis la silhouette 2D du karambit dans buildSculptedMeshData', () => {
    const w = 120;
    const h = 60;
    const alpha = new Float32Array(w * h);
    for (let y = 14; y <= 34; y++) {
      for (let x = 14; x <= 104; x++) {
        alpha[y * w + x] = 1;
      }
    }
    const mesh = buildSculptedMeshData(alpha, w, h, 'lame', 'Karambit');
    expect(mesh.gripMeta).toBeDefined();
    expect(mesh.gripMeta!.gripLocalPos[0]).toBeGreaterThan(0.3);
  });

  it('préserve strictement l’échelle normale du couteau (0.054 karambit, 0.095 baïonnette) sur toutes les animations', () => {
    const cases: Array<{ arch: 'karambit' | 'couteau'; knifeType: KnifeType }> = [
      { arch: 'karambit', knifeType: 'karambit' },
      { arch: 'couteau', knifeType: 'baionnette' },
      { arch: 'couteau', knifeType: 'couteau' },
    ];

    for (const { arch, knifeType } of cases) {
      const cfg = getFPSWeaponViewConfig(arch);
      const hands = createFPSHands('#38bdf8');
      hands.applyPose(arch);

      const rig = new THREE.Group();
      const weaponMount = new THREE.Group();
      const weaponGroup = new THREE.Group();
      const muzzleSide = getWeaponMuzzleSide(arch);
      weaponGroup.rotation.set(
        cfg.weaponRotOffset[0],
        (muzzleSide === 'left' ? -Math.PI / 2 : Math.PI / 2) + cfg.weaponRotOffset[1],
        cfg.weaponRotOffset[2]
      );
      weaponGroup.scale.setScalar(cfg.scale);
      weaponGroup.position.set(...cfg.weaponPos);
      weaponMount.add(weaponGroup);
      rig.add(hands.group, weaponMount);

      const rest = captureKnifeRigRestData(arch, cfg, hands);
      const anim = createKnifeAnimator(knifeType);

      try {
        // Test draw, inspect, attack1, attack2, idle
        const triggers = [
          () => anim.triggerDraw(),
          () => anim.triggerInspect(),
          () => anim.triggerAttack(false),
          () => anim.triggerAttack(true),
        ];

        for (const trigger of triggers) {
          trigger();
          for (let step = 0; step < 60; step++) {
            const pose = anim.update(1 / 60, step * 16.6);
            applyKnifeAnimPose(
              rig,
              weaponMount,
              hands,
              rest,
              cfg.rigPosHip,
              cfg.rigRotBase,
              pose,
              0,
              0
            );
            // L'échelle du couteau NE DOIT JAMAIS être écrasée à 1.0 !
            expect(weaponGroup.scale.x).toBeCloseTo(cfg.scale, 6);
            expect(weaponGroup.scale.y).toBeCloseTo(cfg.scale, 6);
            expect(weaponGroup.scale.z).toBeCloseTo(cfg.scale, 6);
            expect(weaponMount.scale.x).toBe(1);
            expect(weaponMount.scale.y).toBe(1);
            expect(weaponMount.scale.z).toBe(1);
          }
        }
      } finally {
        hands.dispose();
      }
    }
  });

  it('produit des animations distinctes entre karambit, baïonnette et couteau sans dérive résiduelle', () => {
    const karambit = createKnifeAnimator('karambit');
    const baionnette = createKnifeAnimator('baionnette');
    const couteau = createKnifeAnimator('couteau');

    // 1. Sortie (draw) distincte
    karambit.triggerDraw();
    baionnette.triggerDraw();
    couteau.triggerDraw();

    const kDraw = karambit.update(0.18, 180);
    const bDraw = baionnette.update(0.18, 180);
    const cDraw = couteau.update(0.18, 180);

    // Karambit & Baïonnette utilisent bladePlaneSpin mais avec des trajectoires de bras opposées (gauche vs droite)
    expect(Math.abs(kDraw.bladePlaneSpin)).toBeGreaterThan(0.5);
    expect(Math.abs(bDraw.bladePlaneSpin)).toBeGreaterThan(0.5);
    expect(Math.sign(kDraw.rigPos.x)).not.toBe(Math.sign(bDraw.rigPos.x));
    // Couteau classique utilise une vrille axiale (bladeAxisRoll) plutôt que planeSpin
    expect(Math.abs(cDraw.bladeAxisRoll)).toBeGreaterThan(0.5);
    expect(cDraw.bladePlaneSpin).toBe(0);

    // 2. Coup secondaire (attack2) distinct : estocade directe sur baïonnette vs plongée verticale sur karambit
    karambit.triggerAttack(true);
    baionnette.triggerAttack(true);
    couteau.triggerAttack(true);

    const kAtk2 = karambit.update(0.17, 170);
    const bAtk2 = baionnette.update(0.17, 170);
    const cAtk2 = couteau.update(0.17, 170);

    // Estocade baïonnette avance fortement en -Z avec bladeAxisRoll positif
    expect(bAtk2.rigPos.z).toBeLessThan(-0.08);
    expect(bAtk2.bladeAxisRoll).toBeGreaterThan(0.4);
    // Karambit plonge en -Y avec bladePlaneSpin négatif
    expect(kAtk2.rigPos.y).toBeLessThan(-0.03);
    expect(kAtk2.bladePlaneSpin).toBeLessThan(0);
    // Couteau retourne la lame (bladePlaneSpin > 0) pour un coup pic à glace
    expect(cAtk2.bladePlaneSpin).toBeGreaterThan(0.8);

    // 3. Aucune dérive après fin d'animation : retour propre en idle
    for (let i = 0; i < 60; i++) {
      karambit.update(0.05, 1000 + i * 50);
      baionnette.update(0.05, 1000 + i * 50);
      couteau.update(0.05, 1000 + i * 50);
    }
    expect(karambit.getState()).toBe('idle');
    expect(baionnette.getState()).toBe('idle');
    expect(couteau.getState()).toBe('idle');
  });
});
