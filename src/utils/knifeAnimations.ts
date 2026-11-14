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
  protected idleTime = 0;
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
      resetPose(this.blendFrom);
      resetPose(this.outputPose);
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
      if (this.state === 'idle' && this.idleTime > 0.85) {
        this.comboIndex = 1;
      } else {
        this.comboIndex = (this.comboIndex + 1) % 2;
      }
    }
    this.beginState(secondary ? 'attack2' : 'attack1', 0.04);
    // Clamp blade immediately into palm on attack start so interrupting a Karambit ring-spin never leaves a spin residual
    this.blendFrom.bladePlaneSpin = 0;
    this.blendFrom.bladeAxisRoll = 0;
    this.blendFrom.bladeEdgeTilt = 0;
    this.blendFrom.indexCurlOffset = 0;
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
    if (this.state === 'idle') {
      this.idleTime += safeDt;
    } else {
      this.idleTime = 0;
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// 1. KARAMBIT (Valorant Champions 2021 / Reaver / Prime//2.0 Karambit)
//    • Prise inversée (griffe vers l'avant-bas, index dans l'anneau supérieur)
//    • Equip : sortie basse + spin rapide 360° autour de l'anneau + verrouillage paume
//    • Inspect : double twirl fluide (720°) sur l'index + admire recto/verso + flick final
//    • Attack1 : combo 2 coups Valorant (crochet intérieur droite->gauche puis revers gauche->droite)
//    • Attack2 : attaque lourde Valorant (élan haut puis fente crochetée profonde au centre)
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
        const t = now * 0.00145;
        p.rigPos.set(
          Math.sin(t * 0.95) * 0.0028,
          Math.sin(t * 1.50) * 0.0022,
          Math.cos(t * 0.75) * 0.0014
        );
        p.rigRot.set(
          Math.cos(t * 0.85) * 0.008,
          Math.sin(t * 0.65) * 0.012,
          Math.sin(t * 1.05) * 0.010
        );
        p.rightWristRot.set(
          Math.sin(t * 0.90) * 0.010,
          Math.cos(t * 0.70) * 0.012,
          Math.sin(t * 1.15) * 0.014
        );
        p.leftArmPos.set(
          Math.sin(t * 0.85 + 0.6) * 0.0024,
          Math.cos(t * 1.25 + 0.4) * 0.0022,
          0
        );
        return 'idle';
      }

      case 'draw': {
        // Valorant Champions 2021 / Reaver Karambit Equip :
        // Tiré depuis la hanche gauche -> engagement de l'index dans l'anneau -> whip-spin 360° -> clap dans la paume
        const dur = 0.62;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        if (t < 0.16) {
          // Phase 1 : montée rapide depuis le bas-gauche + ouverture de l'index pour libérer l'anneau
          const k = easeOutCubic(t / 0.16);
          const inv = 1 - k * 0.32;
          p.rigPos.set(-0.072 * inv, -0.185 * (1 - k * 0.45), 0.048 * inv);
          p.rigRot.set(-0.16 * inv, 0.16 * inv, 0.12 * k);
          p.rightArmPos.set(-0.028 * (1 - k * 0.4), -0.065 * (1 - k * 0.5), 0.024 * (1 - k * 0.4));
          p.rightWristRot.set(0.24 * inv, -0.14 * k, 0.18 * k);
          p.bladePlaneSpin = Math.PI * 2 * (1 - 0.12 * k);
          p.indexCurlOffset = 0.64 * k;
          p.leftArmPos.set(-0.035 * inv, -0.095 * (1 - k * 0.4), 0.022 * inv);
        } else if (t < 0.78) {
          // Phase 2 : spin vertical/diagonal rapide autour de l'anneau de l'index (style Valorant Reaver/Champions)
          const k = (t - 0.16) / 0.62;
          const ease = easeOutQuart(k);
          const inv = 1 - ease;
          const arc = Math.sin(k * Math.PI);
          p.rigPos.set(-0.049 * inv, -0.102 * inv + arc * 0.022, 0.033 * inv);
          p.rigRot.set(-0.11 * inv, 0.11 * inv, 0.18 * arc);
          p.rightArmPos.set(-0.017 * inv + arc * 0.012, -0.032 * inv + arc * 0.018, 0.014 * inv);
          p.rightWristRot.set(
            0.16 * inv - 0.08 * arc,
            -0.14 * arc,
            0.22 * arc
          );
          p.bladePlaneSpin = Math.PI * 2 * 0.88 * (1 - easeOutBack(k, 1.12));
          p.indexCurlOffset = 0.66 * Math.sin((0.15 + 0.85 * (1 - k)) * Math.PI * 0.5);
          p.leftArmPos.set(-0.024 * inv, -0.057 * inv + arc * 0.014, 0.015 * inv);
          p.leftArmRot.set(0.10 * arc, 0.08 * arc, -0.12 * arc);
        } else {
          // Phase 3 : verrouillage sec de la poignée dans la paume (reverse-grip lock)
          const k = (t - 0.78) / 0.22;
          const lock = dampedLockBounce(k);
          p.rigPos.y = -lock * 0.012;
          p.rigRot.z = -lock * 0.035;
          p.rightArmPos.y = -lock * 0.008;
          p.rightWristRot.set(-lock * 0.11, lock * 0.05, -lock * 0.08);
          p.cameraPunch.pitch = -lock * 0.004;
          p.cameraPunch.roll = lock * 0.003;
        }
        return 'draw';
      }

      case 'inspect': {
        // Valorant Champions 2021 Karambit Inspect :
        // Présentation au centre -> double spin fluide sur l'index (720°) avec pompage du poignet ->
        // bascule d'admiration recto/verso de la griffe -> flick 360° final de reprise en main
        const dur = 2.05;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const focus =
          t < 0.14
            ? easeOutCubic(t / 0.14)
            : t > 0.86
            ? 1 - easeInOutCubic((t - 0.86) / 0.14)
            : 1;

        p.rigPos.set(-0.058 * focus, 0.028 * focus, 0.034 * focus);
        p.rigRot.set(0.06 * focus, -0.19 * focus, 0.10 * focus);
        p.leftArmPos.set(-0.032 * focus, -0.044 * focus, 0.020 * focus);
        p.leftArmRot.set(-0.08 * focus, 0.10 * focus, -0.12 * focus);

        if (t < 0.44) {
          // Phase 1 : double twirl continu (4π) autour de l'anneau avec impulsion circulaire du poignet
          const k = t / 0.44;
          const spinProgress = easeInOutCubic(k);
          const pump = Math.sin(k * Math.PI * 2);
          const env = Math.sin(k * Math.PI);
          p.bladePlaneSpin = Math.PI * 4 * (1 - spinProgress);
          p.indexCurlOffset = 0.66 * env;
          p.rightArmPos.set(
            -0.018 * env + 0.010 * pump,
            0.016 * env + 0.012 * Math.cos(k * Math.PI * 2),
            0.012 * env
          );
          p.rightWristRot.set(
            0.14 * env,
            -0.16 * pump * env,
            0.24 * env + 0.12 * pump
          );
        } else if (t < 0.78) {
          // Phase 2 : pause stylée Valorant — inclinaison recto/verso de la griffe en prise inversée
          const k = (t - 0.44) / 0.34;
          const env = Math.sin(k * Math.PI);
          const sway = Math.sin(k * Math.PI * 2);
          p.bladePlaneSpin = 0;
          p.indexCurlOffset = 0.08 * env;
          p.rightArmPos.set(-0.022 * env, 0.018 * env, 0.016 * env);
          p.rightWristRot.set(
            0.26 * env,
            0.46 * sway,
            0.36 * sway
          );
        } else {
          // Phase 3 : flick de fermeture (2π) autour de l'anneau et claquement dans le poing
          const k = (t - 0.78) / 0.22;
          const env = Math.sin(k * Math.PI);
          p.bladePlaneSpin = Math.PI * 2 * (1 - easeOutBack(k, 1.08));
          p.indexCurlOffset = 0.52 * env;
          p.rightArmPos.set(-0.014 * env, 0.012 * env, 0.008 * env);
          p.rightWristRot.set(-0.12 * env, 0.14 * env, 0.20 * env);
        }
        return 'inspect';
      }

      case 'attack1': {
        // Valorant Karambit Primary Combo (2 coups alternés ultra-nerveux en prise inversée)
        const dur = 0.35;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const isFirstHit = this.comboIndex === 1;
        if (isFirstHit) {
          // Coup 1 : crochet intérieur rapide droite -> gauche + fente avant vers le réticule
          const windPos: [number, number, number] = [0.054, 0.026, 0.056];
          const windRot: [number, number, number] = [0.26, -0.30, -0.42];
          const slashPos: [number, number, number] = [-0.138, 0.032, -0.228];
          const slashRot: [number, number, number] = [-0.52, 0.42, 0.58];

          if (t < 0.17) {
            const k = easeOutCubic(t / 0.17);
            p.rightArmPos.set(windPos[0] * k, windPos[1] * k, windPos[2] * k);
            p.rightWristRot.set(windRot[0] * k, windRot[1] * k, windRot[2] * k);
          } else if (t < 0.44) {
            const k = easeOutQuart((t - 0.17) / 0.27);
            const arc = Math.sin(k * Math.PI);
            p.rightArmPos.set(
              THREE.MathUtils.lerp(windPos[0], slashPos[0], k),
              THREE.MathUtils.lerp(windPos[1], slashPos[1], k) + arc * 0.024,
              THREE.MathUtils.lerp(windPos[2], slashPos[2], k)
            );
            p.rightWristRot.set(
              THREE.MathUtils.lerp(windRot[0], slashRot[0], k),
              THREE.MathUtils.lerp(windRot[1], slashRot[1], k),
              THREE.MathUtils.lerp(windRot[2], slashRot[2], k)
            );
            p.cameraPunch.pitch = -0.011 * arc;
            p.cameraPunch.roll = 0.008 * arc;
          } else {
            const k = 1 - easeOutCubic((t - 0.44) / 0.56);
            p.rightArmPos.set(slashPos[0] * k, slashPos[1] * k, slashPos[2] * k);
            p.rightWristRot.set(slashRot[0] * k, slashRot[1] * k, slashRot[2] * k);
          }
        } else {
          // Coup 2 : revers extérieur fulgurant gauche -> droite en remontant à travers le réticule
          const windPos: [number, number, number] = [-0.088, -0.028, 0.048];
          const windRot: [number, number, number] = [0.20, 0.38, 0.48];
          const slashPos: [number, number, number] = [0.086, 0.052, -0.222];
          const slashRot: [number, number, number] = [-0.46, -0.38, -0.54];

          if (t < 0.16) {
            const k = easeOutCubic(t / 0.16);
            p.rightArmPos.set(windPos[0] * k, windPos[1] * k, windPos[2] * k);
            p.rightWristRot.set(windRot[0] * k, windRot[1] * k, windRot[2] * k);
          } else if (t < 0.43) {
            const k = easeOutQuart((t - 0.16) / 0.27);
            const arc = Math.sin(k * Math.PI);
            p.rightArmPos.set(
              THREE.MathUtils.lerp(windPos[0], slashPos[0], k),
              THREE.MathUtils.lerp(windPos[1], slashPos[1], k) + arc * 0.022,
              THREE.MathUtils.lerp(windPos[2], slashPos[2], k)
            );
            p.rightWristRot.set(
              THREE.MathUtils.lerp(windRot[0], slashRot[0], k),
              THREE.MathUtils.lerp(windRot[1], slashRot[1], k),
              THREE.MathUtils.lerp(windRot[2], slashRot[2], k)
            );
            p.cameraPunch.pitch = -0.011 * arc;
            p.cameraPunch.roll = -0.008 * arc;
          } else {
            const k = 1 - easeOutCubic((t - 0.43) / 0.57);
            p.rightArmPos.set(slashPos[0] * k, slashPos[1] * k, slashPos[2] * k);
            p.rightWristRot.set(slashRot[0] * k, slashRot[1] * k, slashRot[2] * k);
          }
        }
        return 'attack1';
      }

      case 'attack2': {
        // Valorant Karambit Heavy Attack (clic droit) :
        // Armement haut de l'épaule puis fente plongeante déchirante avec la griffe au centre de l'écran
        const dur = 0.50;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const windPos: [number, number, number] = [0.062, 0.048, 0.088];
        const windRot: [number, number, number] = [0.36, -0.22, -0.34];
        const plungePos: [number, number, number] = [-0.128, 0.052, -0.268];
        const plungeRot: [number, number, number] = [-0.62, 0.28, 0.42];

        if (t < 0.22) {
          const k = easeOutCubic(t / 0.22);
          p.rightArmPos.set(windPos[0] * k, windPos[1] * k, windPos[2] * k);
          p.rightWristRot.set(windRot[0] * k, windRot[1] * k, windRot[2] * k);
        } else if (t < 0.45) {
          const k = easeOutQuart((t - 0.22) / 0.23);
          const impact = Math.sin(k * Math.PI);
          p.rightArmPos.set(
            THREE.MathUtils.lerp(windPos[0], plungePos[0], k),
            THREE.MathUtils.lerp(windPos[1], plungePos[1], k) + impact * 0.026,
            THREE.MathUtils.lerp(windPos[2], plungePos[2], k)
          );
          p.rightWristRot.set(
            THREE.MathUtils.lerp(windRot[0], plungeRot[0], k),
            THREE.MathUtils.lerp(windRot[1], plungeRot[1], k),
            THREE.MathUtils.lerp(windRot[2], plungeRot[2], k)
          );
          p.cameraPunch.pitch = -0.020 * impact;
          p.cameraPunch.roll = -0.010 * impact;
        } else if (t < 0.56) {
          const k = (t - 0.45) / 0.11;
          const settleZ = THREE.MathUtils.lerp(plungePos[2], plungePos[2] + 0.024, k);
          p.rightArmPos.set(plungePos[0], plungePos[1], settleZ);
          p.rightWristRot.set(plungeRot[0], plungeRot[1], plungeRot[2]);
        } else {
          const k = 1 - easeOutCubic((t - 0.56) / 0.44);
          const startZ = plungePos[2] + 0.024;
          p.rightArmPos.set(plungePos[0] * k, plungePos[1] * k, startZ * k);
          p.rightWristRot.set(plungeRot[0] * k, plungeRot[1] * k, plungeRot[2] * k);
        }
        return 'attack2';
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BAÏONNETTE (Valorant Xenohunter / Recon Tactical Knife — ferme en main)
//    • Equip : dégaine tactique commando depuis la hanche droite avec roulement en paume
//    • Inspect : inspection Valorant double-face (côté dentelé puis contre-tranchant)
//    • Attack1 : combo 2 tailles diagonales croisées (haut-droite -> bas-gauche, puis retour)
//    • Attack2 : estocade lourde Valorant droit dans le viseur ("planter le couteau")
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
        const t = now * 0.00108;
        p.rigPos.set(
          Math.sin(t * 0.74) * 0.0020,
          Math.sin(t * 1.18) * 0.0020,
          Math.cos(t * 0.62) * 0.0012
        );
        p.rigRot.set(
          Math.cos(t * 0.68) * 0.006,
          Math.sin(t * 0.52) * 0.008,
          Math.sin(t * 0.82) * 0.006
        );
        p.rightWristRot.set(
          Math.sin(t * 0.80) * 0.008,
          Math.cos(t * 0.65) * 0.008,
          0
        );
        p.leftArmPos.set(
          Math.sin(t * 0.68 + 0.8) * 0.0018,
          Math.cos(t * 1.05 + 0.5) * 0.0018,
          0
        );
        return 'idle';
      }

      case 'draw': {
        // Valorant Xenohunter / Tactical Equip :
        // Extraction franche depuis la droite -> roulement axial contrôlé dans la paume -> arrêt militaire net
        const dur = 0.56;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        if (t < 0.72) {
          const k = t / 0.72;
          const ease = easeOutQuart(k);
          const inv = 1 - ease;
          const arc = Math.sin(k * Math.PI);
          p.rightArmPos.set(0.074 * inv, -0.195 * inv + arc * 0.022, 0.058 * inv);
          p.rightWristRot.set(
            -0.46 * inv + 0.14 * arc,
            0.38 * inv,
            0.88 * inv - 0.16 * arc
          );
          // Roulement dans l'axe du manche (autour de gripPivot) fidèle au flip poignet Valorant sans lâcher la poignée
          p.bladeAxisRoll = Math.PI * 0.55 * inv * arc;
          p.bladeEdgeTilt = 0.16 * arc;
          p.rigRot.set(0.09 * inv, -0.15 * inv, -0.14 * arc);
          p.leftArmPos.set(-0.042 * inv, -0.105 * inv + arc * 0.015, 0.026 * inv);
          p.leftArmRot.set(0.12 * arc, -0.08 * arc, 0.10 * arc);
        } else {
          const k = (t - 0.72) / 0.28;
          const lock = dampedLockBounce(k);
          p.rightArmPos.y = -lock * 0.013;
          p.rightWristRot.x = -lock * 0.13;
          p.rigRot.x = -lock * 0.045;
          p.cameraPunch.pitch = -lock * 0.004;
        }
        return 'draw';
      }

      case 'inspect': {
        // Inspection Valorant Xenohunter / Tactical Knife :
        // Élévation centrale -> présentation du flanc principal et des dents -> retournement du poignet -> retour
        const dur = 1.95;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const focus =
          t < 0.18
            ? easeOutCubic(t / 0.18)
            : t > 0.82
            ? 1 - easeInOutCubic((t - 0.82) / 0.18)
            : 1;

        p.rightArmPos.set(-0.066 * focus, 0.032 * focus, 0.034 * focus);
        p.rigRot.set(0.05 * focus, -0.19 * focus, 0.06 * focus);
        p.leftArmPos.set(-0.036 * focus, -0.046 * focus, 0.022 * focus);
        p.leftArmRot.set(-0.10 * focus, 0.12 * focus, -0.10 * focus);

        if (t < 0.44) {
          // Face 1 : inclinaison supinée pour faire briller le plat de la lame et le dos dentelé
          const k = easeInOutCubic(t / 0.44);
          p.rightWristRot.set(0.22 * k, -0.26 * k, 0.76 * k);
          p.bladeAxisRoll = 0.34 * k;
          p.bladeEdgeTilt = 0.12 * k;
        } else if (t < 0.76) {
          // Face 2 : rotation franche du poignet pour inspecter le contre-tranchant et la garde
          const k = easeInOutCubic((t - 0.44) / 0.32);
          p.rightWristRot.set(
            THREE.MathUtils.lerp(0.22, -0.18, k),
            THREE.MathUtils.lerp(-0.26, 0.38, k),
            THREE.MathUtils.lerp(0.76, -0.70, k)
          );
          p.bladeAxisRoll = THREE.MathUtils.lerp(0.34, -0.38, k);
          p.bladeEdgeTilt = THREE.MathUtils.lerp(0.12, -0.14, k);
        } else {
          // Retour amorti en garde sabre
          const k = 1 - easeInOutCubic((t - 0.76) / 0.24);
          p.rightWristRot.set(-0.18 * k, 0.38 * k, -0.70 * k);
          p.bladeAxisRoll = -0.38 * k;
          p.bladeEdgeTilt = -0.14 * k;
        }
        return 'inspect';
      }

      case 'attack1': {
        // Valorant Tactical Knife Primary Combo (2 coups croisés + pointe vers l'avant)
        const dur = 0.34;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const isFirstHit = this.comboIndex === 1;
        const alt = isFirstHit ? 1 : -1;
        const windPos: [number, number, number] = isFirstHit
          ? [0.052, 0.036, 0.062]
          : [-0.072, -0.032, 0.054];
        const windRot: [number, number, number] = [0.24, -0.22 * alt, -0.38 * alt];
        const slashPos: [number, number, number] = isFirstHit
          ? [-0.118, 0.038, -0.226]
          : [0.068, 0.052, -0.224];
        const slashRot: [number, number, number] = [-0.44, 0.28 * alt, 0.48 * alt];

        if (t < 0.17) {
          const k = easeOutCubic(t / 0.17);
          p.rightArmPos.set(windPos[0] * k, windPos[1] * k, windPos[2] * k);
          p.rightWristRot.set(windRot[0] * k, windRot[1] * k, windRot[2] * k);
        } else if (t < 0.42) {
          const k = easeOutQuart((t - 0.17) / 0.25);
          const impact = Math.sin(k * Math.PI);
          p.rightArmPos.set(
            THREE.MathUtils.lerp(windPos[0], slashPos[0], k),
            THREE.MathUtils.lerp(windPos[1], slashPos[1], k),
            THREE.MathUtils.lerp(windPos[2], slashPos[2], k)
          );
          p.rightWristRot.set(
            THREE.MathUtils.lerp(windRot[0], slashRot[0], k),
            THREE.MathUtils.lerp(windRot[1], slashRot[1], k),
            THREE.MathUtils.lerp(windRot[2], slashRot[2], k)
          );
          p.bladeEdgeTilt = -0.15 * alt * impact;
          p.cameraPunch.pitch = -0.010 * impact;
          p.cameraPunch.roll = -0.006 * alt * impact;
        } else {
          const k = 1 - easeOutCubic((t - 0.42) / 0.58);
          p.rightArmPos.set(slashPos[0] * k, slashPos[1] * k, slashPos[2] * k);
          p.rightWristRot.set(slashRot[0] * k, slashRot[1] * k, slashRot[2] * k);
        }
        return 'attack1';
      }

      case 'attack2': {
        // Valorant Heavy Forward Lunge Stab (clic droit — planter la baïonnette droit au centre)
        const dur = 0.48;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const windPos: [number, number, number] = [0.048, 0.024, 0.090];
        const windRot: [number, number, number] = [0.24, 0.14, 0.22];
        const thrustPos: [number, number, number] = [-0.124, 0.056, -0.272];
        const thrustRot: [number, number, number] = [-0.46, -0.14, 0.38];

        if (t < 0.22) {
          const k = easeOutCubic(t / 0.22);
          p.rightArmPos.set(windPos[0] * k, windPos[1] * k, windPos[2] * k);
          p.rightWristRot.set(windRot[0] * k, windRot[1] * k, windRot[2] * k);
        } else if (t < 0.45) {
          const k = easeOutQuart((t - 0.22) / 0.23);
          const impact = Math.sin(k * Math.PI);
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
          p.cameraPunch.pitch = -0.019 * impact;
          p.cameraPunch.roll = -0.008 * impact;
        } else if (t < 0.56) {
          const k = (t - 0.45) / 0.11;
          const settleZ = THREE.MathUtils.lerp(thrustPos[2], thrustPos[2] + 0.024, k);
          p.rightArmPos.set(thrustPos[0], thrustPos[1], settleZ);
          p.rightWristRot.set(thrustRot[0], thrustRot[1], thrustRot[2]);
        } else {
          const k = 1 - easeOutCubic((t - 0.56) / 0.44);
          const startZ = thrustPos[2] + 0.024;
          p.rightArmPos.set(thrustPos[0] * k, thrustPos[1] * k, startZ * k);
          p.rightWristRot.set(thrustRot[0] * k, thrustRot[1] * k, thrustRot[2] * k);
        }
        return 'attack2';
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. KATANA (Valorant Onimaru Kunitsuna — Oni 2.0 / RGX 11z Pro Blade)
//    • Equip : dégainage iaido ample depuis le fourreau à la hanche gauche
//    • Inspect : présentation samouraï longue de la lame courbée et de la garde Oni dorée
//    • Attack1 : combo 2 coupes de sabre (Kesa-Giri diagonal puis Gyaku-Kesa remontant)
//    • Attack2 : fente lourde Oni Katana (armement haut puis coupe plongeante profonde)
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
        p.rigPos.set(
          Math.sin(t * 0.65) * 0.0022,
          Math.sin(t * 1.05) * 0.0024,
          Math.cos(t * 0.55) * 0.0014
        );
        p.rigRot.set(
          Math.cos(t * 0.60) * 0.007,
          Math.sin(t * 0.45) * 0.009,
          Math.sin(t * 0.72) * 0.006
        );
        p.rightWristRot.set(
          Math.sin(t * 0.70) * 0.008,
          Math.cos(t * 0.55) * 0.010,
          0
        );
        p.leftArmPos.set(
          Math.sin(t * 0.75 + 0.5) * 0.0024,
          Math.cos(t * 1.10 + 0.3) * 0.0024,
          0
        );
        return 'idle';
      }

      case 'draw': {
        // Dégainage iaido Valorant Onimaru Kunitsuna :
        // Main droite cherche la tsuka au fourreau bas-gauche -> grand arc de coupe iaido -> arrêt samouraï
        const dur = 0.70;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        if (t < 0.76) {
          const k = t / 0.76;
          const ease = easeOutQuart(k);
          const inv = 1 - ease;
          const arc = Math.sin(k * Math.PI);
          p.rightArmPos.set(-0.155 * inv, -0.188 * inv + arc * 0.032, 0.044 * inv);
          p.rightWristRot.set(
            0.32 * inv - 0.12 * arc,
            0.56 * inv,
            0.68 * inv - 0.14 * arc
          );
          p.bladeAxisRoll = -0.32 * inv;
          p.bladeEdgeTilt = 0.22 * arc;
          p.rigRot.set(0.11 * inv, 0.26 * inv, 0.24 * inv);
          p.leftArmPos.set(0.058 * inv, -0.092 * inv + arc * 0.018, 0.032 * inv);
          p.leftArmRot.set(0.18 * arc, 0.14 * arc, -0.22 * arc);
        } else {
          const k = (t - 0.76) / 0.24;
          const lock = dampedLockBounce(k);
          p.rightArmPos.y = -lock * 0.016;
          p.rightWristRot.x = -lock * 0.11;
          p.rigRot.z = -lock * 0.045;
          p.cameraPunch.pitch = -lock * 0.005;
        }
        return 'draw';
      }

      case 'inspect': {
        // Inspection Valorant Onimaru Kunitsuna :
        // Élévation majestueuse de la lame courbée -> reflet du hamon côté face -> bascule côté fourreau & tsuba Oni
        const dur = 2.25;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const focus =
          t < 0.18
            ? easeOutCubic(t / 0.18)
            : t > 0.82
            ? 1 - easeInOutCubic((t - 0.82) / 0.18)
            : 1;

        p.rightArmPos.set(-0.092 * focus, 0.040 * focus, 0.042 * focus);
        p.rigRot.set(0.06 * focus, -0.23 * focus, 0.08 * focus);
        // La main gauche monte accompagner la garde samouraï avec élégance
        p.leftArmPos.set(0.032 * focus, 0.014 * focus, 0.022 * focus);
        p.leftArmRot.set(-0.14 * focus, 0.18 * focus, -0.18 * focus);

        if (t < 0.48) {
          // Glissement lent de la lumière le long du tranchant courbé (hamon)
          const k = easeInOutCubic(t / 0.48);
          p.rightWristRot.set(0.24 * k, -0.32 * k, 0.72 * k);
          p.bladeAxisRoll = 0.36 * k;
          p.bladeEdgeTilt = 0.15 * k;
        } else if (t < 0.78) {
          // Retournement noble pour admirer l'autre face, la tresse bleue tsuka et la garde Oni
          const k = easeInOutCubic((t - 0.48) / 0.30);
          p.rightWristRot.set(
            THREE.MathUtils.lerp(0.24, -0.14, k),
            THREE.MathUtils.lerp(-0.32, 0.38, k),
            THREE.MathUtils.lerp(0.72, -0.60, k)
          );
          p.bladeAxisRoll = THREE.MathUtils.lerp(0.36, -0.34, k);
          p.bladeEdgeTilt = THREE.MathUtils.lerp(0.15, -0.14, k);
        } else {
          const k = 1 - easeInOutCubic((t - 0.78) / 0.22);
          p.rightWristRot.set(-0.14 * k, 0.38 * k, -0.60 * k);
          p.bladeAxisRoll = -0.34 * k;
          p.bladeEdgeTilt = -0.14 * k;
        }
        return 'inspect';
      }

      case 'attack1': {
        // Valorant Katana Primary Combo : Kesa-Giri (coupe diagonale descendante) + Gyaku-Kesa (coupe remontante)
        const dur = 0.38;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const isFirstHit = this.comboIndex === 1;
        const alt = isFirstHit ? 1 : -1;
        const windPos: [number, number, number] = isFirstHit
          ? [0.068, 0.056, 0.068]
          : [-0.096, -0.044, 0.056];
        const windRot: [number, number, number] = [0.32, -0.28 * alt, -0.52 * alt];
        const cleavePos: [number, number, number] = isFirstHit
          ? [-0.142, 0.024, -0.236]
          : [0.084, 0.058, -0.232];
        const cleaveRot: [number, number, number] = [-0.50, 0.38 * alt, 0.62 * alt];

        if (t < 0.18) {
          const k = easeOutCubic(t / 0.18);
          p.rightArmPos.set(windPos[0] * k, windPos[1] * k, windPos[2] * k);
          p.rightWristRot.set(windRot[0] * k, windRot[1] * k, windRot[2] * k);
        } else if (t < 0.44) {
          const k = easeOutQuart((t - 0.18) / 0.26);
          const impact = Math.sin(k * Math.PI);
          p.rightArmPos.set(
            THREE.MathUtils.lerp(windPos[0], cleavePos[0], k),
            THREE.MathUtils.lerp(windPos[1], cleavePos[1], k) + impact * 0.022,
            THREE.MathUtils.lerp(windPos[2], cleavePos[2], k)
          );
          p.rightWristRot.set(
            THREE.MathUtils.lerp(windRot[0], cleaveRot[0], k),
            THREE.MathUtils.lerp(windRot[1], cleaveRot[1], k),
            THREE.MathUtils.lerp(windRot[2], cleaveRot[2], k)
          );
          p.bladeEdgeTilt = -0.20 * alt * impact;
          p.cameraPunch.pitch = -0.013 * impact;
          p.cameraPunch.roll = -0.009 * alt * impact;
        } else {
          const k = 1 - easeOutCubic((t - 0.44) / 0.56);
          p.rightArmPos.set(cleavePos[0] * k, cleavePos[1] * k, cleavePos[2] * k);
          p.rightWristRot.set(cleaveRot[0] * k, cleaveRot[1] * k, cleaveRot[2] * k);
        }
        return 'attack1';
      }

      case 'attack2': {
        // Valorant Katana Heavy Attack (clic droit) :
        // Armement haut samouraï puis fente plongeante puissante au centre du viseur
        const dur = 0.52;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const windPos: [number, number, number] = [0.058, 0.064, 0.096];
        const windRot: [number, number, number] = [0.38, -0.20, -0.36];
        const cleavePos: [number, number, number] = [-0.132, 0.046, -0.278];
        const cleaveRot: [number, number, number] = [-0.56, 0.24, 0.44];

        if (t < 0.23) {
          const k = easeOutCubic(t / 0.23);
          p.rightArmPos.set(windPos[0] * k, windPos[1] * k, windPos[2] * k);
          p.rightWristRot.set(windRot[0] * k, windRot[1] * k, windRot[2] * k);
        } else if (t < 0.46) {
          const k = easeOutQuart((t - 0.23) / 0.23);
          const impact = Math.sin(k * Math.PI);
          p.rightArmPos.set(
            THREE.MathUtils.lerp(windPos[0], cleavePos[0], k),
            THREE.MathUtils.lerp(windPos[1], cleavePos[1], k) + impact * 0.024,
            THREE.MathUtils.lerp(windPos[2], cleavePos[2], k)
          );
          p.rightWristRot.set(
            THREE.MathUtils.lerp(windRot[0], cleaveRot[0], k),
            THREE.MathUtils.lerp(windRot[1], cleaveRot[1], k),
            THREE.MathUtils.lerp(windRot[2], cleaveRot[2], k)
          );
          p.bladeEdgeTilt = -0.22 * impact;
          p.cameraPunch.pitch = -0.022 * impact;
          p.cameraPunch.roll = -0.011 * impact;
        } else if (t < 0.57) {
          const k = (t - 0.46) / 0.11;
          const settleZ = THREE.MathUtils.lerp(cleavePos[2], cleavePos[2] + 0.026, k);
          p.rightArmPos.set(cleavePos[0], cleavePos[1], settleZ);
          p.rightWristRot.set(cleaveRot[0], cleaveRot[1], cleaveRot[2]);
        } else {
          const k = 1 - easeOutCubic((t - 0.57) / 0.43);
          const startZ = cleavePos[2] + 0.026;
          p.rightArmPos.set(cleavePos[0] * k, cleavePos[1] * k, startZ * k);
          p.rightWristRot.set(cleaveRot[0] * k, cleaveRot[1] * k, cleaveRot[2] * k);
        }
        return 'attack2';
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DAGUE / COUTEAU TACTIQUE (Valorant VCT Lock//In Misericordia / Kunai Champions)
//    • Equip : flick nerveux VCT depuis la hanche gauche avec roulement axial dans la paume
//    • Inspect : présentation de l'emblème VCT/Champions au centre puis retournement damas 180°
//    • Attack1 : combo 2 entailles-estocades croisées ultra-rapides d'assassin
//    • Attack2 : estocade perforante directe au centre du réticule
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
        const t = now * 0.00128;
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
        p.rightWristRot.set(
          Math.sin(t * 0.95) * 0.009,
          Math.cos(t * 0.80) * 0.010,
          0
        );
        p.leftArmPos.set(
          Math.sin(t + 0.5) * 0.0020,
          Math.cos(t * 1.4) * 0.0020,
          0
        );
        return 'idle';
      }

      case 'draw': {
        // Sortie nerveuse Valorant VCT Misericordia :
        // Flick rapide depuis la hanche gauche + vrille axiale de la lame dans la paume + arrêt sec pointe devant
        const dur = 0.50;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        if (t < 0.76) {
          const k = t / 0.76;
          const ease = easeOutQuart(k);
          const inv = 1 - ease;
          const arc = Math.sin(k * Math.PI);
          p.rightArmPos.set(-0.105 * inv, -0.192 * inv + arc * 0.020, 0.050 * inv);
          p.rightWristRot.set(
            0.24 * inv + 0.10 * arc,
            0.44 * inv,
            -0.80 * inv + 0.16 * arc
          );
          p.bladeAxisRoll = Math.PI * 0.65 * inv * arc;
          p.bladeEdgeTilt = 0.15 * arc;
          p.rigRot.set(0.08 * inv, 0.16 * inv, 0.18 * inv);
          p.leftArmPos.set(-0.036 * inv, -0.096 * inv + arc * 0.014, 0.022 * inv);
          p.leftArmRot.set(0.10 * arc, 0.08 * arc, -0.10 * arc);
        } else {
          const k = (t - 0.76) / 0.24;
          const lock = dampedLockBounce(k);
          p.rightArmPos.y = -lock * 0.011;
          p.rightWristRot.z = lock * 0.10;
          p.rigRot.z = lock * 0.035;
          p.cameraPunch.pitch = -lock * 0.004;
        }
        return 'draw';
      }

      case 'inspect': {
        // Inspection Valorant VCT / Kunai Champions :
        // Présente l'emblème central lumineux face caméra, puis pivote à 180° en paume pour admirer le damas
        const dur = 1.85;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const focus =
          t < 0.16
            ? easeOutCubic(t / 0.16)
            : t > 0.82
            ? 1 - easeInOutCubic((t - 0.82) / 0.18)
            : 1;

        p.rightArmPos.set(-0.060 * focus, 0.030 * focus, 0.032 * focus);
        p.rigRot.set(0.06 * focus, -0.19 * focus, 0.08 * focus);
        p.leftArmPos.set(-0.030 * focus, -0.036 * focus, 0.018 * focus);
        p.leftArmRot.set(-0.08 * focus, 0.12 * focus, -0.10 * focus);

        if (t < 0.45) {
          // Face 1 : exposition de l'emblème VCT / Champions au centre
          const k = easeInOutCubic(t / 0.45);
          p.rightWristRot.set(0.18 * k, -0.30 * k, 0.86 * k);
          p.bladeAxisRoll = 0.38 * k;
          p.bladeEdgeTilt = 0.14 * k;
        } else if (t < 0.76) {
          // Face 2 : vrille nerveuse en paume vers le second tranchant symétrique
          const k = easeInOutCubic((t - 0.45) / 0.31);
          p.rightWristRot.set(
            THREE.MathUtils.lerp(0.18, -0.14, k),
            THREE.MathUtils.lerp(-0.30, 0.36, k),
            THREE.MathUtils.lerp(0.86, -0.56, k)
          );
          p.bladeAxisRoll = THREE.MathUtils.lerp(0.38, -0.42, k);
          p.bladeEdgeTilt = THREE.MathUtils.lerp(0.14, -0.14, k);
        } else {
          const k = 1 - easeInOutCubic((t - 0.76) / 0.24);
          p.rightWristRot.set(-0.14 * k, 0.36 * k, -0.56 * k);
          p.bladeAxisRoll = -0.42 * k;
          p.bladeEdgeTilt = -0.14 * k;
        }
        return 'inspect';
      }

      case 'attack1': {
        // Valorant VCT Dagger Primary Combo : 2 entailles-estocades croisées ultra-rapides
        const dur = 0.32;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const isFirstHit = this.comboIndex === 1;
        const alt = isFirstHit ? 1 : -1;
        const windPos: [number, number, number] = isFirstHit
          ? [0.044, 0.022, 0.056]
          : [-0.064, -0.024, 0.048];
        const windRot: [number, number, number] = [0.22, -0.20 * alt, -0.34 * alt];
        const stabPos: [number, number, number] = isFirstHit
          ? [-0.114, 0.042, -0.226]
          : [0.058, 0.048, -0.224];
        const stabRot: [number, number, number] = [-0.44, 0.26 * alt, 0.44 * alt];

        if (t < 0.16) {
          const k = easeOutCubic(t / 0.16);
          p.rightArmPos.set(windPos[0] * k, windPos[1] * k, windPos[2] * k);
          p.rightWristRot.set(windRot[0] * k, windRot[1] * k, windRot[2] * k);
        } else if (t < 0.41) {
          const k = easeOutQuart((t - 0.16) / 0.25);
          const impact = Math.sin(k * Math.PI);
          p.rightArmPos.set(
            THREE.MathUtils.lerp(windPos[0], stabPos[0], k),
            THREE.MathUtils.lerp(windPos[1], stabPos[1], k),
            THREE.MathUtils.lerp(windPos[2], stabPos[2], k)
          );
          p.rightWristRot.set(
            THREE.MathUtils.lerp(windRot[0], stabRot[0], k),
            THREE.MathUtils.lerp(windRot[1], stabRot[1], k),
            THREE.MathUtils.lerp(windRot[2], stabRot[2], k)
          );
          p.bladeEdgeTilt = -0.14 * alt * impact;
          p.cameraPunch.pitch = -0.010 * impact;
          p.cameraPunch.roll = -0.006 * alt * impact;
        } else {
          const k = 1 - easeOutCubic((t - 0.41) / 0.59);
          p.rightArmPos.set(stabPos[0] * k, stabPos[1] * k, stabPos[2] * k);
          p.rightWristRot.set(stabRot[0] * k, stabRot[1] * k, stabRot[2] * k);
        }
        return 'attack1';
      }

      case 'attack2': {
        // Valorant VCT Dagger Heavy Pierce (clic droit — estocade chirurgicale profonde au centre)
        const dur = 0.46;
        const t = timer / dur;
        if (t >= 1) return 'idle';

        const windPos: [number, number, number] = [0.044, 0.020, 0.088];
        const windRot: [number, number, number] = [0.22, -0.12, -0.18];
        const piercePos: [number, number, number] = [-0.116, 0.052, -0.274];
        const pierceRot: [number, number, number] = [-0.48, 0.16, 0.30];

        if (t < 0.21) {
          const k = easeOutCubic(t / 0.21);
          p.rightArmPos.set(windPos[0] * k, windPos[1] * k, windPos[2] * k);
          p.rightWristRot.set(windRot[0] * k, windRot[1] * k, windRot[2] * k);
        } else if (t < 0.43) {
          const k = easeOutQuart((t - 0.21) / 0.22);
          const impact = Math.sin(k * Math.PI);
          p.rightArmPos.set(
            THREE.MathUtils.lerp(windPos[0], piercePos[0], k),
            THREE.MathUtils.lerp(windPos[1], piercePos[1], k),
            THREE.MathUtils.lerp(windPos[2], piercePos[2], k)
          );
          p.rightWristRot.set(
            THREE.MathUtils.lerp(windRot[0], pierceRot[0], k),
            THREE.MathUtils.lerp(windRot[1], pierceRot[1], k),
            THREE.MathUtils.lerp(windRot[2], pierceRot[2], k)
          );
          p.bladeAxisRoll = 0.22 * impact;
          p.cameraPunch.pitch = -0.018 * impact;
          p.cameraPunch.roll = -0.008 * impact;
        } else if (t < 0.54) {
          const k = (t - 0.43) / 0.11;
          const settleZ = THREE.MathUtils.lerp(piercePos[2], piercePos[2] + 0.022, k);
          p.rightArmPos.set(piercePos[0], piercePos[1], settleZ);
          p.rightWristRot.set(pierceRot[0], pierceRot[1], pierceRot[2]);
        } else {
          const k = 1 - easeOutCubic((t - 0.54) / 0.46);
          const startZ = piercePos[2] + 0.022;
          p.rightArmPos.set(piercePos[0] * k, piercePos[1] * k, startZ * k);
          p.rightWristRot.set(pierceRot[0] * k, pierceRot[1] * k, pierceRot[2] * k);
        }
        return 'attack2';
      }
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
