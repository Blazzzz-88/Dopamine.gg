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
import { buildSculptedMeshData, WeaponGripMeta } from './weapon3dBuilder';

function getCurrentFistAndRingWorld(
  hands: ReturnType<typeof createFPSHands>,
  weaponGroup: THREE.Group,
  gripMeta: WeaponGripMeta
) {
  hands.group.updateMatrixWorld(true);
  weaponGroup.updateMatrixWorld(true);
  const rightHandObj = hands.rightArm.getObjectByName('right_hand');
  const handQuat = new THREE.Quaternion();
  const handPos = new THREE.Vector3();
  if (rightHandObj) {
    rightHandObj.getWorldPosition(handPos);
    rightHandObj.getWorldQuaternion(handQuat);
  } else {
    hands.rightArm.getWorldPosition(handPos);
  }
  const currentFist = new THREE.Vector3(-0.002, -0.013, -0.014)
    .applyQuaternion(handQuat)
    .add(handPos);
  const gripWorld = new THREE.Vector3(...gripMeta.gripLocalPos).applyMatrix4(
    weaponGroup.matrixWorld
  );
  const ringWorld = gripMeta.ringLocalPos
    ? new THREE.Vector3(...gripMeta.ringLocalPos).applyMatrix4(weaponGroup.matrixWorld)
    : gripWorld.clone();
  return { currentFist, gripWorld, ringWorld };
}

