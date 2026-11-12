import * as THREE from 'three';
import { getWeaponMuzzleSide, WeaponArchetype } from './weapon3dBuilder';

export interface ArmHoldPose {
  handPos: [number, number, number];
  handRot: [number, number, number];
  shoulderTarget: [number, number, number];
  proxCurl: number;
  distCurl: number;
  indexCurl?: number;
  thumbRot?: [number, number, number];
  visible?: boolean;
}

export interface FPSHandsRig {
  group: THREE.Group;
  rightArm: THREE.Group;
  leftArm: THREE.Group;
  applyPose: (archetype: WeaponArchetype) => void;
  setArmPose: (side: 'left' | 'right', pose: ArmHoldPose) => void;
  dispose: () => void;
}

export interface FPSWeaponViewConfig {
  scale: number;
  weaponPos: [number, number, number];
  weaponRotOffset: [number, number, number];
  rigPosHip: [number, number, number];
  rigPosAds: [number, number, number];
  rigRotBase: [number, number, number];
}

export function getFPSWeaponViewConfig(archetype: WeaponArchetype): FPSWeaponViewConfig {
  if (archetype === 'ar15_sil' || archetype === 'ar15' || archetype === 'ak47') {
    // Straight parallel tactical rifle framing (zero barrel yaw/roll skew; dead-centered ADS on x=0)
    const yShift = archetype === 'ak47' ? -0.044 : archetype === 'ar15' ? -0.036 : -0.030;
    return {
      scale: 0.245,
      weaponPos: [0, yShift, 0.04],
      weaponRotOffset: [0, 0, 0],
      rigPosHip: [0.162, -0.128, -0.40],
      rigPosAds: [0, -0.095, -0.36],
      rigRotBase: [0, 0, 0],
    };
  }

  if (archetype === 'awp') {
    return {
      scale: 0.24,
      weaponPos: [0, 0.004, -0.02],
      weaponRotOffset: [0, 0, 0],
      rigPosHip: [0.195, -0.145, -0.56],
      rigPosAds: [0, -0.095, -0.44],
      rigRotBase: [0, 0, 0],
    };
  }

  if (archetype === 'pistolet') {
    return {
      scale: 0.080,
      weaponPos: [0, 0.024, 0.016],
      weaponRotOffset: [0, 0, 0],
      rigPosHip: [0.172, -0.156, -0.48],
      rigPosAds: [0, -0.118, -0.40],
      rigRotBase: [0, 0, 0],
    };
  }

  if (archetype === 'mac10') {
    return {
      scale: 0.076,
      weaponPos: [0, 0.016, 0.018],
      weaponRotOffset: [0, 0, 0],
      rigPosHip: [0.180, -0.150, -0.49],
      rigPosAds: [0, -0.120, -0.42],
      rigRotBase: [0, 0, 0],
    };
  }

  if (archetype === 'karambit') {
    return {
      scale: 0.050,
      weaponPos: [-0.046, -0.008, 0.012],
      weaponRotOffset: [2.98, 2.41, -0.35],
      rigPosHip: [0.145, -0.104, -0.36],
      rigPosAds: [0.145, -0.104, -0.36],
      rigRotBase: [-0.015, 0.10, 0],
    };
  }

  // couteau (bayonet / katana / dague)
  return {
    scale: 0.095,
    weaponPos: [-0.0096, -0.0134, -0.0556],
    weaponRotOffset: [0.14, -0.14, -0.22],
    rigPosHip: [0.190, -0.128, -0.46],
    rigPosAds: [0.190, -0.128, -0.46],
    rigRotBase: [-0.015, 0.115, 0],
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ─────────────────────────────────────────────────────────────────────────────
// Procedural PBR Texture Set (DOM-safe: returns null in headless Node/jsdom)
// ─────────────────────────────────────────────────────────────────────────────

interface HandsTextureBank {
  clothMap: THREE.CanvasTexture;
  clothNormal: THREE.CanvasTexture;
  clothRough: THREE.CanvasTexture;
  hexMap: THREE.CanvasTexture;
  hexNormal: THREE.CanvasTexture;
  strapMap: THREE.CanvasTexture;
  strapNormal: THREE.CanvasTexture;
  leatherNormal: THREE.CanvasTexture;
  dispose: () => void;
}

function heightToNormalTexture(
  heightData: Float32Array,
  size: number,
  strength: number,
  repX: number,
  repY: number
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heightData[y * size + xp] - heightData[y * size + xm]) * strength;
      const dy = (heightData[yp * size + x] - heightData[ym * size + x]) * strength;
      let nx = -dx;
      let ny = -dy;
      let nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const idx = (y * size + x) * 4;
      d[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  tex.needsUpdate = true;
  return tex;
}

function createHandsTextureBank(): HandsTextureBank | null {
  if (typeof document === 'undefined') return null;
  const probe = document.createElement('canvas');
  if (!probe.getContext('2d')) return null;

  // 1. Tactical Ripstop / Cordura Cloth (256x256 for crisp FPS view + fast startup)
  const cSize = 256;
  const cHeight = new Float32Array(cSize * cSize);
  const cAlb = document.createElement('canvas');
  cAlb.width = cSize;
  cAlb.height = cSize;
  const caCtx = cAlb.getContext('2d')!;
  const caImg = caCtx.createImageData(cSize, cSize);

  const cRgh = document.createElement('canvas');
  cRgh.width = cSize;
  cRgh.height = cSize;
  const crCtx = cRgh.getContext('2d')!;
  const crImg = crCtx.createImageData(cSize, cSize);

  for (let y = 0; y < cSize; y++) {
    for (let x = 0; x < cSize; x++) {
      const idx = y * cSize + x;
      const wx = Math.sin(x * Math.PI * 0.5);
      const wy = Math.sin(y * Math.PI * 0.5);
      const weave = wx * wy * 0.16;
      const rip = x % 16 < 2 || y % 16 < 2 ? 0.22 : 0;
      const mottle =
        Math.sin(x * 0.055 + y * 0.04) * 0.11 + Math.cos(x * 0.11 - y * 0.09) * 0.07;
      const grain = Math.abs((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 0.08;
      const h = 0.5 + weave + rip + mottle + grain;
      cHeight[idx] = h;

      const v = 32 + h * 18;
      const p = idx * 4;
      caImg.data[p] = v * 0.95;
      caImg.data[p + 1] = v * 0.97;
      caImg.data[p + 2] = v * 1.06;
      caImg.data[p + 3] = 255;

      const rough = Math.round((0.80 + (1 - h) * 0.16) * 255);
      crImg.data[p] = rough;
      crImg.data[p + 1] = rough;
      crImg.data[p + 2] = rough;
      crImg.data[p + 3] = 255;
    }
  }
  caCtx.putImageData(caImg, 0, 0);
  crCtx.putImageData(crImg, 0, 0);

  const clothMap = new THREE.CanvasTexture(cAlb);
  clothMap.colorSpace = THREE.SRGBColorSpace;
  clothMap.wrapS = clothMap.wrapT = THREE.RepeatWrapping;
  clothMap.repeat.set(3, 5);

  const clothRough = new THREE.CanvasTexture(cRgh);
  clothRough.wrapS = clothRough.wrapT = THREE.RepeatWrapping;
  clothRough.repeat.set(3, 5);

  const clothNormal = heightToNormalTexture(cHeight, cSize, 2.2, 3, 5)!;

  // 2. Ballistic Hex-Mesh & Carbon Weave (256x256)
  const hSize = 256;
  const hHeight = new Float32Array(hSize * hSize);
  const hAlb = document.createElement('canvas');
  hAlb.width = hSize;
  hAlb.height = hSize;
  const haCtx = hAlb.getContext('2d')!;
  const haImg = haCtx.createImageData(hSize, hSize);

  for (let y = 0; y < hSize; y++) {
    for (let x = 0; x < hSize; x++) {
      const idx = y * hSize + x;
      const cx = Math.floor(x / 8);
      const cy = Math.floor(y / 8);
      const lx = (x % 8) / 8;
      const ly = (y % 8) / 8;
      const parity = (cx + cy) % 2 === 0;
      const cell = parity
        ? Math.sin(lx * Math.PI) * (0.65 + 0.35 * Math.sin(ly * Math.PI))
        : Math.sin(ly * Math.PI) * (0.65 + 0.35 * Math.sin(lx * Math.PI));
      hHeight[idx] = cell;

      const c = 28 + cell * 20;
      const p = idx * 4;
      haImg.data[p] = c * 0.96;
      haImg.data[p + 1] = c * 0.98;
      haImg.data[p + 2] = c * 1.05;
      haImg.data[p + 3] = 255;
    }
  }
  haCtx.putImageData(haImg, 0, 0);
  const hexMap = new THREE.CanvasTexture(hAlb);
  hexMap.colorSpace = THREE.SRGBColorSpace;
  hexMap.wrapS = hexMap.wrapT = THREE.RepeatWrapping;
  hexMap.repeat.set(6, 6);
  const hexNormal = heightToNormalTexture(hHeight, hSize, 2.6, 6, 6)!;

  // 3. Stitched Tactical Nylon Webbing (256x256)
  const sSize = 256;
  const sHeight = new Float32Array(sSize * sSize);
  const sAlb = document.createElement('canvas');
  sAlb.width = sSize;
  sAlb.height = sSize;
  const saCtx = sAlb.getContext('2d')!;
  const saImg = saCtx.createImageData(sSize, sSize);

  for (let y = 0; y < sSize; y++) {
    const v = y / sSize;
    const isStitchRow = Math.abs(v - 0.14) < 0.025 || Math.abs(v - 0.86) < 0.025;
    for (let x = 0; x < sSize; x++) {
      const idx = y * sSize + x;
      const rib = Math.sin(x * 0.8) * 0.35 + Math.sin(y * 1.2) * 0.15;
      const stitch = isStitchRow && x % 18 < 10 ? 0.55 : 0;
      const h = 0.45 + rib * 0.35 + stitch;
      sHeight[idx] = h;

      const c = stitch > 0 ? 72 : 30 + rib * 10;
      const p = idx * 4;
      saImg.data[p] = c * 0.96;
      saImg.data[p + 1] = c * 0.98;
      saImg.data[p + 2] = c * 1.06;
      saImg.data[p + 3] = 255;
    }
  }
  saCtx.putImageData(saImg, 0, 0);
  const strapMap = new THREE.CanvasTexture(sAlb);
  strapMap.colorSpace = THREE.SRGBColorSpace;
  strapMap.wrapS = strapMap.wrapT = THREE.RepeatWrapping;
  strapMap.repeat.set(4, 1);
  const strapNormal = heightToNormalTexture(sHeight, sSize, 2.8, 4, 1)!;

  // 4. Micro-Grain Leather Grip (128x128 for fast generation)
  const lSize = 128;
  const lHeight = new Float32Array(lSize * lSize);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 140; i++) {
    pts.push([
      ((((Math.sin(i * 127.1) * 43758.5453) % 1) + 1) % 1) * lSize,
      ((((Math.sin(i * 269.5) * 43758.5453) % 1) + 1) % 1) * lSize,
    ]);
  }
  for (let y = 0; y < lSize; y++) {
    for (let x = 0; x < lSize; x++) {
      let minD = 9999;
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(x - pts[i][0]);
        let dy = Math.abs(y - pts[i][1]);
        if (dx > lSize * 0.5) dx = lSize - dx;
        if (dy > lSize * 0.5) dy = lSize - dy;
        const d = dx * dx + dy * dy;
        if (d < minD) minD = d;
      }
      lHeight[y * lSize + x] = Math.pow(Math.max(0, 1 - Math.sqrt(minD) / 8), 0.6);
    }
  }
  const leatherNormal = heightToNormalTexture(lHeight, lSize, 2.2, 3, 3)!;

  return {
    clothMap,
    clothNormal,
    clothRough,
    hexMap,
    hexNormal,
    strapMap,
    strapNormal,
    leatherNormal,
    dispose: () => {
      clothMap.dispose();
      clothNormal.dispose();
      clothRough.dispose();
      hexMap.dispose();
      hexNormal.dispose();
      strapMap.dispose();
      strapNormal.dispose();
      leatherNormal.dispose();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sculpted Valorant Tactical Arm & Hand Builder
// ─────────────────────────────────────────────────────────────────────────────

interface FingerRig {
  proxRoot: THREE.Group;
  midRoot: THREE.Group;
  distRoot: THREE.Group;
}

interface ArticulatedArmHandle {
  armRoot: THREE.Group;
  handPivot: THREE.Group;
  forearmPivot: THREE.Group;
  thumbRoot: THREE.Group;
  thumbDist: THREE.Group;
  fingers: FingerRig[];
  setHold: (pose: ArmHoldPose) => void;
}

interface SharedArmMaterials {
  sleeveMat: THREE.MeshPhysicalMaterial;
  innerWrapMat: THREE.MeshPhysicalMaterial;
  gloveDorsalMat: THREE.MeshPhysicalMaterial;
  glovePalmMat: THREE.MeshPhysicalMaterial;
  armorPlateMat: THREE.MeshPhysicalMaterial;
  strapMat: THREE.MeshPhysicalMaterial;
  metalHardwareMat: THREE.MeshStandardMaterial;
  stitchMat: THREE.MeshStandardMaterial;
}

const SLEEVE_Z_START = 0.040;
const SLEEVE_Z_END = 0.56;

function evalSleeveDisplacement(t: number, theta: number, s: number): number {
  const cuffBunch = Math.exp(-Math.pow((t - 0.13) / 0.11, 2));
  const midFolds = smoothstep(0.08, 0.45, t);
  const f1 = Math.sin(theta * 2.0 + t * 22.0 * s + 0.4) * 0.0026;
  const f2 = Math.sin(theta * 3.0 - t * 34.0 * s + 1.5) * 0.0018;
  const f3 = Math.cos(theta * 5.0 + t * 48.0 * s) * 0.0011;
  const cuffRing = Math.sin(t * 72.0 + Math.cos(theta * 2.0) * 0.9) * 0.0022 * cuffBunch;
  const seamGroove = -Math.exp(-Math.pow(Math.sin(theta) / 0.08, 2)) * 0.0011;
  return (f1 + f2 + f3) * (0.55 + 0.95 * cuffBunch + 0.35 * midFolds) + cuffRing + seamGroove;
}

function evalSleevePoint(t: number, theta: number, s: number, radialExtra = 0) {
  const z = SLEEVE_Z_START + t * (SLEEVE_Z_END - SLEEVE_Z_START);
  let cuffFactor = 1.0;
  if (t < 0.022) {
    cuffFactor = 0.75 + 0.31 * Math.sin((t / 0.022) * Math.PI * 0.5);
  } else if (t < 0.060) {
    cuffFactor = 1.06 - ((t - 0.022) / 0.038) * 0.06;
  }

  const muscleSwell = Math.sin(smoothstep(0.05, 0.85, t) * Math.PI) * 0.0048;
  const baseRx = (0.0258 + Math.pow(t, 0.76) * 0.0245 + muscleSwell) * cuffFactor;
  const baseRy = baseRx * (0.78 + t * 0.12);

  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const disp = evalSleeveDisplacement(t, theta, s);
  const lateralBias = 1.0 + 0.07 * cosT * s * smoothstep(0.08, 0.7, t);

  return {
    x: cosT * (baseRx * lateralBias + disp + radialExtra),
    y: sinT * (baseRy + (disp + radialExtra) * 0.88),
    z,
    disp,
  };
}

function buildForearmArmorPlate(
  zStart: number,
  zEnd: number,
  thetaCenter: number,
  arcHalf: number,
  thickness: number,
  s: number,
  mats: SharedArmMaterials
): THREE.Group {
  const group = new THREE.Group();
  const uSegs = 18;
  const vSegs = 12;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= vSegs; j++) {
    const vt = j / vSegs;
    const z = zStart + vt * (zEnd - zStart);
    const t = (z - SLEEVE_Z_START) / (SLEEVE_Z_END - SLEEVE_Z_START);
    const bevelV = Math.min(1, Math.min(vt, 1 - vt) * 7.0);

    for (let i = 0; i <= uSegs; i++) {
      const u = i / uSegs;
      const widthTaper = 0.82 + 0.18 * vt;
      const theta = thetaCenter + (u - 0.5) * 2 * arcHalf * widthTaper;
      const bevelU = Math.min(1, Math.min(u, 1 - u) * 6.5);
      const ridge = 1.0 + 0.35 * (1.0 - Math.abs(u - 0.5) * 2.0);
      const ventGroove = Math.abs(vt - 0.52) < 0.08 ? 0.55 : 1.0;

      const offset = thickness * Math.pow(bevelU * bevelV, 0.35) * ridge * ventGroove + 0.0012;
      const p = evalSleevePoint(t, theta, s, offset);
      positions.push(p.x, p.y, p.z);
      uvs.push(u, vt);
    }
  }
  for (let j = 0; j < vSegs; j++) {
    for (let i = 0; i < uSegs; i++) {
      const a = j * (uSegs + 1) + i;
      const b = a + uSegs + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, mats.armorPlateMat));

  const boltGeo = new THREE.CylinderGeometry(0.0014, 0.0014, 0.0018, 6);
  const upVec = new THREE.Vector3(0, 1, 0);
  const corners: Array<[number, number]> = [
    [0.14, 0.18],
    [0.86, 0.18],
    [0.14, 0.82],
    [0.86, 0.82],
  ];
  for (const [cu, cv] of corners) {
    const z = zStart + cv * (zEnd - zStart);
    const t = (z - SLEEVE_Z_START) / (SLEEVE_Z_END - SLEEVE_Z_START);
    const widthTaper = 0.82 + 0.18 * cv;
    const theta = thetaCenter + (cu - 0.5) * 2 * arcHalf * widthTaper;
    const p = evalSleevePoint(t, theta, s, thickness + 0.0016);
    const bolt = new THREE.Mesh(boltGeo, mats.metalHardwareMat);
    bolt.position.set(p.x, p.y, p.z);
    const norm = new THREE.Vector3(p.x, p.y, 0).normalize();
    bolt.quaternion.setFromUnitVectors(upVec, norm);
    group.add(bolt);
  }

  return group;
}

function buildDiagonalForearmWrap(
  zCenter: number,
  width: number,
  pitchZ: number,
  thickness: number,
  s: number,
  mat: THREE.Material
): THREE.Mesh {
  const radSegs = 44;
  const lenSegs = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= lenSegs; j++) {
    const vt = j / lenSegs;
    const bevel = Math.pow(Math.sin(vt * Math.PI), 0.38);

    for (let i = 0; i <= radSegs; i++) {
      const u = i / radSegs;
      const theta = u * Math.PI * 2;
      const z = zCenter + Math.sin(theta * s) * pitchZ + (vt - 0.5) * width;
      const t = Math.max(0.02, Math.min(0.98, (z - SLEEVE_Z_START) / (SLEEVE_Z_END - SLEEVE_Z_START)));
      const p = evalSleevePoint(t, theta, s, thickness * (0.25 + 0.75 * bevel) + 0.0005);
      positions.push(p.x, p.y, p.z);
      uvs.push(u * 3.0, vt);
    }
  }
  for (let j = 0; j < lenSegs; j++) {
    for (let i = 0; i < radSegs; i++) {
      const a = j * (radSegs + 1) + i;
      const b = a + radSegs + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

function buildSculptedSleeveAndWrist(s: number, mats: SharedArmMaterials): THREE.Group {
  const group = new THREE.Group();

  // 1. Closed inner wrist compression wrap (tucked inside glove cuff so wrist bending never shows a hole)
  {
    const radSegs = 36;
    const lenSegs = 30;
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= lenSegs; j++) {
      const t = j / lenSegs;
      const z = -0.010 + t * 0.088;
      const rib = Math.sin(t * Math.PI * 14) * 0.0005;
      const tipCap = t < 0.14 ? Math.sin((t / 0.14) * Math.PI * 0.5) : 1.0;
      const baseRx = (0.0168 + t * 0.0064 + rib) * (0.25 + 0.75 * tipCap);
      const baseRy = baseRx * (0.72 + t * 0.06);
      const ao = 0.72 + 0.28 * (1.0 - smoothstep(0.65, 1.0, t) * 0.55);

      for (let i = 0; i <= radSegs; i++) {
        const u = i / radSegs;
        const theta = u * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const flatBot = sinT < 0 ? 1.0 - 0.06 * (-sinT) : 1.0;
        positions.push(cosT * baseRx, sinT * baseRy * flatBot, z);
        const shade = ao * (0.88 + 0.12 * (rib / 0.0005));
        colors.push(shade, shade, shade);
        uvs.push(u * 2, t * 2);
      }
    }
    for (let j = 0; j < lenSegs; j++) {
      for (let i = 0; i < radSegs; i++) {
        const a = j * (radSegs + 1) + i;
        const b = a + radSegs + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, mats.innerWrapMat));
  }

  // 2. Sculpted folded outer jacket sleeve with baked vertex AO
  {
    const radSegs = 48;
    const lenSegs = 80;
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= lenSegs; j++) {
      const t = j / lenSegs;
      const cuffShadow = t < 0.03 ? 0.55 + (t / 0.03) * 0.45 : 1.0;
      for (let i = 0; i <= radSegs; i++) {
        const u = i / radSegs;
        const theta = u * Math.PI * 2;
        const p = evalSleevePoint(t, theta, s, 0);
        positions.push(p.x, p.y, p.z);
        uvs.push(u * 2.5, t * 4.5);
        const foldAo = Math.max(0.45, Math.min(1.08, 0.86 + p.disp * 55.0));
        const ao = foldAo * cuffShadow;
        colors.push(ao, ao, ao);
      }
    }
    for (let j = 0; j < lenSegs; j++) {
      for (let i = 0; i < radSegs; i++) {
        const a = j * (radSegs + 1) + i;
        const b = a + radSegs + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, mats.sleeveMat));
  }

  // 3. Diagonal criss-cross wraps + dual forearm gauntlet plates with titanium bolts
  group.add(buildDiagonalForearmWrap(0.088, 0.022, 0.011, 0.0024, s, mats.strapMat));
  group.add(buildDiagonalForearmWrap(0.114, 0.020, -0.012, 0.0022, s, mats.strapMat));
  group.add(buildDiagonalForearmWrap(0.242, 0.020, 0.009, 0.0020, s, mats.strapMat));

  const outerTheta = s > 0 ? Math.PI * 0.38 : Math.PI * 0.62;
  group.add(buildForearmArmorPlate(0.125, 0.195, outerTheta, Math.PI * 0.34, 0.0036, s, mats));
  group.add(buildForearmArmorPlate(0.188, 0.258, outerTheta, Math.PI * 0.30, 0.0032, s, mats));

  [0.088, 0.242].forEach((zc, k) => {
    const t = (zc - SLEEVE_Z_START) / (SLEEVE_Z_END - SLEEVE_Z_START);
    const theta = s > 0 ? 0.15 : Math.PI - 0.15;
    const p = evalSleevePoint(t, theta, s, 0.0028);
    const clasp = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.0038, 0.014, 6, 12),
      mats.metalHardwareMat
    );
    clasp.rotation.x = Math.PI / 2;
    clasp.rotation.z = k === 0 ? 0.25 * s : -0.2 * s;
    clasp.scale.set(0.45, 1.0, 1.0);
    clasp.position.set(p.x, p.y, p.z);
    group.add(clasp);
  });

  return group;
}

function buildSculptedHandShell(s: number, mats: SharedArmMaterials): THREE.Group {
  const group = new THREE.Group();

  // 1. Main anatomical hand shell
  {
    const radSegs = 40;
    const lenSegs = 32;
    const positions: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= lenSegs; j++) {
      const t = j / lenSegs;
      const z = 0.032 - t * 0.060;
      const wristDome = t < 0.14 ? Math.sin((t / 0.14) * Math.PI * 0.5) : 1.0;
      const palmFlare = smoothstep(0.10, 0.72, t) * (1.0 - 0.12 * smoothstep(0.82, 1.0, t));
      const rx = (0.0195 + palmFlare * 0.0080) * (0.22 + 0.78 * wristDome);
      const ry = 0.0138 * (1.0 - 0.30 * smoothstep(0.18, 1.0, t)) * (0.22 + 0.78 * wristDome);

      for (let i = 0; i <= radSegs; i++) {
        const u = i / radSegs;
        const theta = u * Math.PI * 2;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        const thumbSideWeight = Math.max(0, -cosT * s);
        const pinkySideWeight = Math.max(0, cosT * s);

        // Keep palmar thickness sleek & cupped so knife handles sit against the palm without clipping through
        const thenar =
          thumbSideWeight *
          Math.max(0, -sinT) *
          Math.sin(smoothstep(0.10, 0.58, t) * Math.PI) *
          0.0028;
        const hypothenar =
          pinkySideWeight *
          Math.max(0, -sinT) *
          Math.sin(smoothstep(0.08, 0.58, t) * Math.PI) *
          0.0018;
        const palmCenter =
          Math.max(0, -sinT) * Math.exp(-Math.pow(cosT / 0.62, 2)) * smoothstep(0.20, 0.88, t);
        const palmHollow = -palmCenter * 0.0046;
        const dorsalArch =
          Math.max(0, sinT) * (1.0 - cosT * cosT * 0.65) * 0.0026 * Math.sin(t * Math.PI);
        const tendonRipples =
          Math.max(0, sinT) *
          smoothstep(0.25, 0.85, t) *
          (1.0 - smoothstep(0.88, 1.0, t)) *
          Math.cos(cosT * Math.PI * 3.6) *
          0.0009;
        const knuckleBump =
          Math.max(0, sinT) *
          smoothstep(0.66, 0.98, t) *
          (0.0018 + 0.0011 * Math.cos(cosT * Math.PI * 3.6));
        const endCap =
          t > 0.90 ? Math.sqrt(Math.max(0.08, 1.0 - Math.pow((t - 0.90) / 0.10, 2))) : 1.0;

        // Slight dorsal bias (+0.002) opens the grip pocket cleanly between palm and curled fingers
        const rySide = sinT < 0 ? ry * 0.68 : ry * 1.06;
        const x = cosT * rx * (1.0 + thumbSideWeight * 0.10 * Math.sin(t * Math.PI * 0.85));
        const y =
          0.0020 +
          sinT * rySide * endCap +
          dorsalArch +
          tendonRipples +
          knuckleBump -
          thenar -
          hypothenar -
          palmHollow;

        positions.push(x, y, z);
        uvs.push(u * 2, t * 2);
        const ao = 0.82 + 0.18 * Math.max(0, sinT) - palmCenter * 18.0 + tendonRipples * 35.0;
        const cAo = Math.max(0.55, Math.min(1.04, ao));
        colors.push(cAo, cAo, cAo);
      }
    }
    for (let j = 0; j < lenSegs; j++) {
      for (let i = 0; i < radSegs; i++) {
        const a = j * (radSegs + 1) + i;
        const b = a + radSegs + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, mats.gloveDorsalMat));
  }

  // 2. Sculpted Wrist Retention Strap & Clasp
  {
    const wRad = 36;
    const wLen = 8;
    const wPos: number[] = [];
    const wUv: number[] = [];
    const wIdx: number[] = [];
    for (let j = 0; j <= wLen; j++) {
      const vt = j / wLen;
      const z = 0.025 - vt * 0.017;
      const bevel = Math.pow(Math.sin(vt * Math.PI), 0.45);
      const t = (0.032 - z) / 0.060;
      const rx = 0.0204 + smoothstep(0.10, 0.72, t) * 0.0080 + 0.0020 * bevel;
      const ry = 0.0146 * (1.0 - 0.30 * smoothstep(0.18, 1.0, t)) + 0.0018 * bevel;
      for (let i = 0; i <= wRad; i++) {
        const u = i / wRad;
        const theta = u * Math.PI * 2;
        wPos.push(Math.cos(theta) * rx, Math.sin(theta) * ry, z);
        wUv.push(u * 3, vt);
      }
    }
    for (let j = 0; j < wLen; j++) {
      for (let i = 0; i < wRad; i++) {
        const a = j * (wRad + 1) + i;
        const b = a + wRad + 1;
        wIdx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wPos, 3));
    wGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wUv, 2));
    wGeo.setIndex(wIdx);
    wGeo.computeVertexNormals();
    group.add(new THREE.Mesh(wGeo, mats.strapMat));

    const wristBuckle = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.0032, 0.011, 5, 10),
      mats.metalHardwareMat
    );
    wristBuckle.rotation.x = Math.PI / 2;
    wristBuckle.scale.set(0.42, 1.0, 1.0);
    wristBuckle.position.set(0.0215 * s, 0.004, 0.016);
    group.add(wristBuckle);
  }

  // 3. Four Individual CNC-Beveled Knuckle Armor Plates + Dorsal V-Shield
  {
    const knuckleArcs: Array<[number, number]> = [
      [0.14, 0.30],
      [0.32, 0.49],
      [0.51, 0.68],
      [0.70, 0.86],
    ];
    for (const [u0, u1] of knuckleArcs) {
      const kRad = 14;
      const kLen = 10;
      const kPos: number[] = [];
      const kUv: number[] = [];
      const kIdxArr: number[] = [];

      for (let j = 0; j <= kLen; j++) {
        const vt = j / kLen;
        const t = 0.72 + vt * 0.23;
        const z = 0.032 - t * 0.060;
        const rx = 0.0195 + smoothstep(0.10, 0.72, t) * 0.0080;
        const ry = 0.0142 * (1.0 - 0.30 * smoothstep(0.18, 1.0, t));
        const bevelZ = smoothstep(0.0, 0.28, vt) * smoothstep(1.0, 0.72, vt);

        for (let i = 0; i <= kRad; i++) {
          const iu = i / kRad;
          const u = u0 + iu * (u1 - u0);
          const theta = Math.PI * u;
          const bevelX = smoothstep(0.0, 0.28, iu) * smoothstep(1.0, 0.72, iu);
          const thickness = 0.0032 * bevelZ * bevelX;
          kPos.push(Math.cos(theta) * (rx + thickness * 0.4), Math.sin(theta) * ry + 0.0020 + thickness, z);
          kUv.push(iu, vt);
        }
      }
      for (let j = 0; j < kLen; j++) {
        for (let i = 0; i < kRad; i++) {
          const a = j * (kRad + 1) + i;
          const b = a + kRad + 1;
          kIdxArr.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      const kGeo = new THREE.BufferGeometry();
      kGeo.setAttribute('position', new THREE.Float32BufferAttribute(kPos, 3));
      kGeo.setAttribute('uv', new THREE.Float32BufferAttribute(kUv, 2));
      kGeo.setIndex(kIdxArr);
      kGeo.computeVertexNormals();
      group.add(new THREE.Mesh(kGeo, mats.armorPlateMat));
    }

    const dRad = 16;
    const dLen = 8;
    const dPos: number[] = [];
    const dUv: number[] = [];
    const dIdx: number[] = [];
    for (let j = 0; j <= dLen; j++) {
      const vt = j / dLen;
      const t = 0.32 + vt * 0.32;
      const z = 0.032 - t * 0.060;
      const rx = 0.0195 + smoothstep(0.10, 0.72, t) * 0.0080;
      const ry = 0.0142 * (1.0 - 0.30 * smoothstep(0.18, 1.0, t));
      const bevelZ = Math.pow(Math.sin(vt * Math.PI), 0.42);
      const uSpan = 0.46 + 0.14 * vt;
      for (let i = 0; i <= dRad; i++) {
        const iu = i / dRad;
        const theta = Math.PI * (0.5 - uSpan * 0.5 + iu * uSpan);
        const bevelX = Math.pow(Math.sin(iu * Math.PI), 0.40);
        const thickness = 0.0018 * bevelZ * bevelX;
        dPos.push(Math.cos(theta) * (rx + thickness * 0.3), Math.sin(theta) * ry + 0.0018 + thickness, z);
        dUv.push(iu, vt);
      }
    }
    for (let j = 0; j < dLen; j++) {
      for (let i = 0; i < dRad; i++) {
        const a = j * (dRad + 1) + i;
        const b = a + dRad + 1;
        dIdx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const dGeo = new THREE.BufferGeometry();
    dGeo.setAttribute('position', new THREE.Float32BufferAttribute(dPos, 3));
    dGeo.setAttribute('uv', new THREE.Float32BufferAttribute(dUv, 2));
    dGeo.setIndex(dIdx);
    dGeo.computeVertexNormals();
    group.add(new THREE.Mesh(dGeo, mats.armorPlateMat));
  }

  // 4. Recessed Leather Palm Grip Pad
  {
    const pGeo = new THREE.SphereGeometry(0.020, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    pGeo.rotateX(Math.PI);
    pGeo.scale(0.82, 0.18, 0.82);
    const count = pGeo.attributes.position.count;
    pGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1.0), 3));
    const pMesh = new THREE.Mesh(pGeo, mats.glovePalmMat);
    pMesh.position.set(0, -0.0028, -0.003);
    group.add(pMesh);
  }

  // 5. Raised Stitching Seam Line along pinky edge
  {
    const seamPts: THREE.Vector3[] = [];
    const theta = s > 0 ? 0.12 : Math.PI - 0.12;
    for (let i = 0; i <= 12; i++) {
      const t = 0.18 + (i / 12) * 0.70;
      const z = 0.032 - t * 0.060;
      const rx = 0.0195 + smoothstep(0.10, 0.72, t) * 0.0080;
      seamPts.push(new THREE.Vector3(Math.cos(theta) * (rx + 0.0005), 0.001, z));
    }
    const seamGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPts), 16, 0.00046, 5, false);
    group.add(new THREE.Mesh(seamGeo, mats.stitchMat));
  }

  return group;
}

