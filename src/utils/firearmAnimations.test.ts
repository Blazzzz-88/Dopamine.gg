import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFPSHands, getFPSWeaponViewConfig } from './fpsHandsBuilder';
import {
  applyFirearmAnimPose,
  captureFirearmRigRestData,
  createFirearmAnimator,
  FirearmSoundEvent,
} from './firearmAnimations';
import { getWeaponMuzzleSide, WeaponArchetype } from './weapon3dBuilder';

function makeEquippedTestRig(archetype: WeaponArchetype, isInternal = archetype === 'pistolet') {
  const cfg = getFPSWeaponViewConfig(archetype);
  const hands = createFPSHands('#38bdf8');
  hands.applyPose(archetype);

  const viewModelRig = new THREE.Group();
  viewModelRig.add(hands.group);
  const weaponMount = new THREE.Group();
  viewModelRig.add(weaponMount);

  const weaponGroup = new THREE.Group();
  const muzzleSide = getWeaponMuzzleSide(archetype);
  weaponGroup.rotation.set(
    cfg.weaponRotOffset[0],
    (muzzleSide === 'left' ? -Math.PI / 2 : Math.PI / 2) + cfg.weaponRotOffset[1],
    cfg.weaponRotOffset[2]
  );
  weaponGroup.scale.setScalar(cfg.scale);
  weaponGroup.position.set(...cfg.weaponPos);

  const magazineGroup = new THREE.Group();
  magazineGroup.visible = !isInternal;
  weaponGroup.add(magazineGroup);
  weaponMount.add(weaponGroup);

  const magMeta = {
    anchorLocalPos: [archetype === 'pistolet' ? -0.9 : -0.15, -0.12, 0] as [number, number, number],
    pullDirLocal: [archetype === 'ak47' ? -0.25 : -0.08, -0.97, 0] as [number, number, number],
    magLengthLocal: 0.9,
    isInternal,
  };
  magazineGroup.position.set(...magMeta.anchorLocalPos);

  const rest = captureFirearmRigRestData(archetype, cfg, weaponGroup, magMeta, magazineGroup);
  return { cfg, hands, viewModelRig, weaponMount, weaponGroup, magazineGroup, rest };
}

