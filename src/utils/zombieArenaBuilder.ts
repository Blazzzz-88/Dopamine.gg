import * as THREE from 'three';

/** Strictly matches the playable half-extent of the Zombie FPS arena. */
export const ARENA_LIMIT = 18.5;

/** Strictly matches the existing 44x44 perimeter wall coordinates (±21). */
export const ARENA_WALL_COORD = 21;
export const ARENA_WALL_LENGTH = 44;
export const ARENA_WALL_THICKNESS = 0.8;
export const ARENA_WALL_HEIGHT = 4.2;
export const ARENA_FLOOR_SIZE = 46;

export type ArenaColliderKind = 'building' | 'pillar' | 'pole' | 'cover';

export interface ArenaBoxCollider {
  id: string;
  kind: ArenaColliderKind;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
}

export interface ZombieArenaScene {
  group: THREE.Group;
  colliders: ArenaBoxCollider[];
  /** Solid meshes (interior obstacles + perimeter walls + floor) that block bullets & tracers. */
  occluders: THREE.Object3D[];
  dispose: () => void;
}

interface ExteriorBuildingSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  hasPenthouse?: boolean;
  hasSpire?: boolean;
  windowTone?: 'cyan' | 'warm';
  finCount?: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Generates a subtle, sleek architectural concrete slab texture for the arena floor.
 * Safely returns null in headless environments without 2D canvas support.
 */
function createCourtyardFloorTexture(maxAnisotropy: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0c1423';
  ctx.fillRect(0, 0, 512, 512);

  // Subtle alternating slab sheen
  const tile = 128;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const shade = (row + col) % 2 === 0 ? '#0e1728' : '#0b1220';
      ctx.fillStyle = shade;
      ctx.fillRect(col * tile + 2, row * tile + 2, tile - 4, tile - 4);
    }
  }

  // Clean recessed architectural joint lines
  ctx.strokeStyle = '#17253e';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 512; i += tile) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  // Ultra-fine secondary score lines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.045)';
  ctx.lineWidth = 1;
  for (let i = tile / 2; i < 512; i += tile) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(11, 11);
  tex.anisotropy = clamp(maxAnisotropy, 1, 16);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Checks whether a horizontal circle at (x, z) is free of all obstacle colliders
 * and strictly inside [-arenaLimit, arenaLimit].
 */
export function isPointClearOfObstacles(
  x: number,
  z: number,
  radius: number,
  colliders: readonly ArenaBoxCollider[],
  arenaLimit = ARENA_LIMIT
): boolean {
  if (Math.abs(x) > arenaLimit || Math.abs(z) > arenaLimit) return false;
  const rSq = radius * radius;
  for (const box of colliders) {
    const cx = clamp(x, box.minX, box.maxX);
    const cz = clamp(z, box.minZ, box.maxZ);
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < rSq) return false;
  }
  return true;
}

/**
 * Resolves circle-vs-AABB collisions and clamps coordinates within [-arenaLimit, arenaLimit],
 * allowing players and zombies to slide smoothly along buildings, pillars, poles, and cover.
 */
export function resolveArenaCircleCollision(
  x: number,
  z: number,
  radius: number,
  colliders: readonly ArenaBoxCollider[],
  arenaLimit = ARENA_LIMIT
): { x: number; z: number; collided: boolean; pushX: number; pushZ: number } {
  let rx = clamp(x, -arenaLimit, arenaLimit);
  let rz = clamp(z, -arenaLimit, arenaLimit);
  let collided = false;
  let totalPushX = 0;
  let totalPushZ = 0;

  for (let pass = 0; pass < 2; pass++) {
    for (const box of colliders) {
      const cx = clamp(rx, box.minX, box.maxX);
      const cz = clamp(rz, box.minZ, box.maxZ);
      const dx = rx - cx;
      const dz = rz - cz;
      const distSq = dx * dx + dz * dz;

      if (distSq > 0 && distSq < radius * radius) {
        const dist = Math.sqrt(distSq);
        const pen = radius - dist;
        const nx = dx / dist;
        const nz = dz / dist;
        rx += nx * pen;
        rz += nz * pen;
        totalPushX += nx * pen;
        totalPushZ += nz * pen;
        collided = true;
      } else if (distSq === 0) {
        // Center landed strictly inside box; push out through nearest face
        const dLeft = rx - box.minX;
        const dRight = box.maxX - rx;
        const dTop = rz - box.minZ;
        const dBottom = box.maxZ - rz;
        const minEdge = Math.min(dLeft, dRight, dTop, dBottom);
        let px = 0;
        let pz = 0;
        if (minEdge === dLeft) px = -(dLeft + radius);
        else if (minEdge === dRight) px = dRight + radius;
        else if (minEdge === dTop) pz = -(dTop + radius);
        else pz = dBottom + radius;
        rx += px;
        rz += pz;
        totalPushX += px;
        totalPushZ += pz;
        collided = true;
      }
    }
    rx = clamp(rx, -arenaLimit, arenaLimit);
    rz = clamp(rz, -arenaLimit, arenaLimit);
  }

  return { x: rx, z: rz, collided, pushX: totalPushX, pushZ: totalPushZ };
}