function buildSculptedPhalanxMesh(
  rBase: number,
  rTip: number,
  length: number,
  isDistal: boolean,
  mat: THREE.Material,
  addFlexRibs: boolean
): THREE.Group {
  const group = new THREE.Group();
  const radSegs = 20;
  const lenSegs = 16;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= lenSegs; j++) {
    const t = j / lenSegs;
    const z = -t * length;
    const waist = 1.0 - 0.07 * Math.sin(t * Math.PI);
    let r = (rBase + (rTip - rBase) * t) * waist;
    if (isDistal && t > 0.70) {
      const capT = (t - 0.70) / 0.30;
      r *= Math.sqrt(Math.max(0.04, 1.0 - capT * capT));
    }

    const flexRibs = addFlexRibs ? Math.sin(t * Math.PI * 8.0) * 0.00045 * Math.sin(t * Math.PI) : 0;
    const palmGripGrooves = isDistal ? Math.sin(t * Math.PI * 7.0) * 0.00025 * Math.sin(t * Math.PI) : 0;

    for (let i = 0; i <= radSegs; i++) {
      const u = i / radSegs;
      const theta = u * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const yScale = sinT < 0 ? 0.80 : 0.94;
      const tipPad = isDistal && sinT < 0 ? Math.sin(t * Math.PI) * 0.0007 : 0;
      const dorsalFlex = sinT > 0.25 ? flexRibs * ((sinT - 0.25) / 0.75) : 0;
      const palmarGrip = sinT < -0.25 ? palmGripGrooves * ((-sinT - 0.25) / 0.75) : 0;
      const ridge =
        !isDistal && sinT > 0.40
          ? Math.sin(smoothstep(0.18, 0.82, t) * Math.PI) * Math.pow((sinT - 0.40) / 0.60, 1.2) * 0.0010
          : 0;

      positions.push(cosT * r, sinT * r * yScale - tipPad + dorsalFlex + palmarGrip + ridge, z);
      uvs.push(u, t);
      const ao = 0.88 + (dorsalFlex + palmarGrip) * 140.0;
      const cAo = Math.max(0.62, Math.min(1.05, ao));
      colors.push(cAo, cAo, cAo);
    }
  }

  for (let j = 0; j < lenSegs; j++) {
    for (let i = 0; i < radSegs; i++) {
      const a = j * (radSegs + 1) + i;
      const b = a + radSegs + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, mat));

  const jointGeo = new THREE.SphereGeometry(rBase * 0.98, 12, 8);
  jointGeo.setAttribute(
    'color',
    new THREE.BufferAttribute(new Float32Array(jointGeo.attributes.position.count * 3).fill(0.88), 3)
  );
  const jointMesh = new THREE.Mesh(jointGeo, mat);
  jointMesh.scale.set(1.0, 0.88, 1.0);
  group.add(jointMesh);

  return group;
}

