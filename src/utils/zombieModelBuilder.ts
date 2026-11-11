import * as THREE from 'three';
import { ZOMBIE_TIERS, ZombieTier } from './zombieEngine';

export type ZombieHitPart = 'head' | 'body';

export interface ZombieAnimateOptions {
  /** True when the zombie is within melee range and swiping at the player. */
  isAttacking?: boolean;
  /** Normalized stagger/flinch impulse in [0..1] when recently shot. */
  flinch?: number;
}

export interface Zombie3DModel {
  root: THREE.Group;
  tier: ZombieTier;
  headGroup: THREE.Group;
  animate: (walkPhase: number, dt: number, options?: ZombieAnimateOptions) => void;
  setHitFlash: (amount: number) => void;
  dispose: () => void;
}

interface TierVisualStyle {
  skinBase: string;
  skinDark: string;
  skinHighlight: string;
  veinColor: string;
  veinGlow: string;
  veinGlowIntensity: number;
  clothPrimary: string;
  clothSecondary: string;
  clothPattern: string;
  fleshColor: string;
  boneColor: string;
  eyeGlow: string;
  eyeCore: string;
  armorColor: string;
  widthScale: number;
  armLengthScale: number;
  hunchAngle: number;
  headTiltZ: number;
  hasArmor: boolean;
  hasShoulderSpikes: boolean;
  hasDorsalGlow: boolean;
}

const TIER_STYLES: Record<ZombieTier, TierVisualStyle> = {
  standard: {
    skinBase: '#64765d',
    skinDark: '#3f4c3b',
    skinHighlight: '#839879',
    veinColor: '#2c3d2d',
    veinGlow: '#166534',
    veinGlowIntensity: 0.14,
    clothPrimary: '#242d38',
    clothSecondary: '#2d2a23',
    clothPattern: '#1a212a',
    fleshColor: '#691219',
    boneColor: '#cfc5aa',
    eyeGlow: '#4ade80',
    eyeCore: '#dcfce7',
    armorColor: '#1f2937',
    widthScale: 1.0,
    armLengthScale: 1.0,
    hunchAngle: 0.20,
    headTiltZ: 0.14,
    hasArmor: false,
    hasShoulderSpikes: false,
    hasDorsalGlow: false,
  },
  rapide: {
    skinBase: '#876f50',
    skinDark: '#57442d',
    skinHighlight: '#ad906b',
    veinColor: '#7c2d12',
    veinGlow: '#f59e0b',
    veinGlowIntensity: 0.42,
    clothPrimary: '#2d221c',
    clothSecondary: '#1d1a19',
    clothPattern: '#452b1b',
    fleshColor: '#7a1618',
    boneColor: '#dfd3b8',
    eyeGlow: '#fbbf24',
    eyeCore: '#fef3c7',
    armorColor: '#292524',
    widthScale: 0.87,
    armLengthScale: 1.12,
    hunchAngle: 0.36,
    headTiltZ: -0.10,
    hasArmor: false,
    hasShoulderSpikes: false,
    hasDorsalGlow: true,
  },
  colosse: {
    skinBase: '#504256',
    skinDark: '#312536',
    skinHighlight: '#6f5c77',
    veinColor: '#6b1644',
    veinGlow: '#ec4899',
    veinGlowIntensity: 0.65,
    clothPrimary: '#1d1b24',
    clothSecondary: '#2a1c24',
    clothPattern: '#141219',
    fleshColor: '#6e0e25',
    boneColor: '#d7cab1',
    eyeGlow: '#f472b6',
    eyeCore: '#fce7f3',
    armorColor: '#272935',
    widthScale: 1.24,
    armLengthScale: 1.04,
    hunchAngle: 0.24,
    headTiltZ: 0.06,
    hasArmor: true,
    hasShoulderSpikes: true,
    hasDorsalGlow: true,
  },
};

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function gaussian3(dx: number, dy: number, dz: number, rx: number, ry: number, rz: number): number {
  const nx = dx / rx;
  const ny = dy / ry;
  const nz = dz / rz;
  return Math.exp(-(nx * nx + ny * ny + nz * nz));
}

interface TierTextureSet {
  skinMap: THREE.CanvasTexture | null;
  skinBumpMap: THREE.CanvasTexture | null;
  skinRoughnessMap: THREE.CanvasTexture | null;
  clothMap: THREE.CanvasTexture | null;
  clothBumpMap: THREE.CanvasTexture | null;
  fleshMap: THREE.CanvasTexture | null;
  boneMap: THREE.CanvasTexture | null;
  dispose: () => void;
}

function configureSmoothTexture(
  canvas: HTMLCanvasElement,
  isSrgb: boolean,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isSrgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = clamp(maxAnisotropy, 1, 16);
  tex.needsUpdate = true;
  return tex;
}