describe('knifeAnimations — verrouillage strict en main, style Valorant et zéro conflit', () => {
  it('distingue correctement karambit, baïonnette, katana, dague et couteau', () => {
    expect(resolveKnifeType('Karambit')).toBe('karambit');
    expect(resolveKnifeType('Couteau Baïonnette')).toBe('baionnette');
    expect(resolveKnifeType('Baionnette M9')).toBe('baionnette');
    expect(resolveKnifeType('Katana')).toBe('katana');
    expect(resolveKnifeType('Dague')).toBe('dague');
    expect(resolveKnifeType('Couteau Tactique')).toBe('couteau');
  });

  it('aligne tous les couteaux (Karambit, Baïonnette, Katana, Dague) exactement dans le creux du poing droit', () => {
    const karambitSkins: Array<{
      label: string;
      meta: WeaponGripMeta;
      ring: [number, number, number];
      bolster: [number, number, number];
      tip: [number, number, number];
    }> = [
      {
        label: 'Karambit.png (ratio 1.46)',
        meta: {
          gripLocalPos: [0.68, 1.04, 0],
          handleAxis: [0.99, -0.14, 0],
          bladeDir: [-0.14, -0.99, 0],
          ringLocalPos: [1.6, 0.85, 0],
        },
        ring: [1.6, 0.85, 0],
        bolster: [-0.2, 0.69, 0],
        tip: [-1.8, -0.97, 0],
      },
      {
        label: 'Champions 2021 Karambit (1:1)',
        meta: {
          gripLocalPos: [0.55, 0.72, 0],
          handleAxis: [0.91, -0.41, 0],
          bladeDir: [-0.41, -0.91, 0],
          ringLocalPos: [1.45, 0.31, 0],
        },
        ring: [1.45, 0.31, 0],
        bolster: [-0.25, 0.62, 0],
        tip: [-1.5, -1.25, 0],
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
      const gripWorld = new THREE.Vector3(...skin.meta.gripLocalPos).applyMatrix4(
        weaponGroup.matrixWorld
      );
      const ringWorld = new THREE.Vector3(...skin.ring).applyMatrix4(weaponGroup.matrixWorld);
      const bolsterWorld = new THREE.Vector3(...skin.bolster).applyMatrix4(weaponGroup.matrixWorld);
      const tipWorld = new THREE.Vector3(...skin.tip).applyMatrix4(weaponGroup.matrixWorld);

      expect(gripWorld.distanceTo(rest.gripPivot)).toBeLessThan(0.002);
      expect(ringWorld.y).toBeGreaterThan(rest.gripPivot.y + 0.02);
      expect(tipWorld.x).toBeLessThan(bolsterWorld.x - 0.04);
      expect(tipWorld.z).toBeLessThan(bolsterWorld.z - 0.04);

      hands.dispose();
    }

    // Baïonnette droite, Katana incliné et Dague inclinée (pointant vers l'avant dans l'axe du poing)
    for (const bMeta of [
      {
        gripLocalPos: [-1.15, -0.06, 0],
        handleAxis: [1, 0, 0],
        bladeDir: [0, 1, 0],
      } as WeaponGripMeta,
      {
        gripLocalPos: [1.32, -0.78, 0],
        handleAxis: [-0.8, 0.6, 0],
        bladeDir: [-0.6, -0.8, 0],
      } as WeaponGripMeta,
      {
        gripLocalPos: [1.1, 0.58, 0],
        handleAxis: [-0.85, -0.52, 0],
        bladeDir: [0.52, -0.85, 0],
      } as WeaponGripMeta,
    ]) {
      const cfg = getFPSWeaponViewConfig('couteau');
      const hands = createFPSHands('#38bdf8');
      hands.applyPose('couteau');
      hands.group.updateMatrixWorld(true);

      const weaponGroup = new THREE.Group();
      alignBladeWeaponToFist(weaponGroup, 'couteau', hands, cfg, bMeta);
      weaponGroup.updateMatrixWorld(true);

      const rest = captureKnifeRigRestData('couteau', cfg, hands, weaponGroup, bMeta);
      const gripWorld = new THREE.Vector3(...bMeta.gripLocalPos).applyMatrix4(
        weaponGroup.matrixWorld
      );
      expect(gripWorld.distanceTo(rest.gripPivot)).toBeLessThan(0.002);

      // La pointe doit partir devant et vers le haut le long des doigts, jamais dans le poignet
      const tipProbe = new THREE.Vector3(...bMeta.gripLocalPos)
        .addScaledVector(new THREE.Vector3(...bMeta.handleAxis).normalize(), 1.8)
        .applyMatrix4(weaponGroup.matrixWorld);
      expect(tipProbe.z).toBeLessThan(gripWorld.z - 0.05);
      expect(tipProbe.y).toBeGreaterThan(gripWorld.y + 0.04);
      hands.dispose();
    }
  });

  it('extrait gripMeta et ringLocalPos depuis la silhouette 2D du karambit', () => {
    const w = 140;
    const h = 70;
    const alpha = new Float32Array(w * h);
    for (let y = 14; y <= 36; y++) {
      for (let x = 14; x <= 122; x++) {
        alpha[y * w + x] = 1;
      }
    }
    // Creux de l'anneau à droite (x = 104..116, y = 20..30)
    for (let y = 20; y <= 30; y++) {
      for (let x = 104; x <= 116; x++) {
        alpha[y * w + x] = 0;
      }
    }
    const mesh = buildSculptedMeshData(alpha, w, h, 'lame', 'Karambit');
    expect(mesh.gripMeta).toBeDefined();
    expect(mesh.gripMeta!.gripLocalPos[0]).toBeGreaterThan(0.2);
    expect(mesh.gripMeta!.ringLocalPos).toBeDefined();
    expect(mesh.gripMeta!.ringLocalPos![0]).toBeGreaterThan(mesh.gripMeta!.gripLocalPos[0]);
  });

  it('verrouille chaque couteau DANS la main à chaque frame (zéro couteau volant) et préserve son échelle', () => {
    const cases: Array<{
      arch: 'karambit' | 'couteau';
      knifeType: KnifeType;
      meta: WeaponGripMeta;
    }> = [
      {
        arch: 'karambit',
        knifeType: 'karambit',
        meta: {
          gripLocalPos: [0.68, 0.36, 0],
          handleAxis: [1, 0, 0],
          bladeDir: [0, -1, 0],
          ringLocalPos: [1.55, 0.34, 0],
        },
      },
      {
        arch: 'couteau',
        knifeType: 'baionnette',
        meta: {
          gripLocalPos: [-1.15, -0.06, 0],
          handleAxis: [1, 0, 0],
          bladeDir: [0, 1, 0],
        },
      },
      {
        arch: 'couteau',
        knifeType: 'katana',
        meta: {
          gripLocalPos: [1.3, -0.75, 0],
          handleAxis: [-0.8, 0.6, 0],
          bladeDir: [-0.6, -0.8, 0],
        },
      },
      {
        arch: 'couteau',
        knifeType: 'dague',
        meta: {
          gripLocalPos: [1.1, 0.56, 0],
          handleAxis: [-0.85, -0.52, 0],
          bladeDir: [0.52, -0.85, 0],
        },
      },
    ];

    for (const { arch, knifeType, meta } of cases) {
      const cfg = getFPSWeaponViewConfig(arch);
      const hands = createFPSHands('#38bdf8');
      hands.applyPose(arch);

      const rig = new THREE.Group();
      const weaponMount = new THREE.Group();
      const weaponGroup = new THREE.Group();
      alignBladeWeaponToFist(weaponGroup, arch, hands, cfg, meta);
      weaponMount.add(weaponGroup);
      rig.add(hands.group, weaponMount);

      const rest = captureKnifeRigRestData(arch, cfg, hands, weaponGroup, meta);
      const anim = createKnifeAnimator(knifeType);

      // Position de référence du doigt autour de l'anneau en coordonnées locales de right_hand au repos
      const restRingInHand = rest.ringPivot.clone();
      const rightHandObj = hands.rightArm.getObjectByName('right_hand');
      const mHandRestLocal = new THREE.Matrix4().compose(
        hands.rightArm.position.clone(),
        rightHandObj ? rightHandObj.quaternion.clone() : new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1)
      );
      restRingInHand.applyMatrix4(mHandRestLocal.clone().invert());

      try {
        const triggers: Array<{ label: string; fn: () => void }> = [
          { label: 'draw', fn: () => anim.triggerDraw(true) },
          { label: 'inspect', fn: () => anim.triggerInspect() },
          { label: 'attack1', fn: () => anim.triggerAttack(false) },
          { label: 'attack2', fn: () => anim.triggerAttack(true) },
        ];

        for (const { label, fn } of triggers) {
          fn();
          for (let step = 0; step < 65; step++) {
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
            rig.updateMatrixWorld(true);

            // 1. Aucun écrasement d'échelle
            expect(weaponGroup.scale.x).toBeCloseTo(cfg.scale, 6);
            expect(weaponMount.scale.x).toBeCloseTo(1, 6);

            // 2. Verrouillage physique dans la main (ou autour de l'anneau au doigt pendant twirl karambit)
            const { currentFist, gripWorld, ringWorld } = getCurrentFistAndRingWorld(
              hands,
              weaponGroup,
              meta
            );
            if (knifeType === 'karambit' && (label === 'draw' || label === 'inspect')) {
              hands.group.updateMatrixWorld(true);
              const expectedRingWorld = restRingInHand.clone();
              if (rightHandObj) {
                expectedRingWorld.applyMatrix4(rightHandObj.matrixWorld);
              } else {
                expectedRingWorld.applyMatrix4(rig.matrixWorld);
              }
              expect(ringWorld.distanceTo(expectedRingWorld)).toBeLessThan(0.002);
            } else {
              expect(gripWorld.distanceTo(currentFist)).toBeLessThan(0.002);
            }
          }
        }
      } finally {
        hands.dispose();
      }
    }
  });

  it('gère les interruptions rapides sans conflit ni dérive résiduelle', () => {
    const karambit = createKnifeAnimator('karambit');
    const baionnette = createKnifeAnimator('baionnette');
    const katana = createKnifeAnimator('katana');
    const dague = createKnifeAnimator('dague');

    // 1. Interruption inspect -> attack1 (l'attaque prend la priorité immédiatement sans bloquer)
    karambit.triggerInspect();
    karambit.update(0.25, 250);
    karambit.triggerAttack(false);
    expect(karambit.getState()).toBe('attack1');

    // Une attaque en cours NE DOIT PAS être annulée par inspect (T) ou draw (2)
    karambit.triggerInspect();
    expect(karambit.getState()).toBe('attack1');
    karambit.triggerDraw();
    expect(karambit.getState()).toBe('attack1');

    // 2. Signatures Valorant distinctes
    baionnette.triggerDraw(true);
    katana.triggerDraw(true);
    dague.triggerDraw(true);
    const bDraw = baionnette.update(0.14, 140);
    const kDraw = katana.update(0.14, 140);
    const dDraw = dague.update(0.14, 140);
    // Baïonnette / Katana / Dague n'éjectent JAMAIS le couteau (bladePlaneSpin === 0)
    expect(bDraw.bladePlaneSpin).toBe(0);
    expect(kDraw.bladePlaneSpin).toBe(0);
    expect(dDraw.bladePlaneSpin).toBe(0);
    // Katana traverse latéralement (-X), Baïonnette vient de la droite (+X)
    expect(kDraw.rightArmPos.x).toBeLessThan(0);
    expect(bDraw.rightArmPos.x).toBeGreaterThan(0);

    // 3. Retour propre en idle sans dérive pour les 4 types
    for (let i = 0; i < 80; i++) {
      karambit.update(0.05, 1000 + i * 50);
      baionnette.update(0.05, 1000 + i * 50);
      katana.update(0.05, 1000 + i * 50);
      dague.update(0.05, 1000 + i * 50);
    }
    expect(karambit.getState()).toBe('idle');
    expect(baionnette.getState()).toBe('idle');
    expect(katana.getState()).toBe('idle');
    expect(dague.getState()).toBe('idle');
  });

  it('attaque en estocade vers l’avant (planter le couteau) uniquement avec la main droite sans bouger la main gauche', () => {
    const types: KnifeType[] = ['karambit', 'baionnette', 'katana', 'dague'];
    for (const kType of types) {
      for (const heavy of [false, true]) {
        const anim = createKnifeAnimator(kType);
        anim.triggerAttack(heavy);
        let minRightZ = 0;
        for (let step = 0; step < 35; step++) {
          const pose = anim.update(1 / 60, step * 16.6);
          if (pose.rightArmPos.z < minRightZ) minRightZ = pose.rightArmPos.z;
          if (anim.getState() === 'attack1' || anim.getState() === 'attack2') {
            expect(pose.leftArmPos.length()).toBeLessThan(1e-6);
            expect(Math.abs(pose.leftArmRot.x) + Math.abs(pose.leftArmRot.y) + Math.abs(pose.leftArmRot.z)).toBeLessThan(1e-6);
            expect(pose.rigPos.length()).toBeLessThan(1e-6);
            expect(Math.abs(pose.rigRot.x) + Math.abs(pose.rigRot.y) + Math.abs(pose.rigRot.z)).toBeLessThan(1e-6);
          }
        }
        expect(minRightZ).toBeLessThan(-0.18);
      }
    }
  });
});