/**
 * Advances a zombie smoothly toward the player while resolving obstacle collisions
 * and applying tangential wall-slide steering so zombies never stall behind buildings or pillars.
 */
export function stepZombieTowardPlayer(
  zx: number,
  zz: number,
  playerX: number,
  playerZ: number,
  stepDist: number,
  radius: number,
  steerSign: number,
  colliders: readonly ArenaBoxCollider[],
  arenaLimit = ARENA_LIMIT
): { x: number; z: number } {
  const dx = playerX - zx;
  const dz = playerZ - zz;
  const dist = Math.hypot(dx, dz) || 1;
  const dirX = dx / dist;
  const dirZ = dz / dist;

  const first = resolveArenaCircleCollision(
    zx + dirX * stepDist,
    zz + dirZ * stepDist,
    radius,
    colliders,
    arenaLimit
  );

  if (!first.collided) {
    return { x: first.x, z: first.z };
  }

  // Measure progress made along intended direction toward player
  const progress = (first.x - zx) * dirX + (first.z - zz) * dirZ;
  if (progress >= stepDist * 0.45) {
    return { x: first.x, z: first.z };
  }

  // Blocked head-on: slide tangentially around the obstacle normal toward player side
  const pLen = Math.hypot(first.pushX, first.pushZ);
  if (pLen < 1e-5) return { x: first.x, z: first.z };
  const nx = first.pushX / pLen;
  const nz = first.pushZ / pLen;

  // Tangent candidates (-nz, nx) and (nz, -nx)
  const t1x = -nz;
  const t1z = nx;
  const dot1 = t1x * dirX + t1z * dirZ;
  const side = Math.abs(dot1) > 0.12 ? Math.sign(dot1) : steerSign >= 0 ? 1 : -1;

  const slideStep = stepDist * 0.92;
  const second = resolveArenaCircleCollision(
    first.x + t1x * side * slideStep,
    first.z + t1z * side * slideStep,
    radius,
    colliders,
    arenaLimit
  );

  return { x: second.x, z: second.z };
}

/**
 * Builds the sleek ("épuré") 3D architectural Zombie FPS arena while strictly
 * preserving the original 44x44 perimeter walls (±21) and ARENA_LIMIT (18.5).
 */
