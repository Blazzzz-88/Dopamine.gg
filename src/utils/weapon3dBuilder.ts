import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RarityId, WeaponClass } from '../types/casino';

export type WeaponArchetype =
  | 'karambit'
  | 'couteau'
  | 'awp'
  | 'ar15_sil'
  | 'ar15'
  | 'ak47'
  | 'pistolet'
  | 'mac10';

export interface WeaponGripMeta {
  gripLocalPos: [number, number, number];
  handleAxis: [number, number, number];
  bladeDir: [number, number, number];
  /** Optional local ring hole center (karambits) for finger-ring twirl pivots */
  ringLocalPos?: [number, number, number];
  /** Local cross-section handle height around gripLocalPos for uniform hand-fit scaling */
  handleThicknessLocal?: number;
}

export interface WeaponMagMeta {
  /** Top magwell seam pivot (or grip baseplate exit for pistols) in local weapon coordinates */
  anchorLocalPos: [number, number, number];
  /** Normalized extraction direction pointing outward/downward along the magwell axis */
  pullDirLocal: [number, number, number];
  /** Approximate magazine travel height in local weapon units */
  magLengthLocal: number;
  /** True for handguns where the magazine sits enclosed inside the grip */
  isInternal?: boolean;
}

export interface SculptedMeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  bounds: { width: number; height: number; depth: number };
  componentCount: number;
  gripMeta?: WeaponGripMeta;
  muzzleLocalPos?: [number, number, number];
  magMeta?: WeaponMagMeta;
  magMeshData?: SculptedMeshData;
}

export interface Weapon3DModel {
  group: THREE.Group;
  radius: number;
  gripMeta?: WeaponGripMeta;
  muzzleLocalPos?: [number, number, number];
  magMeta?: WeaponMagMeta;
  magazineGroup?: THREE.Group;
  dispose: () => void;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function resolveWeaponArchetype(
  weaponClass: WeaponClass,
  weaponName: string
): WeaponArchetype {
  const n = weaponName.toLowerCase();
  if (n.includes('karambit')) return 'karambit';
  if (
    weaponClass === 'lame' ||
    n.includes('baïonnette') ||
    n.includes('couteau') ||
    n.includes('katana') ||
    n.includes('dague')
  ) {
    return 'couteau';
  }
  if (weaponClass === 'sniper' || n.includes('awp') || n.includes('operator')) return 'awp';
  if (
    weaponClass === 'pistolet' ||
    n.includes('pistolet') ||
    n.includes('deagle') ||
    n.includes('sheriff')
  ) {
    return 'pistolet';
  }
  if (weaponClass === 'pm' || n.includes('mac')) return 'mac10';
  if (n.includes('silencieux') || n.includes('phantom')) return 'ar15_sil';
  if (n.includes('ak') || n.includes('vandal')) return 'ak47';
  return 'ar15';
}

export function getWeaponMuzzleSide(archetype: WeaponArchetype): 'left' | 'right' {
  if (archetype === 'pistolet' || archetype === 'couteau') return 'right';
  return 'left';
}

/**
 * Exact O(W * H) Felzenszwalb-Huttenlocher 2D Euclidean Distance Transform
 * returning distance in grid cells from every foreground cell (bin === 1)
 * to the nearest exterior cell (bin === 0).
 */
function computeEuclideanDistance(bin: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e9;
  const dt = new Float32Array(w * h);
  const f = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);

  const edt1d = (len: number, read: (i: number) => number, write: (i: number, val: number) => void) => {
    for (let q = 0; q < len; q++) f[q] = read(q);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = 0;
      while (true) {
        const r = v[k];
        s = (f[q] + q * q - (f[r] + r * r)) / (2 * q - 2 * r);
        if (s > z[k]) break;
        k--;
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1] < q) k++;
      const r = v[k];
      write(q, (q - r) * (q - r) + f[r]);
    }
  };

  for (let x = 0; x < w; x++) {
    edt1d(
      h,
      (y) => (bin[y * w + x] ? INF : 0),
      (y, val) => {
        dt[y * w + x] = val;
      }
    );
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    edt1d(
      w,
      (x) => dt[row + x],
      (x, val) => {
        dt[row + x] = Math.sqrt(val);
      }
    );
  }
  return dt;
}

interface ComponentMeta {
  id: number;
  pixelCount: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  cx: number;
  cy: number;
  cosA: number;
  sinA: number;
  localLen: number;
  localHeight: number;
  guardU: number;
  spineSign: number; // +1 or -1 in local V indicating spine / ring side vs cutting edge
  narrowTipSide: 'left' | 'right';
  leftHalfArea: number;
  rightHalfArea: number;
}

