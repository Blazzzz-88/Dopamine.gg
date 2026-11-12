/**
 * Knife Animation System — Valorant-inspired procedural FPS rig, Zero-Detachment & Zero-Conflict
 *
 * Guarantees every knife (Karambit, Baïonnette, Katana, Dague) stays physically locked
 * inside the player's right fist (`right_hand` rigid coupling) on every single frame:
 *   - No floating/tossed knife leaving the palm during draw, inspect, or attacks.
 *   - Karambit draw/inspect twirls pivot cleanly around the index-finger ring (`ringPivot`),
 *     with fingers subtly relaxing on spin and snapping tight onto the grip.
 *   - Crossfade state blending eliminates animation pops & input conflicts across
 *     rapid draw / inspect (T) / left-click combo / right-click heavy slashes.
 *
 * 4 Valorant-inspired weapon personalities:
 *   • karambit   → reverse grip, finger-ring twirl on equip/inspect, agile hooked slashes & plunge
 *   • baionnette → tactical commando wrist-snap draw, two-sided blade inspect, diagonal slashes & forward thrust
 *   • katana     → iaido unsheathe sweep, majestic full-blade inspection, kesa-giri cross slashes & heavy overhead cleave
 *   • dague      → quick VCT/lock-in wrist flick draw, emblem/damascus display inspect, rapid cross cuts & lunge stab
 */

import * as THREE from 'three';
import {
  ArmHoldPose,
  FPSHandsRig,
  FPSWeaponViewConfig,
  getBaseArmHolds,
} from './fpsHandsBuilder';
import { getWeaponMuzzleSide, WeaponArchetype, WeaponGripMeta } from './weapon3dBuilder';

export type KnifeType = 'karambit' | 'baionnette' | 'katana' | 'dague' | 'couteau';
export type KnifeAnimState = 'idle' | 'draw' | 'inspect' | 'attack1' | 'attack2';

export interface KnifeAnimPose {
  /** Translation additive du viewModelRig (espace caméra) */
  rigPos: THREE.Vector3;
  /** Rotation additive du viewModelRig (Euler XYZ) */
  rigRot: THREE.Euler;
  /** Translation additive de la main droite dans le rig */
  rightArmPos: THREE.Vector3;
  /** Rotation additive du poignet droit (entraînant l'arme solidairement) */
  rightWristRot: THREE.Euler;
  /** Ouverture légère de l'index pendant un twirl d'anneau (Karambit uniquement) */
  indexCurlOffset: number;
  /** Rotation du Karambit dans le plan autour de son anneau passé au doigt */
  bladePlaneSpin: number;
  /** Léger roulis d'ajustement en paume (inspect / garde) */
  bladeAxisRoll: number;
  /** Inclinaison subtile du tranchant en paume */
  bladeEdgeTilt: number;
  /** Décalage additif de la main gauche de garde */
  leftArmPos: THREE.Vector3;
  /** Rotation additive du poignet gauche */
  leftArmRot: THREE.Euler;
  /** Micro-impulsion caméra (pitch, roll) lors des frappes */
  cameraPunch: { pitch: number; roll: number };
}

export interface KnifeAnimator {
  readonly knifeType: KnifeType;
  update(dt: number, now: number): KnifeAnimPose;
  triggerAttack(secondary?: boolean): void;
  triggerDraw(fromHip?: boolean): void;
  triggerInspect(): void;
  getState(): KnifeAnimState;
}

export interface KnifeRigRestData {
  archetype: WeaponArchetype;
  gripPivot: THREE.Vector3;
  ringPivot: THREE.Vector3;
  planeNormal: THREE.Vector3;
  lengthAxis: THREE.Vector3;
  edgeAxis: THREE.Vector3;
  baseRightHold: ArmHoldPose;
  baseLeftHold: ArmHoldPose;
  handRestMatrixInv: THREE.Matrix4;
  baseLeftArmPos: THREE.Vector3;
  baseLeftArmRot: THREE.Euler;
  baseRightHandRot: THREE.Euler;
}