function drawSeamlessRadial(
  ctx: CanvasRenderingContext2D,
  size: number,
  cx: number,
  cy: number,
  r: number,
  innerColor: string,
  outerColor: string
): void {
  for (const offsetX of [-size, 0, size]) {
    const x = cx + offsetX;
    if (x + r < 0 || x - r > size) continue;
    const g = ctx.createRadialGradient(x, cy, r * 0.08, x, cy, r);
    g.addColorStop(0, innerColor);
    g.addColorStop(1, outerColor);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBranchingVein(
  ctx: CanvasRenderingContext2D,
  bumpCtx: CanvasRenderingContext2D,
  size: number,
  startX: number,
  startY: number,
  angle: number,
  length: number,
  width: number,
  color: string,
  rng: () => number,
  depth: number
): void {
  if (depth <= 0 || length < 8 || width < 0.45) return;
  const midAngle = angle + (rng() - 0.5) * 0.55;
  const endAngle = midAngle + (rng() - 0.5) * 0.5;
  const mx = startX + Math.cos(midAngle) * (length * 0.5);
  const my = startY + Math.sin(midAngle) * (length * 0.5);
  const ex = startX + Math.cos(endAngle) * length;
  const ey = startY + Math.sin(endAngle) * length;

  for (const ox of [-size, 0, size]) {
    if (Math.max(startX + ox, ex + ox) < -20 || Math.min(startX + ox, ex + ox) > size + 20) continue;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX + ox, startY);
    ctx.quadraticCurveTo(mx + ox, my, ex + ox, ey);
    ctx.stroke();

    bumpCtx.strokeStyle = 'rgba(225, 225, 225, 0.35)';
    bumpCtx.lineWidth = width * 1.1;
    bumpCtx.lineCap = 'round';
    bumpCtx.beginPath();
    bumpCtx.moveTo(startX + ox, startY);
    bumpCtx.quadraticCurveTo(mx + ox, my, ex + ox, ey);
    bumpCtx.stroke();
  }

  if (rng() < 0.85) {
    drawBranchingVein(
      ctx,
      bumpCtx,
      size,
      ex,
      ey,
      endAngle + (rng() - 0.5) * 0.7,
      length * (0.64 + rng() * 0.16),
      width * 0.72,
      color,
      rng,
      depth - 1
    );
  }
  if (rng() < 0.65) {
    drawBranchingVein(
      ctx,
      bumpCtx,
      size,
      mx,
      my,
      midAngle + (rng() > 0.5 ? 0.55 : -0.55),
      length * (0.55 + rng() * 0.2),
      width * 0.62,
      color,
      rng,
      depth - 1
    );
  }
}

function createTierTextures(tier: ZombieTier, maxAnisotropy: number): TierTextureSet {
  const empty: TierTextureSet = {
    skinMap: null,
    skinBumpMap: null,
    skinRoughnessMap: null,
    clothMap: null,
    clothBumpMap: null,
    fleshMap: null,
    boneMap: null,
    dispose: () => {},
  };
  if (typeof document === 'undefined') return empty;

  const style = TIER_STYLES[tier];
  const seed = tier === 'standard' ? 104729 : tier === 'rapide' ? 224737 : 350377;
  const rng = mulberry32(seed);
  const size = 512;

  const skinCanvas = document.createElement('canvas');
  skinCanvas.width = size;
  skinCanvas.height = size;
  const skinCtx = skinCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');

  const clothCanvas = document.createElement('canvas');
  clothCanvas.width = size;
  clothCanvas.height = size;
  const clothCtx = clothCanvas.getContext('2d');

  const clothBumpCanvas = document.createElement('canvas');
  clothBumpCanvas.width = size;
  clothBumpCanvas.height = size;
  const clothBumpCtx = clothBumpCanvas.getContext('2d');

  const fleshCanvas = document.createElement('canvas');
  fleshCanvas.width = 256;
  fleshCanvas.height = 256;
  const fleshCtx = fleshCanvas.getContext('2d');

  const boneCanvas = document.createElement('canvas');
  boneCanvas.width = 256;
  boneCanvas.height = 256;
  const boneCtx = boneCanvas.getContext('2d');

  if (!skinCtx || !bumpCtx || !roughCtx || !clothCtx || !clothBumpCtx || !fleshCtx || !boneCtx) {
    return empty;
  }

  // 1. High-resolution necrotic skin diffuse + bump + roughness (smooth gradients, zero pixel blocks)
  const skinGrad = skinCtx.createLinearGradient(0, 0, 0, size);
  skinGrad.addColorStop(0, style.skinHighlight);
  skinGrad.addColorStop(0.5, style.skinBase);
  skinGrad.addColorStop(1, style.skinDark);
  skinCtx.fillStyle = skinGrad;
  skinCtx.fillRect(0, 0, size, size);

  bumpCtx.fillStyle = '#808080';
  bumpCtx.fillRect(0, 0, size, size);

  roughCtx.fillStyle = '#c4c4c4'; // ~0.77 dry necrotic skin base roughness
  roughCtx.fillRect(0, 0, size, size);

  // Soft livor mortis mottling & bruising patches
  for (let i = 0; i < 65; i++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const r = 24 + rng() * 68;
    const isDark = rng() > 0.35;
    drawSeamlessRadial(
      skinCtx,
      size,
      cx,
      cy,
      r,
      isDark ? 'rgba(34, 24, 36, 0.24)' : 'rgba(170, 182, 145, 0.14)',
      'rgba(0, 0, 0, 0)'
    );
    drawSeamlessRadial(
      bumpCtx,
      size,
      cx,
      cy,
      r * 0.7,
      isDark ? 'rgba(95, 95, 95, 0.25)' : 'rgba(165, 165, 165, 0.2)',
      'rgba(128, 128, 128, 0)'
    );
  }

  // Organic fine skin wrinkles & pores
  for (let i = 0; i < 140; i++) {
    const x0 = rng() * size;
    const y0 = rng() * size;
    const len = 14 + rng() * 32;
    const ang = (rng() - 0.5) * 0.6;
    const x1 = x0 + Math.cos(ang) * len;
    const y1 = y0 + Math.sin(ang) * len;
    bumpCtx.strokeStyle = rng() > 0.5 ? 'rgba(70, 70, 70, 0.32)' : 'rgba(175, 175, 175, 0.25)';
    bumpCtx.lineWidth = 1.0 + rng() * 1.4;
    bumpCtx.lineCap = 'round';
    bumpCtx.beginPath();
    bumpCtx.moveTo(x0, y0);
    bumpCtx.quadraticCurveTo((x0 + x1) * 0.5, (y0 + y1) * 0.5 + (rng() - 0.5) * 6, x1, y1);
    bumpCtx.stroke();
  }

  // Subdermal branching infected veins
  for (let i = 0; i < 20; i++) {
    const sx = rng() * size;
    const sy = rng() * size;
    const ang = rng() * Math.PI * 2;
    drawBranchingVein(
      skinCtx,
      bumpCtx,
      size,
      sx,
      sy,
      ang,
      36 + rng() * 38,
      2.6 + rng() * 1.2,
      style.veinColor,
      rng,
      4
    );
  }

  // Moist lacerations & blood-stained patches (low roughness = realistic wet sheen)
  for (let i = 0; i < 14; i++) {
    const wx = rng() * size;
    const wy = rng() * size;
    const wr = 14 + rng() * 28;
    drawSeamlessRadial(skinCtx, size, wx, wy, wr, 'rgba(92, 12, 18, 0.52)', 'rgba(60, 10, 14, 0)');
    drawSeamlessRadial(
      roughCtx,
      size,
      wx,
      wy,
      wr,
      'rgba(48, 48, 48, 0.85)', // wet ~0.19 roughness
      'rgba(196, 196, 196, 0)'
    );
    drawSeamlessRadial(bumpCtx, size, wx, wy, wr * 0.7, 'rgba(65, 65, 65, 0.45)', 'rgba(128,128,128,0)');
  }

  // 2. Smooth Woven Tattered Cloth Texture + Bump
  clothCtx.fillStyle = style.clothPrimary;
  clothCtx.fillRect(0, 0, size, size);
  clothBumpCtx.fillStyle = '#808080';
  clothBumpCtx.fillRect(0, 0, size, size);

  // Subtle woven twill threads
  clothCtx.strokeStyle = style.clothPattern;
  clothCtx.lineWidth = 1.2;
  clothBumpCtx.strokeStyle = 'rgba(155, 155, 155, 0.35)';
  clothBumpCtx.lineWidth = 1.2;
  for (let y = 0; y < size; y += 4) {
    clothCtx.globalAlpha = 0.26;
    clothCtx.beginPath();
    clothCtx.moveTo(0, y);
    clothCtx.lineTo(size, y);
    clothCtx.stroke();

    clothBumpCtx.beginPath();
    clothBumpCtx.moveTo(0, y);
    clothBumpCtx.lineTo(size, y);
    clothBumpCtx.stroke();
  }
  for (let x = 0; x < size; x += 5) {
    clothCtx.globalAlpha = 0.16;
    clothCtx.beginPath();
    clothCtx.moveTo(x, 0);
    clothCtx.lineTo(x, size);
    clothCtx.stroke();
  }
  clothCtx.globalAlpha = 1.0;

  // Grime, dust & dried blood splatters on clothing
  for (let i = 0; i < 42; i++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const r = 22 + rng() * 64;
    const blood = rng() < 0.35;
    drawSeamlessRadial(
      clothCtx,
      size,
      cx,
      cy,
      r,
      blood ? 'rgba(72, 10, 14, 0.38)' : 'rgba(14, 14, 12, 0.32)',
      'rgba(0, 0, 0, 0)'
    );
    drawSeamlessRadial(
      clothBumpCtx,
      size,
      cx,
      cy,
      r * 0.8,
      'rgba(105, 105, 105, 0.28)',
      'rgba(128, 128, 128, 0)'
    );
  }

  // 3. Striated Wet Exposed Flesh Texture
  fleshCtx.fillStyle = style.fleshColor;
  fleshCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 80; i++) {
    const y = rng() * 256;
    fleshCtx.strokeStyle = rng() > 0.45 ? 'rgba(165, 32, 42, 0.48)' : 'rgba(42, 5, 10, 0.55)';
    fleshCtx.lineWidth = 1.5 + rng() * 3.5;
    fleshCtx.beginPath();
    fleshCtx.moveTo(0, y);
    fleshCtx.bezierCurveTo(85, y + (rng() - 0.5) * 20, 170, y + (rng() - 0.5) * 20, 256, y);
    fleshCtx.stroke();
  }

  // 4. Aged Ivory Bone Texture
  boneCtx.fillStyle = style.boneColor;
  boneCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 45; i++) {
    const x = rng() * 256;
    boneCtx.strokeStyle = rng() > 0.3 ? 'rgba(130, 114, 88, 0.25)' : 'rgba(90, 16, 20, 0.25)';
    boneCtx.lineWidth = 1 + rng() * 2;
    boneCtx.beginPath();
    boneCtx.moveTo(x, 0);
    boneCtx.lineTo(x + (rng() - 0.5) * 14, 256);
    boneCtx.stroke();
  }

  const skinMap = configureSmoothTexture(skinCanvas, true, maxAnisotropy, 1, 1);
  const skinBumpMap = configureSmoothTexture(bumpCanvas, false, maxAnisotropy, 1, 1);
  const skinRoughnessMap = configureSmoothTexture(roughCanvas, false, maxAnisotropy, 1, 1);
  const clothMap = configureSmoothTexture(clothCanvas, true, maxAnisotropy, 2, 2);
  const clothBumpMap = configureSmoothTexture(clothBumpCanvas, false, maxAnisotropy, 2, 2);
  const fleshMap = configureSmoothTexture(fleshCanvas, true, maxAnisotropy, 1, 1);
  const boneMap = configureSmoothTexture(boneCanvas, true, maxAnisotropy, 1, 1);

  return {
    skinMap,
    skinBumpMap,
    skinRoughnessMap,
    clothMap,
    clothBumpMap,
    fleshMap,
    boneMap,
    dispose: () => {
      skinMap.dispose();
      skinBumpMap.dispose();
      skinRoughnessMap.dispose();
      clothMap.dispose();
      clothBumpMap.dispose();
      fleshMap.dispose();
      boneMap.dispose();
    },
  };
}

