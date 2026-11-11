import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ARENA_FLOOR_SIZE,
  ARENA_LIMIT,
  ARENA_WALL_COORD,
  ARENA_WALL_LENGTH,
  createZombieArena,
  isPointClearOfObstacles,
  resolveArenaCircleCollision,
  stepZombieTowardPlayer,
} from './zombieArenaBuilder';

describe('zombieArenaBuilder — architecture 3D épurée & dimensions strictes', () => {
  it('préserve strictement les dimensions exactes de la map actuelle (ARENA_LIMIT=18.5, murs ±21, sol 46x46)', () => {
    expect(ARENA_LIMIT).toBe(18.5);
    expect(ARENA_WALL_COORD).toBe(21);
    expect(ARENA_WALL_LENGTH).toBe(44);
    expect(ARENA_FLOOR_SIZE).toBe(46);

    const arena = createZombieArena(4);
    try {
      arena.group.updateMatrixWorld(true);

      const floor = arena.group.getObjectByName('arena_floor');
      expect(floor).toBeDefined();
      const floorBox = new THREE.Box3().setFromObject(floor!);
      expect(floorBox.min.x).toBeCloseTo(-23, 2);
      expect(floorBox.max.x).toBeCloseTo(23, 2);
      expect(floorBox.min.z).toBeCloseTo(-23, 2);
      expect(floorBox.max.z).toBeCloseTo(23, 2);

      const wallGroup = arena.group.getObjectByName('arena_perimeter_walls');
      expect(wallGroup).toBeDefined();
      const wallBoxes: THREE.Box3[] = [];
      wallGroup!.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.name === 'perimeter_wall') {
          wallBoxes.push(new THREE.Box3().setFromObject(obj));
        }
      });
      expect(wallBoxes.length).toBe(4);
      // North/South walls at z = ±21, West/East walls at x = ±21
      const zCenters = wallBoxes.map((b) => (b.min.z + b.max.z) * 0.5);
      const xCenters = wallBoxes.map((b) => (b.min.x + b.max.x) * 0.5);
      expect(zCenters.some((z) => Math.abs(z + 21) < 0.05)).toBe(true);
      expect(zCenters.some((z) => Math.abs(z - 21) < 0.05)).toBe(true);
      expect(xCenters.some((x) => Math.abs(x + 21) < 0.05)).toBe(true);
      expect(xCenters.some((x) => Math.abs(x - 21) < 0.05)).toBe(true);

      // Player spawn (0, 4) must remain completely clear with wide margin
      expect(isPointClearOfObstacles(0, 4, 2.5, arena.colliders, ARENA_LIMIT)).toBe(true);
    } finally {
      arena.dispose();
    }
  });

  it('ajoute des bâtiments extérieurs hors périmètre ainsi que bâtiments, poteaux et murets intérieurs sans empiéter', () => {
    const arena = createZombieArena(4);
    try {
      arena.group.updateMatrixWorld(true);

      // Exterior buildings stay strictly outside the ±20.6 inner arena walls
      const skyline = arena.group.getObjectByName('arena_surrounding_buildings');
      expect(skyline).toBeDefined();
      let extBuildingCount = 0;
      for (const child of skyline!.children) {
        if (child.name === 'exterior_building') {
          extBuildingCount += 1;
          const box = new THREE.Box3().setFromObject(child);
          const outsideX = box.max.x < -21.2 || box.min.x > 21.2;
          const outsideZ = box.max.z < -21.2 || box.min.z > 21.2;
          expect(outsideX || outsideZ).toBe(true);
        }
      }
      expect(extBuildingCount).toBeGreaterThanOrEqual(12);

      // Interior colliders cover buildings, pillars, poles, and low cover within ARENA_LIMIT
      const kinds = new Set(arena.colliders.map((c) => c.kind));
      expect(kinds.has('building')).toBe(true);
      expect(kinds.has('pillar')).toBe(true);
      expect(kinds.has('pole')).toBe(true);
      expect(kinds.has('cover')).toBe(true);

      // Verify none of the interior colliders overlap each other
      for (let i = 0; i < arena.colliders.length; i++) {
        const a = arena.colliders[i];
        expect(a.minX).toBeGreaterThanOrEqual(-ARENA_LIMIT);
        expect(a.maxX).toBeLessThanOrEqual(ARENA_LIMIT);
        expect(a.minZ).toBeGreaterThanOrEqual(-ARENA_LIMIT);
        expect(a.maxZ).toBeLessThanOrEqual(ARENA_LIMIT);
        for (let j = i + 1; j < arena.colliders.length; j++) {
          const b = arena.colliders[j];
          const overlapX = a.minX < b.maxX && a.maxX > b.minX;
          const overlapZ = a.minZ < b.maxZ && a.maxZ > b.minZ;
          expect(overlapX && overlapZ).toBe(false);
        }
      }

      // Raycasting blocks bullets through solid pavilions while clearing low cover at eye height (1.65)
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(-12.2, 1.5, 0),
        new THREE.Vector3(0, 0, -1),
        0,
        40
      );
      const buildingHits = raycaster.intersectObjects(arena.occluders, false);
      expect(buildingHits.length).toBeGreaterThan(0);
      expect(buildingHits[0].distance).toBeLessThan(12);

      raycaster.set(new THREE.Vector3(0, 1.65, -4), new THREE.Vector3(0, 0, -1));
      const overCoverHits = raycaster.intersectObjects(arena.occluders, false);
      // Should pass cleanly over cover_north_center (at z=-11.5, height=1.15) and hit North wall (z=-20.6)
      expect(overCoverHits.length).toBeGreaterThan(0);
      expect(overCoverHits[0].distance).toBeGreaterThan(15);
    } finally {
      arena.dispose();
    }
  });

  it('résout les collisions joueur/zombie et contourne les bâtiments sans blocage', () => {
    const arena = createZombieArena(1);
    try {
      // Clamps strictly to ARENA_LIMIT
      const clamped = resolveArenaCircleCollision(25, -24, 0.45, arena.colliders, ARENA_LIMIT);
      expect(clamped.x).toBe(ARENA_LIMIT);
      expect(clamped.z).toBe(-ARENA_LIMIT);

      // Pushes smoothly out of northwest pavilion (-12.2, -12.0)
      const pushed = resolveArenaCircleCollision(-12.2, -12.0, 0.45, arena.colliders, ARENA_LIMIT);
      expect(pushed.collided).toBe(true);
      expect(isPointClearOfObstacles(pushed.x, pushed.z, 0.44, arena.colliders, ARENA_LIMIT)).toBe(true);

      // Zombie placed directly behind northwest pavilion successfully steers around it toward player (0, 4)
      let zx = -12.2;
      let zz = -15.5;
      for (let step = 0; step < 90; step++) {
        const next = stepZombieTowardPlayer(zx, zz, 0, 4, 0.14, 0.42, 1, arena.colliders, ARENA_LIMIT);
        zx = next.x;
        zz = next.z;
      }
      expect(zz).toBeGreaterThan(-10.0);
    } finally {
      arena.dispose();
    }
  });
});