function analyzeComponents(
  bin: Uint8Array,
  w: number,
  h: number,
  bladeVariant: 'bayonet' | 'katana' | 'dague' = 'bayonet'
): {
  compId: Int32Array;
  components: ComponentMeta[];
} {
  const n = w * h;
  const compId = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const rawComps: number[][] = [];

  for (let i = 0; i < n; i++) {
    if (!bin[i] || compId[i] !== -1) continue;
    const pixels: number[] = [];
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    compId[i] = rawComps.length;
    while (head < tail) {
      const p = queue[head++];
      pixels.push(p);
      const x = p % w;
      const y = (p - x) / w;
      if (x > 0 && bin[p - 1] && compId[p - 1] === -1) {
        compId[p - 1] = rawComps.length;
        queue[tail++] = p - 1;
      }
      if (x < w - 1 && bin[p + 1] && compId[p + 1] === -1) {
        compId[p + 1] = rawComps.length;
        queue[tail++] = p + 1;
      }
      if (y > 0 && bin[p - w] && compId[p - w] === -1) {
        compId[p - w] = rawComps.length;
        queue[tail++] = p - w;
      }
      if (y < h - 1 && bin[p + w] && compId[p + w] === -1) {
        compId[p + w] = rawComps.length;
        queue[tail++] = p + w;
      }
    }
    rawComps.push(pixels);
  }

  // Filter out tiny isolated alpha dust speckles (< 14 cells)
  const kept: ComponentMeta[] = [];
  const remap = new Int32Array(rawComps.length).fill(-1);

  for (let idx = 0; idx < rawComps.length; idx++) {
    const pixels = rawComps[idx];
    if (pixels.length < 14) {
      for (const p of pixels) bin[p] = 0;
      continue;
    }
    const newIdx = kept.length;
    remap[idx] = newIdx;

    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    let sx = 0;
    let sy = 0;
    for (const p of pixels) {
      const x = p % w;
      const y = (p - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sx += x;
      sy += y;
    }
    const cx = sx / pixels.length;
    const cy = sy / pixels.length;

    // Principal axis PCA for angled cutouts (like stacked bayonets)
    let mxx = 0;
    let myy = 0;
    let mxy = 0;
    for (const p of pixels) {
      const x = p % w - cx;
      const y = (p - (p % w)) / w - cy;
      mxx += x * x;
      myy += y * y;
      mxy += x * y;
    }
    let angle = 0.5 * Math.atan2(2 * mxy, mxx - myy);
    // Keep axis aligned horizontally unless distinctly tilted
    if (Math.abs(angle) < 0.08) angle = 0;
    let cosA = Math.cos(angle);
    let sinA = Math.sin(angle);
    if (cosA < 0) {
      cosA = -cosA;
      sinA = -sinA;
    }

    let minU = 1e9;
    let maxU = -1e9;
    let minV = 1e9;
    let maxV = -1e9;
    for (const p of pixels) {
      const dx = (p % w) - cx;
      const dy = (p - (p % w)) / w - cy;
      const lu = dx * cosA + dy * sinA;
      const lv = -dx * sinA + dy * cosA;
      if (lu < minU) minU = lu;
      if (lu > maxU) maxU = lu;
      if (lv < minV) minV = lv;
      if (lv > maxV) maxV = lv;
    }

    // Locate crossguard slice along local U (used for bayonets/daggers at any flip/angle)
    const buckets = 36;
    const uSpan = Math.max(1, maxU - minU);
    const bMinV = new Float32Array(buckets).fill(1e9);
    const bMaxV = new Float32Array(buckets).fill(-1e9);
    let leftHalfArea = 0;
    let rightHalfArea = 0;
    for (const p of pixels) {
      const dx = (p % w) - cx;
      const dy = (p - (p % w)) / w - cy;
      const lu = dx * cosA + dy * sinA;
      const lv = -dx * sinA + dy * cosA;
      const luNorm = (lu - minU) / uSpan;
      if (luNorm < 0.45) leftHalfArea++;
      else if (luNorm > 0.55) rightHalfArea++;
      const b = clamp(Math.floor(luNorm * (buckets - 1)), 0, buckets - 1);
      if (lv < bMinV[b]) bMinV[b] = lv;
      if (lv > bMaxV[b]) bMaxV[b] = lv;
    }
    const guardLoB = bladeVariant === 'katana' ? Math.floor(buckets * 0.62) : 2;
    const guardHiB = bladeVariant === 'katana' ? Math.floor(buckets * 0.80) : buckets - 3;
    let bestGuardB = bladeVariant === 'katana' ? Math.floor(buckets * 0.70) : Math.floor(buckets * 0.36);
    let bestGuardSpan = -1;
    for (let b = guardLoB; b <= guardHiB; b++) {
      const span = bMaxV[b] - bMinV[b];
      if (span > bestGuardSpan) {
        bestGuardSpan = span;
        bestGuardB = b;
      }
    }
    const guardU = bestGuardB / (buckets - 1);
    const guardTopReach = Math.abs(bMinV[bestGuardB]);
    const guardBotReach = Math.abs(bMaxV[bestGuardB]);
    // On an M9 bayonet, the muzzle ring side of the crossguard protrudes further than the bottom quillon;
    // on Katana, the scabbard hangs on the bottom (+lv) side so keep top (-lv) as upward spine/edge.
    const spineSign = bladeVariant === 'katana' ? -1 : guardTopReach >= guardBotReach ? -1 : 1;

    let leftEndSum = 0;
    let leftEndCnt = 0;
    let rightEndSum = 0;
    let rightEndCnt = 0;
    for (let b = 1; b <= 5; b++) {
      if (bMaxV[b] >= bMinV[b]) {
        leftEndSum += bMaxV[b] - bMinV[b];
        leftEndCnt++;
      }
    }
    for (let b = buckets - 6; b <= buckets - 2; b++) {
      if (bMaxV[b] >= bMinV[b]) {
        rightEndSum += bMaxV[b] - bMinV[b];
        rightEndCnt++;
      }
    }
    const leftEndSpan = leftEndCnt > 0 ? leftEndSum / leftEndCnt : 0;
    const rightEndSpan = rightEndCnt > 0 ? rightEndSum / rightEndCnt : 0;
    const narrowTipSide: 'left' | 'right' = leftEndSpan < rightEndSpan ? 'left' : 'right';

    kept.push({
      id: newIdx,
      pixelCount: pixels.length,
      minX,
      maxX,
      minY,
      maxY,
      cx,
      cy,
      cosA,
      sinA,
      localLen: maxU - minU,
      localHeight: maxV - minV,
      guardU,
      spineSign,
      narrowTipSide,
      leftHalfArea,
      rightHalfArea,
    });
  }

  for (let i = 0; i < n; i++) {
    compId[i] = compId[i] >= 0 ? remap[compId[i]] : -1;
  }

  return { compId, components: kept };
}

/**
 * Evaluates smooth anatomical half-thickness `halfZ` and contour wall `rimZ` in
 * normalized world units (longest axis = 4.0) so each weapon has authentic barrels,
 * cylindrical scopes/silencers, stepped-in magazines, recessed triggers, flat beveled
 * slides/receivers, and razor-tapered knife blades with zero balloon inflation.
 */
function buildDepthField(
  alpha: Float32Array,
  bin: Uint8Array,
  compId: Int32Array,
  components: ComponentMeta[],
  w: number,
  h: number,
  scale: number,
  archetype: WeaponArchetype,
  bladeVariant: 'bayonet' | 'katana' | 'dague' = 'bayonet'
): {
  targetHalfZ: Float32Array;
  rimFrac: Float32Array;
  dt: Float32Array;
  isExactCyl: Uint8Array;
  cylNormY: Float32Array;
} {
  const n = w * h;
  const dt = computeEuclideanDistance(bin, w, h);
  const targetHalfZ = new Float32Array(n);
  const rimFrac = new Float32Array(n);
  const isExactCyl = new Uint8Array(n);
  const cylNormY = new Float32Array(n);

  // Measure BOTH continuous vertical span (vRunLen) and horizontal span (hRunLen)
  // so long horizontal cylindrical barrels/scopes stay round while narrow vertical iron sights & turrets stay flat/slim.
  const vRunLen = new Float32Array(n);
  const vRunMid = new Float32Array(n);
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!bin[y * w + x]) {
        y++;
        continue;
      }
      const start = y;
      while (y < h && bin[y * w + x]) y++;
      const end = y - 1;
      const span = end - start + 1;
      const mid = 0.5 * (start + end);
      for (let yy = start; yy <= end; yy++) {
        vRunLen[yy * w + x] = span;
        vRunMid[yy * w + x] = mid;
      }
    }
  }

  const hRunLen = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let x = 0;
    while (x < w) {
      if (!bin[row + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < w && bin[row + x]) x++;
      const end = x - 1;
      const span = end - start + 1;
      for (let xx = start; xx <= end; xx++) {
        hRunLen[row + xx] = span;
      }
    }
  }

  // Approximate blade column bounds on normalized component coordinate space
  const totalWorldW = (w - 4) * scale;
  const totalWorldH = (h - 4) * scale;

  // For AWP sniper rifles, reconstruct the unbroken concentric scope optical cylinder axis (midY, radY)
  // across mounts/turrets so the scope remains genuinely circular (1:1 Z/Y) without mount pinches.
  const awpScopeTop = new Float32Array(w).fill(-1);
  const awpScopeBot = new Float32Array(w).fill(-1);
  if (archetype === 'awp' && components.length > 0) {
    const mainComp = components[0];
    const bw = Math.max(1, mainComp.maxX - mainComp.minX);
    const bh = Math.max(1, mainComp.maxY - mainComp.minY);
    const xStart = clamp(Math.floor(mainComp.minX + bw * 0.40), 1, w - 2);
    const xEnd = clamp(Math.ceil(mainComp.minX + bw * 0.78), 1, w - 2);
    const yUpperLim = clamp(Math.floor(mainComp.minY + bh * 0.44), 1, h - 2);

    const rawTop = new Float32Array(w).fill(-1);
    const rawBot = new Float32Array(w).fill(-1);
    for (let x = xStart; x <= xEnd; x++) {
      let y = mainComp.minY;
      while (y <= yUpperLim && !bin[y * w + x]) y++;
      if (y > yUpperLim) continue;
      const t = y;
      while (y <= yUpperLim && bin[y * w + x]) y++;
      const b = y - 1;
      // Clean scope slice if followed by air gap before receiver
      let hasGapBelow = false;
      for (let g = b + 1; g <= Math.min(h - 2, b + Math.max(3, Math.round(bh * 0.14))); g++) {
        if (!bin[g * w + x] && g < mainComp.maxY - bh * 0.35) {
          hasGapBelow = true;
          break;
        }
      }
      if (hasGapBelow && b - t >= 4) {
        rawTop[x] = t;
        rawBot[x] = b;
      }
    }

    // Reject brief upper turret spikes via neighborhood local baseline on rawTop,
    // and interpolate cleanly across narrow ring mount gaps.
    const cleanCols: number[] = [];
    for (let x = xStart; x <= xEnd; x++) {
      if (rawTop[x] >= 0) cleanCols.push(x);
    }
    if (cleanCols.length >= 4) {
      // Median-filter topY against turret spikes while preserving bell flare
      const filteredTop = new Float32Array(rawTop);
      const filteredBot = new Float32Array(rawBot);
      const win = Math.max(4, Math.round(bw * 0.045));
      for (const x of cleanCols) {
        const tops: number[] = [];
        const bots: number[] = [];
        for (let nx = Math.max(xStart, x - win); nx <= Math.min(xEnd, x + win); nx++) {
          if (rawTop[nx] >= 0) {
            tops.push(rawTop[nx]);
            bots.push(rawBot[nx]);
          }
        }
        tops.sort((a, b) => a - b);
        bots.sort((a, b) => a - b);
        // Pick lower (larger Y) half median so turret protrusions don't pull scope ceiling upward
        const medTop = tops[Math.min(tops.length - 1, Math.floor(tops.length * 0.65))];
        const medBot = bots[Math.floor(bots.length * 0.5)];
        if (medTop - rawTop[x] > Math.max(3, (medBot - medTop) * 0.36)) {
          filteredTop[x] = medTop;
        }
        filteredBot[x] = rawBot[x];
      }

      // Linearly interpolate scopeTop/Bot across ring mounts between nearest clean columns
      for (let x = xStart; x <= xEnd; x++) {
        // Only fill columns that actually contain pixels inside the scope band
        if (filteredTop[x] >= 0) {
          awpScopeTop[x] = filteredTop[x];
          awpScopeBot[x] = filteredBot[x];
        } else {
          let lx = x - 1;
          while (lx >= xStart && filteredTop[lx] < 0) lx--;
          let rx = x + 1;
          while (rx <= xEnd && filteredTop[rx] < 0) rx++;
          if (lx >= xStart && rx <= xEnd && rx - lx <= Math.max(8, Math.round(bw * 0.08))) {
            const frac = (x - lx) / (rx - lx);
            const interpT = lerp(filteredTop[lx], filteredTop[rx], frac);
            const interpB = lerp(filteredBot[lx], filteredBot[rx], frac);
            const midSampleY = clamp(Math.round(0.5 * (interpT + interpB)), 0, h - 1);
            if (bin[midSampleY * w + x]) {
              awpScopeTop[x] = interpT;
              awpScopeBot[x] = interpB;
            }
          }
        }
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const cid = compId[i] >= 0 ? compId[i] : 0;
      const comp = components[cid];
      if (!comp) continue;

      const d = dt[i];
      const u = clamp((x - comp.minX) / Math.max(1, comp.maxX - comp.minX), 0, 1);
      const v = clamp((y - comp.minY) / Math.max(1, comp.maxY - comp.minY), 0, 1);

      const runPx = Math.max(1, vRunLen[i]);
      const runWorldH = runPx * scale;
      const runWorldW = Math.max(1, hRunLen[i]) * scale;
      const runCenterOffNorm = runPx > 1 ? Math.abs(y - vRunMid[i]) / (0.5 * runPx) : 0;
      const cylFactor = Math.sqrt(Math.max(0, 1 - runCenterOffNorm * runCenterOffNorm));

      if (archetype === 'karambit') {
        const isBlade = u < 0.43;
        if (isBlade) {
          // Outer convex spine keeps sturdy machined steel gauge + chamfer; inner belly tapers cleanly to razor edge
          const runMinY = vRunMid[i] - 0.5 * runPx;
          const runMaxY = vRunMid[i] + 0.5 * runPx;
          const edgeT = clamp((y - runMinY) / Math.max(1, runMaxY - runMinY), 0, 1);
          const pointTipFade = u < 0.09 ? clamp(u / 0.09, 0.28, 1) : 1;
          const edgeSharp = edgeT < 0.34 ? lerp(0.82, 1.0, edgeT / 0.34) : lerp(1.0, 0.03, (edgeT - 0.34) / 0.66);
          targetHalfZ[i] = 0.046 * edgeSharp * pointTipFade;
          rimFrac[i] = edgeT < 0.26 ? 0.24 : 0.0;
        } else {
          // Ergonomic finger-grooved handle + pinky ring (thick & contoured)
          const isRing = u > 0.78;
          const round = Math.pow(clamp(d / 6.0, 0, 1), 0.48);
          targetHalfZ[i] = (isRing ? 0.112 : 0.148) * (0.46 + 0.54 * round);
          rimFrac[i] = 0.24;
        }
      } else if (archetype === 'couteau') {
        // PCA-aligned local U & V coordinates so even tilted/dual bayonets sculpt cleanly
        const dx = x - comp.cx;
        const dy = y - comp.cy;
        const halfLen = Math.max(1, 0.5 * comp.localLen);
        const lu = clamp((dx * comp.cosA + dy * comp.sinA + halfLen) / (2 * halfLen), 0, 1);
        const lv = -dx * comp.sinA + dy * comp.cosA;

        // Blade lies on the longer side away from crossguard (guardU)
        const handleIsLeft = comp.guardU <= 0.5;
        const inBlade = handleIsLeft ? lu > comp.guardU + 0.03 : lu < comp.guardU - 0.03;
        const inGuard = Math.abs(lu - comp.guardU) <= 0.035;

        if (inGuard) {
          targetHalfZ[i] = bladeVariant === 'katana' ? 0.092 : 0.105;
          rimFrac[i] = 0.45;
        } else if (inBlade) {
          const tipTaper = clamp(d / 2.6, 0.08, 1);
          if (bladeVariant === 'katana') {
            targetHalfZ[i] = 0.050 * clamp(d / 3.2, 0.18, 1);
            rimFrac[i] = 0.16;
          } else if (bladeVariant === 'dague') {
            // Double-edged symmetric dagger bevel: raised spine down middle, keen edge on both sides
            const symEdge = clamp(1 - Math.abs(lv) / Math.max(4, comp.localHeight * 0.18), 0.06, 1);
            targetHalfZ[i] = 0.048 * symEdge * tipTaper;
            rimFrac[i] = 0.10;
          } else {
            // Spine is toward spineSign, cutting edge is opposite (-spineSign)
            const approxHalfH = Math.max(4, comp.localHeight * 0.22);
            const edgeSigned = (lv * comp.spineSign) / approxHalfH; // +1 at spine, -1 at cutting edge
            const tCut = clamp(0.5 * (1 - edgeSigned), 0, 1); // 0 = spine, 1 = edge
            const bladeBevel = tCut < 0.38 ? lerp(0.76, 1.0, tCut / 0.38) : lerp(1.0, 0.03, (tCut - 0.38) / 0.62);
            targetHalfZ[i] = 0.048 * bladeBevel * tipTaper;
            rimFrac[i] = tCut < 0.25 ? 0.18 : 0.0;
          }
        } else {
          // Contoured cylindrical handle + steel pommel
          const round = Math.pow(clamp(d / 5.5, 0, 1), 0.48);
          targetHalfZ[i] = (bladeVariant === 'katana' ? 0.120 : 0.145) * (0.48 + 0.52 * round);
          rimFrac[i] = 0.26;
        }
      } else if (archetype === 'pistolet') {
        const isSlide = v < 0.35;
        const isTriggerZone = u > 0.34 && u < 0.62 && v > 0.35 && v < 0.60 && runWorldH < 0.34;
        if (isSlide) {
          const slideTopChamfer = v < 0.11 ? lerp(0.72, 1.0, v / 0.11) : 1.0;
          targetHalfZ[i] = 0.128 * slideTopChamfer;
          rimFrac[i] = 0.58;
        } else if (isTriggerZone) {
          targetHalfZ[i] = 0.044;
          rimFrac[i] = 0.36;
        } else {
          const roundGrip = Math.pow(clamp(d / 6.5, 0, 1), 0.48);
          targetHalfZ[i] = 0.140 * (0.62 + 0.38 * roundGrip);
          rimFrac[i] = 0.48;
        }
      } else if (archetype === 'mac10') {
        const isBarrel = u < 0.21 && v < 0.32 && runWorldH < 0.52;
        const isStrapOrStock = (u < 0.22 && v > 0.32) || u > 0.75 || v < 0.14;
        const isMag = v > 0.56 && u > 0.42 && u < 0.64;
        if (isBarrel) {
          const r = clamp(runWorldH * 0.52, 0.068, 0.115);
          const ny = runPx > 1 ? clamp((vRunMid[i] - y) / (0.5 * runPx), -1, 1) : 0;
          targetHalfZ[i] = r * Math.max(0.18, Math.sqrt(Math.max(0, 1 - ny * ny)));
          rimFrac[i] = 0.0;
          isExactCyl[i] = 1;
          cylNormY[i] = ny;
        } else if (isStrapOrStock) {
          targetHalfZ[i] = 0.046;
          rimFrac[i] = 0.42;
        } else if (isMag) {
          targetHalfZ[i] = 0.140;
          rimFrac[i] = 0.68;
        } else {
          targetHalfZ[i] = 0.275;
          rimFrac[i] = 0.84;
        }
      } else if (archetype === 'awp') {
        const sTop = awpScopeTop[x];
        const sBot = awpScopeBot[x];
        const hasScopeEnv = sTop >= 0 && sBot > sTop + 2;
        const inScopeTube = hasScopeEnv && y >= sTop - 0.5 && y <= sBot + 0.5;
        const isScopeTurret = hasScopeEnv && y < sTop - 0.5 && v < 0.22;
        const isScopeMount = hasScopeEnv && y > sBot + 0.5 && v < 0.44 && runWorldW < 0.28;
        const isBarrel = !hasScopeEnv && u < 0.46 && v < 0.46 && runWorldH < 0.22 && runWorldW >= 0.32;
        const isBipod = u < 0.36 && v > 0.54;
        const isMagOrTrigger = u > 0.53 && u < 0.68 && v > 0.61;

        if (inScopeTube) {
          // Exact 1:1 circular cylinder cross-section: depth diameter == vertical tube height
          const scopeMidY = 0.5 * (sTop + sBot);
          const scopeRadPx = Math.max(2, 0.5 * (sBot - sTop));
          const ny = clamp((scopeMidY - y) / scopeRadPx, -1, 1);
          const circleCyl = Math.sqrt(Math.max(0, 1 - ny * ny));
          const radWorld = clamp(scopeRadPx * scale, 0.044, 0.125);
          targetHalfZ[i] = radWorld * Math.max(0.10, circleCyl);
          rimFrac[i] = 0.0;
          isExactCyl[i] = 1;
          cylNormY[i] = ny;
        } else if (isScopeTurret) {
          const turretR = clamp(runWorldW * 0.42, 0.028, 0.046);
          targetHalfZ[i] = turretR;
          rimFrac[i] = 0.48;
        } else if (isScopeMount) {
          targetHalfZ[i] = 0.042;
          rimFrac[i] = 0.40;
        } else if (isBarrel) {
          const r = clamp(runWorldH * 0.48, 0.024, 0.062);
          const ny = runPx > 1 ? clamp((vRunMid[i] - y) / (0.5 * runPx), -1, 1) : 0;
          targetHalfZ[i] = r * Math.max(0.14, Math.sqrt(Math.max(0, 1 - ny * ny)));
          rimFrac[i] = 0.0;
          isExactCyl[i] = 1;
          cylNormY[i] = ny;
        } else if (isBipod) {
          targetHalfZ[i] = 0.026;
          rimFrac[i] = 0.20;
        } else if (isMagOrTrigger) {
          targetHalfZ[i] = 0.045;
          rimFrac[i] = 0.38;
        } else {
          const stockBevel = Math.pow(clamp(d / 4.2, 0, 1), 0.5);
          targetHalfZ[i] = lerp(0.058, 0.078, stockBevel);
          rimFrac[i] = 0.36;
        }
      } else {
        // Rifles: ar15, ar15_sil, ak47
        const isNarrowIronSight = v < 0.32 && runWorldW < 0.34;
        const isThinHorizontalBar = runWorldH < 0.22 * (totalWorldH / 1.25 + 0.2) && runWorldW >= 0.34;
        const isSilencerOrBarrel =
          !isNarrowIronSight &&
          ((u < 0.27 && v < 0.52 && isThinHorizontalBar) ||
            ((archetype === 'ar15' || archetype === 'ar15_sil') && u > 0.67 && u < 0.80 && v < 0.38 && runWorldH < 0.24 && runWorldW >= 0.28));
        const isTriggerGuard = u > 0.50 && u < 0.68 && v > 0.48 && v < 0.72 && runWorldH < 0.18;
        const isMag = v > 0.54 && u > 0.34 && u < 0.58;
        const isGrip = v > 0.54 && u >= 0.58 && u < 0.74;
        const isStock = u > 0.72;
        const isCarryHandle = archetype === 'ar15_sil' && u > 0.32 && u < 0.56 && v < 0.24;

        if (isNarrowIronSight) {
          targetHalfZ[i] = 0.026;
          rimFrac[i] = 0.32;
        } else if (isSilencerOrBarrel) {
          const r = clamp(runWorldH * 0.48, 0.024, 0.072);
          const ny = runPx > 1 ? clamp((vRunMid[i] - y) / (0.5 * runPx), -1, 1) : 0;
          targetHalfZ[i] = r * Math.max(0.16, Math.sqrt(Math.max(0, 1 - ny * ny)));
          rimFrac[i] = 0.0;
          isExactCyl[i] = 1;
          cylNormY[i] = ny;
        } else if (isTriggerGuard) {
          targetHalfZ[i] = 0.026;
          rimFrac[i] = 0.30;
        } else if (isMag) {
          targetHalfZ[i] = 0.052;
          rimFrac[i] = 0.46;
        } else if (isGrip) {
          targetHalfZ[i] = 0.064;
          rimFrac[i] = 0.36;
        } else if (isCarryHandle) {
          targetHalfZ[i] = 0.048;
          rimFrac[i] = 0.42;
        } else if (isStock) {
          targetHalfZ[i] = 0.065;
          rimFrac[i] = 0.38;
        } else {
          const isHandguard = u < 0.38 && v >= 0.24 && v < 0.54;
          targetHalfZ[i] = isHandguard ? lerp(0.066, 0.082, cylFactor) : 0.082;
          rimFrac[i] = isHandguard ? 0.28 : 0.42;
        }
      }
    }
  }

  // Smooth non-cylindrical regions across 4-connected neighbors; smooth exact cylinders ONLY along X
  // so vertical circular tube curvature sqrt(1 - dy^2) is preserved intact without flat pinching.
  const smoothZ = new Float32Array(targetHalfZ);
  const smoothRim = new Float32Array(rimFrac);
  const tmpZ = new Float32Array(n);
  const tmpRim = new Float32Array(n);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!bin[i]) continue;
        let sumZ = smoothZ[i] * 2;
        let sumR = smoothRim[i] * 2;
        let weight = 2;
        const neighbors = isExactCyl[i] ? [i - 1, i + 1] : [i - 1, i + 1, i - w, i + w];
        for (const ni of neighbors) {
          if (bin[ni] && (!isExactCyl[i] || isExactCyl[ni])) {
            sumZ += smoothZ[ni];
            sumR += smoothRim[ni];
            weight += 1;
          }
        }
        tmpZ[i] = sumZ / weight;
        tmpRim[i] = sumR / weight;
      }
    }
    smoothZ.set(tmpZ);
    smoothRim.set(tmpRim);
  }

  // Final height combines beveled edge rise on flat parts while keeping true circular cylinder arcs pure
  // Deagle / MAC-10 keep a tighter 1.8-cell machined chamfer so top slides & box receivers stay broad
  const bevelWidth = archetype === 'pistolet' || archetype === 'mac10' ? 1.8 : 3.2;
  for (let i = 0; i < n; i++) {
    if (!bin[i]) continue;
    const zMax = smoothZ[i];
    if (isExactCyl[i]) {
      targetHalfZ[i] = zMax;
      rimFrac[i] = 0.0;
    } else {
      const rF = smoothRim[i];
      const edgeZ = zMax * rF;
      const ramp = Math.pow(clamp(dt[i] / bevelWidth, 0, 1), 0.52);
      targetHalfZ[i] = edgeZ + (zMax - edgeZ) * ramp;
      rimFrac[i] = rF;
    }
  }

  // Extrapolate smooth z/rim cleanly 1 cell into exterior margin so edge crossing interpolation
  // reads meaningful nearby silhouette depth even where alpha crosses 0.5!
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (bin[i]) continue;
      let bestZ = 0;
      let bestR = 0;
      let cnt = 0;
      for (const ni of [i - 1, i + 1, i - w, i + w]) {
        if (bin[ni]) {
          bestZ += targetHalfZ[ni] * rimFrac[ni];
          bestR += rimFrac[ni];
          cnt++;
        }
      }
      if (cnt > 0) {
        targetHalfZ[i] = bestZ / cnt;
        rimFrac[i] = bestR / cnt;
      }
    }
  }

  void totalWorldW;
  void alpha;
  return { targetHalfZ, rimFrac, dt, isExactCyl, cylNormY };
}

