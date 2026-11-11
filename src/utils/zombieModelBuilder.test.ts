import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ZOMBIE_TIERS, ZombieTier } from './zombieEngine';
import { createZombie3DModel, createZombieAssetBank } from './zombieModelBuilder';

function countModelTriangles(root: THREE.Object3D): {
  meshCount: number;
  triangleCount: number;
  usesBoxGeometry: boolean;
} {
  let meshCount = 0;
  let triangleCount = 0;
  let usesBoxGeometry = false;

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      meshCount += 1;
      if (obj.geometry instanceof THREE.BoxGeometry) {
        usesBoxGeometry = true;
      }
      const idx = obj.geometry.index;
      if (idx) {
        triangleCount += idx.count / 3;
      } else {
        const pos = obj.geometry.attributes.position;
        if (pos) triangleCount += pos.count / 3;
      }
    }
  });

  return { meshCount, triangleCount, usesBoxGeometry };
}

describe('zombieModelBuilder high-detail non-pixelated 3D models', () => {
  const tiers: ZombieTier[] = ['standard', 'rapide', 'colosse'];

  it('builds smooth high-polygon anatomical zombie meshes with zero boxy BoxGeometry primitives', () => {
    const bank = createZombieAssetBank(8);
    try {
      for (const tier of tiers) {
        const model = createZombie3DModel(tier, bank);
        try {
          model.root.updateMatrixWorld(true);
          const stats = countModelTriangles(model.root);

          expect(stats.usesBoxGeometry).toBe(false);
          expect(stats.meshCount).toBeGreaterThanOrEqual(45);
          expect(stats.triangleCount).toBeGreaterThanOrEqual(8000);
        } finally {
          model.dispose();
        }
      }
    } finally {
      bank.dispose();
    }
  });

  it('grounds boots cleanly near y=0 and differentiates proportions across standard, rapide, and colosse', () => {
    const heights: Record<ZombieTier, number> = { standard: 0, rapide: 0, colosse: 0 };
    const widths: Record<ZombieTier, number> = { standard: 0, rapide: 0, colosse: 0 };

    for (const tier of tiers) {
      const model = createZombie3DModel(tier);
      try {
        model.root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model.root);
        const size = new THREE.Vector3();
        box.getSize(size);

        // Boots rest smoothly near the arena floor plane (y = 0)
        expect(box.min.y).toBeGreaterThanOrEqual(-0.08);
        expect(box.min.y).toBeLessThanOrEqual(0.08);

        heights[tier] = size.y;
        widths[tier] = size.x;
        expect(size.y).toBeGreaterThan(1.5 * ZOMBIE_TIERS[tier].scale);
      } finally {
        model.dispose();
      }
    }

    expect(heights.colosse).toBeGreaterThan(heights.standard);
    expect(heights.standard).toBeGreaterThan(heights.rapide);
    expect(widths.colosse).toBeGreaterThan(widths.standard);
    expect(widths.standard).toBeGreaterThan(widths.rapide);
  });

  it('tags all head meshes as head and torso/limbs as body, supporting accurate FPS raycast headshots', () => {
    const model = createZombie3DModel('standard');
    try {
      let headMeshCount = 0;
      let bodyMeshCount = 0;

      model.headGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          expect(obj.userData.part).toBe('head');
          headMeshCount += 1;
        }
      });

      model.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          expect(['head', 'body']).toContain(obj.userData.part);
          if (obj.userData.part === 'body') bodyMeshCount += 1;
        }
      });

      expect(headMeshCount).toBeGreaterThanOrEqual(15);
      expect(bodyMeshCount).toBeGreaterThanOrEqual(30);

      model.root.updateMatrixWorld(true);
      const headCenter = new THREE.Vector3();
      new THREE.Box3().setFromObject(model.headGroup).getCenter(headCenter);

      // Raycast directly from front (+Z) into the skull center -> must score 'head'
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(headCenter.x, headCenter.y, 2.5),
        new THREE.Vector3(0, 0, -1)
      );
      const headHits = raycaster.intersectObject(model.root, true);
      expect(headHits.length).toBeGreaterThan(0);
      expect(headHits[0].object.userData.part).toBe('head');

      // Raycast at chest height -> must score 'body'
      raycaster.set(new THREE.Vector3(0, 1.18, 2.5), new THREE.Vector3(0, 0, -1));
      const bodyHits = raycaster.intersectObject(model.root, true);
      expect(bodyHits.length).toBeGreaterThan(0);
      expect(bodyHits[0].object.userData.part).toBe('body');
    } finally {
      model.dispose();
    }
  });

  it('articulates walk, lunge attack, and hit-flash recovery cleanly without leaving emissives stuck', () => {
    const model = createZombie3DModel('colosse');
    try {
      const leftLeg = model.root.getObjectByName('zombie_left_leg')!;
      const rightLeg = model.root.getObjectByName('zombie_right_leg')!;
      const leftArm = model.root.getObjectByName('zombie_left_arm')!;
      const jaw = model.root.getObjectByName('zombie_jaw')!;

      expect(leftLeg).toBeDefined();
      expect(rightLeg).toBeDefined();
      expect(leftArm).toBeDefined();
      expect(jaw).toBeDefined();

      model.animate(0, 0.016, { isAttacking: false });
      const leg0 = leftLeg.rotation.x;
      model.animate(Math.PI * 0.5, 0.016, { isAttacking: false });
      expect(leftLeg.rotation.x).not.toBeCloseTo(leg0, 3);
      expect(Math.sign(leftLeg.rotation.x)).not.toBe(Math.sign(rightLeg.rotation.x));

      const jawWalk = jaw.rotation.x;
      model.animate(Math.PI * 0.5, 0.12, { isAttacking: true, flinch: 0.5 });
      expect(Number.isFinite(leftArm.rotation.x)).toBe(true);
      expect(jaw.rotation.x).toBeGreaterThan(jawWalk);

      // Verify hit flash sets emissive toward white and cleanly restores baseline on 0
      const sampleMeshes: THREE.Mesh[] = [];
      model.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) sampleMeshes.push(obj);
      });
      const clothMesh = sampleMeshes.find((m) => (m.material as THREE.MeshStandardMaterial).roughness >= 0.89)!;
      const clothMat = clothMesh.material as THREE.MeshStandardMaterial;
      const baseHex = clothMat.emissive.getHex();
      const baseIntensity = clothMat.emissiveIntensity;

      model.setHitFlash(1);
      expect(clothMat.emissive.getHex()).toBe(0xffffff);
      expect(clothMat.emissiveIntensity).toBeGreaterThan(baseIntensity);

      model.setHitFlash(0);
      expect(clothMat.emissive.getHex()).toBe(baseHex);
      expect(clothMat.emissiveIntensity).toBe(baseIntensity);
    } finally {
      model.dispose();
    }
  });
});
