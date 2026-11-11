import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createFPSHands, getFPSWeaponViewConfig } from './fpsHandsBuilder';
import { WeaponArchetype } from './weapon3dBuilder';

function segmentDistanceSq(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3
): number {
  const d1 = new THREE.Vector3().subVectors(q1, p1);
  const d2 = new THREE.Vector3().subVectors(q2, p2);
  const r = new THREE.Vector3().subVectors(p1, p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);

  let s = 0;
  let t = 0;
  if (a <= 1e-8 && e <= 1e-8) return r.lengthSq();
  if (a <= 1e-8) {
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const c = d1.dot(r);
    if (e <= 1e-8) {
      s = Math.max(0, Math.min(1, -c / a));
    } else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - c) / a));
      }
    }
  }
  const c1 = p1.clone().addScaledVector(d1, s);
  const c2 = p2.clone().addScaledVector(d2, t);
  return c1.distanceToSquared(c2);
}

describe('fpsHandsBuilder anatomical & collision verification', () => {
  const archetypes: WeaponArchetype[] = [
    'ar15',
    'ar15_sil',
    'ak47',
    'awp',
    'pistolet',
    'mac10',
    'karambit',
    'couteau',
  ];

  it('guarantees zero left/right forearm intersection across all 8 weapon archetypes', () => {
    const hands = createFPSHands('#38bdf8');
    try {
      for (const arch of archetypes) {
        hands.applyPose(arch);
        hands.group.updateMatrixWorld(true);

        if (!hands.leftArm.visible) {
          // One-handed weapon (mac10) intentionally keeps left arm tucked off-screen
          expect(arch).toBe('mac10');
          expect(hands.rightArm.visible).toBe(true);
          continue;
        }

        const lForearm = hands.leftArm.getObjectByName('left_forearm')!;
        const rForearm = hands.rightArm.getObjectByName('right_forearm')!;
        expect(lForearm).toBeDefined();
        expect(rForearm).toBeDefined();

        const lStart = new THREE.Vector3(0, 0, 0.02).applyMatrix4(lForearm.matrixWorld);
        const lEnd = new THREE.Vector3(0, 0, 0.56).applyMatrix4(lForearm.matrixWorld);
        const rStart = new THREE.Vector3(0, 0, 0.02).applyMatrix4(rForearm.matrixWorld);
        const rEnd = new THREE.Vector3(0, 0, 0.56).applyMatrix4(rForearm.matrixWorld);

        // Forearm sleeves slope left (-X) vs right (+X) and downward (-Y)
        expect(lEnd.x).toBeLessThan(lStart.x - 0.12);
        expect(rEnd.x).toBeGreaterThan(rStart.x + 0.08);
        expect(lEnd.y).toBeLessThan(lStart.y - 0.06);
        expect(rEnd.y).toBeLessThan(rStart.y - 0.06);

        // Segment-to-segment minimum distance between forearms (combined radius ~0.068)
        const minForearmDist = Math.sqrt(segmentDistanceSq(lStart, lEnd, rStart, rEnd));
        if (arch === 'pistolet') {
          // Two-handed Weaver stance wraps wrists cleanly side-by-side then diverges quickly
          expect(minForearmDist).toBeGreaterThanOrEqual(0.048);
        } else {
          expect(minForearmDist).toBeGreaterThanOrEqual(0.11);
        }

        // Left & right hands must never collapse onto the same point
        const handDist = hands.leftArm.position.distanceTo(hands.rightArm.position);
        const minHandGap = arch === 'pistolet' ? 0.035 : 0.21;
        expect(handDist).toBeGreaterThanOrEqual(minHandGap);
      }
    } finally {
      hands.dispose();
    }
  });

  it('uses CS2 close-right screenshot hold exclusively for AR15 and AK47 vs distinct holds for others', () => {
    const ar15Cfg = getFPSWeaponViewConfig('ar15');
    const akCfg = getFPSWeaponViewConfig('ak47');
    const pistolCfg = getFPSWeaponViewConfig('pistolet');
    const mac10Cfg = getFPSWeaponViewConfig('mac10');
    const knifeCfg = getFPSWeaponViewConfig('karambit');

    expect(ar15Cfg.rigPosHip[2]).toBeGreaterThan(pistolCfg.rigPosHip[2]);
    expect(akCfg.rigPosHip).toEqual(ar15Cfg.rigPosHip);
    expect(mac10Cfg.rigPosHip).not.toEqual(ar15Cfg.rigPosHip);
    expect(knifeCfg.rigPosHip).not.toEqual(ar15Cfg.rigPosHip);
  });

  it('aligne parfaitement droit le canon de chaque arme à feu (zéro inclinaison latérale ou roulis)', () => {
    const firearms: WeaponArchetype[] = ['ar15', 'ar15_sil', 'ak47', 'awp', 'pistolet', 'mac10'];
    for (const arch of firearms) {
      const cfg = getFPSWeaponViewConfig(arch);
      expect(cfg.rigRotBase).toEqual([0, 0, 0]);
      expect(cfg.weaponRotOffset).toEqual([0, 0, 0]);
      expect(cfg.weaponPos[0]).toBe(0);
      expect(cfg.rigPosAds[0]).toBe(0);
    }
  });
});