/** Builds a smoothed alpha field around foreground cells while keeping padded margins clear. */
function buildSmoothAlphaField(
  alphaSrc: Float32Array,
  bin: Uint8Array,
  w: number,
  h: number
): Float32Array {
  const smoothA = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const center = alphaSrc[i];
      const avg =
        (alphaSrc[i - w - 1] +
          2 * alphaSrc[i - w] +
          alphaSrc[i - w + 1] +
          2 * alphaSrc[i - 1] +
          4 * center +
          2 * alphaSrc[i + 1] +
          alphaSrc[i + w - 1] +
          2 * alphaSrc[i + w] +
          alphaSrc[i + w + 1]) /
        16;
      smoothA[i] = bin[i] ? Math.max(0.54, avg) : avg * 0.85;
    }
  }
  return smoothA;
}

/** Detects the external protruding magazine region & extraction vector on rifles/AWP/MAC-10. */
function detectMagazineCutRegion(
  bin: Uint8Array,
  w: number,
  _h: number,
  minAx: number,
  maxAx: number,
  minAy: number,
  maxAy: number,
  archetype: WeaponArchetype
): {
  leftX: number;
  rightX: number;
  yCut: number;
  peakY: number;
  anchorX: number;
  anchorY: number;
  pullDirX: number;
  pullDirY: number;
  pixelCount: number;
} | null {
  const bw = Math.max(1, maxAx - minAx);
  const bh = Math.max(1, maxAy - minAy);
  if (bw < 16 || bh < 10) return null;

  const colBot = new Int32Array(w).fill(minAy);
  for (let x = minAx; x <= maxAx; x++) {
    for (let y = maxAy; y >= minAy; y--) {
      if (bin[y * w + x]) {
        colBot[x] = y;
        break;
      }
    }
  }

  let uLo = 0.36;
  let uHi = 0.64;
  if (archetype === 'awp') {
    uLo = 0.54;
    uHi = 0.66;
  } else if (archetype === 'mac10') {
    uLo = 0.44;
    uHi = 0.68;
  } else if (archetype === 'ar15_sil' || archetype === 'ar15') {
    uLo = 0.36;
    uHi = 0.62;
  } else if (archetype === 'ak47') {
    uLo = 0.36;
    uHi = 0.62;
  }

  const xStart = Math.max(minAx + 1, Math.round(minAx + uLo * bw));
  const xEnd = Math.min(maxAx - 1, Math.round(minAx + uHi * bw));
  let peakX = xStart;
  let peakY = minAy;
  for (let x = xStart; x <= xEnd; x++) {
    if (colBot[x] > peakY) {
      peakY = colBot[x];
      peakX = x;
    }
  }

  // Locate the higher receiver/trigger-guard shelf immediately behind the magazine
  let xNotch = peakX;
  let yNotch = peakY;
  let shelfFound = false;
  let flatCount = 0;
  const maxRightScan = Math.min(maxAx - 2, xEnd + Math.round(0.05 * bw));
  for (let x = peakX; x <= maxRightScan; x++) {
    const cy = colBot[x];
    if (cy < peakY - bh * 0.16) shelfFound = true;
    if (cy < yNotch - 1) {
      yNotch = cy;
      xNotch = x;
      flatCount = 0;
    } else if (shelfFound) {
      flatCount++;
      if (cy > yNotch + bh * 0.05 || flatCount > Math.max(3, Math.round(0.025 * bw))) {
        break;
      }
    }
  }

  let yCut: number;
  if (archetype === 'ar15' || archetype === 'ar15_sil') {
    yCut = Math.round(yNotch - bh * 0.045);
  } else if (archetype === 'ak47') {
    yCut = Math.round(Math.max(yNotch + bh * 0.015, minAy + 0.46 * bh));
  } else if (archetype === 'awp') {
    const xAhead = Math.max(minAx + 2, Math.round(minAx + 0.51 * bw));
    yCut = Math.round(Math.max(colBot[xAhead], minAy + 0.66 * bh) + bh * 0.015);
  } else {
    yCut = Math.round(yNotch + bh * 0.015);
  }

  if (peakY - yCut < bh * 0.11 || yCut <= minAy + 2) return null;

  let leftX = peakX;
  for (let x = peakX; x >= minAx + Math.round(0.30 * bw); x--) {
    if (colBot[x] <= yCut) {
      leftX = x + 1;
      break;
    }
    leftX = x;
  }
  let rightX = peakX;
  for (let x = peakX; x <= xNotch; x++) {
    if (colBot[x] <= yCut) {
      rightX = x - 1;
      break;
    }
    rightX = x;
  }
  if (rightX - leftX < 2) return null;

  // Compute exact top centroid vs bottom centroid for natural extraction direction (e.g., curved AK mag)
  let topSumX = 0;
  let topCnt = 0;
  let botSumX = 0;
  let botSumY = 0;
  let botCnt = 0;
  let pixelCount = 0;
  const topBandMax = Math.min(maxAy, yCut + Math.max(2, Math.round(0.18 * (peakY - yCut))));
  const botBandMin = Math.max(yCut, Math.round(yCut + 0.65 * (peakY - yCut)));

  for (let y = yCut; y <= maxAy; y++) {
    for (let x = leftX; x <= rightX; x++) {
      if (!bin[y * w + x]) continue;
      pixelCount++;
      if (y <= topBandMax) {
        topSumX += x;
        topCnt++;
      }
      if (y >= botBandMin) {
        botSumX += x;
        botSumY += y;
        botCnt++;
      }
    }
  }
  if (pixelCount < 24 || topCnt === 0) return null;

  const anchorX = topSumX / topCnt;
  const anchorY = yCut;
  const bx = botCnt > 0 ? botSumX / botCnt : anchorX;
  const by = botCnt > 0 ? botSumY / botCnt : peakY;
  // Note: world Y is negated relative to pixel Y
  const pdx = bx - anchorX;
  const pdy = -(by - anchorY);
  const plen = Math.hypot(pdx, pdy) || 1;

  return {
    leftX,
    rightX,
    yCut,
    peakY,
    anchorX,
    anchorY,
    pullDirX: pdx / plen,
    pullDirY: pdy / plen,
    pixelCount,
  };
}