/**
 * Creates a smooth organic LatheGeometry from `[radius, y]` profile points
 * using spline interpolation and optional anatomical vertex sculpting.
 */
function createOrganicLatheGeometry(
  profile: Array<[number, number]>,
  radialSegments: number,
  splineSamples = 20,
  deform?: (x: number, y: number, z: number, normY: number) => [number, number, number]
): THREE.BufferGeometry {
  const curvePts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const spline = new THREE.SplineCurve(curvePts);
  const sampled = spline.getPoints(splineSamples);

  const geo = new THREE.LatheGeometry(sampled, radialSegments);
  if (deform) {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const py = pos.getY(i);
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const spanY = Math.max(1e-5, maxY - minY);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const t = (y - minY) / spanY;
      const [nx, ny, nz] = deform(x, y, z, t);
      pos.setXYZ(i, nx, ny, nz);
    }
    pos.needsUpdate = true;
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds an anatomically sculpted zombie cranium with brow overhang, deep sunken orbital sockets,
 * prominent cheekbones, gaunt hollow cheeks, decayed nose bridge, and snarling upper jaw.
 */
function createSculptedSkullGeometry(tier: ZombieTier): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.122, 34, 26);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    // Base elongated cranial proportions
    x *= tier === 'colosse' ? 0.96 : tier === 'rapide' ? 0.84 : 0.89;
    y *= 1.18;
    z *= 1.07;

    // Back of cranium / occipital fullness
    if (y > 0.0 && z < 0.0) {
      z *= 1.08;
      x *= 1.04;
    }

    // Taper lower face slightly toward jaw/cheek
    if (y < 0.0 && z > -0.02) {
      const lowerT = clamp(-y / 0.14, 0, 1);
      x *= 1.0 - lowerT * 0.24;
    }

    // Prominent supraorbital brow ridge (menacing overhang)
    const brow = gaussian3(x, y - 0.044, z - 0.114, 0.068, 0.022, 0.046);
    z += brow * 0.024;
    y -= brow * 0.004;

    // Deep sunken eye sockets (bilateral) centered on front orbital plane
    const leftEye = gaussian3(x + 0.038, y - 0.015, z - 0.115, 0.024, 0.022, 0.044);
    const rightEye = gaussian3(x - 0.038, y - 0.015, z - 0.115, 0.024, 0.022, 0.044);
    z -= (leftEye + rightEye) * 0.040;

    // Sharp zygomatic cheekbones
    const leftCheek = gaussian3(x + 0.060, y + 0.016, z - 0.092, 0.024, 0.020, 0.040);
    const rightCheek = gaussian3(x - 0.060, y + 0.016, z - 0.092, 0.024, 0.020, 0.040);
    x += (rightCheek - leftCheek) * 0.014;
    z += (leftCheek + rightCheek) * 0.016;

    // Cadaverous hollow cheeks
    const leftHollow = gaussian3(x + 0.050, y + 0.052, z - 0.068, 0.026, 0.026, 0.045);
    const rightHollow = gaussian3(x - 0.050, y + 0.052, z - 0.068, 0.026, 0.026, 0.045);
    x -= (rightHollow - leftHollow) * 0.018;
    z -= (leftHollow + rightHollow) * 0.015;

    // Gaunt temporal hollows
    const leftTemple = gaussian3(x + 0.082, y - 0.035, z - 0.025, 0.022, 0.032, 0.045);
    const rightTemple = gaussian3(x - 0.082, y - 0.035, z - 0.025, 0.022, 0.032, 0.045);
    x -= (rightTemple - leftTemple) * 0.011;

    // Sharp nasal bridge & sunken necrotic nasal cavity
    const noseBridge = gaussian3(x, y - 0.002, z - 0.120, 0.015, 0.025, 0.036);
    const noseTip = gaussian3(x, y + 0.024, z - 0.122, 0.015, 0.014, 0.032);
    z += noseBridge * 0.022 - noseTip * 0.018;

    // Forward maxilla snarl muzzle (gives depth above open mouth)
    const muzzle = gaussian3(x, y + 0.056, z - 0.106, 0.042, 0.024, 0.046);
    z += muzzle * 0.018;

    // Subtle cranial asymmetry & battle dent on right forehead
    const dent = gaussian3(x - 0.038, y - 0.072, z - 0.075, 0.028, 0.025, 0.034);
    z -= dent * 0.012;
    y -= dent * 0.008;

    // Trim bottom underside behind maxilla so articulated jaw & teeth fit cleanly
    if (y < -0.068 && z > 0.005) {
      y = -0.068 + (y + 0.068) * 0.32;
    }

    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a U-curved lower mandible jaw with chin prominence for the hinged mouth.
 */
function createSculptedJawGeometry(tier: ZombieTier): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.088, 26, 18);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const wMul = tier === 'colosse' ? 1.10 : tier === 'rapide' ? 0.88 : 0.95;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) * wMul;
    let y = pos.getY(i) * 0.54;
    let z = pos.getZ(i) * 0.92;

    // Shift forward so hinge is near rear condyles (z ~ 0) and chin extends forward (+Z)
    z += 0.038;

    // Flatten top mouth surface and accentuate chin point
    if (y > 0.008) y *= 0.42;
    const chin = gaussian3(x, y + 0.022, z - 0.105, 0.030, 0.022, 0.032);
    z += chin * 0.018;
    y -= chin * 0.012;

    // Hollow inner mouth top depression
    const mouthHollow = gaussian3(x, y - 0.01, z - 0.052, 0.036, 0.025, 0.050);
    y -= mouthHollow * 0.018;

    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a smooth open-ended torn cloth tube with organic jagged frayed hem edges.
 */
function createTornClothGeometry(
  topRadius: number,
  bottomRadius: number,
  height: number,
  radialSegs: number,
  heightSegs: number,
  tearSeed: number,
  topFlared = false,
  thetaStart = 0,
  thetaLength = Math.PI * 2
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(
    topRadius,
    bottomRadius,
    height,
    radialSegs,
    heightSegs,
    true,
    thetaStart,
    thetaLength
  );
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const halfH = height * 0.5;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const tFromTop = clamp((halfH - y) / height, 0, 1);

    // Smooth harmonic jagged hem near the bottom (or top if topFlared)
    const edgeWeight = topFlared ? Math.pow(1 - tFromTop, 2.2) : Math.pow(tFromTop, 2.2);
    const jag =
      Math.sin(ang * 5 + tearSeed) * 0.026 +
      Math.cos(ang * 9 - tearSeed * 1.7) * 0.016 +
      Math.sin(ang * 13 + tearSeed * 0.6) * 0.009;
    y += jag * edgeWeight;

    // Slight cloth fold/drape ripple around circumference
    const drape = 1.0 + Math.sin(ang * 6 + tearSeed * 0.5) * 0.035 * edgeWeight;
    pos.setXYZ(i, x * drape, y, z * drape);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a sculpted zombie boot/shoe whose sole bottom sits strictly at local `y = 0`.
 */
function createSculptedBootGeometry(side: 'left' | 'right'): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.068, 22, 16);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const sign = side === 'right' ? 1 : -1;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i) * 0.72;
    let y = pos.getY(i) * 0.66;
    let z = pos.getZ(i) * 1.78;

    // Shift forward so ankle sits near z = 0 and toe reaches z = +0.16
    z += 0.048;

    // Slight anatomical inward/outward foot curve
    x += sign * Math.sin(clamp((z + 0.06) / 0.22, 0, 1) * Math.PI) * 0.008;

    // Taper toe box downward and flatten sole plane
    const frontT = clamp((z - 0.02) / 0.14, 0, 1);
    if (y > 0) {
      y *= 1.0 - frontT * 0.42;
      // Ankle collar rise near back
      const ankleRise = gaussian3(x, y - 0.025, z + 0.02, 0.045, 0.035, 0.045);
      y += ankleRise * 0.032;
    }

    // Shift entire boot up so minimum Y is exactly 0
    y += 0.044;
    if (y < 0.006) y = y * 0.15; // crisp flat sole contact

    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