describe('firearmAnimations — rechargement avec changement de chargeur & inspection (touche T)', () => {
  it('extrait le chargeur 3D, l’échange hors cadre et émet mag_out -> mag_in -> bolt_rack dans l’ordre', () => {
    const { cfg, hands, viewModelRig, weaponMount, magazineGroup, rest } =
      makeEquippedTestRig('ak47');

    try {
      const anim = createFirearmAnimator('ak47');
      anim.triggerReload(1200);
      expect(anim.getState()).toBe('reload');

      const events: FirearmSoundEvent[] = [];
      let maxSlide = 0;
      let sawHiddenSwap = false;
      let sawTilt = false;

      for (let i = 0; i < 72; i++) {
        const pose = anim.update(0.02, i * 20);
        events.push(...pose.events);
        if (pose.magSlide > maxSlide) maxSlide = pose.magSlide;
        if (pose.state === 'reload' && !pose.magVisible) sawHiddenSwap = true;
        if (Math.abs(pose.magTilt) > 0.05) sawTilt = true;

        applyFirearmAnimPose(
          viewModelRig,
          weaponMount,
          hands,
          rest,
          cfg.rigPosHip,
          cfg.rigRotBase,
          pose
        );
        expect(Number.isFinite(viewModelRig.position.y)).toBe(true);
        expect(Number.isFinite(magazineGroup.position.y)).toBe(true);
      }

      // Ordre strict des bruitages mécaniques
      expect(events).toEqual(['mag_out', 'mag_in', 'bolt_rack']);
      // Le chargeur sort franchement du puits et bascule (rock-and-lock AK-47)
      expect(maxSlide).toBeGreaterThan(1.5);
      expect(sawHiddenSwap).toBe(true);
      expect(sawTilt).toBe(true);

      // Retour à zéro parfait sans dérive
      expect(anim.getState()).toBe('idle');
      expect(magazineGroup.position.distanceTo(rest.magAnchorLocal)).toBeLessThan(1e-5);
      expect(viewModelRig.position.x).toBeCloseTo(cfg.rigPosHip[0], 5);
      expect(viewModelRig.rotation.y).toBeCloseTo(0, 5);
    } finally {
      hands.dispose();
    }
  });

  it('rend visible et sort le chargeur interne sur pistolet puis le masque une fois réenclenché', () => {
    const { cfg, hands, viewModelRig, weaponMount, magazineGroup, rest } =
      makeEquippedTestRig('pistolet', true);

    try {
      const anim = createFirearmAnimator('pistolet');
      const idlePose = anim.update(0.016, 0);
      applyFirearmAnimPose(
        viewModelRig,
        weaponMount,
        hands,
        rest,
        cfg.rigPosHip,
        cfg.rigRotBase,
        idlePose
      );
      expect(magazineGroup.visible).toBe(false);

      anim.triggerReload(950);
      let sawMagVisible = false;
      for (let i = 0; i < 60; i++) {
        const pose = anim.update(0.02, i * 20);
        applyFirearmAnimPose(
          viewModelRig,
          weaponMount,
          hands,
          rest,
          cfg.rigPosHip,
          cfg.rigRotBase,
          pose
        );
        if (pose.state === 'reload' && pose.magVisible && pose.magSlide > 0.2) {
          sawMagVisible = true;
        }
      }

      expect(sawMagVisible).toBe(true);
      expect(anim.getState()).toBe('idle');
      expect(magazineGroup.visible).toBe(false);
    } finally {
      hands.dispose();
    }
  });

  it('anime temporairement le bras gauche lors du rechargement du MAC-10 puis le replie proprement', () => {
    const { cfg, hands, viewModelRig, weaponMount, rest } = makeEquippedTestRig('mac10');

    try {
      expect(hands.leftArm.visible).toBe(false);
      const anim = createFirearmAnimator('mac10');
      anim.triggerReload(1100);

      let sawLeftArmActive = false;
      for (let i = 0; i < 65; i++) {
        const pose = anim.update(0.02, i * 20);
        applyFirearmAnimPose(
          viewModelRig,
          weaponMount,
          hands,
          rest,
          cfg.rigPosHip,
          cfg.rigRotBase,
          pose
        );
        if (pose.state === 'reload' && hands.leftArm.visible) {
          sawLeftArmActive = true;
        }
      }

      expect(sawLeftArmActive).toBe(true);
      expect(anim.getState()).toBe('idle');
      expect(hands.leftArm.visible).toBe(false);
    } finally {
      hands.dispose();
    }
  });

  it('joue une animation d’inspection complète (T) pour chaque arme à feu et peut être interrompue par le tir ou rechargement', () => {
    const firearms: WeaponArchetype[] = ['ar15', 'ar15_sil', 'ak47', 'awp', 'pistolet', 'mac10'];

    for (const arch of firearms) {
      const { cfg, hands, viewModelRig, weaponMount, rest } = makeEquippedTestRig(
        arch,
        arch === 'pistolet'
      );
      try {
        const anim = createFirearmAnimator(arch);
        anim.triggerInspect();
        expect(anim.getState()).toBe('inspect');

        const events: FirearmSoundEvent[] = [];
        let maxAbsYaw = 0;
        let maxAbsRoll = 0;

        for (let i = 0; i < 200; i++) {
          const pose = anim.update(0.02, i * 20);
          events.push(...pose.events);
          maxAbsYaw = Math.max(maxAbsYaw, Math.abs(pose.rigRot.y));
          maxAbsRoll = Math.max(maxAbsRoll, Math.abs(pose.rigRot.z));
          applyFirearmAnimPose(
            viewModelRig,
            weaponMount,
            hands,
            rest,
            cfg.rigPosHip,
            cfg.rigRotBase,
            pose
          );
          if (anim.getState() === 'idle') break;
        }

        expect(events).toContain('inspect_start');
        expect(events).toContain('inspect_check');
        expect(maxAbsYaw).toBeGreaterThan(0.35);
        expect(maxAbsRoll).toBeGreaterThan(0.35);
        expect(anim.getState()).toBe('idle');
        expect(viewModelRig.rotation.x).toBeCloseTo(0, 5);
        expect(viewModelRig.rotation.y).toBeCloseTo(0, 5);
        expect(viewModelRig.rotation.z).toBeCloseTo(0, 5);

        // Interruption immédiate par tir (cancel) ou rechargement
        anim.triggerInspect();
        anim.update(0.25, 250);
        expect(anim.getState()).toBe('inspect');
        anim.cancel();
        expect(anim.getState()).toBe('idle');

        anim.triggerInspect();
        anim.triggerReload(1000);
        expect(anim.getState()).toBe('reload');
      } finally {
        hands.dispose();
      }
    }
  });
});