/** Sculpt a watertight front+back+bevel manifold from a precomputed alpha+binary region. */
function sculptManifoldFromMasks(params: {
  smoothA: Float32Array;
  w: number;
  h: number;
  targetHalfZ: Float32Array;
  rimFrac: Float32Array;
  isExactCyl: Uint8Array;
  cylNormY: Float32Array;
  scale: number;
  cxGrid: number;
  cyGrid: number;
  originOffsetX?: number;
  originOffsetY?: number;
  zScale?: number;
  boundsWidth: number;
  boundsHeight: number;
  componentCount: number;
}): SculptedMeshData {
  const {
    smoothA,
    w,
    h,
    targetHalfZ,
    rimFrac,
    isExactCyl,
    cylNormY,
    scale,
    cxGrid,
    cyGrid,
    originOffsetX = 0,
    originOffsetY = 0,
    zScale = 1,
    boundsWidth,
    boundsHeight,
    componentCount,
  } = params;
  const n = w * h;

  const toWorldX = (gx: number) => (gx - cxGrid) * scale - originOffsetX;
  const toWorldY = (gy: number) => -(gy - cyGrid) * scale - originOffsetY;
  // Grid padded by 2 pixels around original normalized UV [0..1]
  const innerW = w - 4;
  const innerH = h - 4;
  const toU = (gx: number) => clamp((gx - 2) / Math.max(1, innerW), 0.002, 0.998);
  const toV = (gy: number) => 1 - clamp((gy - 2) / Math.max(1, innerH), 0.002, 0.998);

  const frontPos: number[] = [];
  const frontUV: number[] = [];
  const backPos: number[] = [];
  const backUV: number[] = [];
  const vertCylFlag: number[] = [];
  const vertCylNy: number[] = [];
  const frontIdx: number[] = [];
  const backIdx: number[] = [];

  const cornerVert = new Int32Array(n).fill(-1);
  const hEdgeVert = new Int32Array(n).fill(-1);
  const vEdgeVert = new Int32Array(n).fill(-1);

  const allocSideVertex = (gx: number, gy: number, zHalf: number, cylIdx: number): number => {
    const id = frontPos.length / 3;
    const wx = toWorldX(gx);
    const wy = toWorldY(gy);
    const u = toU(gx);
    const v = toV(gy);
    const zh = zHalf * zScale;
    frontPos.push(wx, wy, zh);
    frontUV.push(u, v);
    backPos.push(wx, wy, -zh);
    backUV.push(u, v);
    vertCylFlag.push(cylIdx >= 0 && isExactCyl[cylIdx] ? 1 : 0);
    vertCylNy.push(cylIdx >= 0 ? cylNormY[cylIdx] : 0);
    return id;
  };

  const getCorner = (x: number, y: number): number => {
    const i = y * w + x;
    if (cornerVert[i] !== -1) return cornerVert[i];
    const id = allocSideVertex(x, y, targetHalfZ[i], i);
    cornerVert[i] = id;
    return id;
  };

  const getHEdge = (x: number, y: number): number => {
    const i = y * w + x;
    if (hEdgeVert[i] !== -1) return hEdgeVert[i];
    const a0 = smoothA[i];
    const a1 = smoothA[i + 1];
    const t = clamp((0.5 - a0) / (a1 - a0 || 1e-5), 0.04, 0.96);
    const gx = x + t;
    const gy = y;
    const insideIdx = a0 >= 0.5 ? i : i + 1;
    const frac = isExactCyl[insideIdx] ? 0.88 : rimFrac[insideIdx];
    const rimZ = targetHalfZ[insideIdx] * frac;
    const id = allocSideVertex(gx, gy, rimZ, insideIdx);
    hEdgeVert[i] = id;
    return id;
  };

  const getVEdge = (x: number, y: number): number => {
    const i = y * w + x;
    if (vEdgeVert[i] !== -1) return vEdgeVert[i];
    const a0 = smoothA[i];
    const a1 = smoothA[i + w];
    const t = clamp((0.5 - a0) / (a1 - a0 || 1e-5), 0.04, 0.96);
    const gx = x;
    const gy = y + t;
    const insideIdx = a0 >= 0.5 ? i : i + w;
    const frac = isExactCyl[insideIdx] ? 0.14 : rimFrac[insideIdx];
    const rimZ = targetHalfZ[insideIdx] * frac;
    const id = allocSideVertex(gx, gy, rimZ, insideIdx);
    vEdgeVert[i] = id;
    return id;
  };

  const wallSegments: Array<[number, number]> = [];

  const emitPoly = (poly: number[]) => {
    if (poly.length < 3) return;
    const v0 = poly[0];
    for (let k = 1; k < poly.length - 1; k++) {
      const v1 = poly[k];
      const v2 = poly[k + 1];
      frontIdx.push(v0, v1, v2);
      backIdx.push(v0, v2, v1);
    }
  };

  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const iTL = y * w + x;
      const iBL = (y + 1) * w + x;
      const iBR = (y + 1) * w + (x + 1);
      const iTR = y * w + (x + 1);

      const inTL = smoothA[iTL] >= 0.5;
      const inBL = smoothA[iBL] >= 0.5;
      const inBR = smoothA[iBR] >= 0.5;
      const inTR = smoothA[iTR] >= 0.5;

      const count = (inTL ? 1 : 0) + (inBL ? 1 : 0) + (inBR ? 1 : 0) + (inTR ? 1 : 0);
      if (count === 0) continue;

      if (count === 4) {
        const tl = getCorner(x, y);
        const bl = getCorner(x, y + 1);
        const br = getCorner(x + 1, y + 1);
        const tr = getCorner(x + 1, y);
        frontIdx.push(tl, bl, br, tl, br, tr);
        backIdx.push(tl, br, bl, tl, tr, br);
        continue;
      }

      const isSaddle1 = inTL && inBR && !inBL && !inTR;
      const isSaddle2 = !inTL && !inBR && inBL && inTR;
      if (isSaddle1 || isSaddle2) {
        const cAvg = 0.25 * (smoothA[iTL] + smoothA[iBL] + smoothA[iBR] + smoothA[iTR]);
        const eL = getVEdge(x, y);
        const eB = getHEdge(x, y + 1);
        const eR = getVEdge(x + 1, y);
        const eT = getHEdge(x, y);

        if (isSaddle1) {
          const tl = getCorner(x, y);
          const br = getCorner(x + 1, y + 1);
          if (cAvg < 0.5) {
            emitPoly([tl, eL, eT]);
            emitPoly([br, eR, eB]);
            wallSegments.push([eL, eT], [eR, eB]);
          } else {
            emitPoly([tl, eL, eB, br, eR, eT]);
            wallSegments.push([eL, eB], [eR, eT]);
          }
        } else {
          const bl = getCorner(x, y + 1);
          const tr = getCorner(x + 1, y);
          if (cAvg < 0.5) {
            emitPoly([bl, eB, eL]);
            emitPoly([tr, eT, eR]);
            wallSegments.push([eB, eL], [eT, eR]);
          } else {
            emitPoly([eL, bl, eB, eR, tr, eT]);
            wallSegments.push([eB, eR], [eT, eL]);
          }
        }
        continue;
      }

      const poly: number[] = [];
      let exitVert = -1;
      let entryVert = -1;

      if (inTL) poly.push(getCorner(x, y));
      if (inTL !== inBL) {
        const e = getVEdge(x, y);
        poly.push(e);
        if (inTL) exitVert = e;
        else entryVert = e;
      }
      if (inBL) poly.push(getCorner(x, y + 1));
      if (inBL !== inBR) {
        const e = getHEdge(x, y + 1);
        poly.push(e);
        if (inBL) exitVert = e;
        else entryVert = e;
      }
      if (inBR) poly.push(getCorner(x + 1, y + 1));
      if (inBR !== inTR) {
        const e = getVEdge(x + 1, y);
        poly.push(e);
        if (inBR) exitVert = e;
        else entryVert = e;
      }
      if (inTR) poly.push(getCorner(x + 1, y));
      if (inTR !== inTL) {
        const e = getHEdge(x, y);
        poly.push(e);
        if (inTR) exitVert = e;
        else entryVert = e;
      }

      emitPoly(poly);
      if (exitVert !== -1 && entryVert !== -1) {
        wallSegments.push([exitVert, entryVert]);
      }
    }
  }

  const vertCount = frontPos.length / 3;
  const sumBX = new Float32Array(vertCount);
  const sumBY = new Float32Array(vertCount);
  const sumBCnt = new Uint8Array(vertCount);
  for (let pass = 0; pass < 4; pass++) {
    sumBX.fill(0);
    sumBY.fill(0);
    sumBCnt.fill(0);
    for (const [e0, e1] of wallSegments) {
      sumBX[e0] += frontPos[e1 * 3];
      sumBY[e0] += frontPos[e1 * 3 + 1];
      sumBCnt[e0]++;
      sumBX[e1] += frontPos[e0 * 3];
      sumBY[e1] += frontPos[e0 * 3 + 1];
      sumBCnt[e1]++;
    }
    for (let vi = 0; vi < vertCount; vi++) {
      const cnt = sumBCnt[vi];
      if (cnt === 0) continue;
      const ax = sumBX[vi] / cnt;
      const ay = sumBY[vi] / cnt;
      const nx = lerp(frontPos[vi * 3], ax, 0.38);
      const ny = lerp(frontPos[vi * 3 + 1], ay, 0.38);
      frontPos[vi * 3] = nx;
      frontPos[vi * 3 + 1] = ny;
      backPos[vi * 3] = nx;
      backPos[vi * 3 + 1] = ny;
    }
  }

  const frontNormals = new Float32Array(frontPos.length);
  const backNormals = new Float32Array(backPos.length);

  const accumulateNormals = (pos: number[], idx: number[], outNorm: Float32Array) => {
    for (let t = 0; t < idx.length; t += 3) {
      const i0 = idx[t] * 3;
      const i1 = idx[t + 1] * 3;
      const i2 = idx[t + 2] * 3;
      const ax = pos[i1] - pos[i0];
      const ay = pos[i1 + 1] - pos[i0 + 1];
      const az = pos[i1 + 2] - pos[i0 + 2];
      const bx = pos[i2] - pos[i0];
      const by = pos[i2 + 1] - pos[i0 + 1];
      const bz = pos[i2 + 2] - pos[i0 + 2];
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      const nz = ax * by - ay * bx;
      outNorm[i0] += nx;
      outNorm[i0 + 1] += ny;
      outNorm[i0 + 2] += nz;
      outNorm[i1] += nx;
      outNorm[i1 + 1] += ny;
      outNorm[i1 + 2] += nz;
      outNorm[i2] += nx;
      outNorm[i2 + 1] += ny;
      outNorm[i2 + 2] += nz;
    }
    for (let k = 0; k < outNorm.length; k += 3) {
      const len = Math.hypot(outNorm[k], outNorm[k + 1], outNorm[k + 2]) || 1;
      outNorm[k] /= len;
      outNorm[k + 1] /= len;
      outNorm[k + 2] /= len;
    }
  };

  accumulateNormals(frontPos, frontIdx, frontNormals);
  accumulateNormals(backPos, backIdx, backNormals);

  for (let vi = 0; vi < vertCount; vi++) {
    if (!vertCylFlag[vi]) continue;
    const nyCyl = clamp(vertCylNy[vi], -0.97, 0.97);
    const nzCyl = Math.sqrt(Math.max(0.03, 1 - nyCyl * nyCyl));
    const o = vi * 3;

    const fx = frontNormals[o] * 0.14;
    const fy = lerp(frontNormals[o + 1], nyCyl, 0.88);
    const fz = lerp(frontNormals[o + 2], nzCyl, 0.88);
    const fLen = Math.hypot(fx, fy, fz) || 1;
    frontNormals[o] = fx / fLen;
    frontNormals[o + 1] = fy / fLen;
    frontNormals[o + 2] = fz / fLen;

    const bx = backNormals[o] * 0.14;
    const by = lerp(backNormals[o + 1], nyCyl, 0.88);
    const bz = lerp(backNormals[o + 2], -nzCyl, 0.88);
    const bLen = Math.hypot(bx, by, bz) || 1;
    backNormals[o] = bx / bLen;
    backNormals[o + 1] = by / bLen;
    backNormals[o + 2] = bz / bLen;
  }

  const wallPos: number[] = [];
  const wallNorm: number[] = [];
  const wallUV: number[] = [];
  const wallIdx: number[] = [];

  for (const [e0, e1] of wallSegments) {
    const z0 = frontPos[e0 * 3 + 2];
    const z1 = frontPos[e1 * 3 + 2];
    if (z0 <= 0.0004 && z1 <= 0.0004) continue;

    const x0 = frontPos[e0 * 3];
    const y0 = frontPos[e0 * 3 + 1];
    const u0 = frontUV[e0 * 2];
    const v0 = frontUV[e0 * 2 + 1];

    const x1 = frontPos[e1 * 3];
    const y1 = frontPos[e1 * 3 + 1];
    const u1 = frontUV[e1 * 2];
    const v1 = frontUV[e1 * 2 + 1];

    const dx = x1 - x0;
    const dy = y1 - y0;
    const edgeLen = Math.hypot(dx, dy) || 1;
    const nx = dy / edgeLen;
    const ny = -dx / edgeLen;

    const tNx = nx * 0.72;
    const tNy = ny * 0.72;
    const tNz = 0.694;

    const base = wallPos.length / 3;
    wallPos.push(x0, y0, z0, x0, y0, 0, x1, y1, 0, x1, y1, z1, x0, y0, -z0, x1, y1, -z1);
    wallNorm.push(
      tNx, tNy, tNz,
      nx, ny, 0,
      nx, ny, 0,
      tNx, tNy, tNz,
      tNx, tNy, -tNz,
      tNx, tNy, -tNz
    );
    wallUV.push(u0, v0, u0, v0, u1, v1, u1, v1, u0, v0, u1, v1);
    wallIdx.push(
      base, base + 1, base + 2,
      base, base + 2, base + 3,
      base + 1, base + 4, base + 5,
      base + 1, base + 5, base + 2
    );
  }

  const totalFloats = frontPos.length + backPos.length + wallPos.length;
  const totalUVFloats = frontUV.length + backUV.length + wallUV.length;
  const totalIndices = frontIdx.length + backIdx.length + wallIdx.length;

  const positions = new Float32Array(totalFloats);
  const normals = new Float32Array(totalFloats);
  const uvs = new Float32Array(totalUVFloats);
  const indices = new Uint32Array(totalIndices);

  positions.set(frontPos, 0);
  positions.set(backPos, frontPos.length);
  positions.set(wallPos, frontPos.length + backPos.length);

  normals.set(frontNormals, 0);
  normals.set(backNormals, frontNormals.length);
  normals.set(wallNorm, frontNormals.length + backNormals.length);

  uvs.set(frontUV, 0);
  uvs.set(backUV, frontUV.length);
  uvs.set(wallUV, frontUV.length + backUV.length);

  let idxCursor = 0;
  for (let i = 0; i < frontIdx.length; i++) indices[idxCursor++] = frontIdx[i];
  const backOffset = vertCount;
  for (let i = 0; i < backIdx.length; i++) indices[idxCursor++] = backIdx[i] + backOffset;
  const wallOffset = vertCount * 2;
  for (let i = 0; i < wallIdx.length; i++) indices[idxCursor++] = wallIdx[i] + wallOffset;

  let maxAbsZ = 0;
  for (let i = 2; i < positions.length; i += 3) {
    const az = Math.abs(positions[i]);
    if (az > maxAbsZ) maxAbsZ = az;
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    bounds: {
      width: boundsWidth,
      height: boundsHeight,
      depth: maxAbsZ * 2,
    },
    componentCount,
  };
}