interface TierGeometrySet {
  torsoSkin: THREE.BufferGeometry;
  torsoCloth: THREE.BufferGeometry;
  pelvis: THREE.BufferGeometry;
  thighSkin: THREE.BufferGeometry;
  thighClothLeft: THREE.BufferGeometry;
  thighClothRight: THREE.BufferGeometry;
  shinSkin: THREE.BufferGeometry;
  shinClothLeft: THREE.BufferGeometry;
  upperArmSkin: THREE.BufferGeometry;
  upperArmCloth: THREE.BufferGeometry;
  forearmSkin: THREE.BufferGeometry;
  shoulderCap: THREE.BufferGeometry;
  jointSphere: THREE.BufferGeometry;
  palm: THREE.BufferGeometry;
  fingerProx: THREE.BufferGeometry;
  fingerDist: THREE.BufferGeometry;
  claw: THREE.BufferGeometry;
  bootLeft: THREE.BufferGeometry;
  bootRight: THREE.BufferGeometry;
  neck: THREE.BufferGeometry;
  skull: THREE.BufferGeometry;
  jaw: THREE.BufferGeometry;
  eye: THREE.BufferGeometry;
  tooth: THREE.BufferGeometry;
  fang: THREE.BufferGeometry;
  ribCurves: THREE.BufferGeometry[];
  woundPatch: THREE.BufferGeometry;
  vertebra: THREE.BufferGeometry;
  veinTendrils: THREE.BufferGeometry[];
  armorChest: THREE.BufferGeometry;
  armorShoulder: THREE.BufferGeometry;
  spike: THREE.BufferGeometry;
  dispose: () => void;
}