export function createZombieArena(maxAnisotropy = 8): ZombieArenaScene {
  const group = new THREE.Group();
  group.name = 'zombie_arena_root';

  const colliders: ArenaBoxCollider[] = [];
  const occluders: THREE.Object3D[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.add(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.add(m);
    return m;
  };

  // Shared Architectural Materials (Sleek Dark Brutalist / Minimalist Containment Courtyard)
  const floorTex = createCourtyardFloorTexture(maxAnisotropy);
  if (floorTex) textures.add(floorTex);

  const floorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: floorTex ? '#ffffff' : '#0c1423',
      map: floorTex ?? null,
      roughness: 0.86,
      metalness: 0.14,
    })
  );
  const outerGroundMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#070b14',
      roughness: 0.96,
      metalness: 0.04,
    })
  );
  const concreteMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#131d2f',
      roughness: 0.78,
      metalness: 0.16,
    })
  );
  const slateMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1d2b42',
      roughness: 0.68,
      metalness: 0.22,
    })
  );
  const steelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#0e1624',
      roughness: 0.4,
      metalness: 0.68,
    })
  );
  const darkGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#09101d',
      roughness: 0.22,
      metalness: 0.78,
    })
  );
  const cyanGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.85,
      roughness: 0.3,
      metalness: 0.1,
    })
  );
  const roseGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#fb7185',
      emissive: '#e11d48',
      emissiveIntensity: 0.72,
      roughness: 0.3,
      metalness: 0.1,
    })
  );
  const lampGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#f0f9ff',
      emissive: '#bae6fd',
      emissiveIntensity: 1.35,
      roughness: 0.2,
    })
  );
  const windowWarmMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#e2e8f0',
      emissive: '#94a3b8',
      emissiveIntensity: 0.36,
      roughness: 0.35,
    })
  );
  const windowCyanMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#7dd3fc',
      emissive: '#0369a1',
      emissiveIntensity: 0.44,
      roughness: 0.35,
    })
  );

  // Helper to place a box mesh cleanly grounded at baseY
  const addBox = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x: number,
    baseY: number,
    z: number,
    name?: string
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.set(x, baseY + h * 0.5, z);
    if (name) mesh.name = name;
    parent.add(mesh);
    return mesh;
  };

  // 1. Courtyard Floor (strictly 46x46 matching original) + Outer Horizon Ground
  const floorGeo = trackGeo(new THREE.PlaneGeometry(ARENA_FLOOR_SIZE, ARENA_FLOOR_SIZE));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'arena_floor';
  group.add(floor);
  occluders.push(floor);

  const outerFloor = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(160, 160)), outerGroundMat);
  outerFloor.rotation.x = -Math.PI / 2;
  outerFloor.position.y = -0.04;
  outerFloor.name = 'arena_outer_ground';
  group.add(outerFloor);

  // Subtle architectural perimeter boundary frame flush at ±19.2 & central courtyard ring
  const trimSpan = 38.6;
  const trimOffset = 19.3;
  addBox(group, trimSpan, 0.014, 0.16, slateMat, 0, 0, -trimOffset);
  addBox(group, trimSpan, 0.014, 0.16, slateMat, 0, 0, trimOffset);
  addBox(group, 0.16, 0.014, trimSpan, slateMat, -trimOffset, 0, 0);
  addBox(group, 0.16, 0.014, trimSpan, slateMat, trimOffset, 0, 0);

  const centerRingGeo = trackGeo(new THREE.RingGeometry(3.4, 3.65, 48));
  const centerRing = new THREE.Mesh(centerRingGeo, slateMat);
  centerRing.rotation.x = -Math.PI / 2;
  centerRing.position.y = 0.01;
  group.add(centerRing);

  // 2. Perimeter Containment Walls (strictly centered at ±21, length 44) + Corner Bastion Towers
  const wallGroup = new THREE.Group();
  wallGroup.name = 'arena_perimeter_walls';
  group.add(wallGroup);

  const buildPerimeterWall = (
    x: number,
    z: number,
    isHorizontal: boolean,
    accentMat: THREE.Material,
    inwardSign: number
  ) => {
    const w = isHorizontal ? ARENA_WALL_LENGTH : ARENA_WALL_THICKNESS;
    const d = isHorizontal ? ARENA_WALL_THICKNESS : ARENA_WALL_LENGTH;

    // Main wall body + base plinth + sleek overhanging coping
    const body = addBox(wallGroup, w, ARENA_WALL_HEIGHT, d, concreteMat, x, 0, z, 'perimeter_wall');
    occluders.push(body);

    addBox(
      wallGroup,
      isHorizontal ? w : 1.06,
      0.38,
      isHorizontal ? 1.06 : d,
      slateMat,
      x,
      0,
      z
    );
    addBox(
      wallGroup,
      isHorizontal ? w : 1.04,
      0.24,
      isHorizontal ? 1.04 : d,
      slateMat,
      x,
      ARENA_WALL_HEIGHT,
      z
    );

    // Subtle inward recessed luminous architectural band
    const stripOffset = inwardSign * (ARENA_WALL_THICKNESS * 0.5 + 0.02);
    addBox(
      wallGroup,
      isHorizontal ? ARENA_WALL_LENGTH - 4 : 0.05,
      0.07,
      isHorizontal ? 0.05 : ARENA_WALL_LENGTH - 4,
      accentMat,
      isHorizontal ? x : x + stripOffset,
      3.55,
      isHorizontal ? z + stripOffset : z
    );

    // Spaced structural pilasters ("poteaux de mur") breaking up flat wall spans
    const offsets = [-14, -7, 0, 7, 14];
    for (const off of offsets) {
      const px = isHorizontal ? off : x;
      const pz = isHorizontal ? z : off;
      addBox(
        wallGroup,
        isHorizontal ? 0.56 : 1.14,
        ARENA_WALL_HEIGHT + 0.36,
        isHorizontal ? 1.14 : 0.56,
        steelMat,
        px,
        0,
        pz
      );
    }
  };

  buildPerimeterWall(0, -ARENA_WALL_COORD, true, roseGlowMat, 1);
  buildPerimeterWall(0, ARENA_WALL_COORD, true, cyanGlowMat, -1);
  buildPerimeterWall(-ARENA_WALL_COORD, 0, false, roseGlowMat, 1);
  buildPerimeterWall(ARENA_WALL_COORD, 0, false, cyanGlowMat, -1);

  // Four Corner Bastion Watch-Towers at (±21, ±21)
  const cornerCoords: Array<[number, number, THREE.Material]> = [
    [-ARENA_WALL_COORD, -ARENA_WALL_COORD, roseGlowMat],
    [ARENA_WALL_COORD, -ARENA_WALL_COORD, cyanGlowMat],
    [-ARENA_WALL_COORD, ARENA_WALL_COORD, roseGlowMat],
    [ARENA_WALL_COORD, ARENA_WALL_COORD, cyanGlowMat],
  ];
  for (const [cx, cz, accent] of cornerCoords) {
    const tower = new THREE.Group();
    tower.position.set(cx, 0, cz);
    tower.name = 'corner_watch_tower';
    addBox(tower, 3.0, 0.45, 3.0, slateMat, 0, 0, 0);
    const shaft = addBox(tower, 2.5, 7.2, 2.5, concreteMat, 0, 0.45, 0);
    occluders.push(shaft);
    addBox(tower, 2.66, 0.65, 2.66, darkGlassMat, 0, 5.7, 0);
    addBox(tower, 2.7, 0.1, 2.7, accent, 0, 6.0, 0);
    addBox(tower, 3.05, 0.26, 3.05, slateMat, 0, 7.65, 0);
    // Rooftop pole spire
    const spire = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.035, 0.055, 1.4, 8)),
      steelMat
    );
    spire.position.set(0, 8.6, 0);
    tower.add(spire);
    group.add(tower);
  }

  // 3. Surrounding Sleek 3D Buildings ("Bâtiments extérieurs") outside ±21
  const skylineGroup = new THREE.Group();
  skylineGroup.name = 'arena_surrounding_buildings';
  group.add(skylineGroup);

  const buildExteriorBuilding = (spec: ExteriorBuildingSpec) => {
    const b = new THREE.Group();
    b.position.set(spec.x, 0, spec.z);
    b.name = 'exterior_building';

    // Stepped podium + main monolith volume (grounded cleanly into outer horizon plane)
    addBox(b, spec.w + 0.9, 1.45, spec.d + 0.9, slateMat, 0, -0.05, 0);
    addBox(b, spec.w, spec.h, spec.d, concreteMat, 0, 1.4, 0);

    // Clean roof cornice cap
    const roofY = 1.4 + spec.h;
    addBox(b, spec.w + 0.36, 0.28, spec.d + 0.36, slateMat, 0, roofY, 0);

    // Optional stepped architectural penthouse & spire
    if (spec.hasPenthouse) {
      const pw = spec.w * 0.64;
      const pd = spec.d * 0.64;
      const ph = Math.max(1.8, spec.h * 0.15);
      addBox(b, pw, ph, pd, slateMat, 0, roofY + 0.28, 0);
      addBox(b, pw + 0.2, 0.16, pd + 0.2, steelMat, 0, roofY + 0.28 + ph, 0);
      if (spec.hasSpire) {
        const spire = new THREE.Mesh(
          trackGeo(new THREE.CylinderGeometry(0.05, 0.09, 3.6, 8)),
          steelMat
        );
        spire.position.set(0, roofY + 0.28 + ph + 1.9, 0);
        b.add(spire);
      }
    }

    // Minimalist recessed horizontal window bands
    const winMat = spec.windowTone === 'cyan' ? windowCyanMat : windowWarmMat;
    const bandLevels = spec.h > 16 ? [0.28, 0.48, 0.68, 0.86] : [0.36, 0.64, 0.84];
    for (const frac of bandLevels) {
      const wy = 1.4 + spec.h * frac;
      addBox(b, spec.w + 0.06, 0.26, spec.d + 0.06, darkGlassMat, 0, wy, 0);
      addBox(b, spec.w + 0.08, 0.09, spec.d + 0.08, winMat, 0, wy + 0.08, 0);
    }

    // Clean vertical architectural fins on wide facades
    const finCount = spec.finCount ?? 3;
    const facingX = Math.abs(spec.x) > Math.abs(spec.z);
    for (let i = 0; i < finCount; i++) {
      const t = finCount === 1 ? 0 : -0.34 + (0.68 * i) / (finCount - 1);
      if (facingX) {
        addBox(b, spec.w + 0.22, spec.h - 0.6, 0.22, steelMat, 0, 1.7, spec.d * t);
      } else {
        addBox(b, 0.22, spec.h - 0.6, spec.d + 0.22, steelMat, spec.w * t, 1.7, 0);
      }
    }

    skylineGroup.add(b);
  };

  const exteriorSpecs: ExteriorBuildingSpec[] = [
    // North skyline (directly facing spawn camera)
    { x: -17.5, z: -27.5, w: 9.2, d: 6.4, h: 14.5, hasPenthouse: true, windowTone: 'warm', finCount: 3 },
    { x: -4.2, z: -29.2, w: 10.8, d: 7.0, h: 20.5, hasPenthouse: true, hasSpire: true, windowTone: 'cyan', finCount: 4 },
    { x: 9.0, z: -26.8, w: 8.6, d: 6.0, h: 12.0, hasPenthouse: false, windowTone: 'warm', finCount: 3 },
    { x: 20.5, z: -28.0, w: 8.8, d: 7.2, h: 17.5, hasPenthouse: true, windowTone: 'cyan', finCount: 3 },
    // East skyline
    { x: 27.5, z: -13.5, w: 6.4, d: 9.8, h: 16.0, hasPenthouse: true, windowTone: 'cyan', finCount: 3 },
    { x: 29.0, z: 0.5, w: 7.2, d: 10.2, h: 20.0, hasPenthouse: true, hasSpire: true, windowTone: 'warm', finCount: 4 },
    { x: 26.8, z: 14.5, w: 6.0, d: 8.8, h: 11.5, hasPenthouse: false, windowTone: 'cyan', finCount: 3 },
    // South skyline
    { x: 16.5, z: 27.5, w: 9.0, d: 6.4, h: 14.5, hasPenthouse: true, windowTone: 'cyan', finCount: 3 },
    { x: 2.8, z: 28.8, w: 10.4, d: 6.8, h: 18.5, hasPenthouse: true, hasSpire: true, windowTone: 'warm', finCount: 4 },
    { x: -11.5, z: 26.8, w: 9.4, d: 6.0, h: 12.5, hasPenthouse: false, windowTone: 'cyan', finCount: 3 },
    // West skyline
    { x: -27.5, z: 14.0, w: 6.4, d: 9.2, h: 15.5, hasPenthouse: true, windowTone: 'warm', finCount: 3 },
    { x: -29.2, z: 0.0, w: 7.4, d: 11.0, h: 21.5, hasPenthouse: true, hasSpire: true, windowTone: 'cyan', finCount: 4 },
    { x: -26.8, z: -14.0, w: 6.0, d: 8.6, h: 11.0, hasPenthouse: false, windowTone: 'warm', finCount: 3 },
    // Distant corner backdrop towers
    { x: -28.5, z: -28.5, w: 8.5, d: 8.5, h: 23.0, hasPenthouse: true, windowTone: 'warm', finCount: 3 },
    { x: 28.5, z: 28.5, w: 8.5, d: 8.5, h: 22.5, hasPenthouse: true, windowTone: 'cyan', finCount: 3 },
  ];
  for (const spec of exteriorSpecs) buildExteriorBuilding(spec);

  // 4. Interior 3D Structures inside the Playable Courtyard (strictly preserving open sightlines)
  const interiorGroup = new THREE.Group();
  interiorGroup.name = 'arena_interior_decor';
  group.add(interiorGroup);

  const registerBoxCollider = (
    id: string,
    kind: ArenaColliderKind,
    cx: number,
    cz: number,
    w: number,
    d: number,
    height: number
  ) => {
    colliders.push({
      id,
      kind,
      minX: cx - w * 0.5,
      maxX: cx + w * 0.5,
      minZ: cz - d * 0.5,
      maxZ: cz + d * 0.5,
      height,
    });
  };

  // A. Two Sleek Modular Tactical Pavilions / Mini-Buildings ("Bâtiments intérieurs")
  const buildInteriorPavilion = (id: string, x: number, z: number, accentMat: THREE.Material) => {
    const pav = new THREE.Group();
    pav.position.set(x, 0, z);
    pav.name = `interior_building_${id}`;

    // Plinth & main monolith block (3.4 x 3.4 footprint)
    occluders.push(addBox(pav, 3.6, 0.24, 3.6, slateMat, 0, 0, 0));
    const core = addBox(pav, 3.2, 3.16, 3.2, concreteMat, 0, 0.24, 0, `${id}_core`);
    occluders.push(core);

    // 4 exterior corner steel posts ("poteaux d'angle")
    const cornerOff = 1.62;
    for (const sx of [-cornerOff, cornerOff]) {
      for (const sz of [-cornerOff, cornerOff]) {
        const post = addBox(pav, 0.2, 3.45, 0.2, steelMat, sx, 0, sz);
        occluders.push(post);
      }
    }

    // Recessed dark glass horizontal band + subtle glowing sill strip
    addBox(pav, 3.26, 0.42, 3.26, darkGlassMat, 0, 2.05, 0);
    addBox(pav, 3.28, 0.06, 3.28, accentMat, 0, 2.02, 0);

    // Sleek cantilevered roof slab
    const roof = addBox(pav, 4.0, 0.22, 4.0, slateMat, 0, 3.4, 0);
    occluders.push(roof);
    addBox(pav, 3.5, 0.14, 3.5, steelMat, 0, 3.62, 0);

    interiorGroup.add(pav);
    registerBoxCollider(id, 'building', x, z, 3.6, 3.6, 3.76);
  };

  buildInteriorPavilion('pavilion_nw', -12.2, -12.0, roseGlowMat);
  buildInteriorPavilion('pavilion_ne', 12.2, -12.0, cyanGlowMat);

  // B. Four Tall Structural Pillars ("Poteaux architecturaux")
  const buildArchitecturalPillar = (id: string, x: number, z: number, accentMat: THREE.Material) => {
    const pil = new THREE.Group();
    pil.position.set(x, 0, z);
    pil.name = `interior_pillar_${id}`;

    occluders.push(addBox(pil, 1.38, 0.3, 1.38, slateMat, 0, 0, 0));
    const shaft = addBox(pil, 1.04, 4.0, 1.04, concreteMat, 0, 0.3, 0, `${id}_shaft`);
    occluders.push(shaft);
    occluders.push(addBox(pil, 1.24, 0.26, 1.24, steelMat, 0, 4.3, 0));
    // Clean vertical recessed LED strip along column faces
    addBox(pil, 1.08, 3.2, 0.06, accentMat, 0, 0.7, 0);
    addBox(pil, 0.06, 3.2, 1.08, accentMat, 0, 0.7, 0);

    interiorGroup.add(pil);
    registerBoxCollider(id, 'pillar', x, z, 1.38, 1.38, 4.56);
  };

  buildArchitecturalPillar('pillar_w', -14.5, 2.0, roseGlowMat);
  buildArchitecturalPillar('pillar_e', 14.5, 2.0, cyanGlowMat);
  buildArchitecturalPillar('pillar_sw', -13.0, 13.5, roseGlowMat);
  buildArchitecturalPillar('pillar_se', 13.0, 13.5, cyanGlowMat);

  // C. Five Sleek Low Tactical Cover Monoliths ("Murets épurés")
  const buildLowCoverBlock = (
    id: string,
    x: number,
    z: number,
    w: number,
    d: number,
    h: number,
    accentMat: THREE.Material
  ) => {
    const cov = new THREE.Group();
    cov.position.set(x, 0, z);
    cov.name = `interior_cover_${id}`;

    occluders.push(addBox(cov, w + 0.16, 0.18, d + 0.16, slateMat, 0, 0, 0));
    const body = addBox(cov, w, h - 0.3, d, concreteMat, 0, 0.18, 0, `${id}_body`);
    occluders.push(body);
    occluders.push(addBox(cov, w + 0.08, 0.12, d + 0.08, steelMat, 0, h - 0.12, 0));
    addBox(cov, w + 0.02, 0.05, d + 0.02, accentMat, 0, h - 0.24, 0);

    interiorGroup.add(cov);
    registerBoxCollider(id, 'cover', x, z, w + 0.16, d + 0.16, h);
  };

  buildLowCoverBlock('cover_north_center', 0, -11.5, 3.2, 0.95, 1.15, cyanGlowMat);
  buildLowCoverBlock('cover_mid_w', -7.8, -5.2, 2.0, 1.1, 1.22, roseGlowMat);
  buildLowCoverBlock('cover_mid_e', 7.8, -5.2, 2.0, 1.1, 1.22, cyanGlowMat);
  buildLowCoverBlock('cover_south_w', -6.8, 9.2, 2.0, 1.1, 1.22, roseGlowMat);
  buildLowCoverBlock('cover_south_e', 6.8, 9.2, 2.0, 1.1, 1.22, cyanGlowMat);

  // D. Sleek Minimalist Streetlight Poles ("Poteaux d'éclairage")
  const poleShaftGeo = trackGeo(new THREE.CylinderGeometry(0.06, 0.085, 4.7, 10));
  const polePlinthGeo = trackGeo(new THREE.CylinderGeometry(0.18, 0.22, 0.32, 10));
  const armGeo = trackGeo(new THREE.BoxGeometry(1.18, 0.07, 0.08));
  const headGeo = trackGeo(new THREE.BoxGeometry(0.48, 0.08, 0.22));
  const lensGeo = trackGeo(new THREE.BoxGeometry(0.38, 0.025, 0.15));

  const buildStreetLampPost = (
    id: string,
    x: number,
    z: number,
    rotY: number,
    withCollider: boolean
  ) => {
    const pole = new THREE.Group();
    pole.position.set(x, 0, z);
    pole.rotation.y = rotY;
    pole.name = `lamp_pole_${id}`;

    const plinth = new THREE.Mesh(polePlinthGeo, slateMat);
    plinth.position.y = 0.16;
    pole.add(plinth);

    const shaft = new THREE.Mesh(poleShaftGeo, steelMat);
    shaft.position.y = 0.32 + 2.35;
    pole.add(shaft);
    if (withCollider) occluders.push(shaft);

    const arm = new THREE.Mesh(armGeo, steelMat);
    arm.position.set(0.54, 5.14, 0);
    arm.rotation.z = 0.22;
    pole.add(arm);

    const head = new THREE.Mesh(headGeo, steelMat);
    head.position.set(1.12, 5.26, 0);
    pole.add(head);

    const lens = new THREE.Mesh(lensGeo, lampGlowMat);
    lens.position.set(1.12, 5.21, 0);
    pole.add(lens);

    interiorGroup.add(pole);
    if (withCollider) {
      registerBoxCollider(id, 'pole', x, z, 0.44, 0.44, 5.3);
    }
  };

  // Perimeter walkway lamp posts (positioned at ±19.3 outside walkable ARENA_LIMIT=18.5)
  buildStreetLampPost('pole_perim_w1', -19.3, -14, 0, false);
  buildStreetLampPost('pole_perim_w2', -19.3, 0, 0, false);
  buildStreetLampPost('pole_perim_w3', -19.3, 14, 0, false);
  buildStreetLampPost('pole_perim_e1', 19.3, -14, Math.PI, false);
  buildStreetLampPost('pole_perim_e2', 19.3, 0, Math.PI, false);
  buildStreetLampPost('pole_perim_e3', 19.3, 14, Math.PI, false);
  buildStreetLampPost('pole_perim_n1', -10, -19.3, -Math.PI / 2, false);
  buildStreetLampPost('pole_perim_n2', 10, -19.3, -Math.PI / 2, false);
  buildStreetLampPost('pole_perim_s1', -10, 19.3, Math.PI / 2, false);
  buildStreetLampPost('pole_perim_s2', 10, 19.3, Math.PI / 2, false);

  // 4 sleek freestanding courtyard light poles inside the arena
  buildStreetLampPost('pole_inner_nw', -5.0, -16.2, -Math.PI / 2, true);
  buildStreetLampPost('pole_inner_ne', 5.0, -16.2, -Math.PI / 2, true);
  buildStreetLampPost('pole_inner_sw', -5.0, 15.8, Math.PI / 2, true);
  buildStreetLampPost('pole_inner_se', 5.0, 15.8, Math.PI / 2, true);

  const dispose = () => {
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
  };

  return { group, colliders, occluders, dispose };
}