/**
 * Pure deterministic Marching-Cells watertight 3D weapon manifold builder.
 * Builds separate front (+Z), back (-Z), and outward-normal edge walls cleanly
 * with shared seam coordinates so all inner holes (trigger guard, karambit ring,
 * thumbhole) remain hollow with zero Z-fighting or open cracks.
 */
export function buildSculptedMeshData(
  rawAlpha: Float32Array,
  w: number,
  h: number,
  weaponClass: WeaponClass,
  weaponName: string,
  options?: { singleHeroComponent?: boolean; separateMagazine?: boolean }
): SculptedMeshData {
  const archetype = resolveWeaponArchetype(weaponClass, weaponName);
  const lowerWeapon = weaponName.toLowerCase();
  const bladeVariant: 'bayonet' | 'katana' | 'dague' = lowerWeapon.includes('katana')
    ? 'katana'
    : lowerWeapon.includes('dague')
    ? 'dague'
    : 'bayonet';
  const n = w * h;

  // Compute centroid bounds from active pixels for tight 3D framing
  let minAx = w;
  let maxAx = 0;
  let minAy = h;
  let maxAy = 0;
  const bin = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (rawAlpha[i] >= 0.48) {
        bin[i] = 1;
        if (x < minAx) minAx = x;
        if (x > maxAx) maxAx = x;
        if (y < minAy) minAy = y;
        if (y > maxAy) maxAy = y;
      }
    }
  }

  let { compId, components } = analyzeComponents(bin, w, h, bladeVariant);

  // For multi-piece showcase images (like twin bayonets) in FPS hand-held mode,
  // isolate only the main hero weapon piece cleanly.
  const effectiveAlpha =
    options?.singleHeroComponent && components.length > 1
      ? new Float32Array(rawAlpha)
      : rawAlpha;

  if (options?.singleHeroComponent && components.length > 1) {
    const maxArea = Math.max(...components.map((c) => c.pixelCount));
    // Only treat components >= 25% of the largest piece as separate weapon candidates (e.g. twin bayonets),
    // never a tiny floating trigger / sight / barrel fragment sitting below the weapon center of mass.
    const majorComps = components.filter((c) => c.pixelCount >= maxArea * 0.25);
    const hero = majorComps.reduce((best, c) => (c.cy > best.cy ? c : best), majorComps[0]);
    const discardedMajors = majorComps.filter((c) => c.id !== hero.id);
    const padX = Math.max(8, Math.round(w * 0.04));
    const padY = 8;

    const keptIds = new Set<number>([hero.id]);
    for (const c of components) {
      if (c.id === hero.id || c.pixelCount >= maxArea * 0.25) continue;
      const insideHeroBox =
        c.minX >= hero.minX - padX &&
        c.maxX <= hero.maxX + padX &&
        c.minY >= hero.minY - padY &&
        c.maxY <= hero.maxY + padY;
      if (!insideHeroBox) continue;
      const distToHero = Math.hypot(c.cx - hero.cx, c.cy - hero.cy);
      const closerToDiscarded = discardedMajors.some(
        (dm) => Math.hypot(c.cx - dm.cx, c.cy - dm.cy) < distToHero
      );
      if (!closerToDiscarded) {
        keptIds.add(c.id);
      }
    }

    minAx = w;
    maxAx = 0;
    minAy = h;
    maxAy = 0;
    let totalKeptPixels = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!keptIds.has(compId[i])) {
          bin[i] = 0;
          effectiveAlpha[i] = 0;
          compId[i] = -1;
        } else {
          // Merge preserved small sub-parts (e.g. detached trigger / barrel tip) into hero component 0
          // so buildDepthField normalizes their u/v across the full weapon silhouette.
          compId[i] = 0;
          totalKeptPixels++;
          if (x < minAx) minAx = x;
          if (x > maxAx) maxAx = x;
          if (y < minAy) minAy = y;
          if (y > maxAy) maxAy = y;
        }
      }
    }
    components = [
      {
        ...hero,
        id: 0,
        pixelCount: totalKeptPixels || hero.pixelCount,
        minX: minAx,
        maxX: maxAx,
        minY: minAy,
        maxY: maxAy,
      },
    ];
  }

  const longAxisCells = Math.max(1, maxAx - minAx, maxAy - minAy);
  const scale = 4.0 / longAxisCells;
  const cxGrid = 0.5 * (minAx + maxAx);
  const cyGrid = 0.5 * (minAy + maxAy);
  const toWorldX = (gx: number) => (gx - cxGrid) * scale;
  const toWorldY = (gy: number) => -(gy - cyGrid) * scale;

  let magMeta: WeaponMagMeta | undefined;
  let magMeshData: SculptedMeshData | undefined;
  let bodyAlpha = effectiveAlpha;
  let bodyBin = bin;
  let bodyCompId = compId;
  let bodyComponents = components;

  const isFirearm = archetype !== 'karambit' && archetype !== 'couteau';
  if (options?.separateMagazine && isFirearm) {
    if (archetype === 'pistolet') {
      // Handgun magazine inserts internally up into the angled grip heel
      const bw = Math.max(1, maxAx - minAx);
      const bh = Math.max(1, maxAy - minAy);
      const yBotScan = Math.round(minAy + 0.84 * bh);
      const yMidScan = Math.round(minAy + 0.64 * bh);
      const xLim = Math.round(minAx + 0.42 * bw);
      let botSumX = 0;
      let botSumY = 0;
      let botCnt = 0;
      let midSumX = 0;
      let midSumY = 0;
      let midCnt = 0;
      for (let x = minAx; x <= xLim; x++) {
        for (let y = yBotScan; y <= maxAy; y++) {
          if (bin[y * w + x]) {
            botSumX += x;
            botSumY += y;
            botCnt++;
          }
        }
        for (let y = yMidScan - 4; y <= yMidScan + 4; y++) {
          if (y >= minAy && y <= maxAy && bin[y * w + x]) {
            midSumX += x;
            midSumY += y;
            midCnt++;
          }
        }
      }
      const bx = botCnt > 0 ? botSumX / botCnt : minAx + 0.16 * bw;
      const by = botCnt > 0 ? Math.min(maxAy, botSumY / botCnt + bh * 0.04) : maxAy;
      const mx = midCnt > 0 ? midSumX / midCnt : minAx + 0.20 * bw;
      const my = midCnt > 0 ? midSumY / midCnt : minAy + 0.64 * bh;
      const pdx = bx - mx;
      const pdy = -(by - my);
      const plen = Math.hypot(pdx, pdy) || 1;
      magMeta = {
        anchorLocalPos: [toWorldX(bx), toWorldY(by), 0],
        pullDirLocal: [pdx / plen, pdy / plen, 0],
        magLengthLocal: Math.max(0.7, bh * 0.44 * scale),
        isInternal: true,
      };
    } else {
      const magCut = detectMagazineCutRegion(bin, w, h, minAx, maxAx, minAy, maxAy, archetype);
      if (magCut) {
        const candBodyAlpha = new Float32Array(effectiveAlpha);
        const candBodyBin = new Uint8Array(bin);
        const magAlpha = new Float32Array(n);
        const magBin = new Uint8Array(n);
        const yOverlapTop = Math.max(minAy + 1, magCut.yCut - 2);

        for (let y = yOverlapTop; y <= maxAy; y++) {
          for (let x = magCut.leftX; x <= magCut.rightX; x++) {
            const idx = y * w + x;
            if (!bin[idx]) continue;
            magAlpha[idx] = Math.max(0.54, effectiveAlpha[idx]);
            magBin[idx] = 1;
            if (y >= magCut.yCut) {
              candBodyBin[idx] = 0;
              candBodyAlpha[idx] = 0;
            }
          }
        }

        const bodyCheck = analyzeComponents(candBodyBin, w, h);
        const bodyHero =
          bodyCheck.components.length > 0
            ? bodyCheck.components.reduce(
                (best, c) => (c.pixelCount > best.pixelCount ? c : best),
                bodyCheck.components[0]
              )
            : undefined;
        let origArea = 0;
        let bodyHeroArea = 0;
        if (bodyHero) {
          for (let i = 0; i < n; i++) {
            if (bin[i]) origArea++;
            if (candBodyBin[i] && bodyCheck.compId[i] === bodyHero.id) bodyHeroArea++;
          }
        }
        if (bodyHero && bodyHeroArea >= origArea * 0.62) {
          bodyAlpha = candBodyAlpha;
          bodyBin = candBodyBin;
          bodyCompId = bodyCheck.compId;
          bodyComponents = bodyCheck.components;

          // Isolate only main connected magazine piece
          const magAnalyze = analyzeComponents(magBin, w, h);
          if (magAnalyze.components.length > 0) {
            const heroMag = magAnalyze.components.reduce(
              (best, c) => (c.pixelCount > best.pixelCount ? c : best),
              magAnalyze.components[0]
            );
            for (let i = 0; i < n; i++) {
              if (magBin[i] && magAnalyze.compId[i] !== heroMag.id) {
                magBin[i] = 0;
                magAlpha[i] = 0;
              }
            }

            const magSmooth = buildSmoothAlphaField(magAlpha, magBin, w, h);
            const magDepth = buildDepthField(
              magSmooth,
              magBin,
              magAnalyze.compId,
              magAnalyze.components,
              w,
              h,
              scale,
              archetype
            );
            const anchorWX = toWorldX(magCut.anchorX);
            const anchorWY = toWorldY(magCut.anchorY);
            magMeshData = sculptManifoldFromMasks({
              smoothA: magSmooth,
              w,
              h,
              targetHalfZ: magDepth.targetHalfZ,
              rimFrac: magDepth.rimFrac,
              isExactCyl: magDepth.isExactCyl,
              cylNormY: magDepth.cylNormY,
              scale,
              cxGrid,
              cyGrid,
              originOffsetX: anchorWX,
              originOffsetY: anchorWY,
              zScale: 0.86,
              boundsWidth: (magCut.rightX - magCut.leftX) * scale,
              boundsHeight: (magCut.peakY - magCut.yCut) * scale,
              componentCount: 1,
            });
            magMeta = {
              anchorLocalPos: [anchorWX, anchorWY, 0],
              pullDirLocal: [magCut.pullDirX, magCut.pullDirY, 0],
              magLengthLocal: Math.max(0.35, (magCut.peakY - magCut.yCut) * scale),
              isInternal: false,
            };
          }
        }
      }
    }
  }

  const smoothA = buildSmoothAlphaField(bodyAlpha, bodyBin, w, h);
  const { targetHalfZ, rimFrac, isExactCyl, cylNormY } = buildDepthField(
    smoothA,
    bodyBin,
    bodyCompId,
    bodyComponents,
    w,
    h,
    scale,
    archetype,
    bladeVariant
  );

  const mainMesh = sculptManifoldFromMasks({
    smoothA,
    w,
    h,
    targetHalfZ,
    rimFrac,
    isExactCyl,
    cylNormY,
    scale,
    cxGrid,
    cyGrid,
    boundsWidth: (maxAx - minAx) * scale,
    boundsHeight: (maxAy - minAy) * scale,
    componentCount: bodyComponents.length,
  });

  const positions = mainMesh.positions;
  const normals = mainMesh.normals;
  const uvs = mainMesh.uvs;
  const indices = mainMesh.indices;
  const bounds = mainMesh.bounds;
  const componentCount = mainMesh.componentCount;
  void uvs;
  void indices;
  void normals;

  let gripMeta: WeaponGripMeta | undefined;
  if (archetype === 'karambit') {
    const sampleColSpan = (u: number): [number, number, number] => {
      const x = clamp(Math.round(minAx + u * (maxAx - minAx)), 1, w - 2);
      let y0 = -1;
      let y1 = -1;
      for (let y = minAy; y <= maxAy; y++) {
        if (bin[y * w + x]) {
          if (y0 < 0) y0 = y;
          y1 = y;
        }
      }
      if (y0 < 0) return [toWorldX(x), 0, 0.85];
      return [toWorldX(x), toWorldY(0.5 * (y0 + y1)), Math.max(0.35, (y1 - y0 + 1) * scale)];
    };

    // Locate the enclosed finger ring hole center cleanly for all Karambit aspect ratios (incl. 1:1 Champions)
    let ringSumX = 0;
    let ringSumY = 0;
    let ringCnt = 0;
    const rxLo = clamp(Math.round(minAx + 0.68 * (maxAx - minAx)), 1, w - 2);
    const rxHi = clamp(Math.round(minAx + 0.98 * (maxAx - minAx)), rxLo, w - 2);
    for (let x = rxLo; x <= rxHi; x++) {
      let yTop = -1;
      let yBot = -1;
      for (let y = minAy; y <= maxAy; y++) {
        if (bin[y * w + x]) {
          if (yTop < 0) yTop = y;
          yBot = y;
        }
      }
      if (yTop >= 0 && yBot - yTop > 6) {
        for (let y = yTop + 1; y < yBot; y++) {
          if (!bin[y * w + x]) {
            ringSumX += x;
            ringSumY += y;
            ringCnt++;
          }
        }
      }
    }

    const [xrFallback, yrFallback] = sampleColSpan(0.87);
    const ringWorldX = ringCnt > 12 ? toWorldX(ringSumX / ringCnt) : xrFallback;
    const ringWorldY = ringCnt > 12 ? toWorldY(ringSumY / ringCnt) : yrFallback;

    const [x1, y1, th1] = sampleColSpan(0.56);
    const [, , th2] = sampleColSpan(0.74);
    const dx = ringWorldX - x1;
    const dy = ringWorldY - y1;
    const len = Math.hypot(dx, dy) || 1;
    const hx = dx / len;
    const hy = dy / len;
    // Anchor fist grip at a uniform offset behind the ring center so the thumb sits inside the ring on every Karambit skin
    const gripBackFromRing = 0.62;
    const gripX = ringWorldX - hx * gripBackFromRing;
    const gripY = ringWorldY - hy * gripBackFromRing;
    gripMeta = {
      gripLocalPos: [gripX, gripY, 0],
      handleAxis: [hx, hy, 0],
      bladeDir: [hy, -hx, 0],
      ringLocalPos: [ringWorldX, ringWorldY, 0],
      handleThicknessLocal: 0.5 * (th1 + th2),
    };
  } else if (archetype === 'couteau' && components.length > 0) {
    const hero = components[0];
    const handleIsLeft =
      bladeVariant === 'katana'
        ? hero.leftHalfArea > hero.rightHalfArea && hero.guardU < 0.5
        : bladeVariant === 'dague'
        ? hero.narrowTipSide === 'right'
        : Math.abs(hero.guardU - 0.5) > 0.1
        ? hero.guardU < 0.5
        : hero.narrowTipSide === 'right';
    const uLo =
      bladeVariant === 'katana'
        ? handleIsLeft
          ? 0.06
          : 0.79
        : handleIsLeft
        ? hero.guardU * 0.25
        : hero.guardU + (1 - hero.guardU) * 0.18;
    const uHi =
      bladeVariant === 'katana'
        ? handleIsLeft
          ? 0.21
          : 0.94
        : handleIsLeft
        ? hero.guardU * 0.84
        : hero.guardU + (1 - hero.guardU) * 0.76;
    const halfLen = Math.max(1, 0.5 * hero.localLen);
    const katanaCoreHalfV = Math.max(10, hero.localHeight * 0.14);
    let sx = 0;
    let sy = 0;
    let cnt = 0;
    for (let y = hero.minY; y <= hero.maxY; y++) {
      for (let x = hero.minX; x <= hero.maxX; x++) {
        if (!bin[y * w + x]) continue;
        const dx = x - hero.cx;
        const dy = y - hero.cy;
        const lu = clamp((dx * hero.cosA + dy * hero.sinA + halfLen) / (2 * halfLen), 0, 1);
        const lv = -dx * hero.sinA + dy * hero.cosA;
        if (
          lu >= uLo &&
          lu <= uHi &&
          (bladeVariant !== 'katana' || Math.abs(lv) <= katanaCoreHalfV)
        ) {
          sx += x;
          sy += y;
          cnt++;
        }
      }
    }
    const dirSign = handleIsLeft ? 1 : -1;
    const hx = hero.cosA * dirSign;
    const hy = -hero.sinA * dirSign;
    // World representation of pixel perpendicular lv = (-sinA, cosA) with Y flipped is (-sinA, -cosA),
    // ensuring hx * bx + hy * by === 0 strictly at every tilt angle.
    const bx = -hero.sinA * hero.spineSign;
    const by = -hero.cosA * hero.spineSign;
    gripMeta = {
      gripLocalPos: cnt > 0 ? [toWorldX(sx / cnt), toWorldY(sy / cnt), 0] : [0, 0, 0],
      handleAxis: [hx, hy, 0],
      bladeDir: [bx, by, 0],
    };
  }

  let muzzleLocalPos: [number, number, number] | undefined;
  if (archetype !== 'karambit' && archetype !== 'couteau') {
    const muzzleSide = getWeaponMuzzleSide(archetype);
    const bw = Math.max(1, maxAx - minAx);
    const bh = Math.max(1, maxAy - minAy);
    // Restrict scan to upper 58% so hanging straps (MAC-10) or bipods (AWP) never skew muzzle height
    const yUpperMax = Math.min(maxAy, Math.round(minAy + 0.58 * bh));
    const startX = clamp(
      Math.round(minAx + (muzzleSide === 'right' ? 0.992 : 0.008) * bw),
      1,
      w - 2
    );
    const stepDir = muzzleSide === 'right' ? -1 : 1;
    const maxSteps = Math.max(6, Math.ceil(0.14 * bw));

    let foundX = -1;
    let tipY0 = -1;
    let tipY1 = -1;
    for (let s = 0; s <= maxSteps; s++) {
      const x = clamp(startX + s * stepDir, 1, w - 2);
      let y0 = -1;
      let y1 = -1;
      for (let y = minAy; y <= yUpperMax; y++) {
        if (bin[y * w + x]) {
          if (y0 < 0) y0 = y;
          y1 = y;
        }
      }
      if (y0 >= 0) {
        foundX = x;
        tipY0 = y0;
        tipY1 = y1;
        break;
      }
    }

    if (foundX >= 0) {
      // Pistol bore sits ~32% below slide top; rifles/SMG/AWP muzzles are vertically centered on bore tip
      const boreFrac = archetype === 'pistolet' ? 0.32 : 0.5;
      const boreY = tipY0 + boreFrac * (tipY1 - tipY0);
      muzzleLocalPos = [toWorldX(foundX), toWorldY(boreY), 0];
    } else {
      muzzleLocalPos = [muzzleSide === 'right' ? 1.92 : -1.92, 0.25, 0];
    }
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    bounds,
    componentCount,
    gripMeta,
    muzzleLocalPos,
    magMeta,
    magMeshData,
  };
}