function createTierGeometries(tier: ZombieTier): TierGeometrySet {
  const style = TIER_STYLES[tier];
  const w = style.widthScale;
  const aLen = style.armLengthScale;

  // Sculpted anatomical torso (from waist y=0 to collar y=0.52)
  const torsoSkin = createOrganicLatheGeometry(
    [
      [0.115 * w, 0.0],
      [0.105 * w, 0.10],
      [0.128 * w, 0.24],
      [0.168 * w, 0.39],
      [0.155 * w, 0.48],
      [0.068 * w, 0.53],
    ],
    28,
    24,
    (x, y, z, t) => {
      // Elliptical human torso depth vs breadth
      let nx = x * 1.18;
      let nz = z * 0.72;
      // Pectoral projection in front upper chest
      const pecs = gaussian3(nx, y - 0.38, nz - 0.10, 0.13 * w, 0.08, 0.06);
      nz += pecs * 0.032;
      // Sternum cleft between pecs
      const sternum = gaussian3(nx, y - 0.37, nz - 0.12, 0.024, 0.07, 0.05);
      nz -= sternum * 0.018;
      // Hunched kyphotic upper spine in back
      const hunch = gaussian3(nx, y - 0.39, nz + 0.09, 0.09 * w, 0.10, 0.07);
      nz -= hunch * (tier === 'colosse' ? 0.052 : 0.032);
      // Hollow abdomen / gaunt rib edge
      if (t > 0.08 && t < 0.48 && nz > 0) {
        const gaunt = gaussian3(nx, y - 0.16, nz - 0.08, 0.10 * w, 0.09, 0.06);
        nz -= gaunt * (tier === 'rapide' ? 0.032 : 0.018);
      }
      // Left pectoral tear cavity for exposed ribs
      const chestCavity = gaussian3(nx + 0.075 * w, y - 0.30, nz - 0.105 * w, 0.075 * w, 0.085, 0.055);
      nz -= chestCavity * 0.022;
      return [nx, y, nz];
    }
  );

  // Tattered open-front jacket/shirt overlay exposing mutilated chest & ribcage
  const torsoCloth = createTornClothGeometry(
    0.172 * w,
    0.136 * w,
    0.45,
    30,
    10,
    2.3,
    false,
    0.50,
    Math.PI * 2 - 1.00
  );
  torsoCloth.scale(1.16, 1.0, 0.75);
  torsoCloth.computeVertexNormals();

  // Pelvis / hips
  const pelvis = new THREE.SphereGeometry(0.138 * w, 24, 16);
  pelvis.scale(1.18, 0.74, 0.80);

  // Thigh (length 0.41 downward from 0 to -0.41)
  const thighSkin = createOrganicLatheGeometry(
    [
      [0.052 * w, -0.41],
      [0.060 * w, -0.30],
      [0.076 * w, -0.14],
      [0.084 * w, 0.0],
    ],
    20,
    14,
    (x, y, z) => [x * 0.94, y, z * 1.04]
  );

  const thighClothLeft = createTornClothGeometry(0.092 * w, 0.066 * w, 0.36, 20, 6, 1.4);
  const thighClothRight = createTornClothGeometry(0.092 * w, 0.072 * w, 0.27, 20, 6, 4.1);

  // Shin / Calf (length 0.395 downward from 0 to -0.395)
  const shinSkin = createOrganicLatheGeometry(
    [
      [0.037 * w, -0.395],
      [0.044 * w, -0.28],
      [0.058 * w, -0.15],
      [0.052 * w, 0.0],
    ],
    20,
    14,
    (x, y, z) => {
      // Calf gastrocnemius bulge posteriorly (-Z)
      const calf = gaussian3(x, y + 0.14, z + 0.04, 0.05, 0.09, 0.05);
      return [x * 0.92, y, z - calf * 0.022];
    }
  );
  const shinClothLeft = createTornClothGeometry(0.062 * w, 0.052 * w, 0.31, 20, 5, 3.3);

  // Upper Arm (length 0.28 downward from 0 to -0.28)
  const armW = tier === 'colosse' ? 1.30 : tier === 'rapide' ? 0.84 : 1.0;
  const upperArmSkin = createOrganicLatheGeometry(
    [
      [0.036 * armW, -0.28 * aLen],
      [0.044 * armW, -0.18 * aLen],
      [0.050 * armW, -0.08 * aLen],
      [0.048 * armW, 0.0],
    ],
    18,
    12,
    (x, y, z) => {
      const bicep = gaussian3(x, y + 0.13 * aLen, z - 0.03, 0.045, 0.08, 0.045);
      return [x, y, z * 1.04 + bicep * 0.012];
    }
  );
  const upperArmCloth = createTornClothGeometry(0.058 * armW, 0.048 * armW, 0.20 * aLen, 18, 4, 2.9);

  // Forearm (length 0.26 downward from 0 to -0.26)
  const forearmSkin = createOrganicLatheGeometry(
    [
      [0.025 * armW, -0.26 * aLen],
      [0.032 * armW, -0.15 * aLen],
      [0.040 * armW, -0.05 * aLen],
      [0.038 * armW, 0.0],
    ],
    18,
    12
  );

  const shoulderCap = new THREE.SphereGeometry(0.068 * armW, 18, 14);
  shoulderCap.scale(1.0, 0.95, 1.05);
  const jointSphere = new THREE.SphereGeometry(0.044 * armW, 14, 12);

  // Clawed Hand parts
  const palm = new THREE.SphereGeometry(0.034 * armW, 16, 12);
  palm.scale(0.55, 1.15, 0.95);
  const fingerProx = new THREE.CapsuleGeometry(0.0085 * armW, 0.028 * aLen, 6, 10);
  const fingerDist = new THREE.CapsuleGeometry(0.0072 * armW, 0.022 * aLen, 6, 10);
  const claw = new THREE.ConeGeometry(0.0062 * armW, 0.028 * aLen, 8);

  // Sculpted boots
  const bootLeft = createSculptedBootGeometry('left');
  const bootRight = createSculptedBootGeometry('right');

  // Neck
  const neck = createOrganicLatheGeometry(
    [
      [0.062 * w, 0.0],
      [0.050 * w, 0.06],
      [0.053 * w, 0.13],
    ],
    18,
    8
  );

  const skull = createSculptedSkullGeometry(tier);
  const jaw = createSculptedJawGeometry(tier);
  const eye = new THREE.SphereGeometry(0.015, 14, 12);
  const tooth = new THREE.ConeGeometry(0.0046, 0.017, 7);
  const fang = new THREE.ConeGeometry(0.0058, 0.026, 8);

  // 4 Exposed Curved Rib Bones on Left Chest Wound
  const ribCurves: THREE.BufferGeometry[] = [];
  for (let r = 0; r < 4; r++) {
    const ry = 0.245 + r * 0.036;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.022 * w, ry, 0.156 * w * 0.72),
      new THREE.Vector3(-0.088 * w, ry - 0.006, 0.162 * w * 0.72),
      new THREE.Vector3(-0.154 * w, ry + 0.004, 0.105 * w * 0.72),
      new THREE.Vector3(-0.174 * w, ry + 0.012, 0.015),
    ]);
    ribCurves.push(new THREE.TubeGeometry(curve, 14, 0.0088 * w, 8, false));
  }

  // Torn chest/abdomen wet flesh patch
  const woundPatch = new THREE.SphereGeometry(0.088 * w, 18, 14);
  woundPatch.scale(1.1, 1.35, 0.35);

  // Dorsal spine vertebrae bumps
  const vertebra = new THREE.SphereGeometry(0.016 * w, 12, 10);
  vertebra.scale(0.85, 1.15, 1.25);

  // Mutated glowing bio-vein tendrils for Rapide & Colosse
  const veinTendrils: THREE.BufferGeometry[] = [];
  if (style.hasDorsalGlow) {
    const t1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02 * w, 0.14, -0.095 * w),
      new THREE.Vector3(0.04 * w, 0.28, -0.115 * w),
      new THREE.Vector3(0.09 * w, 0.42, -0.09 * w),
      new THREE.Vector3(0.16 * w, 0.46, 0.01),
    ]);
    const t2 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.02 * w, 0.12, -0.092 * w),
      new THREE.Vector3(-0.06 * w, 0.29, -0.112 * w),
      new THREE.Vector3(-0.12 * w, 0.43, -0.06 * w),
    ]);
    const t3 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.04 * w, 0.22, 0.105 * w),
      new THREE.Vector3(0.11 * w, 0.34, 0.11 * w),
      new THREE.Vector3(0.15 * w, 0.45, 0.04 * w),
    ]);
    veinTendrils.push(
      new THREE.TubeGeometry(t1, 14, 0.009 * w, 7, false),
      new THREE.TubeGeometry(t2, 14, 0.0085 * w, 7, false),
      new THREE.TubeGeometry(t3, 14, 0.0095 * w, 7, false)
    );
  }

  // Colosse shattered right-half riot vest armor plate & shoulder bone spikes
  const armorChest = new THREE.CylinderGeometry(0.176 * w, 0.144 * w, 0.26, 22, 1, false, -0.15, 1.45);
  armorChest.scale(1.16, 1.0, 0.78);
  const armorShoulder = new THREE.SphereGeometry(0.088 * armW, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const spike = new THREE.ConeGeometry(0.024, 0.13, 10);

  const allGeos: THREE.BufferGeometry[] = [
    torsoSkin,
    torsoCloth,
    pelvis,
    thighSkin,
    thighClothLeft,
    thighClothRight,
    shinSkin,
    shinClothLeft,
    upperArmSkin,
    upperArmCloth,
    forearmSkin,
    shoulderCap,
    jointSphere,
    palm,
    fingerProx,
    fingerDist,
    claw,
    bootLeft,
    bootRight,
    neck,
    skull,
    jaw,
    eye,
    tooth,
    fang,
    woundPatch,
    vertebra,
    armorChest,
    armorShoulder,
    spike,
    ...ribCurves,
    ...veinTendrils,
  ];

  return {
    torsoSkin,
    torsoCloth,
    pelvis,
    thighSkin,
    thighClothLeft,
    thighClothRight,
    shinSkin,
    shinClothLeft,
    upperArmSkin,
    upperArmCloth,
    forearmSkin,
    shoulderCap,
    jointSphere,
    palm,
    fingerProx,
    fingerDist,
    claw,
    bootLeft,
    bootRight,
    neck,
    skull,
    jaw,
    eye,
    tooth,
    fang,
    ribCurves,
    woundPatch,
    vertebra,
    veinTendrils,
    armorChest,
    armorShoulder,
    spike,
    dispose: () => {
      for (const g of allGeos) g.dispose();
    },
  };
}

interface TierAssetEntry {
  textures: TierTextureSet;
  geos: TierGeometrySet;
}

export interface ZombieAssetBank {
  /** Retrieves cached textures and geometries for a zombie tier. */
  getTierAssets: (tier: ZombieTier) => TierAssetEntry;
  dispose: () => void;
}

/**
 * Creates a reusable asset bank caching high-res procedural PBR textures and smooth sculpted
 * geometries per zombie tier so spawning waves of zombies is instant with minimal GPU memory.
 */
export function createZombieAssetBank(maxAnisotropy = 8): ZombieAssetBank {
  const cache = new Map<ZombieTier, TierAssetEntry>();
  const getTierAssets = (tier: ZombieTier): TierAssetEntry => {
    let entry = cache.get(tier);
    if (!entry) {
      entry = {
        textures: createTierTextures(tier, maxAnisotropy),
        geos: createTierGeometries(tier),
      };
      cache.set(tier, entry);
    }
    return entry;
  };
  return {
    getTierAssets,
    dispose: () => {
      for (const entry of cache.values()) {
        entry.textures.dispose();
        entry.geos.dispose();
      }
      cache.clear();
    },
  };
}

interface FlashMaterialRecord {
  mat: THREE.MeshStandardMaterial;
  baseEmissive: THREE.Color;
  baseIntensity: number;
}

function tagPart(mesh: THREE.Mesh, part: ZombieHitPart): THREE.Mesh {
  mesh.userData = { part };
  return mesh;
}