function buildArticulatedArm(side: 'left' | 'right', mats: SharedArmMaterials): ArticulatedArmHandle {
  const s = side === 'right' ? 1 : -1;
  const armRoot = new THREE.Group();
  armRoot.name = side === 'right' ? 'fps_right_arm' : 'fps_left_arm';

  const handPivot = new THREE.Group();
  handPivot.name = `${side}_hand`;
  armRoot.add(handPivot);

  handPivot.add(buildSculptedHandShell(s, mats));

  const fingers: FingerRig[] = [];
  const fingerConfigs = [
    { x: -0.0175, y: 0.0012, z: -0.0255, r: 0.0052, l1: 0.0185, l2: 0.0130, l3: 0.0110, splay: -0.05 },
    { x: -0.0058, y: 0.0022, z: -0.0270, r: 0.0054, l1: 0.0205, l2: 0.0145, l3: 0.0115, splay: 0.0 },
    { x: 0.0058, y: 0.0014, z: -0.0258, r: 0.0050, l1: 0.0185, l2: 0.0130, l3: 0.0105, splay: 0.04 },
    { x: 0.0165, y: 0.0, z: -0.0235, r: 0.0044, l1: 0.0145, l2: 0.0105, l3: 0.0095, splay: 0.09 },
  ];

  for (const cfg of fingerConfigs) {
    const proxRoot = new THREE.Group();
    proxRoot.position.set(cfg.x * s, cfg.y, cfg.z);
    proxRoot.rotation.y = cfg.splay * s;
    proxRoot.add(buildSculptedPhalanxMesh(cfg.r, cfg.r * 0.88, cfg.l1, false, mats.gloveDorsalMat, true));

    const midRoot = new THREE.Group();
    midRoot.position.set(0, 0, -cfg.l1);
    midRoot.add(buildSculptedPhalanxMesh(cfg.r * 0.88, cfg.r * 0.78, cfg.l2, false, mats.glovePalmMat, true));

    const distRoot = new THREE.Group();
    distRoot.position.set(0, 0, -cfg.l2);
    distRoot.add(buildSculptedPhalanxMesh(cfg.r * 0.78, cfg.r * 0.65, cfg.l3, true, mats.glovePalmMat, false));

    midRoot.add(distRoot);
    proxRoot.add(midRoot);
    handPivot.add(proxRoot);
    fingers.push({ proxRoot, midRoot, distRoot });
  }

  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(-0.021 * s, -0.0015, -0.005);
  thumbRoot.add(buildSculptedPhalanxMesh(0.0066, 0.0058, 0.019, false, mats.gloveDorsalMat, true));

  const thumbDist = new THREE.Group();
  thumbDist.position.set(0, 0, -0.019);
  thumbDist.add(buildSculptedPhalanxMesh(0.0058, 0.0046, 0.015, true, mats.glovePalmMat, false));
  thumbRoot.add(thumbDist);
  handPivot.add(thumbRoot);

  const forearmPivot = new THREE.Group();
  forearmPivot.name = `${side}_forearm`;
  forearmPivot.add(buildSculptedSleeveAndWrist(s, mats));
  armRoot.add(forearmPivot);

  const wristLocal = new THREE.Vector3(0, 0, 0.024);
  const wristInArmRoot = new THREE.Vector3();
  const dirToShoulder = new THREE.Vector3();
  const targetVec = new THREE.Vector3();
  const handUpHint = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const xAxis = new THREE.Vector3();
  const yAxis = new THREE.Vector3();
  const basisMat = new THREE.Matrix4();

  const setHold: ArticulatedArmHandle['setHold'] = ({
    handPos,
    handRot,
    shoulderTarget,
    proxCurl,
    distCurl,
    indexCurl,
    thumbRot = [0.22, 0.30 * s, -0.18 * s],
    visible = true,
  }) => {
    armRoot.visible = visible;
    armRoot.position.set(handPos[0], handPos[1], handPos[2]);
    armRoot.rotation.set(0, 0, 0);
    handPivot.rotation.set(handRot[0], handRot[1], handRot[2]);

    fingers.forEach((f, idx) => {
      const pCurl = idx === 0 && indexCurl !== undefined ? indexCurl : proxCurl + idx * 0.035;
      const dCurl = idx === 0 && indexCurl !== undefined ? indexCurl * 0.65 : distCurl;
      f.proxRoot.rotation.x = pCurl * 0.65;
      f.midRoot.rotation.x = pCurl * 0.55;
      f.distRoot.rotation.x = dCurl * 0.65;
    });
    thumbRoot.rotation.set(thumbRot[0], thumbRot[1], thumbRot[2]);
    thumbDist.rotation.x = -0.42;

    wristInArmRoot.copy(wristLocal).applyEuler(handPivot.rotation);
    forearmPivot.position.copy(wristInArmRoot);

    targetVec.set(
      shoulderTarget[0] - handPos[0],
      shoulderTarget[1] - handPos[1],
      shoulderTarget[2] - handPos[2]
    );
    dirToShoulder.subVectors(targetVec, wristInArmRoot).normalize();

    // Align forearm dorsal roll naturally with the hand's dorsal axis so the wrist never twists awkwardly
    handUpHint.set(0, 1, 0).applyEuler(handPivot.rotation).lerp(worldUp, 0.25);
    handUpHint.addScaledVector(dirToShoulder, -handUpHint.dot(dirToShoulder));
    if (handUpHint.lengthSq() < 1e-5) {
      handUpHint.set(0, 1, 0).addScaledVector(dirToShoulder, -dirToShoulder.y);
    }
    yAxis.copy(handUpHint).normalize();
    xAxis.crossVectors(yAxis, dirToShoulder).normalize();
    yAxis.crossVectors(dirToShoulder, xAxis).normalize();
    basisMat.makeBasis(xAxis, yAxis, dirToShoulder);
    forearmPivot.quaternion.setFromRotationMatrix(basisMat);
  };

  return {
    armRoot,
    handPivot,
    forearmPivot,
    thumbRoot,
    thumbDist,
    fingers,
    setHold,
  };
}