/**
 * Upsamples & edge-preserving filters textures up to 2K resolution so skin finishes
 * render liquid-smooth up close with zero pixelation, then synthesizes 2K paired
 * PBR maps (roughness, metalness, and RGB tangent-space normalMap).
 */
function prepareWeaponTextures(
  img: HTMLImageElement,
  archetype: WeaponArchetype,
  maxTextureSize = 2048
): {
  mapCanvas: HTMLCanvasElement;
  roughnessCanvas: HTMLCanvasElement;
  metalnessCanvas: HTMLCanvasElement;
  normalCanvas: HTMLCanvasElement;
  alphaGrid: Float32Array;
  gridW: number;
  gridH: number;
} {
  // Upsample source artwork cleanly toward target max edge (default 2048px, 1024px in fast FPS slot cache)
  const targetMaxTex = clamp(maxTextureSize, 512, 2048);
  const maxSrcDim = Math.max(img.width, img.height, 1);
  const scaleTex = clamp(targetMaxTex / maxSrcDim, 0.5, 2.5);
  const clampedScale = maxSrcDim * scaleTex > targetMaxTex ? targetMaxTex / maxSrcDim : scaleTex;
  const tw = Math.max(16, Math.round(img.width * clampedScale));
  const th = Math.max(16, Math.round(img.height * clampedScale));

  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = tw;
  mapCanvas.height = th;
  const ctx = mapCanvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, tw, th);

  const imgData = ctx.getImageData(0, 0, tw, th);
  const rawUpscaled = new Uint8ClampedArray(imgData.data);
  const src = new Uint8ClampedArray(rawUpscaled);
  const pix = imgData.data;

  // Edge-preserving bilateral de-pixelation pass on solid interior pixels:
  // smooths compression blockiness while preserving crisp crisp graphic ink lines.
  for (let y = 1; y < th - 1; y++) {
    for (let x = 1; x < tw - 1; x++) {
      const o = (y * tw + x) * 4;
      const ca = rawUpscaled[o + 3];
      if (ca < 220) continue;
      const cr = rawUpscaled[o];
      const cg = rawUpscaled[o + 1];
      const cb = rawUpscaled[o + 2];
      let sr = cr * 2;
      let sg = cg * 2;
      let sb = cb * 2;
      let sw = 2;
      for (const off of [-4, 4, -tw * 4, tw * 4, -tw * 4 - 4, -tw * 4 + 4, tw * 4 - 4, tw * 4 + 4]) {
        const no = o + off;
        if (rawUpscaled[no + 3] < 200) continue;
        const diff =
          Math.abs(rawUpscaled[no] - cr) +
          Math.abs(rawUpscaled[no + 1] - cg) +
          Math.abs(rawUpscaled[no + 2] - cb);
        if (diff < 68) {
          const wgt = diff < 28 ? 1.0 : 0.45;
          sr += rawUpscaled[no] * wgt;
          sg += rawUpscaled[no + 1] * wgt;
          sb += rawUpscaled[no + 2] * wgt;
          sw += wgt;
        }
      }
      src[o] = Math.round(sr / sw);
      src[o + 1] = Math.round(sg / sw);
      src[o + 2] = Math.round(sb / sw);
    }
  }

  // Build paired PBR roughness, metalness & true RGB tangent-space normalMap
  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = tw;
  roughnessCanvas.height = th;
  const rCtx = roughnessCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(tw, th);

  const metalnessCanvas = document.createElement('canvas');
  metalnessCanvas.width = tw;
  metalnessCanvas.height = th;
  const mCtx = metalnessCanvas.getContext('2d')!;
  const mImg = mCtx.createImageData(tw, th);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = tw;
  normalCanvas.height = th;
  const nCtx = normalCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(tw, th);

  const isBladeArch = archetype === 'karambit' || archetype === 'couteau';

  // Precompute surface luminance field for crisp Sobel gradient normals
  const lumaGrid = new Float32Array(tw * th);
  for (let i = 0; i < tw * th; i++) {
    const o = i * 4;
    lumaGrid[i] = (src[o] * 0.299 + src[o + 1] * 0.587 + src[o + 2] * 0.114) / 255;
  }

  for (let y = 0; y < th; y++) {
    const ym = y > 0 ? y - 1 : 0;
    const yp = y < th - 1 ? y + 1 : th - 1;
    for (let x = 0; x < tw; x++) {
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < tw - 1 ? x + 1 : tw - 1;
      const i = y * tw + x;
      const o = i * 4;
      const r = src[o];
      const g = src[o + 1];
      const b = src[o + 2];
      const a = src[o + 3];
      const luma = (r + g + b) / 3;
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const isWood = r > g + 14 && g > b + 6 && chroma > 22 && luma < 175 && archetype === 'ak47';

      let rough = 0.36;
      let metal = 0.48;
      if (a > 20) {
        if (luma < 48 && chroma < 16) {
          rough = 0.64;
          metal = 0.18;
        } else if (isWood) {
          rough = 0.52;
          metal = 0.08;
        } else if (isBladeArch) {
          rough = chroma > 14 ? 0.24 : luma > 195 ? 0.38 : 0.46;
          metal = chroma > 14 ? 0.84 : luma > 195 ? 0.22 : 0.36;
        } else if (chroma < 26 && luma > 96) {
          rough = luma > 188 ? 0.42 : 0.24;
          metal = luma > 188 ? 0.18 : 0.86;
        } else if (luma > 135 || chroma > 40) {
          rough = luma > 190 ? 0.40 : 0.26;
          metal = luma > 190 ? 0.22 : 0.54;
        } else {
          rough = 0.34;
          metal = 0.56;
        }
      }

      const rByte = Math.round(rough * 255);
      const mByte = Math.round(metal * 255);
      rImg.data[o] = rByte;
      rImg.data[o + 1] = rByte;
      rImg.data[o + 2] = rByte;
      rImg.data[o + 3] = 255;

      mImg.data[o] = mByte;
      mImg.data[o + 1] = mByte;
      mImg.data[o + 2] = mByte;
      mImg.data[o + 3] = 255;

      // Full 3x3 Sobel gradient normal + anisotropic micro-brushed alloy finish
      const tl = lumaGrid[ym * tw + xm];
      const tc = lumaGrid[ym * tw + x];
      const tr = lumaGrid[ym * tw + xp];
      const ml = lumaGrid[y * tw + xm];
      const mr = lumaGrid[y * tw + xp];
      const bl = lumaGrid[yp * tw + xm];
      const bc = lumaGrid[yp * tw + x];
      const br = lumaGrid[yp * tw + xp];

      const dX = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const dY = bl + 2 * bc + br - (tl + 2 * tc + tr);
      const microBrush = (((x * 7 + y * 29) & 7) - 3.5) * 0.012;
      const strength = isBladeArch ? 1.45 : 1.75;
      const nx = clamp(-dX * strength, -0.75, 0.75);
      const ny = clamp(dY * strength + microBrush, -0.75, 0.75);
      const nz = Math.sqrt(Math.max(0.25, 1 - nx * nx - ny * ny));

      nImg.data[o] = Math.round((nx * 0.5 + 0.5) * 255);
      nImg.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      nImg.data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      nImg.data[o + 3] = 255;
    }
  }
  rCtx.putImageData(rImg, 0, 0);
  mCtx.putImageData(mImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);

  // 5 passes of outward RGB color dilation into transparent border pixels
  let cur = new Uint8ClampedArray(src);
  const next = new Uint8ClampedArray(src);
  for (let pass = 0; pass < 5; pass++) {
    for (let y = 1; y < th - 1; y++) {
      for (let x = 1; x < tw - 1; x++) {
        const idx = (y * tw + x) * 4;
        if (cur[idx + 3] >= 245) continue;
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let sw = 0;
        for (const off of [-4, 4, -tw * 4, tw * 4]) {
          const ni = idx + off;
          const na = cur[ni + 3];
          if (na >= 128) {
            const wgt = na / 255;
            sr += cur[ni] * wgt;
            sg += cur[ni + 1] * wgt;
            sb += cur[ni + 2] * wgt;
            sw += wgt;
          }
        }
        if (sw > 0) {
          next[idx] = Math.round(sr / sw);
          next[idx + 1] = Math.round(sg / sw);
          next[idx + 2] = Math.round(sb / sw);
          next[idx + 3] = 255;
        }
      }
    }
    cur.set(next);
  }
  // Ensure every remaining border pixel has opaque alpha so LinearFilter stays halo-free
  for (let i = 0; i < tw * th; i++) {
    pix[i * 4] = cur[i * 4];
    pix[i * 4 + 1] = cur[i * 4 + 1];
    pix[i * 4 + 2] = cur[i * 4 + 2];
    pix[i * 4 + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  // Downsample clean silhouette alpha field onto ultra-dense marching-cells grid (up to 600 cols)
  const aspect = tw / th;
  const innerW = clamp(Math.round(440 * Math.sqrt(Math.max(0.5, aspect))), 360, 600);
  const innerH = Math.max(92, Math.round(innerW / aspect));
  const gridW = innerW + 4;
  const gridH = innerH + 4;
  const alphaGrid = new Float32Array(gridW * gridH);

  for (let gy = 2; gy < gridH - 2; gy++) {
    const sy0 = ((gy - 2) / innerH) * th;
    const sy1 = ((gy - 1) / innerH) * th;
    const iy0 = clamp(Math.floor(sy0), 0, th - 1);
    const iy1 = clamp(Math.ceil(sy1), iy0 + 1, th);
    for (let gx = 2; gx < gridW - 2; gx++) {
      const sx0 = ((gx - 2) / innerW) * tw;
      const sx1 = ((gx - 1) / innerW) * tw;
      const ix0 = clamp(Math.floor(sx0), 0, tw - 1);
      const ix1 = clamp(Math.ceil(sx1), ix0 + 1, tw);

      let sumA = 0;
      let maxA = 0;
      let cnt = 0;
      for (let py = iy0; py < iy1; py++) {
        for (let px = ix0; px < ix1; px++) {
          const aVal = src[(py * tw + px) * 4 + 3] / 255;
          sumA += aVal;
          if (aVal > maxA) maxA = aVal;
          cnt++;
        }
      }
      const avg = sumA / Math.max(1, cnt);
      alphaGrid[gy * gridW + gx] = clamp(avg * 0.72 + maxA * 0.28, 0, 1);
    }
  }

  return {
    mapCanvas,
    roughnessCanvas,
    metalnessCanvas,
    normalCanvas,
    alphaGrid,
    gridW,
    gridH,
  };
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossible de charger la texture 3D : ${src}`));
    img.src = src;
  });
}

/**
 * Generates an HDR studio lightbox environment texture combining RoomEnvironment with
 * high-contrast luminous architectural light strips so curved weapon barrels, scopes,
 * and blades reflect crisp specular ribbons from every camera angle.
 */
export function createStudioEnvironment(
  renderer: THREE.WebGLRenderer
): { texture: THREE.Texture; dispose: () => void } {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const baseRoom = new RoomEnvironment();
  envScene.add(baseRoom);

  // Architectural softbox strips for long specular tube highlights
  const stripMatMain = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.55) });
  const stripMatCool = new THREE.MeshBasicMaterial({ color: new THREE.Color('#bae6fd').multiplyScalar(1.25) });
  const stripMatWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#fef3c7').multiplyScalar(1.05) });

  const overheadStripGeo = new THREE.PlaneGeometry(14, 1.35);
  const overheadStrip = new THREE.Mesh(overheadStripGeo, stripMatMain);
  overheadStrip.position.set(0, 7.5, 1.6);
  overheadStrip.rotation.x = Math.PI / 2 - 0.15;
  envScene.add(overheadStrip);

  const sideStripGeo = new THREE.PlaneGeometry(12, 1.1);
  const sideLeft = new THREE.Mesh(sideStripGeo, stripMatCool);
  sideLeft.position.set(-6.5, 2.2, 4.5);
  sideLeft.lookAt(0, 0, 0);
  envScene.add(sideLeft);

  const sideRight = new THREE.Mesh(sideStripGeo, stripMatWarm);
  sideRight.position.set(6.5, 1.4, -4.5);
  sideRight.lookAt(0, 0, 0);
  envScene.add(sideRight);

  const rt = pmrem.fromScene(envScene, 0.035);
  baseRoom.dispose();
  overheadStripGeo.dispose();
  sideStripGeo.dispose();
  stripMatMain.dispose();
  stripMatCool.dispose();
  stripMatWarm.dispose();
  pmrem.dispose();

  return {
    texture: rt.texture,
    dispose: () => rt.dispose(),
  };
}

/** Creates a compact 3D metallic + brass pistol magazine for handguns whose mag seats inside the grip. */
function buildPistolMagazineGroup(magLength: number): THREE.Group {
  const g = new THREE.Group();
  const bodyW = 0.40;
  const bodyD = 0.34;

  const steelMat = new THREE.MeshStandardMaterial({
    color: '#2c313a',
    roughness: 0.32,
    metalness: 0.85,
  });
  const baseMat = new THREE.MeshStandardMaterial({
    color: '#17191f',
    roughness: 0.68,
    metalness: 0.2,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: '#eab308',
    roughness: 0.25,
    metalness: 0.92,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: '#d97706',
    roughness: 0.28,
    metalness: 0.88,
  });

  // Polymer floorplate at base (y = 0)
  const floorplate = new THREE.Mesh(
    new THREE.BoxGeometry(bodyW * 1.18, 0.12, bodyD * 1.15),
    baseMat
  );
  floorplate.position.set(0, 0.06, 0);
  g.add(floorplate);

  // Machined steel magazine sleeve extending upward into grip (+Y)
  const tubeH = Math.max(0.45, magLength - 0.14);
  const tube = new THREE.Mesh(new THREE.BoxGeometry(bodyW, tubeH, bodyD), steelMat);
  tube.position.set(0, 0.12 + tubeH * 0.5, 0);
  g.add(tube);

  // Brass cartridge casing & copper bullet tip seated in feed lips at top
  const casing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, bodyW * 0.72, 10),
    brassMat
  );
  casing.rotation.z = Math.PI / 2;
  casing.position.set(-0.02, 0.12 + tubeH + 0.03, 0);
  g.add(casing);

  const bulletTip = new THREE.Mesh(
    new THREE.ConeGeometry(0.052, 0.11, 10),
    copperMat
  );
  bulletTip.rotation.z = -Math.PI / 2;
  bulletTip.position.set(bodyW * 0.36 + 0.035, 0.12 + tubeH + 0.03, 0);
  g.add(bulletTip);

  return g;
}

/**
 * Loads a weapon cutout PNG/WebP and builds a high-resolution photorealistic PBR Three.js Group
 * matching the exact weapon silhouette and colors from all 360° angles.
 */
export async function buildWeapon3DModel(
  imageSrc: string,
  weaponClass: WeaponClass,
  weaponName: string,
  maxAnisotropy = 16,
  options?: {
    singleHeroComponent?: boolean;
    separateMagazine?: boolean;
    rarity?: RarityId;
    maxTextureSize?: number;
  }
): Promise<Weapon3DModel> {
  const img = await loadHtmlImage(imageSrc);
  const archetype = resolveWeaponArchetype(weaponClass, weaponName);
  const {
    mapCanvas,
    roughnessCanvas,
    metalnessCanvas,
    normalCanvas,
    alphaGrid,
    gridW,
    gridH,
  } = prepareWeaponTextures(img, archetype, options?.maxTextureSize ?? 2048);

  const meshData = buildSculptedMeshData(
    alphaGrid,
    gridW,
    gridH,
    weaponClass,
    weaponName,
    options
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
  geometry.computeBoundingSphere();

  const colorTexture = new THREE.CanvasTexture(mapCanvas);
  colorTexture.colorSpace = THREE.SRGBColorSpace;
  colorTexture.anisotropy = maxAnisotropy;
  colorTexture.minFilter = THREE.LinearMipmapLinearFilter;
  colorTexture.magFilter = THREE.LinearFilter;
  colorTexture.needsUpdate = true;

  const roughTexture = new THREE.CanvasTexture(roughnessCanvas);
  roughTexture.anisotropy = maxAnisotropy;
  roughTexture.needsUpdate = true;

  const metalTexture = new THREE.CanvasTexture(metalnessCanvas);
  metalTexture.anisotropy = maxAnisotropy;
  metalTexture.needsUpdate = true;

  const normalTexture = new THREE.CanvasTexture(normalCanvas);
  normalTexture.anisotropy = maxAnisotropy;
  normalTexture.needsUpdate = true;

  const isBlade = archetype === 'karambit' || archetype === 'couteau';
  const r = options?.rarity;
  const iridescenceAmount =
    r === 'secret'
      ? 0.52
      : r === 'legendaire'
      ? 0.36
      : r === 'mythique'
      ? 0.24
      : r === 'rare'
      ? 0.16
      : 0.10;

  const material = new THREE.MeshPhysicalMaterial({
    map: colorTexture,
    roughnessMap: roughTexture,
    metalnessMap: metalTexture,
    normalMap: normalTexture,
    normalScale: new THREE.Vector2(isBlade ? 0.78 : 0.94, isBlade ? 0.78 : 0.94),
    metalness: 1.0,
    roughness: 1.0,
    clearcoat: isBlade ? 0.42 : 0.34,
    clearcoatRoughness: isBlade ? 0.18 : 0.22,
    iridescence: iridescenceAmount,
    iridescenceIOR: 1.38,
    iridescenceThicknessRange: [160, 440],
    specularIntensity: 0.72,
    specularColor: new THREE.Color('#f1f5f9'),
    envMapIntensity: 1.15,
  });

  const weaponMesh = new THREE.Mesh(geometry, material);
  weaponMesh.castShadow = true;
  weaponMesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(weaponMesh);

  let magazineGroup: THREE.Group | undefined;
  let magGeo: THREE.BufferGeometry | undefined;
  if (options?.separateMagazine && meshData.magMeta) {
    if (meshData.magMeshData) {
      magGeo = new THREE.BufferGeometry();
      magGeo.setAttribute('position', new THREE.BufferAttribute(meshData.magMeshData.positions, 3));
      magGeo.setAttribute('normal', new THREE.BufferAttribute(meshData.magMeshData.normals, 3));
      magGeo.setAttribute('uv', new THREE.BufferAttribute(meshData.magMeshData.uvs, 2));
      magGeo.setIndex(new THREE.BufferAttribute(meshData.magMeshData.indices, 1));
      magGeo.computeBoundingSphere();

      const magMesh = new THREE.Mesh(magGeo, material);
      magMesh.name = 'weapon_magazine_mesh';
      magMesh.castShadow = true;
      magMesh.receiveShadow = true;

      magazineGroup = new THREE.Group();
      magazineGroup.name = 'weapon_magazine';
      magazineGroup.position.set(...meshData.magMeta.anchorLocalPos);
      magazineGroup.add(magMesh);
      group.add(magazineGroup);
    } else if (meshData.magMeta.isInternal) {
      magazineGroup = buildPistolMagazineGroup(meshData.magMeta.magLengthLocal);
      magazineGroup.name = 'weapon_magazine';
      magazineGroup.position.set(...meshData.magMeta.anchorLocalPos);
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3(...meshData.magMeta.pullDirLocal).normalize()
      );
      magazineGroup.quaternion.copy(q);
      magazineGroup.visible = false;
      group.add(magazineGroup);
    }
  }

  const radius = Math.max(1.2, geometry.boundingSphere?.radius ?? 2.2);

  return {
    group,
    radius,
    gripMeta: meshData.gripMeta,
    muzzleLocalPos: meshData.muzzleLocalPos,
    magMeta: meshData.magMeta,
    magazineGroup,
    dispose: () => {
      geometry.dispose();
      magGeo?.dispose();
      if (magazineGroup && meshData.magMeta?.isInternal) {
        const mats = new Set<THREE.Material>();
        magazineGroup.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (Array.isArray(obj.material)) obj.material.forEach((m) => mats.add(m));
            else if (obj.material) mats.add(obj.material);
          }
        });
        mats.forEach((m) => m.dispose());
      }
      material.dispose();
      colorTexture.dispose();
      roughTexture.dispose();
      metalTexture.dispose();
      normalTexture.dispose();
    },
  };
}