function buildArticulatedArm(
  side: 'left' | 'right',
  tier: ZombieTier,
  geos: TierGeometrySet,
  skinMat: THREE.MeshStandardMaterial,
  clothMat: THREE.MeshStandardMaterial,
  fleshMat: THREE.MeshStandardMaterial,
  clawMat: THREE.MeshStandardMaterial,
  armorMat: THREE.MeshStandardMaterial
): {
  armGroup: THREE.Group;
  forearmGroup: THREE.Group;
  handGroup: THREE.Group;
} {
  const style = TIER_STYLES[tier];
  const sign = side === 'right' ? 1 : -1;
  const armW = tier === 'colosse' ? 1.30 : tier === 'rapide' ? 0.84 : 1.0;
  const aLen = style.armLengthScale;

  const armGroup = new THREE.Group();
  armGroup.name = `zombie_${side}_arm`;

  const shoulder = tagPart(new THREE.Mesh(geos.shoulderCap, skinMat), 'body');
  armGroup.add(shoulder);

  if (style.hasArmor) {
    const pauldron = tagPart(new THREE.Mesh(geos.armorShoulder, armorMat), 'body');
    pauldron.position.set(sign * 0.012, 0.016, 0);
    pauldron.rotation.z = -sign * 0.35;
    armGroup.add(pauldron);
  }

  if (style.hasShoulderSpikes && side === 'right') {
    for (let s = 0; s < 2; s++) {
      const sp = tagPart(new THREE.Mesh(geos.spike, clawMat), 'body');
      sp.position.set(0.04 + s * 0.012, 0.065 - s * 0.02, -0.02 + s * 0.04);
      sp.rotation.set(-0.2 + s * 0.4, 0, -0.65);
      armGroup.add(sp);
    }
  }

  const upperArm = tagPart(new THREE.Mesh(geos.upperArmSkin, skinMat), 'body');
  armGroup.add(upperArm);

  // Torn sleeve covering upper arm (shredded differently per side for realistic asymmetry)
  const sleeve = tagPart(new THREE.Mesh(geos.upperArmCloth, clothMat), 'body');
  sleeve.position.y = side === 'left' ? -0.095 * aLen : -0.115 * aLen;
  sleeve.rotation.y = side === 'left' ? 0.4 : 2.1;
  armGroup.add(sleeve);

  const elbow = tagPart(new THREE.Mesh(geos.jointSphere, skinMat), 'body');
  elbow.position.y = -0.28 * aLen;
  armGroup.add(elbow);

  const forearmGroup = new THREE.Group();
  forearmGroup.position.set(0, -0.28 * aLen, 0);
  armGroup.add(forearmGroup);

  const forearm = tagPart(new THREE.Mesh(geos.forearmSkin, skinMat), 'body');
  forearmGroup.add(forearm);

  // Exposed forearm tendon/laceration on left arm
  if (side === 'left') {
    const slash = tagPart(new THREE.Mesh(geos.woundPatch, fleshMat), 'body');
    slash.scale.set(0.24, 0.68, 0.25);
    slash.position.set(-0.022 * armW, -0.13 * aLen, 0.015 * armW);
    forearmGroup.add(slash);
  }

  const handGroup = new THREE.Group();
  handGroup.position.set(0, -0.26 * aLen, 0);
  forearmGroup.add(handGroup);

  const palmMesh = tagPart(new THREE.Mesh(geos.palm, skinMat), 'body');
  palmMesh.position.set(0, -0.036 * aLen, 0.008);
  handGroup.add(palmMesh);

  // 4 curled clawed fingers (curling inward toward body centerline: -sign)
  const fingerZOffsets = [-0.022, -0.007, 0.008, 0.023];
  const fingerScales = [0.88, 1.04, 0.98, 0.80];
  fingerZOffsets.forEach((fz, idx) => {
    const fScale = fingerScales[idx];
    const fRoot = new THREE.Group();
    fRoot.position.set(0, -0.068 * aLen, fz * armW + 0.006);
    fRoot.rotation.z = -sign * 0.45;

    const prox = tagPart(new THREE.Mesh(geos.fingerProx, skinMat), 'body');
    prox.scale.set(1, fScale, 1);
    prox.position.y = -0.016 * aLen * fScale;
    fRoot.add(prox);

    const dist = tagPart(new THREE.Mesh(geos.fingerDist, skinMat), 'body');
    dist.scale.set(1, fScale, 1);
    dist.position.set(-sign * 0.008, -0.042 * aLen * fScale, 0);
    dist.rotation.z = -sign * 0.55;
    fRoot.add(dist);

    const clawMesh = tagPart(new THREE.Mesh(geos.claw, clawMat), 'body');
    clawMesh.scale.setScalar(fScale);
    clawMesh.position.set(-sign * 0.020, -0.062 * aLen * fScale, 0);
    clawMesh.rotation.z = -sign * 1.05 + Math.PI;
    fRoot.add(clawMesh);

    handGroup.add(fRoot);
  });

  // Opposable medial thumb (angles inward toward body centerline and forward toward +Z)
  const thumb = tagPart(new THREE.Mesh(geos.fingerProx, skinMat), 'body');
  thumb.position.set(-sign * 0.018 * armW, -0.038 * aLen, 0.032 * armW);
  thumb.rotation.set(-0.45, 0, -sign * 0.35);
  handGroup.add(thumb);

  const thumbClaw = tagPart(new THREE.Mesh(geos.claw, clawMat), 'body');
  thumbClaw.position.set(-sign * 0.028 * armW, -0.062 * aLen, 0.044 * armW);
  thumbClaw.rotation.set(-0.65 + Math.PI, 0, -sign * 0.45);
  handGroup.add(thumbClaw);

  return { armGroup, forearmGroup, handGroup };
}

function buildArticulatedLeg(
  side: 'left' | 'right',
  tier: ZombieTier,
  geos: TierGeometrySet,
  skinMat: THREE.MeshStandardMaterial,
  clothMat: THREE.MeshStandardMaterial,
  fleshMat: THREE.MeshStandardMaterial,
  bootMat: THREE.MeshStandardMaterial
): {
  legGroup: THREE.Group;
  shinGroup: THREE.Group;
} {
  const w = TIER_STYLES[tier].widthScale;
  const legGroup = new THREE.Group();
  legGroup.name = `zombie_${side}_leg`;

  const thigh = tagPart(new THREE.Mesh(geos.thighSkin, skinMat), 'body');
  legGroup.add(thigh);

  const thighCloth = tagPart(
    new THREE.Mesh(side === 'left' ? geos.thighClothLeft : geos.thighClothRight, clothMat),
    'body'
  );
  thighCloth.position.y = side === 'left' ? -0.18 : -0.135;
  legGroup.add(thighCloth);

  const knee = tagPart(new THREE.Mesh(geos.jointSphere, skinMat), 'body');
  knee.scale.setScalar(1.18 * w);
  knee.position.y = -0.41;
  legGroup.add(knee);

  const shinGroup = new THREE.Group();
  shinGroup.position.set(0, -0.41, 0);
  legGroup.add(shinGroup);

  const shin = tagPart(new THREE.Mesh(geos.shinSkin, skinMat), 'body');
  shinGroup.add(shin);

  // Left leg retains torn lower trouser cuff; right leg reveals decayed calf & wound
  if (side === 'left') {
    const shinCloth = tagPart(new THREE.Mesh(geos.shinClothLeft, clothMat), 'body');
    shinCloth.position.y = -0.16;
    shinGroup.add(shinCloth);
  } else {
    const calfWound = tagPart(new THREE.Mesh(geos.woundPatch, fleshMat), 'body');
    calfWound.scale.set(0.32, 0.72, 0.35);
    calfWound.position.set(0.02 * w, -0.16, 0.028 * w);
    shinGroup.add(calfWound);
  }

  const boot = tagPart(
    new THREE.Mesh(side === 'left' ? geos.bootLeft : geos.bootRight, bootMat),
    'body'
  );
  boot.position.set(0, -0.47, 0);
  shinGroup.add(boot);

  return { legGroup, shinGroup };
}