/** Returns the canonical resting left/right hand & shoulder holds for any weapon archetype. */
export function getBaseArmHolds(archetype: WeaponArchetype): {
  left: ArmHoldPose;
  right: ArmHoldPose;
} {
  if (archetype === 'ar15_sil' || archetype === 'ar15' || archetype === 'ak47') {
    const leftHandY =
      archetype === 'ak47' ? 0.019 : archetype === 'ar15' ? 0.008 : 0.002;
    const leftHandZ = archetype === 'ak47' ? -0.112 : -0.132;
    const rightHandY = archetype === 'ak47' ? -0.056 : -0.082;
    return {
      left: {
        handPos: [-0.032, leftHandY, leftHandZ],
        handRot: [-0.04, -0.30, 1.84],
        shoulderTarget: [-0.42, -0.22, 0.34],
        proxCurl: -1.06,
        distCurl: -0.94,
        thumbRot: [0.05, -0.24, 0.18],
        visible: true,
      },
      right: {
        handPos: [0.016, rightHandY, 0.162],
        handRot: [-0.30, 0.20, -1.50],
        shoulderTarget: [0.30, -0.26, 0.44],
        proxCurl: -1.28,
        distCurl: -1.08,
        indexCurl: -0.65,
        thumbRot: [0.22, -0.26, 0.18],
        visible: true,
      },
    };
  }

  if (archetype === 'awp') {
    return {
      left: {
        handPos: [-0.028, -0.028, -0.185],
        handRot: [0.02, -0.28, 1.94],
        shoulderTarget: [-0.44, -0.22, 0.28],
        proxCurl: -0.98,
        distCurl: -0.88,
        thumbRot: [0.08, -0.22, 0.18],
        visible: true,
      },
      right: {
        handPos: [0.016, -0.056, 0.155],
        handRot: [-0.26, 0.20, -1.50],
        shoulderTarget: [0.32, -0.24, 0.44],
        proxCurl: -1.28,
        distCurl: -1.08,
        indexCurl: -0.65,
        thumbRot: [0.22, -0.24, 0.18],
        visible: true,
      },
    };
  }

  if (archetype === 'pistolet') {
    return {
      right: {
        handPos: [0.020, 0.0, 0.104],
        handRot: [-0.34, 0.22, -1.50],
        shoulderTarget: [0.29, -0.22, 0.44],
        proxCurl: -1.42,
        distCurl: -1.22,
        indexCurl: -0.62,
        thumbRot: [0.14, -0.24, 0.16],
        visible: true,
      },
      left: {
        handPos: [-0.018, -0.012, 0.084],
        handRot: [-0.26, -0.44, 1.56],
        shoulderTarget: [-0.36, -0.22, 0.40],
        proxCurl: -1.06,
        distCurl: -0.94,
        thumbRot: [0.10, 0.20, -0.14],
        visible: true,
      },
    };
  }

  if (archetype === 'mac10') {
    return {
      right: {
        handPos: [0.020, -0.002, 0.038],
        handRot: [-0.16, 0.36, -1.52],
        shoulderTarget: [0.26, -0.22, 0.42],
        proxCurl: -1.58,
        distCurl: -1.38,
        indexCurl: -0.86,
        thumbRot: [0.16, -0.28, 0.18],
        visible: true,
      },
      left: {
        handPos: [-0.42, -0.34, 0.18],
        handRot: [0, 0, 1.1],
        shoulderTarget: [-0.52, -0.44, 0.38],
        proxCurl: -0.45,
        distCurl: -0.4,
        visible: false,
      },
    };
  }

  // Natural Valorant-inspired blade holds (ergonomic wrist angles, fingers wrapped snugly onto handle)
  if (archetype === 'karambit') {
    return {
      right: {
        handPos: [0.006, -0.010, 0.030],
        handRot: [0.46, 0.28, -1.36],
        shoulderTarget: [0.30, -0.23, 0.36],
        proxCurl: -1.62,
        distCurl: -1.48,
        indexCurl: -1.52,
        thumbRot: [-0.72, 0.42, 0.14],
        visible: true,
      },
      left: {
        handPos: [-0.275, -0.064, 0.012],
        handRot: [-0.22, -0.36, 0.92],
        shoulderTarget: [-0.46, -0.24, 0.34],
        proxCurl: -0.82,
        distCurl: -0.70,
        thumbRot: [0.14, 0.18, -0.16],
        visible: true,
      },
    };
  }

  // couteau / baionnette / katana / dague
  return {
    right: {
      handPos: [0.004, -0.016, 0.044],
      handRot: [-0.58, 0.22, -1.24],
      shoulderTarget: [0.27, -0.22, 0.42],
      proxCurl: -1.58,
      distCurl: -1.36,
      indexCurl: -1.46,
      thumbRot: [0.20, -0.32, 0.22],
      visible: true,
    },
    left: {
      handPos: [-0.265, -0.072, 0.018],
      handRot: [-0.24, -0.38, 0.90],
      shoulderTarget: [-0.46, -0.24, 0.34],
      proxCurl: -0.85,
      distCurl: -0.72,
      thumbRot: [0.14, 0.18, -0.16],
      visible: true,
    },
  };
}