/** Détermine la personnalité d'animation Valorant selon le nom exact de l'arme. */
export function resolveKnifeType(weaponName: string): KnifeType {
  const n = weaponName.toLowerCase();
  if (n.includes('karambit')) return 'karambit';
  if (n.includes('katana')) return 'katana';
  if (n.includes('baïonnette') || n.includes('baionnette')) return 'baionnette';
  if (n.includes('dague')) return 'dague';
  return 'couteau';
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(t: number): number {
  const c = 1 - clamp01(t);
  return 1 - c * c * c;
}

function easeOutQuart(t: number): number {
  const c = 1 - clamp01(t);
  return 1 - c * c * c * c;
}

function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function easeOutBack(t: number, s = 1.35): number {
  const c = clamp01(t) - 1;
  return 1 + (s + 1) * c * c * c + s * c * c;
}

function dampedLockBounce(t: number): number {
  const c = clamp01(t);
  return Math.sin(c * Math.PI * 1.5) * Math.exp(-4.8 * c) * (1 - c);
}

function createEmptyPose(): KnifeAnimPose {
  return {
    rigPos: new THREE.Vector3(),
    rigRot: new THREE.Euler(),
    rightArmPos: new THREE.Vector3(),
    rightWristRot: new THREE.Euler(),
    indexCurlOffset: 0,
    bladePlaneSpin: 0,
    bladeAxisRoll: 0,
    bladeEdgeTilt: 0,
    leftArmPos: new THREE.Vector3(),
    leftArmRot: new THREE.Euler(),
    cameraPunch: { pitch: 0, roll: 0 },
  };
}

function resetPose(p: KnifeAnimPose): void {
  p.rigPos.set(0, 0, 0);
  p.rigRot.set(0, 0, 0);
  p.rightArmPos.set(0, 0, 0);
  p.rightWristRot.set(0, 0, 0);
  p.indexCurlOffset = 0;
  p.bladePlaneSpin = 0;
  p.bladeAxisRoll = 0;
  p.bladeEdgeTilt = 0;
  p.leftArmPos.set(0, 0, 0);
  p.leftArmRot.set(0, 0, 0);
  p.cameraPunch.pitch = 0;
  p.cameraPunch.roll = 0;
}

function copyPose(dst: KnifeAnimPose, src: KnifeAnimPose): void {
  dst.rigPos.copy(src.rigPos);
  dst.rigRot.copy(src.rigRot);
  dst.rightArmPos.copy(src.rightArmPos);
  dst.rightWristRot.copy(src.rightWristRot);
  dst.indexCurlOffset = src.indexCurlOffset;
  dst.bladePlaneSpin = src.bladePlaneSpin;
  dst.bladeAxisRoll = src.bladeAxisRoll;
  dst.bladeEdgeTilt = src.bladeEdgeTilt;
  dst.leftArmPos.copy(src.leftArmPos);
  dst.leftArmRot.copy(src.leftArmRot);
  dst.cameraPunch.pitch = src.cameraPunch.pitch;
  dst.cameraPunch.roll = src.cameraPunch.roll;
}

function lerpPose(out: KnifeAnimPose, a: KnifeAnimPose, b: KnifeAnimPose, k: number): void {
  const t = clamp01(k);
  out.rigPos.lerpVectors(a.rigPos, b.rigPos, t);
  out.rigRot.set(
    THREE.MathUtils.lerp(a.rigRot.x, b.rigRot.x, t),
    THREE.MathUtils.lerp(a.rigRot.y, b.rigRot.y, t),
    THREE.MathUtils.lerp(a.rigRot.z, b.rigRot.z, t)
  );
  out.rightArmPos.lerpVectors(a.rightArmPos, b.rightArmPos, t);
  out.rightWristRot.set(
    THREE.MathUtils.lerp(a.rightWristRot.x, b.rightWristRot.x, t),
    THREE.MathUtils.lerp(a.rightWristRot.y, b.rightWristRot.y, t),
    THREE.MathUtils.lerp(a.rightWristRot.z, b.rightWristRot.z, t)
  );
  out.indexCurlOffset = THREE.MathUtils.lerp(a.indexCurlOffset, b.indexCurlOffset, t);
  out.bladePlaneSpin = THREE.MathUtils.lerp(a.bladePlaneSpin, b.bladePlaneSpin, t);
  out.bladeAxisRoll = THREE.MathUtils.lerp(a.bladeAxisRoll, b.bladeAxisRoll, t);
  out.bladeEdgeTilt = THREE.MathUtils.lerp(a.bladeEdgeTilt, b.bladeEdgeTilt, t);
  out.leftArmPos.lerpVectors(a.leftArmPos, b.leftArmPos, t);
  out.leftArmRot.set(
    THREE.MathUtils.lerp(a.leftArmRot.x, b.leftArmRot.x, t),
    THREE.MathUtils.lerp(a.leftArmRot.y, b.leftArmRot.y, t),
    THREE.MathUtils.lerp(a.leftArmRot.z, b.leftArmRot.z, t)
  );
  out.cameraPunch.pitch = THREE.MathUtils.lerp(a.cameraPunch.pitch, b.cameraPunch.pitch, t);
  out.cameraPunch.roll = THREE.MathUtils.lerp(a.cameraPunch.roll, b.cameraPunch.roll, t);
}

/**
 * Base crossfade animator: snapshots current blended pose on any state switch so
 * rapid clicking, inspect cancels, or weapon swaps never snap or create conflicts.
 */
abstract class ValorantKnifeAnimatorBase implements KnifeAnimator {
  abstract readonly knifeType: KnifeType;
  protected state: KnifeAnimState = 'idle';
  protected timer = 0;
  protected comboIndex = 0;
  private blendElapsed = 0;
  private blendDuration = 0;
  private readonly targetPose = createEmptyPose();
  private readonly blendFrom = createEmptyPose();
  private readonly outputPose = createEmptyPose();

  private beginState(nextState: KnifeAnimState, blendSec: number): void {
    copyPose(this.blendFrom, this.outputPose);
    this.state = nextState;
    this.timer = 0;
    this.blendElapsed = 0;
    this.blendDuration = blendSec;
  }

  triggerDraw(fromHip = false): void {
    if (fromHip) {
      this.state = 'draw';
      this.timer = 0;
      this.blendElapsed = 0;
      this.blendDuration = 0;
      return;
    }
    if (this.state === 'attack1' || this.state === 'attack2') return;
    this.beginState('draw', 0.05);
  }

  triggerInspect(): void {
    if (this.state === 'attack1' || this.state === 'attack2') return;
    this.beginState('inspect', 0.09);
  }

  triggerAttack(secondary = false): void {
    if (this.state === 'attack1' && this.timer < 0.12) return;
    if (this.state === 'attack2' && this.timer < 0.22) return;
    if (!secondary) {
      this.comboIndex = (this.comboIndex + 1) % 2;
    }
    this.beginState(secondary ? 'attack2' : 'attack1', 0.04);
  }

  getState(): KnifeAnimState {
    return this.state;
  }

  protected abstract evaluateTargetPose(
    state: KnifeAnimState,
    timer: number,
    now: number,
    out: KnifeAnimPose
  ): KnifeAnimState;

  update(dt: number, now: number): KnifeAnimPose {
    const safeDt = Math.max(0, Math.min(0.05, dt));
    this.timer += safeDt;

    resetPose(this.targetPose);
    const nextState = this.evaluateTargetPose(this.state, this.timer, now, this.targetPose);
    if (nextState !== this.state) {
      copyPose(this.blendFrom, this.outputPose);
      this.state = nextState;
      this.timer = 0;
      this.blendElapsed = 0;
      this.blendDuration = 0.08;
      resetPose(this.targetPose);
      this.evaluateTargetPose(this.state, 0, now, this.targetPose);
    }

    if (this.blendDuration > 0 && this.blendElapsed < this.blendDuration) {
      this.blendElapsed += safeDt;
      const k = easeOutCubic(this.blendElapsed / this.blendDuration);
      lerpPose(this.outputPose, this.blendFrom, this.targetPose, k);
    } else {
      copyPose(this.outputPose, this.targetPose);
    }

    return this.outputPose;
  }
}

/**
 * Shared forward-thrust ("planter le couteau") attack animation using ONLY the right knife hand.
 * Leaves the left arm (`leftArmPos`, `leftArmRot`) and whole-rig rotation/position untouched so
 * the off-hand never swings or participates in the knife strike.
 */
function evaluateStabAttack(
  state: 'attack1' | 'attack2',
  timer: number,
  knifeType: KnifeType,
  comboIndex: number,
  p: KnifeAnimPose
): KnifeAnimState {
  const isHeavy = state === 'attack2';
  const dur = isHeavy ? 0.48 : 0.34;
  const t = timer / dur;
  if (t >= 1) return 'idle';

  const isKarambit = knifeType === 'karambit';
  const alt = !isHeavy && comboIndex === 1 ? -1 : 1;

  // Wind-up & forward plunge coordinates aimed directly toward center crosshair
  const windPos: [number, number, number] = isHeavy
    ? [0.044, 0.022, 0.088]
    : [0.032, -0.014, 0.066];
  const windRot: [number, number, number] = isKarambit
    ? [0.22, -0.10, -0.14]
    : [0.20, 0.14 * alt, 0.22 * alt];

  const thrustPos: [number, number, number] = isHeavy
    ? [-0.125, 0.056, -0.265]
    : [-0.102, 0.046, -0.225];
  const thrustRot: [number, number, number] = isKarambit
    ? [-0.52, 0.18, 0.22]
    : [-0.42, -0.12 * alt, 0.36 * alt];

  const windEnd = isHeavy ? 0.22 : 0.17;
  const thrustEnd = isHeavy ? 0.45 : 0.40;
  const holdEnd = isHeavy ? 0.56 : 0.44;

  if (t < windEnd) {
    const k = easeOutCubic(t / windEnd);
    p.rightArmPos.set(windPos[0] * k, windPos[1] * k, windPos[2] * k);
    p.rightWristRot.set(windRot[0] * k, windRot[1] * k, windRot[2] * k);
  } else if (t < thrustEnd) {
    const k = easeOutQuart((t - windEnd) / (thrustEnd - windEnd));
    p.rightArmPos.set(
      THREE.MathUtils.lerp(windPos[0], thrustPos[0], k),
      THREE.MathUtils.lerp(windPos[1], thrustPos[1], k),
      THREE.MathUtils.lerp(windPos[2], thrustPos[2], k)
    );
    p.rightWristRot.set(
      THREE.MathUtils.lerp(windRot[0], thrustRot[0], k),
      THREE.MathUtils.lerp(windRot[1], thrustRot[1], k),
      THREE.MathUtils.lerp(windRot[2], thrustRot[2], k)
    );
    const impact = Math.sin(k * Math.PI);
    p.cameraPunch.pitch = (isHeavy ? -0.018 : -0.010) * impact;
    p.cameraPunch.roll = (isHeavy ? -0.008 : -0.005 * alt) * impact;
  } else if (t < holdEnd) {
    // Brief weighted settle while the blade is planted in the target
    const k = (t - thrustEnd) / (holdEnd - thrustEnd);
    const settleZ = THREE.MathUtils.lerp(thrustPos[2], thrustPos[2] + 0.024, k);
    p.rightArmPos.set(thrustPos[0], thrustPos[1], settleZ);
    p.rightWristRot.set(thrustRot[0], thrustRot[1], thrustRot[2]);
  } else {
    const k = 1 - easeOutCubic((t - holdEnd) / (1 - holdEnd));
    const startZ = thrustPos[2] + 0.024;
    p.rightArmPos.set(thrustPos[0] * k, thrustPos[1] * k, startZ * k);
    p.rightWristRot.set(thrustRot[0] * k, thrustRot[1] * k, thrustRot[2] * k);
  }

  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. KARAMBIT (Valorant Champions / Reaver / Prime Karambit)
// ─────────────────────────────────────────────────────────────────────────────

class KarambitAnimator extends ValorantKnifeAnimatorBase {
  readonly knifeType: KnifeType = 'karambit';

  protected evaluateTargetPose(
    state: KnifeAnimState,
    timer: number,
    now: number,
    p: KnifeAnimPose
  ): KnifeAnimState {
    switch (state) {
      case 'idle': {
        const t = now * 0.0014;
        p.rigPos.set(
          Math.sin(t * 0.95) * 0.0028,
          Math.sin(t * 1.45) * 0.0022,
          Math.cos(t * 0.72) * 0.0014
        );
        p.rigRot.set(
          Math.cos(t * 0.85) * 0.008,
          Math.sin(t * 0.65) * 0.012,
          Math.sin(t * 1.05) * 0.010
        );
        p.leftArmPos.set(Math.sin(t * 0.85 + 0.6) * 0.0022, Math.cos(t * 1.25 + 0.4) * 0.0022, 0);
        return 'idle';
      }

      case 'draw': {
        const dur = 0.58;
        const t = timer / dur;
        if (t >= 1) return 'idle';
        if (t < 0.78) {
          const k = t / 0.78;
          const ease = easeOutQuart(k);
          const inv = 1 - ease;
          const arc = Math.sin(k * Math.PI);
          p.rigPos.set(-0.065 * inv, -0.175 * inv + arc * 0.018, 0.045 * inv);
          p.rigRot.set(-0.14 * inv, 0.14 * inv, 0.16 * arc);
          // 1 tour serré autour de l'anneau passé à l'index avant fermeture du poing
          p.bladePlaneSpin = Math.PI * 2 * (1 - easeOutBack(k, 1.1));
          p.rightWristRot.set(0.18 * inv, -0.10 * arc, 0.16 * arc);
          p.indexCurlOffset = 0.58 * arc;
          p.leftArmPos.set(-0.03 * inv, -0.09 * inv, 0.02 * inv);
        } else {
          const k = (t - 0.78) / 0.22;
          const lock = dampedLockBounce(k);
          p.rigPos.y = -lock * 0.010;
          p.rightWristRot.x = -lock * 0.09;
        }
        return 'draw';
      }

      case 'inspect': {
        const dur = 1.85;
        const t = timer / dur;
        if (t >= 1) return 'idle';
        const focus =
          t < 0.16
            ? easeOutCubic(t / 0.16)
            : t > 0.82
            ? 1 - easeInOutCubic((t - 0.82) / 0.18)
            : 1;

        p.rigPos.set(-0.056 * focus, 0.026 * focus, 0.032 * focus);
        p.rigRot.set(0.06 * focus, -0.18 * focus, 0.10 * focus);
        p.leftArmPos.set(-0.03 * focus, -0.04 * focus, 0.018 * focus);

        if (t < 0.44) {
          // Double twirl Valorant autour de l'anneau sur le doigt
          const k = t / 0.44;
          p.bladePlaneSpin = Math.PI * 4 * (1 - easeInOutCubic(k));
          p.indexCurlOffset = 0.62 * Math.sin(k * Math.PI);
          p.rightWristRot.z = 0.18 * Math.sin(k * Math.PI);
        } else if (t < 0.80) {
          // Bascule lente du poignet pour montrer les deux côtés de la lame courbe
          const k = (t - 0.44) / 0.36;
          p.rightWristRot.set(
            Math.sin(k * Math.PI) * 0.22,
            Math.sin(k * Math.PI * 2) * 0.42,
            Math.sin(k * Math.PI * 2) * 0.32
          );
        } else {
          const k = (t - 0.80) / 0.20;
          p.bladePlaneSpin = Math.PI * 2 * (1 - easeOutBack(k, 1.05));
          p.indexCurlOffset = 0.45 * Math.sin(k * Math.PI);
        }
        return 'inspect';
      }

      case 'attack1':
      case 'attack2':
        return evaluateStabAttack(state, timer, this.knifeType, this.comboIndex, p);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BAÏONNETTE (Valorant Xenohunter / Recon — ferme en main, jamais jetée)
// ─────────────────────────────────────────────────────────────────────────────

class BaionnetteAnimator extends ValorantKnifeAnimatorBase {
  readonly knifeType: KnifeType = 'baionnette';

  protected evaluateTargetPose(
    state: KnifeAnimState,
    timer: number,
    now: number,
    p: KnifeAnimPose
  ): KnifeAnimState {
    switch (state) {
      case 'idle': {
        const t = now * 0.00105;
        p.rigPos.set(Math.sin(t * 0.72) * 0.0020, Math.sin(t * 1.15) * 0.0020, 0);
        p.rigRot.set(
          Math.cos(t * 0.68) * 0.006,
          Math.sin(t * 0.50) * 0.008,
          Math.sin(t * 0.80) * 0.006
        );
        p.leftArmPos.set(Math.sin(t * 0.68 + 0.8) * 0.0018, Math.cos(t * 1.05 + 0.5) * 0.0018, 0);
        return 'idle';
      }

      case 'draw': {
        // Montée commando Valorant (poing verrouillé sur le manche, rotation du poignet sans envol)
        const dur = 0.54;
        const t = timer / dur;
        if (t >= 1) return 'idle';
        if (t < 0.72) {
          const k = t / 0.72;
          const ease = easeOutQuart(k);
          const inv = 1 - ease;
          const arc = Math.sin(k * Math.PI);
          p.rightArmPos.set(0.068 * inv, -0.19 * inv, 0.055 * inv);
          p.rightWristRot.set(-0.42 * inv, 0.36 * inv, 0.85 * inv);
          p.rigRot.set(0.08 * inv, -0.14 * inv, -0.12 * arc);
          p.leftArmPos.set(-0.04 * inv, -0.10 * inv, 0.025 * inv);
        } else {
          const k = (t - 0.72) / 0.28;
          const lock = dampedLockBounce(k);
          p.rightArmPos.y = -lock * 0.012;
          p.rightWristRot.x = -lock * 0.12;
          p.rigRot.x = -lock * 0.04;
        }
        return 'draw';
      }

      case 'inspect': {
        // Inspection Valorant Xenohunter : tourne le poignet des 2 côtés tout en gardant la main soudée
        const dur = 1.90;
        const t = timer / dur;
        if (t >= 1) return 'idle';
        const focus =
          t < 0.18
            ? easeOutCubic(t / 0.18)
            : t > 0.82
            ? 1 - easeInOutCubic((t - 0.82) / 0.18)
            : 1;

        p.rightArmPos.set(-0.062 * focus, 0.028 * focus, 0.032 * focus);
        p.rigRot.set(0.04 * focus, -0.18 * focus, 0.05 * focus);
        p.leftArmPos.set(-0.035 * focus, -0.045 * focus, 0.02 * focus);

        if (t < 0.45) {
          const k = easeInOutCubic(t / 0.45);
          p.rightWristRot.set(0.18 * k, -0.22 * k, 0.72 * k);
        } else if (t < 0.75) {
          const k = easeInOutCubic((t - 0.45) / 0.30);
          p.rightWristRot.set(
            THREE.MathUtils.lerp(0.18, -0.16, k),
            THREE.MathUtils.lerp(-0.22, 0.34, k),
            THREE.MathUtils.lerp(0.72, -0.68, k)
          );
        } else {
          const k = 1 - easeInOutCubic((t - 0.75) / 0.25);
          p.rightWristRot.set(-0.16 * k, 0.34 * k, -0.68 * k);
        }
        return 'inspect';
      }

      case 'attack1':
      case 'attack2':
        return evaluateStabAttack(state, timer, this.knifeType, this.comboIndex, p);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. KATANA (Valorant Oni 2.0 / RGX Katana — iaido unsheathe & kesa-giri)
// ─────────────────────────────────────────────────────────────────────────────

class KatanaAnimator extends ValorantKnifeAnimatorBase {
  readonly knifeType: KnifeType = 'katana';

  protected evaluateTargetPose(
    state: KnifeAnimState,
    timer: number,
    now: number,
    p: KnifeAnimPose
  ): KnifeAnimState {
    switch (state) {
      case 'idle': {
        const t = now * 0.00095;
        p.rigPos.set(Math.sin(t * 0.65) * 0.0022, Math.sin(t * 1.05) * 0.0024, 0);
        p.rigRot.set(
          Math.cos(t * 0.60) * 0.007,
          Math.sin(t * 0.45) * 0.009,
          Math.sin(t * 0.72) * 0.006
        );
        p.leftArmPos.set(Math.sin(t * 0.75 + 0.5) * 0.0024, Math.cos(t * 1.1 + 0.3) * 0.0024, 0);
        return 'idle';
      }

      case 'draw': {
        // Dégainage iaido Valorant Oni Katana : traversée bas-gauche -> garde diagonale droite
        const dur = 0.68;
        const t = timer / dur;
        if (t >= 1) return 'idle';
        if (t < 0.76) {
          const k = t / 0.76;
          const ease = easeOutQuart(k);
          const inv = 1 - ease;
          const arc = Math.sin(k * Math.PI);
          p.rightArmPos.set(-0.14 * inv, -0.18 * inv + arc * 0.025, 0.04 * inv);
          p.rightWristRot.set(0.28 * inv, 0.52 * inv, 0.64 * inv);
          p.rigRot.set(0.10 * inv, 0.24 * inv, 0.22 * inv);
          p.leftArmPos.set(0.05 * inv, -0.09 * inv, 0.03 * inv);
          p.leftArmRot.set(0.15 * arc, 0.12 * arc, -0.18 * arc);
        } else {
          const k = (t - 0.76) / 0.24;
          const lock = dampedLockBounce(k);
          p.rightArmPos.y = -lock * 0.015;
          p.rightWristRot.x = -lock * 0.10;
          p.rigRot.z = -lock * 0.04;
        }
        return 'draw';
      }

      case 'inspect': {
        // Inspection Oni Katana : longue présentation inclinée de la lame & de la garde Onimaru
        const dur = 2.20;
        const t = timer / dur;
        if (t >= 1) return 'idle';
        const focus =
          t < 0.18
            ? easeOutCubic(t / 0.18)
            : t > 0.82
            ? 1 - easeInOutCubic((t - 0.82) / 0.18)
            : 1;

        p.rightArmPos.set(-0.088 * focus, 0.038 * focus, 0.040 * focus);
        p.rigRot.set(0.06 * focus, -0.22 * focus, 0.08 * focus);
        p.leftArmPos.set(-0.025 * focus, -0.045 * focus, 0.015 * focus);

        if (t < 0.48) {
          const k = easeInOutCubic(t / 0.48);
          p.rightWristRot.set(0.22 * k, -0.30 * k, 0.68 * k);
        } else if (t < 0.78) {
          const k = easeInOutCubic((t - 0.48) / 0.30);
          p.rightWristRot.set(
            THREE.MathUtils.lerp(0.22, -0.12, k),
            THREE.MathUtils.lerp(-0.30, 0.36, k),
            THREE.MathUtils.lerp(0.68, -0.58, k)
          );
        } else {
          const k = 1 - easeInOutCubic((t - 0.78) / 0.22);
          p.rightWristRot.set(-0.12 * k, 0.36 * k, -0.58 * k);
        }
        return 'inspect';
      }

      case 'attack1':
      case 'attack2':
        return evaluateStabAttack(state, timer, this.knifeType, this.comboIndex, p);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DAGUE / COUTEAU TACTIQUE (Valorant VCT / Kunai — rapide, précis, sans vol)
// ─────────────────────────────────────────────────────────────────────────────

class DaggerAnimator extends ValorantKnifeAnimatorBase {
  readonly knifeType: KnifeType;

  constructor(type: KnifeType = 'dague') {
    super();
    this.knifeType = type;
  }

  protected evaluateTargetPose(
    state: KnifeAnimState,
    timer: number,
    now: number,
    p: KnifeAnimPose
  ): KnifeAnimState {
    switch (state) {
      case 'idle': {
        const t = now * 0.00125;
        p.rigPos.set(
          Math.sin(t) * 0.0028,
          Math.sin(t * 1.9) * 0.0018,
          Math.cos(t * 0.8) * 0.0014
        );
        p.rigRot.set(
          Math.cos(t * 0.9) * 0.008,
          Math.sin(t * 0.75) * 0.010,
          Math.sin(t * 1.1) * 0.009
        );
        p.leftArmPos.set(Math.sin(t + 0.5) * 0.0020, Math.cos(t * 1.4) * 0.0020, 0);
        return 'idle';
      }

      case 'draw': {
        // Sortie nerveuse VCT depuis la hanche avec pivot souple du poignet verrouillé dans la main
        const dur = 0.50;
        const t = timer / dur;
        if (t >= 1) return 'idle';
        if (t < 0.76) {
          const k = t / 0.76;
          const ease = easeOutQuart(k);
          const inv = 1 - ease;
          p.rightArmPos.set(-0.10 * inv, -0.19 * inv, 0.048 * inv);
          p.rightWristRot.set(0.22 * inv, 0.42 * inv, -0.78 * inv);
          p.rigRot.set(0.08 * inv, 0.16 * inv, 0.18 * inv);
          p.leftArmPos.set(-0.035 * inv, -0.095 * inv, 0.02 * inv);
        } else {
          const k = (t - 0.76) / 0.24;
          const lock = dampedLockBounce(k);
          p.rightArmPos.y = -lock * 0.010;
          p.rightWristRot.z = lock * 0.09;
          p.rigRot.z = lock * 0.03;
        }
        return 'draw';
      }

      case 'inspect': {
        // Inspection Valorant VCT : présente l'emblème central puis pivote l'autre face du damas
        const dur = 1.80;
        const t = timer / dur;
        if (t >= 1) return 'idle';
        const focus =
          t < 0.16
            ? easeOutCubic(t / 0.16)
            : t > 0.82
            ? 1 - easeInOutCubic((t - 0.82) / 0.18)
            : 1;

        p.rightArmPos.set(-0.058 * focus, 0.028 * focus, 0.030 * focus);
        p.rigRot.set(0.06 * focus, -0.18 * focus, 0.08 * focus);
        p.leftArmPos.set(-0.032 * focus, -0.038 * focus, 0.018 * focus);

        if (t < 0.45) {
          const k = easeInOutCubic(t / 0.45);
          p.rightWristRot.set(0.16 * k, -0.28 * k, 0.85 * k);
        } else if (t < 0.76) {
          const k = easeInOutCubic((t - 0.45) / 0.31);
          p.rightWristRot.set(
            THREE.MathUtils.lerp(0.16, -0.12, k),
            THREE.MathUtils.lerp(-0.28, 0.34, k),
            THREE.MathUtils.lerp(0.85, -0.52, k)
          );
        } else {
          const k = 1 - easeInOutCubic((t - 0.76) / 0.24);
          p.rightWristRot.set(-0.12 * k, 0.34 * k, -0.52 * k);
        }
        return 'inspect';
      }

      case 'attack1':
      case 'attack2':
        return evaluateStabAttack(state, timer, this.knifeType, this.comboIndex, p);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory & Alignement anatomique verrouillé dans la main
// ─────────────────────────────────────────────────────────────────────────────

export function createKnifeAnimator(knifeType: KnifeType): KnifeAnimator {
  if (knifeType === 'karambit') return new KarambitAnimator();
  if (knifeType === 'baionnette') return new BaionnetteAnimator();
  if (knifeType === 'katana') return new KatanaAnimator();
  return new DaggerAnimator(knifeType === 'dague' ? 'dague' : 'couteau');
}

function getRightFistBasis(hands: FPSHandsRig) {
  const rightHandObj = hands.rightArm.getObjectByName('right_hand');
  const handRot = rightHandObj ? rightHandObj.rotation : new THREE.Euler();
  const fistCenter = new THREE.Vector3(-0.002, -0.013, -0.014)
    .applyEuler(handRot)
    .add(hands.rightArm.position);
  const indexCenter = new THREE.Vector3(-0.017, -0.013, -0.014)
    .applyEuler(handRot)
    .add(hands.rightArm.position);
  const pinkyCenter = new THREE.Vector3(0.017, -0.013, -0.014)
    .applyEuler(handRot)
    .add(hands.rightArm.position);
  const handHandleAxis = new THREE.Vector3().subVectors(indexCenter, pinkyCenter).normalize();
  return { rightHandObj, handRot, fistCenter, handHandleAxis };
}

/**
 * Aligne géométriquement la poignée de CHAQUE couteau (Karambit, Baïonnette, Katana, Dague)
 * coaxialement DANS le creux du poing et des doigts repliés (`handHandleAxis`).
 */
export function alignBladeWeaponToFist(
  weaponGroup: THREE.Group,
  archetype: WeaponArchetype,
  hands: FPSHandsRig,
  weaponCfg: FPSWeaponViewConfig,
  gripMeta?: WeaponGripMeta
): void {
  const { handRot, fistCenter, handHandleAxis } = getRightFistBasis(hands);

  const meta: WeaponGripMeta =
    gripMeta ??
    (archetype === 'karambit'
      ? {
          gripLocalPos: [0.68, 0.36, 0],
          handleAxis: [1, 0, 0],
          bladeDir: [0, -1, 0],
        }
      : {
          gripLocalPos: [-1.15, -0.06, 0],
          handleAxis: [1, 0, 0],
          bladeDir: [0, 1, 0],
        });

  const srcHandle = new THREE.Vector3(...meta.handleAxis).normalize();
  const rawBlade = new THREE.Vector3(...meta.bladeDir);
  rawBlade.addScaledVector(srcHandle, -rawBlade.dot(srcHandle));
  if (rawBlade.lengthSq() < 1e-6) {
    rawBlade
      .set(0, Math.abs(srcHandle.y) < 0.9 ? 1 : 0, Math.abs(srcHandle.y) >= 0.9 ? 1 : 0)
      .addScaledVector(srcHandle, -srcHandle.dot(new THREE.Vector3(0, 1, 0)));
  }
  const srcBlade = rawBlade.normalize();
  const srcNormal = new THREE.Vector3().crossVectors(srcHandle, srcBlade).normalize();
  const mSrc = new THREE.Matrix4().makeBasis(srcHandle, srcBlade, srcNormal);

  let mTarget: THREE.Matrix4;
  if (archetype === 'karambit') {
    // Prise inversée : manche coaxial aux doigts (pinky -> index), face plate posée sur la paume et tranchant vers l'avant-gauche
    const desiredBladeRaw = new THREE.Vector3(-0.62, 0.34, -0.71).normalize();
    const handBladeDir = desiredBladeRaw
      .clone()
      .addScaledVector(handHandleAxis, -desiredBladeRaw.dot(handHandleAxis))
      .normalize();
    const handNormal = new THREE.Vector3().crossVectors(handHandleAxis, handBladeDir).normalize();
    mTarget = new THREE.Matrix4().makeBasis(handHandleAxis, handBladeDir, handNormal);
  } else {
    // Prise sabre / Valorant : le manche suit exactement le tunnel des doigts (pinky -> index),
    // dos de la lame (+bladeDir) vers le côté pouce/poignet (+Z local main), tranchant (-bladeDir) vers les phalanges (-Z local main).
    const rawDorsal = new THREE.Vector3(0, 0, 1).applyEuler(handRot);
    const handBladeDir = rawDorsal
      .clone()
      .addScaledVector(handHandleAxis, -rawDorsal.dot(handHandleAxis))
      .normalize();
    const handNormal = new THREE.Vector3().crossVectors(handHandleAxis, handBladeDir).normalize();
    mTarget = new THREE.Matrix4().makeBasis(handHandleAxis, handBladeDir, handNormal);
  }

  const mRot = new THREE.Matrix4().multiplyMatrices(mTarget, mSrc.transpose());
  const q = new THREE.Quaternion().setFromRotationMatrix(mRot);

  const fitScale =
    archetype === 'karambit' && meta.handleThicknessLocal && meta.handleThicknessLocal > 0.2
      ? THREE.MathUtils.clamp(0.029 / meta.handleThicknessLocal, 0.026, 0.042)
      : weaponCfg.scale;

  weaponGroup.quaternion.copy(q);
  weaponGroup.scale.setScalar(fitScale);
  const gripOffset = new THREE.Vector3(...meta.gripLocalPos)
    .multiplyScalar(fitScale)
    .applyQuaternion(q);
  weaponGroup.position.copy(fistCenter).sub(gripOffset);
}

/**
 * Capture la matrice exacte de la main droite au repos et les pivots locaux (paume + anneau)
 * afin de verrouiller rigidement le couteau dans la main sur toutes les animations.
 */
export function captureKnifeRigRestData(
  archetype: WeaponArchetype,
  weaponCfg: FPSWeaponViewConfig,
  hands: FPSHandsRig,
  weaponGroup?: THREE.Group,
  gripMeta?: WeaponGripMeta
): KnifeRigRestData {
  const muzzleSide = getWeaponMuzzleSide(archetype);
  const baseHolds = getBaseArmHolds(archetype);
  const weaponQuat = weaponGroup
    ? weaponGroup.quaternion.clone()
    : new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          weaponCfg.weaponRotOffset[0],
          (muzzleSide === 'left' ? -Math.PI / 2 : Math.PI / 2) + weaponCfg.weaponRotOffset[1],
          weaponCfg.weaponRotOffset[2]
        )
      );

  let planeNormal: THREE.Vector3;
  let lengthAxis: THREE.Vector3;
  let edgeAxis: THREE.Vector3;

  if (gripMeta) {
    const hAx = new THREE.Vector3(...gripMeta.handleAxis).normalize();
    const bDirRaw = new THREE.Vector3(...gripMeta.bladeDir);
    bDirRaw.addScaledVector(hAx, -bDirRaw.dot(hAx));
    const bDir = bDirRaw.lengthSq() > 1e-6 ? bDirRaw.normalize() : new THREE.Vector3(0, 1, 0);
    const localPlaneNorm =
      archetype === 'karambit'
        ? new THREE.Vector3().crossVectors(bDir, hAx).normalize()
        : new THREE.Vector3().crossVectors(hAx, bDir).normalize();
    planeNormal = localPlaneNorm.applyQuaternion(weaponQuat).normalize();
    lengthAxis = hAx
      .clone()
      .multiplyScalar(archetype === 'karambit' ? -1 : 1)
      .applyQuaternion(weaponQuat)
      .normalize();
    edgeAxis = bDir.clone().applyQuaternion(weaponQuat).normalize();
  } else {
    planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(weaponQuat).normalize();
    lengthAxis = new THREE.Vector3(muzzleSide === 'left' ? -1 : 1, 0, 0)
      .applyQuaternion(weaponQuat)
      .normalize();
    edgeAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(weaponQuat).normalize();
  }

  const { rightHandObj, fistCenter } = getRightFistBasis(hands);
  const handRestMatrix = new THREE.Matrix4().compose(
    hands.rightArm.position.clone(),
    rightHandObj ? rightHandObj.quaternion.clone() : new THREE.Quaternion(),
    new THREE.Vector3(1, 1, 1)
  );
  const handRestMatrixInv = handRestMatrix.clone().invert();

  let ringPivot: THREE.Vector3;
  if (archetype === 'karambit' && weaponGroup) {
    weaponGroup.updateMatrix();
    if (gripMeta?.ringLocalPos) {
      ringPivot = new THREE.Vector3(...gripMeta.ringLocalPos).applyMatrix4(weaponGroup.matrix);
    } else if (gripMeta) {
      const hAx = new THREE.Vector3(...gripMeta.handleAxis).normalize();
      const approxLocalRing = new THREE.Vector3(...gripMeta.gripLocalPos).addScaledVector(hAx, 0.85);
      ringPivot = approxLocalRing.applyMatrix4(weaponGroup.matrix);
    } else {
      ringPivot = fistCenter.clone().addScaledVector(lengthAxis, -0.048);
    }
  } else {
    ringPivot = fistCenter.clone();
  }

  return {
    archetype,
    gripPivot: fistCenter,
    ringPivot,
    planeNormal,
    lengthAxis,
    edgeAxis,
    baseRightHold: {
      ...baseHolds.right,
      handPos: [...baseHolds.right.handPos],
      handRot: [...baseHolds.right.handRot],
      shoulderTarget: [...baseHolds.right.shoulderTarget],
      thumbRot: baseHolds.right.thumbRot ? [...baseHolds.right.thumbRot] : undefined,
    },
    baseLeftHold: {
      ...baseHolds.left,
      handPos: [...baseHolds.left.handPos],
      handRot: [...baseHolds.left.handRot],
      shoulderTarget: [...baseHolds.left.shoulderTarget],
      thumbRot: baseHolds.left.thumbRot ? [...baseHolds.left.thumbRot] : undefined,
    },
    handRestMatrixInv,
    baseLeftArmPos: hands.leftArm.position.clone(),
    baseLeftArmRot: hands.leftArm.rotation.clone(),
    baseRightHandRot: rightHandObj ? rightHandObj.rotation.clone() : new THREE.Euler(),
  };
}

const _qHandCur = new THREE.Quaternion();
const _mHandCur = new THREE.Matrix4();
const _mHandDelta = new THREE.Matrix4();
const _mSpin = new THREE.Matrix4();
const _mPivotSpin = new THREE.Matrix4();
const _mMount = new THREE.Matrix4();
const _tPlus = new THREE.Matrix4();
const _tMinus = new THREE.Matrix4();
const _unitScale = new THREE.Vector3(1, 1, 1);
const _qSpin = new THREE.Quaternion();
const _qPlane = new THREE.Quaternion();
const _qAxis = new THREE.Quaternion();
const _qEdge = new THREE.Quaternion();

/**
 * Applique l'animation Valorant au rig, aux deux bras IK (`setArmPose`), puis verrouille
 * `weaponMount` exactement sur la matrice courante de `right_hand` afin qu'aucun couteau
 * ne quitte jamais la main ni ne flotte dans le vide.
 */
export function applyKnifeAnimPose(
  viewModelRig: THREE.Group,
  weaponMount: THREE.Group,
  hands: FPSHandsRig,
  rest: KnifeRigRestData,
  baseRigPos: [number, number, number],
  baseRigRot: [number, number, number],
  pose: KnifeAnimPose,
  walkBobX = 0,
  walkBobY = 0
): void {
  viewModelRig.position.set(
    baseRigPos[0] + walkBobX + pose.rigPos.x,
    baseRigPos[1] + walkBobY + pose.rigPos.y,
    baseRigPos[2] + pose.rigPos.z
  );

  viewModelRig.rotation.set(
    baseRigRot[0] + pose.rigRot.x,
    baseRigRot[1] + pose.rigRot.y,
    baseRigRot[2] + pose.rigRot.z
  );

  const baseIdxCurl = rest.baseRightHold.indexCurl ?? rest.baseRightHold.proxCurl;
  const relaxedIdxCurl = THREE.MathUtils.clamp(baseIdxCurl + pose.indexCurlOffset, -1.68, -0.35);

  hands.setArmPose('right', {
    ...rest.baseRightHold,
    handPos: [
      rest.baseRightHold.handPos[0] + pose.rightArmPos.x,
      rest.baseRightHold.handPos[1] + pose.rightArmPos.y,
      rest.baseRightHold.handPos[2] + pose.rightArmPos.z,
    ],
    handRot: [
      rest.baseRightHold.handRot[0] + pose.rightWristRot.x,
      rest.baseRightHold.handRot[1] + pose.rightWristRot.y,
      rest.baseRightHold.handRot[2] + pose.rightWristRot.z,
    ],
    indexCurl: relaxedIdxCurl,
  });

  hands.setArmPose('left', {
    ...rest.baseLeftHold,
    handPos: [
      rest.baseLeftHold.handPos[0] + pose.leftArmPos.x,
      rest.baseLeftHold.handPos[1] + pose.leftArmPos.y,
      rest.baseLeftHold.handPos[2] + pose.leftArmPos.z,
    ],
    handRot: [
      rest.baseLeftHold.handRot[0] + pose.leftArmRot.x,
      rest.baseLeftHold.handRot[1] + pose.leftArmRot.y,
      rest.baseLeftHold.handRot[2] + pose.leftArmRot.z,
    ],
  });

  const rightHandObj = hands.rightArm.getObjectByName('right_hand');
  if (rightHandObj) {
    _qHandCur.setFromEuler(rightHandObj.rotation);
    _mHandCur.compose(hands.rightArm.position, _qHandCur, _unitScale);
  } else {
    _mHandCur.compose(hands.rightArm.position, _qHandCur.identity(), _unitScale);
  }

  _mHandDelta.multiplyMatrices(_mHandCur, rest.handRestMatrixInv);

  const hasPlaneSpin = Math.abs(pose.bladePlaneSpin) > 1e-6;
  const hasPalmTilt = Math.abs(pose.bladeAxisRoll) > 1e-6 || Math.abs(pose.bladeEdgeTilt) > 1e-6;

  if (hasPlaneSpin || hasPalmTilt) {
    const spinPivot = rest.archetype === 'karambit' && hasPlaneSpin ? rest.ringPivot : rest.gripPivot;
    _qPlane.setFromAxisAngle(rest.planeNormal, pose.bladePlaneSpin);
    _qAxis.setFromAxisAngle(rest.lengthAxis, pose.bladeAxisRoll);
    _qEdge.setFromAxisAngle(rest.edgeAxis, pose.bladeEdgeTilt);
    _qSpin.copy(_qPlane).multiply(_qAxis).multiply(_qEdge);

    _tPlus.makeTranslation(spinPivot.x, spinPivot.y, spinPivot.z);
    _mSpin.makeRotationFromQuaternion(_qSpin);
    _tMinus.makeTranslation(-spinPivot.x, -spinPivot.y, -spinPivot.z);
    _mPivotSpin.multiplyMatrices(_tPlus, _mSpin).multiply(_tMinus);
    _mMount.multiplyMatrices(_mHandDelta, _mPivotSpin);
  } else {
    _mMount.copy(_mHandDelta);
  }

  _mMount.decompose(weaponMount.position, weaponMount.quaternion, weaponMount.scale);
  weaponMount.scale.set(1, 1, 1);
}