function buildHeadAssembly(
  tier: ZombieTier,
  geos: TierGeometrySet,
  skinMat: THREE.MeshStandardMaterial,
  fleshMat: THREE.MeshStandardMaterial,
  boneMat: THREE.MeshStandardMaterial,
  eyeMat: THREE.MeshStandardMaterial
): {
  headGroup: THREE.Group;
  jawGroup: THREE.Group;
} {
  const style = TIER_STYLES[tier];
  const headGroup = new THREE.Group();
  headGroup.name = 'zombie_head';

  const cranium = tagPart(new THREE.Mesh(geos.skull, skinMat), 'head');
  cranium.position.set(0, 0.088, 0.01);
  headGroup.add(cranium);

  // Recessed glowing eyes sitting inside the deep anatomical sockets
  for (const sx of [-0.038, 0.038]) {
    const eyeMesh = tagPart(new THREE.Mesh(geos.eye, eyeMat), 'head');
    eyeMesh.position.set(sx, 0.103, 0.086);
    headGroup.add(eyeMesh);
  }

  // Dark inner mouth cavity behind teeth so open jaw never looks hollow/transparent
  const mouthCavity = tagPart(new THREE.Mesh(geos.jointSphere, fleshMat), 'head');
  mouthCavity.scale.set(1.05, 0.78, 0.95);
  mouthCavity.position.set(0, 0.010, 0.058);
  headGroup.add(mouthCavity);

  // Upper teeth arch (slightly uneven zombie dentition)
  const upperTeethCount = 8;
  for (let i = 0; i < upperTeethCount; i++) {
    const frac = (i / (upperTeethCount - 1)) * 2 - 1; // [-1..1]
    const ang = frac * 0.92;
    const isFang = (i === 1 || i === upperTeethCount - 2) && tier !== 'standard';
    const tMesh = tagPart(new THREE.Mesh(isFang ? geos.fang : geos.tooth, boneMat), 'head');
    tMesh.position.set(
      Math.sin(ang) * 0.038,
      0.014 - (i % 2) * 0.002,
      0.065 + Math.cos(ang) * 0.056
    );
    tMesh.rotation.set(Math.PI + 0.14, 0, (i % 2 === 0 ? 1 : -1) * 0.08);
    headGroup.add(tMesh);
  }

  // Hinged Lower Jaw
  const jawGroup = new THREE.Group();
  jawGroup.name = 'zombie_jaw';
  jawGroup.position.set(0, 0.018, -0.004);
  jawGroup.rotation.x = tier === 'rapide' ? 0.28 : 0.20;
  headGroup.add(jawGroup);

  const jawMesh = tagPart(new THREE.Mesh(geos.jaw, skinMat), 'head');
  jawMesh.position.set(0, -0.020, 0);
  jawGroup.add(jawMesh);

  // Exposed broken mandible patch on left cheek of Standard & Colosse
  if (tier !== 'rapide') {
    const cheekTear = tagPart(new THREE.Mesh(geos.woundPatch, fleshMat), 'head');
    cheekTear.scale.set(0.32, 0.28, 0.45);
    cheekTear.position.set(-0.042, -0.010, 0.056);
    cheekTear.rotation.y = -0.65;
    jawGroup.add(cheekTear);
  }

  // Lower teeth arch
  const lowerTeethCount = 7;
  for (let i = 0; i < lowerTeethCount; i++) {
    const frac = (i / (lowerTeethCount - 1)) * 2 - 1;
    const ang = frac * 0.85;
    const isFang = (i === 1 || i === lowerTeethCount - 2) && tier === 'colosse';
    const tMesh = tagPart(new THREE.Mesh(isFang ? geos.fang : geos.tooth, boneMat), 'head');
    tMesh.position.set(
      Math.sin(ang) * 0.033,
      0.002,
      0.054 + Math.cos(ang) * 0.048
    );
    tMesh.rotation.set(-0.12, 0, (i % 2 === 0 ? -1 : 1) * 0.06);
    jawGroup.add(tMesh);
  }

  // Sculpted ears
  for (const sx of [-1, 1]) {
    const ear = tagPart(new THREE.Mesh(geos.vertebra, skinMat), 'head');
    ear.scale.set(0.55, 1.45, 0.9);
    ear.position.set(sx * (style.widthScale > 1.1 ? 0.112 : 0.102), 0.075, -0.008);
    ear.rotation.z = sx * 0.18;
    headGroup.add(ear);
  }

  return { headGroup, jawGroup };
}

/**
 * Builds an articulated, high-detail, smooth non-pixelated 3D Zombie Model for the given tier.
 * Every head mesh carries `userData.part = 'head'` and all other meshes carry `userData.part = 'body'`
 * for accurate FPS raycast headshot multipliers.
 */