/**
 * Creates 3D articulated First-Person Valorant-style tactical hands & sculpted sleeves
 * posed per weapon archetype with seamless wrist-to-shoulder forearm aiming and
 * zero left/right arm intersection.
 */
export function createFPSHands(accentHex = '#38bdf8'): FPSHandsRig {
  const group = new THREE.Group();
  group.name = 'fps_hands_root';

  const texBank = createHandsTextureBank();

  const mats: SharedArmMaterials = {
    sleeveMat: new THREE.MeshPhysicalMaterial({
      ...(texBank ? { map: texBank.clothMap, normalMap: texBank.clothNormal, roughnessMap: texBank.clothRough } : {}),
      normalScale: new THREE.Vector2(1.15, 1.15),
      color: '#b8c0ce',
      roughness: 0.90,
      metalness: 0.03,
      sheen: 0.65,
      sheenRoughness: 0.70,
      sheenColor: new THREE.Color('#475569'),
      vertexColors: true,
    }),
    innerWrapMat: new THREE.MeshPhysicalMaterial({
      ...(texBank ? { map: texBank.strapMap, normalMap: texBank.strapNormal } : {}),
      normalScale: new THREE.Vector2(1.0, 1.0),
      color: '#7c8596',
      roughness: 0.84,
      metalness: 0.05,
      sheen: 0.4,
      sheenColor: new THREE.Color('#334155'),
      vertexColors: true,
    }),
    gloveDorsalMat: new THREE.MeshPhysicalMaterial({
      ...(texBank ? { map: texBank.hexMap, normalMap: texBank.hexNormal } : {}),
      normalScale: new THREE.Vector2(1.0, 1.0),
      color: '#9aa3b2',
      roughness: 0.62,
      metalness: 0.10,
      vertexColors: true,
    }),
    glovePalmMat: new THREE.MeshPhysicalMaterial({
      ...(texBank ? { normalMap: texBank.leatherNormal } : {}),
      normalScale: new THREE.Vector2(1.0, 1.0),
      color: '#17191f',
      roughness: 0.68,
      metalness: 0.06,
      vertexColors: true,
    }),
    armorPlateMat: new THREE.MeshPhysicalMaterial({
      ...(texBank ? { map: texBank.hexMap, normalMap: texBank.hexNormal } : {}),
      normalScale: new THREE.Vector2(0.45, 0.45),
      color: '#3e4554',
      roughness: 0.36,
      metalness: 0.42,
      clearcoat: 0.32,
      clearcoatRoughness: 0.38,
    }),
    strapMat: new THREE.MeshPhysicalMaterial({
      ...(texBank ? { map: texBank.strapMap, normalMap: texBank.strapNormal } : {}),
      normalScale: new THREE.Vector2(1.1, 1.1),
      color: '#8892a3',
      roughness: 0.78,
      metalness: 0.06,
    }),
    metalHardwareMat: new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.28,
      metalness: 0.85,
    }),
    stitchMat: new THREE.MeshStandardMaterial({
      color: accentHex,
      roughness: 0.72,
      metalness: 0.12,
    }),
  };

  const right = buildArticulatedArm('right', mats);
  const left = buildArticulatedArm('left', mats);
  group.add(right.armRoot, left.armRoot);

  const applyPose = (archetype: WeaponArchetype) => {
    const holds = getBaseArmHolds(archetype);
    left.setHold(holds.left);
    right.setHold(holds.right);
  };

  const setArmPose = (side: 'left' | 'right', pose: ArmHoldPose) => {
    if (side === 'left') left.setHold(pose);
    else right.setHold(pose);
  };

  void getWeaponMuzzleSide;
  applyPose('ar15');

  return {
    group,
    rightArm: right.armRoot,
    leftArm: left.armRoot,
    applyPose,
    setArmPose,
    dispose: () => {
      texBank?.dispose();
      const disposedGeo = new Set<THREE.BufferGeometry>();
      const disposedMat = new Set<THREE.Material>();
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (!disposedGeo.has(obj.geometry)) {
            disposedGeo.add(obj.geometry);
            obj.geometry.dispose();
          }
          const mList = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mList) {
            if (!disposedMat.has(m)) {
              disposedMat.add(m);
              m.dispose();
            }
          }
        }
      });
    },
  };
}