export function createZombie3DModel(
  tier: ZombieTier,
  assetBank?: ZombieAssetBank
): Zombie3DModel {
  const meta = ZOMBIE_TIERS[tier];
  const style = TIER_STYLES[tier];
  const ownedAssets = assetBank ? null : { textures: createTierTextures(tier, 8), geos: createTierGeometries(tier) };
  const { textures, geos } = assetBank ? assetBank.getTierAssets(tier) : ownedAssets!;

  // Per-instance lightweight PBR materials (referencing cached smooth 512px textures)
  // so individual zombies can flash independently when hit without mutating siblings.
  const skinMat = new THREE.MeshStandardMaterial({
    color: textures.skinMap ? '#e5e7eb' : style.skinBase,
    ...(textures.skinMap ? { map: textures.skinMap } : {}),
    ...(textures.skinBumpMap ? { bumpMap: textures.skinBumpMap, bumpScale: 0.018 } : {}),
    ...(textures.skinRoughnessMap ? { roughnessMap: textures.skinRoughnessMap } : {}),
    roughness: 0.78,
    metalness: 0.04,
    emissive: style.veinGlow,
    emissiveIntensity: style.veinGlowIntensity * 0.25,
  });

  const clothMat = new THREE.MeshStandardMaterial({
    color: textures.clothMap ? '#dcdcdc' : style.clothPrimary,
    ...(textures.clothMap ? { map: textures.clothMap } : {}),
    ...(textures.clothBumpMap ? { bumpMap: textures.clothBumpMap, bumpScale: 0.014 } : {}),
    roughness: 0.90,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  const bootMat = new THREE.MeshStandardMaterial({
    color: '#18181b',
    roughness: 0.84,
    metalness: 0.10,
  });

  const fleshMat = new THREE.MeshStandardMaterial({
    color: textures.fleshMap ? '#f5d0d0' : style.fleshColor,
    ...(textures.fleshMap ? { map: textures.fleshMap } : {}),
    roughness: 0.28,
    metalness: 0.06,
    emissive: '#450a0a',
    emissiveIntensity: 0.15,
  });

  const boneMat = new THREE.MeshStandardMaterial({
    color: textures.boneMap ? '#f5f5f4' : style.boneColor,
    ...(textures.boneMap ? { map: textures.boneMap } : {}),
    roughness: 0.45,
    metalness: 0.05,
  });

  const clawMat = new THREE.MeshStandardMaterial({
    color: '#29221d',
    roughness: 0.42,
    metalness: 0.14,
  });

  const armorMat = new THREE.MeshStandardMaterial({
    color: style.armorColor,
    roughness: 0.50,
    metalness: 0.45,
  });

  const eyeMat = new THREE.MeshStandardMaterial({
    color: style.eyeCore,
    emissive: style.eyeGlow,
    emissiveIntensity: 1.55,
    roughness: 0.15,
    metalness: 0.0,
  });

  const veinGlowMat = new THREE.MeshStandardMaterial({
    color: style.eyeGlow,
    emissive: style.veinGlow,
    emissiveIntensity: style.veinGlowIntensity * 1.4,
    roughness: 0.35,
    metalness: 0.05,
  });

  const flashableMaterials: FlashMaterialRecord[] = [
    skinMat,
    clothMat,
    bootMat,
    fleshMat,
    boneMat,
    clawMat,
    armorMat,
    eyeMat,
    veinGlowMat,
  ].map((mat) => ({
    mat,
    baseEmissive: mat.emissive.clone(),
    baseIntensity: mat.emissiveIntensity,
  }));

  const root = new THREE.Group();
  root.name = `zombie_root_${tier}`;
  root.scale.setScalar(meta.scale);

  const w = style.widthScale;
  const pelvisGroup = new THREE.Group();
  pelvisGroup.position.set(0, 0.88, 0);
  root.add(pelvisGroup);

  const pelvisMesh = tagPart(new THREE.Mesh(geos.pelvis, clothMat), 'body');
  pelvisGroup.add(pelvisMesh);

  // Legs
  const leftLeg = buildArticulatedLeg('left', tier, geos, skinMat, clothMat, fleshMat, bootMat);
  leftLeg.legGroup.position.set(-0.105 * w, 0, 0);
  pelvisGroup.add(leftLeg.legGroup);

  const rightLeg = buildArticulatedLeg('right', tier, geos, skinMat, clothMat, fleshMat, bootMat);
  rightLeg.legGroup.position.set(0.105 * w, 0, 0);
  pelvisGroup.add(rightLeg.legGroup);

  // Hunched Spine & Torso
  const spineGroup = new THREE.Group();
  spineGroup.position.set(0, 0.06, 0);
  spineGroup.rotation.x = style.hunchAngle;
  pelvisGroup.add(spineGroup);

  const torsoMesh = tagPart(new THREE.Mesh(geos.torsoSkin, skinMat), 'body');
  spineGroup.add(torsoMesh);

  const shirtMesh = tagPart(new THREE.Mesh(geos.torsoCloth, clothMat), 'body');
  shirtMesh.position.set(0, 0.25, 0);
  spineGroup.add(shirtMesh);

  // Exposed chest cavity wound & curved rib bones
  const chestWound = tagPart(new THREE.Mesh(geos.woundPatch, fleshMat), 'body');
  chestWound.position.set(-0.082 * w, 0.30, 0.098 * w);
  chestWound.rotation.y = -0.38;
  spineGroup.add(chestWound);

  for (const ribGeo of geos.ribCurves) {
    const ribMesh = tagPart(new THREE.Mesh(ribGeo, boneMat), 'body');
    spineGroup.add(ribMesh);
  }

  // Dorsal spine vertebrae bumps protruding through torn back
  for (let v = 0; v < 5; v++) {
    const vertMesh = tagPart(new THREE.Mesh(geos.vertebra, boneMat), 'body');
    vertMesh.position.set(0, 0.16 + v * 0.068, -0.105 * w);
    spineGroup.add(vertMesh);
  }

  // Mutated glowing bio-fissures (Rapide & Colosse)
  for (const vGeo of geos.veinTendrils) {
    const vMesh = tagPart(new THREE.Mesh(vGeo, veinGlowMat), 'body');
    spineGroup.add(vMesh);
  }

  // Colosse tactical kevlar chest armor plate
  if (style.hasArmor) {
    const armorPlate = tagPart(new THREE.Mesh(geos.armorChest, armorMat), 'body');
    armorPlate.position.set(0, 0.31, 0.015);
    spineGroup.add(armorPlate);
  }

  // Arms
  const leftArm = buildArticulatedArm('left', tier, geos, skinMat, clothMat, fleshMat, clawMat, armorMat);
  leftArm.armGroup.position.set(-0.22 * w, 0.44, 0.01);
  spineGroup.add(leftArm.armGroup);

  const rightArm = buildArticulatedArm('right', tier, geos, skinMat, clothMat, fleshMat, clawMat, armorMat);
  rightArm.armGroup.position.set(0.22 * w, 0.44, 0.01);
  spineGroup.add(rightArm.armGroup);

  // Neck + Head
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0, 0.50, 0.02);
  neckGroup.rotation.x = -style.hunchAngle * 0.45; // counter-tilt so eyes track player
  spineGroup.add(neckGroup);

  const neckMesh = tagPart(new THREE.Mesh(geos.neck, skinMat), 'body');
  neckGroup.add(neckMesh);

  const { headGroup, jawGroup } = buildHeadAssembly(tier, geos, skinMat, fleshMat, boneMat, eyeMat);
  headGroup.position.set(0, 0.11, 0.01);
  headGroup.rotation.z = style.headTiltZ;
  neckGroup.add(headGroup);

  let attackAccum = 0;
  let lastFlashActive = false;
  const whiteFlash = new THREE.Color('#ffffff');

  const animate: Zombie3DModel['animate'] = (walkPhase, dt, options) => {
    const isAttacking = options?.isAttacking ?? false;
    const flinch = clamp(options?.flinch ?? 0, 0, 1);

    if (isAttacking) {
      attackAccum += dt * (tier === 'rapide' ? 11.5 : 8.5);
    } else {
      attackAccum = THREE.MathUtils.lerp(attackAccum, 0, Math.min(1, dt * 8));
    }

    const stride = isAttacking ? 0.18 : 1.0;
    const sSin = Math.sin(walkPhase);
    const sCos = Math.cos(walkPhase);

    // Asymmetric limping shamble for Marcheur vs aggressive sprint for Rôdeur vs heavy stomp for Colosse
    const legSwingAmp = (tier === 'rapide' ? 0.68 : tier === 'colosse' ? 0.46 : 0.52) * stride;
    const limpBias = tier === 'standard' ? 0.22 : 0.0;

    // Negative X rotation swings thigh forward (+Z); positive knee X bends calf backward (-Z)
    const lHipX = -sSin * legSwingAmp - limpBias * 0.35;
    const rHipX = sSin * legSwingAmp * (1.0 - limpBias);
    leftLeg.legGroup.rotation.x = lHipX;
    rightLeg.legGroup.rotation.x = rHipX;
    leftLeg.shinGroup.rotation.x = Math.max(0.08, -sCos * 0.48 * stride + 0.22);
    rightLeg.shinGroup.rotation.x = Math.max(0.08, sCos * 0.48 * stride + 0.22);

    // Subtle grounded stride bounce & hip sway (feet stay near y=0)
    pelvisGroup.position.y = 0.875 + Math.abs(sCos) * 0.032 * stride;
    pelvisGroup.rotation.z = sSin * (tier === 'standard' ? 0.09 : 0.05) * stride;
    pelvisGroup.rotation.y = sCos * 0.08 * stride;

    // Spine hunch, swagger, and bullet flinch snap-back
    spineGroup.rotation.x = style.hunchAngle + sCos * 0.05 - flinch * 0.26;
    spineGroup.rotation.z = -sSin * 0.07;

    // Outstretched arms (-X rotation aims arms forward toward +Z) + lunge clawing when close
    const swipeL = isAttacking ? Math.sin(attackAccum) * 0.65 : sSin * 0.14;
    const swipeR = isAttacking ? Math.sin(attackAccum + 1.4) * 0.65 : -sSin * 0.14;

    leftArm.armGroup.rotation.set(-1.18 + swipeL - flinch * 0.2, 0.12, -0.14);
    rightArm.armGroup.rotation.set(-1.24 + swipeR - flinch * 0.2, -0.12, 0.14);
    leftArm.forearmGroup.rotation.x = isAttacking ? -0.45 - Math.abs(Math.cos(attackAccum)) * 0.4 : -0.34;
    rightArm.forearmGroup.rotation.x = isAttacking ? -0.45 - Math.abs(Math.sin(attackAccum)) * 0.4 : -0.38;

    // Creepy head bob & open snarling jaw
    headGroup.rotation.z = style.headTiltZ + Math.sin(walkPhase * 0.5) * 0.08;
    headGroup.rotation.x = -0.06 + flinch * 0.22;
    jawGroup.rotation.x =
      (tier === 'rapide' ? 0.28 : 0.20) +
      Math.abs(Math.sin(walkPhase * 0.8)) * 0.12 +
      (isAttacking ? Math.abs(Math.sin(attackAccum)) * 0.28 : 0);
  };

  const setHitFlash: Zombie3DModel['setHitFlash'] = (amount) => {
    const clamped = clamp(amount, 0, 1);
    if (clamped <= 0.001) {
      if (!lastFlashActive) return;
      for (const rec of flashableMaterials) {
        rec.mat.emissive.copy(rec.baseEmissive);
        rec.mat.emissiveIntensity = rec.baseIntensity;
      }
      lastFlashActive = false;
      return;
    }
    lastFlashActive = true;
    for (const rec of flashableMaterials) {
      rec.mat.emissive.copy(rec.baseEmissive).lerp(whiteFlash, clamped);
      rec.mat.emissiveIntensity = rec.baseIntensity + clamped * 0.85;
    }
  };

  // Set default posed frame immediately so initial spawn looks organic on frame 0
  animate(0, 0);

  return {
    root,
    tier,
    headGroup,
    animate,
    setHitFlash,
    dispose: () => {
      root.removeFromParent();
      for (const rec of flashableMaterials) rec.mat.dispose();
      if (ownedAssets) {
        ownedAssets.geos.dispose();
        ownedAssets.textures.dispose();
      }
    },
  };
}
