/**
 * Knife Animation System — procédural, temps-réel, Three.js (Vue FPS)
 *
 * Préserve intégralement l'échelle et la pose de base du modèle 3D (`cfg.scale`),
 * en animant le rig, les mains et un pivot dédié autour du point de prise / anneau.
 *
 * 3 personnalités distinctes :
 *   • karambit   → prise inversée, flip fluide autour de l'anneau, crochets rapides & plongée
 *   • baionnette → flip-catch CS2 à 360°, tenue militaire stable, taille diagonale & estocade
 *   • couteau    → rotation axiale rapide, équilibre agile, coupes croisées & coup pic à glace
 */

import * as THREE from 'three';
import { getWeaponMuzzleSide, WeaponArchetype, WeaponGripMeta } from './weapon3dBuilder';
import { FPSHandsRig, FPSWeaponViewConfig } from './fpsHandsBuilder';

export type KnifeType = 'karambit' | 'baionnette' | 'couteau';
export type KnifeAnimState = 'idle' | 'draw' | 'inspect' | 'attack1' | 'attack2';

export interface KnifeAnimPose {
  /** Translation additive du viewModelRig (espace caméra) */
  rigPos: THREE.Vector3;
  /** Rotation additive du viewModelRig (Euler XYZ) */
  rigRot: THREE.Euler;
  /** Rotation du couteau dans le plan de la lame autour du point de prise (anneau / poignée) */
  bladePlaneSpin: number;
  /** Roulis axial du couteau le long de l'axe manche -> pointe */
  bladeAxisRoll: number;
  /** Inclinaison latérale du tranchant */
  bladeEdgeTilt: number;
  /** Rotation additive du poignet droit (handPivot) */
  rightWristRot: THREE.Euler;
  /** Décalage additif de la main gauche de garde */
  leftArmPos: THREE.Vector3;
  /** Rotation additive du bras gauche de garde */
  leftArmRot: THREE.Euler;
  /** Micro-impulsion caméra (pitch, roll) lors des frappes */
  cameraPunch: { pitch: number; roll: number };
}

export interface KnifeAnimator {
  readonly knifeType: KnifeType;
  update(dt: number, now: number): KnifeAnimPose;
  triggerAttack(secondary?: boolean): void;
  triggerDraw(): void;
  triggerInspect(): void;
  getState(): KnifeAnimState;
}

export interface KnifeRigRestData {
  archetype: WeaponArchetype;
  gripPivot: THREE.Vector3;
  planeNormal: THREE.Vector3;
  lengthAxis: THREE.Vector3;
  edgeAxis: THREE.Vector3;
  baseLeftArmPos: THREE.Vector3;
  baseLeftArmRot: THREE.Euler;
  baseRightHandRot: THREE.Euler;
}

/** Détermine la personnalité d'animation selon le nom exact de l'arme. */
export function resolveKnifeType(weaponName: string): KnifeType {
  const n = weaponName.toLowerCase();
  if (n.includes('karambit')) return 'karambit';
  if (n.includes('baïonnette') || n.includes('baionnette')) return 'baionnette';
  return 'couteau';
}

// ─────────────────────────────────────────────────────────────────────────────
// Fonctions d'interpolation et de ressorts
// ─────────────────────────────────────────────────────────────────────────────

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

function easeOutBack(t: number, s = 1.6): number {
  const c = clamp01(t) - 1;
  return 1 + (s + 1) * c * c * c + s * c * c;
}

/** Cloche lisse 0 -> 1 -> 0 sur [0, 1] */
function smoothBell(t: number): number {
  const c = clamp01(t);
  return Math.sin(c * Math.PI);
}

/** Rebond amorti final (s'annule proprement à t = 0 et t = 1) */
function dampedLockBounce(t: number): number {
  const c = clamp01(t);
  return Math.sin(c * Math.PI * 1.5) * Math.exp(-4.5 * c) * (1 - c);
}

function createEmptyPose(): KnifeAnimPose {
  return {
    rigPos: new THREE.Vector3(),
    rigRot: new THREE.Euler(),
    bladePlaneSpin: 0,
    bladeAxisRoll: 0,
    bladeEdgeTilt: 0,
    rightWristRot: new THREE.Euler(),
    leftArmPos: new THREE.Vector3(),
    leftArmRot: new THREE.Euler(),
    cameraPunch: { pitch: 0, roll: 0 },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. KARAMBIT — flip sur anneau, posture agile, crochets rapides & plongée
// ─────────────────────────────────────────────────────────────────────────────

class KarambitAnimator implements KnifeAnimator {
  readonly knifeType: KnifeType = 'karambit';
  private state: KnifeAnimState = 'idle';
  private timer = 0;
  private comboIndex = 0;
  private flourishTimer = 0;
  private nextFlourishAt = 3.8;
  private flourishActive = false;
  private flourishProgress = 0;
  private readonly pose = createEmptyPose();

  triggerDraw(): void {
    this.state = 'draw';
    this.timer = 0;
    this.flourishActive = false;
  }

  triggerInspect(): void {
    if (this.state === 'attack1' || this.state === 'attack2') return;
    this.state = 'inspect';
    this.timer = 0;
    this.flourishActive = false;
  }

  triggerAttack(secondary = false): void {
    if (this.state === 'attack1' && this.timer < 0.14) return;
    if (this.state === 'attack2' && this.timer < 0.22) return;
    if (!secondary) {
      this.comboIndex = (this.comboIndex + 1) % 2;
    }
    this.state = secondary ? 'attack2' : 'attack1';
    this.timer = 0;
    this.flourishActive = false;
  }

  getState(): KnifeAnimState {
    return this.state;
  }

  update(dt: number, now: number): KnifeAnimPose {
    this.timer += dt;
    const p = this.pose;
    p.rigPos.set(0, 0, 0);
    p.rigRot.set(0, 0, 0);
    p.bladePlaneSpin = 0;
    p.bladeAxisRoll = 0;
    p.bladeEdgeTilt = 0;
    p.rightWristRot.set(0, 0, 0);
    p.leftArmPos.set(0, 0, 0);
    p.leftArmRot.set(0, 0, 0);
    p.cameraPunch.pitch = 0;
    p.cameraPunch.roll = 0;

    switch (this.state) {
      case 'idle': {
        const t = now * 0.0014;
        // Respiration souple en garde inversée + léger balancier du poignet
        p.rigPos.set(
          Math.sin(t * 0.95) * 0.0032,
          Math.sin(t * 1.45) * 0.0026,
          Math.cos(t * 0.72) * 0.0018
        );
        p.rigRot.set(
          Math.cos(t * 0.85) * 0.011,
          Math.sin(t * 0.65) * 0.018,
          Math.sin(t * 1.05) * 0.016
        );
        p.leftArmPos.set(
          Math.sin(t * 0.85 + 0.6) * 0.0025,
          Math.cos(t * 1.25 + 0.4) * 0.0028,
          0
        );

        // Twirl périodique sur l'anneau (signature CS2 Karambit)
        this.flourishTimer += dt;
        if (!this.flourishActive && this.flourishTimer >= this.nextFlourishAt) {
          this.flourishActive = true;
          this.flourishProgress = 0;
          this.flourishTimer = 0;
          this.nextFlourishAt = 4.2 + Math.random() * 2.2;
        }
        if (this.flourishActive) {
          this.flourishProgress += dt / 0.60;
          if (this.flourishProgress >= 1) {
            this.flourishActive = false;
            this.flourishProgress = 0;
          } else {
            const ft = this.flourishProgress;
            const bell = smoothBell(ft);
            // Rotation complète 360° de la lame autour de l'anneau
            p.bladePlaneSpin = Math.PI * 2 * (1 - easeInOutCubic(ft));
            // Légère inclinaison du poignet pour que la lame passe proprement à côté du bras
            p.rigRot.z += bell * 0.14;
            p.rigPos.y += bell * 0.012;
            p.rightWristRot.x += bell * 0.14;
          }
        }
        break;
      }

      case 'draw': {
        const dur = 0.72;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        if (t < 0.76) {
          const k = t / 0.76;
          const ease = easeOutQuart(k);
          const inv = 1 - ease;
          // Monte depuis le bas-gauche avec un tour complet autour de l'anneau
          p.rigPos.set(-0.085 * inv, -0.21 * inv + Math.sin(k * Math.PI) * 0.025, 0.05 * inv);
          p.rigRot.set(-0.22 * inv, 0.18 * inv, 0.24 * Math.sin(k * Math.PI));
          p.bladePlaneSpin = Math.PI * 2 * (1 - easeOutBack(k, 1.15));
          p.rightWristRot.x = 0.22 * inv;
          p.leftArmPos.set(-0.04 * inv, -0.10 * inv, 0.03 * inv);
        } else {
          // Verrouillage net en garde
          const k = (t - 0.76) / 0.24;
          const lock = dampedLockBounce(k);
          p.rigPos.y = -lock * 0.014;
          p.rigRot.x = -lock * 0.045;
          p.rightWristRot.x = -lock * 0.08;
        }
        break;
      }

      case 'inspect': {
        const dur = 1.90;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        const focus =
          t < 0.18
            ? easeOutCubic(t / 0.18)
            : t > 0.80
            ? 1 - easeInOutCubic((t - 0.80) / 0.20)
            : 1;

        p.rigPos.set(-0.068 * focus, 0.030 * focus, 0.038 * focus);
        p.rigRot.set(0.08 * focus, -0.24 * focus, 0.18 * focus);
        p.leftArmPos.set(-0.035 * focus, -0.045 * focus, 0.02 * focus);

        if (t < 0.42) {
          // Double twirl rapide autour de l'anneau
          const k = t / 0.42;
          p.bladePlaneSpin = Math.PI * 4 * (1 - easeInOutCubic(k));
        } else if (t < 0.82) {
          // Inclinaison lente pour admirer la courbure et les reflets du skin
          const k = (t - 0.42) / 0.40;
          p.bladeAxisRoll = Math.sin(k * Math.PI * 2) * 0.48;
          p.bladeEdgeTilt = Math.sin(k * Math.PI) * 0.22;
        } else {
          // Tour final de retour en main
          const k = (t - 0.82) / 0.18;
          p.bladePlaneSpin = Math.PI * 2 * (1 - easeOutBack(k, 1.1));
        }
        break;
      }

      case 'attack1': {
        const dur = 0.34;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        const forehand = this.comboIndex === 0;
        if (forehand) {
          // Crochet rapide droite -> gauche
          if (t < 0.16) {
            const k = easeOutCubic(t / 0.16);
            p.rigPos.set(0.055 * k, 0.025 * k, 0.03 * k);
            p.rigRot.set(0.10 * k, -0.24 * k, -0.22 * k);
            p.rightWristRot.z = -0.14 * k;
          } else if (t < 0.38) {
            const k = easeOutQuart((t - 0.16) / 0.22);
            p.rigPos.set(
              THREE.MathUtils.lerp(0.055, -0.175, k),
              THREE.MathUtils.lerp(0.025, -0.055, k),
              THREE.MathUtils.lerp(0.03, -0.095, k)
            );
            p.rigRot.set(
              THREE.MathUtils.lerp(0.10, -0.26, k),
              THREE.MathUtils.lerp(-0.24, 0.50, k),
              THREE.MathUtils.lerp(-0.22, 0.46, k)
            );
            p.bladeEdgeTilt = -0.32 * k;
            p.rightWristRot.set(-0.18 * k, 0.15 * k, 0.22 * k);
            p.leftArmPos.set(-0.045 * k, -0.025 * k, 0.045 * k);
            p.cameraPunch.pitch = -0.008 * Math.sin(k * Math.PI);
            p.cameraPunch.roll = 0.011 * Math.sin(k * Math.PI);
          } else {
            const k = 1 - easeOutCubic((t - 0.38) / 0.62);
            p.rigPos.set(-0.175 * k, -0.055 * k, -0.095 * k);
            p.rigRot.set(-0.26 * k, 0.50 * k, 0.46 * k);
            p.bladeEdgeTilt = -0.32 * k;
            p.rightWristRot.set(-0.18 * k, 0.15 * k, 0.22 * k);
            p.leftArmPos.set(-0.045 * k, -0.025 * k, 0.045 * k);
          }
        } else {
          // Revers rapide gauche -> droite
          if (t < 0.15) {
            const k = easeOutCubic(t / 0.15);
            p.rigPos.set(-0.105 * k, -0.02 * k, 0.02 * k);
            p.rigRot.set(-0.08 * k, 0.34 * k, 0.34 * k);
          } else if (t < 0.38) {
            const k = easeOutQuart((t - 0.15) / 0.23);
            p.rigPos.set(
              THREE.MathUtils.lerp(-0.105, 0.085, k),
              THREE.MathUtils.lerp(-0.02, 0.018, k),
              THREE.MathUtils.lerp(0.02, -0.085, k)
            );
            p.rigRot.set(
              THREE.MathUtils.lerp(-0.08, -0.18, k),
              THREE.MathUtils.lerp(0.34, -0.38, k),
              THREE.MathUtils.lerp(0.34, -0.38, k)
            );
            p.bladeEdgeTilt = 0.28 * k;
            p.rightWristRot.set(-0.14 * k, -0.15 * k, -0.20 * k);
            p.leftArmPos.set(-0.035 * k, -0.015 * k, 0.03 * k);
            p.cameraPunch.pitch = -0.007 * Math.sin(k * Math.PI);
            p.cameraPunch.roll = -0.010 * Math.sin(k * Math.PI);
          } else {
            const k = 1 - easeOutCubic((t - 0.38) / 0.62);
            p.rigPos.set(0.085 * k, 0.018 * k, -0.085 * k);
            p.rigRot.set(-0.18 * k, -0.38 * k, -0.38 * k);
            p.bladeEdgeTilt = 0.28 * k;
            p.rightWristRot.set(-0.14 * k, -0.15 * k, -0.20 * k);
            p.leftArmPos.set(-0.035 * k, -0.015 * k, 0.03 * k);
          }
        }
        break;
      }

      case 'attack2': {
        // Coup lourd : haute garde puis plongée verticale déchirante
        const dur = 0.48;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        if (t < 0.24) {
          const k = easeOutCubic(t / 0.24);
          p.rigPos.set(0.038 * k, 0.102 * k, 0.038 * k);
          p.rigRot.set(0.38 * k, -0.16 * k, -0.22 * k);
          p.bladePlaneSpin = 0.26 * k;
          p.rightWristRot.x = 0.18 * k;
          p.leftArmPos.set(-0.03 * k, 0.02 * k, 0.02 * k);
        } else if (t < 0.44) {
          const k = easeOutQuart((t - 0.24) / 0.20);
          p.rigPos.set(
            THREE.MathUtils.lerp(0.038, -0.095, k),
            THREE.MathUtils.lerp(0.102, -0.112, k),
            THREE.MathUtils.lerp(0.038, -0.135, k)
          );
          p.rigRot.set(
            THREE.MathUtils.lerp(0.38, -0.58, k),
            THREE.MathUtils.lerp(-0.16, 0.24, k),
            THREE.MathUtils.lerp(-0.22, 0.26, k)
          );
          p.bladePlaneSpin = THREE.MathUtils.lerp(0.26, -0.36, k);
          p.rightWristRot.x = THREE.MathUtils.lerp(0.18, -0.28, k);
          p.leftArmPos.set(-0.055 * k, -0.04 * k, 0.05 * k);
          p.cameraPunch.pitch = -0.018 * Math.sin(k * Math.PI);
          p.cameraPunch.roll = -0.014 * Math.sin(k * Math.PI);
        } else {
          const k = 1 - easeOutCubic((t - 0.44) / 0.56);
          p.rigPos.set(-0.095 * k, -0.112 * k, -0.135 * k);
          p.rigRot.set(-0.58 * k, 0.24 * k, 0.26 * k);
          p.bladePlaneSpin = -0.36 * k;
          p.rightWristRot.x = -0.28 * k;
          p.leftArmPos.set(-0.055 * k, -0.04 * k, 0.05 * k);
        }
        break;
      }
    }

    return p;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. BAÏONNETTE — flip-catch CS2, garde ferme + reflet sur lame, estocade lourde
// ─────────────────────────────────────────────────────────────────────────────

class BaionnetteAnimator implements KnifeAnimator {
  readonly knifeType: KnifeType = 'baionnette';
  private state: KnifeAnimState = 'idle';
  private timer = 0;
  private comboIndex = 0;
  private glintTimer = 0;
  private nextGlintAt = 4.6;
  private glintActive = false;
  private glintProgress = 0;
  private readonly pose = createEmptyPose();

  triggerDraw(): void {
    this.state = 'draw';
    this.timer = 0;
    this.glintActive = false;
  }

  triggerInspect(): void {
    if (this.state === 'attack1' || this.state === 'attack2') return;
    this.state = 'inspect';
    this.timer = 0;
    this.glintActive = false;
  }

  triggerAttack(secondary = false): void {
    if (this.state === 'attack1' && this.timer < 0.18) return;
    if (this.state === 'attack2' && this.timer < 0.25) return;
    if (!secondary) {
      this.comboIndex = (this.comboIndex + 1) % 2;
    }
    this.state = secondary ? 'attack2' : 'attack1';
    this.timer = 0;
    this.glintActive = false;
  }

  getState(): KnifeAnimState {
    return this.state;
  }

  update(dt: number, now: number): KnifeAnimPose {
    this.timer += dt;
    const p = this.pose;
    p.rigPos.set(0, 0, 0);
    p.rigRot.set(0, 0, 0);
    p.bladePlaneSpin = 0;
    p.bladeAxisRoll = 0;
    p.bladeEdgeTilt = 0;
    p.rightWristRot.set(0, 0, 0);
    p.leftArmPos.set(0, 0, 0);
    p.leftArmRot.set(0, 0, 0);
    p.cameraPunch.pitch = 0;
    p.cameraPunch.roll = 0;

    switch (this.state) {
      case 'idle': {
        const t = now * 0.0010;
        // Tenue militaire calme et ancrée (pas de tournoiement incessant)
        p.rigPos.set(Math.sin(t * 0.72) * 0.0020, Math.sin(t * 1.15) * 0.0022, 0);
        p.rigRot.set(
          Math.cos(t * 0.68) * 0.006,
          Math.sin(t * 0.50) * 0.008,
          Math.sin(t * 0.80) * 0.007
        );
        p.leftArmPos.set(
          Math.sin(t * 0.68 + 0.8) * 0.0018,
          Math.cos(t * 1.05 + 0.5) * 0.0020,
          0
        );

        // Micro-inspection périodique : incline doucement la lame pour capter un reflet sur les dents
        this.glintTimer += dt;
        if (!this.glintActive && this.glintTimer >= this.nextGlintAt) {
          this.glintActive = true;
          this.glintProgress = 0;
          this.glintTimer = 0;
          this.nextGlintAt = 5.0 + Math.random() * 2.5;
        }
        if (this.glintActive) {
          this.glintProgress += dt / 1.25;
          if (this.glintProgress >= 1) {
            this.glintActive = false;
            this.glintProgress = 0;
          } else {
            const g = smoothBell(this.glintProgress);
            p.bladeAxisRoll = -0.52 * g;
            p.bladeEdgeTilt = 0.14 * g;
            p.rigRot.y += 0.12 * g;
            p.rightWristRot.z += 0.18 * g;
          }
        }
        break;
      }

      case 'draw': {
        // Flip-catch CS2 : monte du bas-droit, fait un tour complet bout-pour-bout puis se verrouille
        const dur = 0.78;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        if (t < 0.68) {
          const k = t / 0.68;
          const ease = easeOutCubic(k);
          const inv = 1 - ease;
          const tossArc = Math.sin(k * Math.PI);
          p.rigPos.set(0.095 * inv, -0.22 * inv + tossArc * 0.036, 0.045 * inv - tossArc * 0.045);
          p.rigRot.set(0.18 * inv, -0.22 * inv, -0.24 * inv);
          // Rotation bout-pour-bout de 360° dans le plan de la lame
          p.bladePlaneSpin = Math.PI * 2 * (1 - ease);
          p.rightWristRot.set(0.24 * tossArc, 0, -0.15 * inv);
          p.leftArmPos.set(-0.04 * inv, -0.12 * inv, 0.03 * inv);
        } else {
          // Prise ferme avec recul d'impact dans la paume
          const k = (t - 0.68) / 0.32;
          const lock = dampedLockBounce(k);
          p.rigPos.y = -lock * 0.022;
          p.rigPos.z = lock * 0.012;
          p.rigRot.x = -lock * 0.065;
          p.rightWristRot.x = -lock * 0.10;
        }
        break;
      }

      case 'inspect': {
        const dur = 2.15;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        const focus =
          t < 0.18
            ? easeOutCubic(t / 0.18)
            : t > 0.82
            ? 1 - easeInOutCubic((t - 0.82) / 0.18)
            : 1;

        p.rigPos.set(-0.078 * focus, 0.026 * focus, 0.042 * focus);
        p.rigRot.set(0.06 * focus, -0.34 * focus, 0.08 * focus);
        p.leftArmPos.set(-0.04 * focus, -0.05 * focus, 0.02 * focus);

        // Retourne la baïonnette d'un côté à l'autre pour montrer les deux faces de la lame
        if (t >= 0.25 && t < 0.52) {
          const k = easeInOutCubic((t - 0.25) / 0.27);
          p.bladeAxisRoll = Math.PI * k;
        } else if (t >= 0.52 && t < 0.72) {
          p.bladeAxisRoll = Math.PI;
          p.bladeEdgeTilt = Math.sin(((t - 0.52) / 0.20) * Math.PI) * 0.18;
        } else if (t >= 0.72 && t < 0.94) {
          const k = easeInOutCubic((t - 0.72) / 0.22);
          p.bladeAxisRoll = Math.PI + Math.PI * k;
        }
        break;
      }

      case 'attack1': {
        // Coupe diagonale puissante (alternance haut-droite -> bas-gauche / bas-gauche -> haut-droite)
        const dur = 0.40;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        const slashDown = this.comboIndex === 0;
        if (slashDown) {
          if (t < 0.17) {
            const k = easeOutCubic(t / 0.17);
            p.rigPos.set(0.068 * k, 0.048 * k, 0.035 * k);
            p.rigRot.set(0.18 * k, -0.24 * k, -0.32 * k);
            p.rightWristRot.z = -0.18 * k;
          } else if (t < 0.39) {
            const k = easeOutQuart((t - 0.17) / 0.22);
            p.rigPos.set(
              THREE.MathUtils.lerp(0.068, -0.185, k),
              THREE.MathUtils.lerp(0.048, -0.072, k),
              THREE.MathUtils.lerp(0.035, -0.105, k)
            );
            p.rigRot.set(
              THREE.MathUtils.lerp(0.18, -0.26, k),
              THREE.MathUtils.lerp(-0.24, 0.52, k),
              THREE.MathUtils.lerp(-0.32, 0.46, k)
            );
            p.bladeEdgeTilt = -0.26 * k;
            p.rightWristRot.set(-0.16 * k, 0.14 * k, 0.24 * k);
            p.leftArmPos.set(-0.05 * k, -0.025 * k, 0.045 * k);
            p.cameraPunch.pitch = -0.009 * Math.sin(k * Math.PI);
            p.cameraPunch.roll = 0.012 * Math.sin(k * Math.PI);
          } else {
            const k = 1 - easeOutCubic((t - 0.39) / 0.61);
            p.rigPos.set(-0.185 * k, -0.072 * k, -0.105 * k);
            p.rigRot.set(-0.26 * k, 0.52 * k, 0.46 * k);
            p.bladeEdgeTilt = -0.26 * k;
            p.rightWristRot.set(-0.16 * k, 0.14 * k, 0.24 * k);
            p.leftArmPos.set(-0.05 * k, -0.025 * k, 0.045 * k);
          }
        } else {
          if (t < 0.16) {
            const k = easeOutCubic(t / 0.16);
            p.rigPos.set(-0.135 * k, -0.052 * k, 0.02 * k);
            p.rigRot.set(-0.15 * k, 0.38 * k, 0.42 * k);
          } else if (t < 0.39) {
            const k = easeOutQuart((t - 0.16) / 0.23);
            p.rigPos.set(
              THREE.MathUtils.lerp(-0.135, 0.082, k),
              THREE.MathUtils.lerp(-0.052, 0.042, k),
              THREE.MathUtils.lerp(0.02, -0.095, k)
            );
            p.rigRot.set(
              THREE.MathUtils.lerp(-0.15, 0.16, k),
              THREE.MathUtils.lerp(0.38, -0.32, k),
              THREE.MathUtils.lerp(0.42, -0.34, k)
            );
            p.bladeEdgeTilt = 0.24 * k;
            p.rightWristRot.set(-0.12 * k, -0.16 * k, -0.20 * k);
            p.leftArmPos.set(-0.035 * k, -0.015 * k, 0.035 * k);
            p.cameraPunch.pitch = 0.008 * Math.sin(k * Math.PI);
            p.cameraPunch.roll = -0.011 * Math.sin(k * Math.PI);
          } else {
            const k = 1 - easeOutCubic((t - 0.39) / 0.61);
            p.rigPos.set(0.082 * k, 0.042 * k, -0.095 * k);
            p.rigRot.set(0.16 * k, -0.32 * k, -0.34 * k);
            p.bladeEdgeTilt = 0.24 * k;
            p.rightWristRot.set(-0.12 * k, -0.16 * k, -0.20 * k);
            p.leftArmPos.set(-0.035 * k, -0.015 * k, 0.035 * k);
          }
        }
        break;
      }

      case 'attack2': {
        // Estocade militaire lourde : armé à l'épaule puis poussée directe vers le viseur
        const dur = 0.52;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        if (t < 0.22) {
          const k = easeInOutCubic(t / 0.22);
          p.rigPos.set(0.032 * k, -0.018 * k, 0.075 * k);
          p.rigRot.set(0.06 * k, -0.08 * k, 0.26 * k);
          p.bladeAxisRoll = 0.58 * k;
          p.rightWristRot.z = -0.18 * k;
          p.leftArmPos.set(-0.02 * k, -0.01 * k, 0.03 * k);
        } else if (t < 0.42) {
          const k = easeOutQuart((t - 0.22) / 0.20);
          p.rigPos.set(
            THREE.MathUtils.lerp(0.032, -0.078, k),
            THREE.MathUtils.lerp(-0.018, 0.016, k),
            THREE.MathUtils.lerp(0.075, -0.205, k)
          );
          p.rigRot.set(
            THREE.MathUtils.lerp(0.06, -0.05, k),
            THREE.MathUtils.lerp(-0.08, 0.14, k),
            THREE.MathUtils.lerp(0.26, 0.44, k)
          );
          p.bladeAxisRoll = THREE.MathUtils.lerp(0.58, 0.68, k);
          p.rightWristRot.set(-0.08 * k, 0, -0.22 * k);
          p.leftArmPos.set(-0.05 * k, -0.03 * k, 0.055 * k);
          p.cameraPunch.pitch = 0.012 * Math.sin(k * Math.PI);
          p.cameraPunch.roll = -0.014 * Math.sin(k * Math.PI);
        } else {
          const k = 1 - easeOutCubic((t - 0.42) / 0.58);
          p.rigPos.set(-0.078 * k, 0.016 * k, -0.205 * k);
          p.rigRot.set(-0.05 * k, 0.14 * k, 0.44 * k);
          p.bladeAxisRoll = 0.68 * k;
          p.rightWristRot.set(-0.08 * k, 0, -0.22 * k);
          p.leftArmPos.set(-0.05 * k, -0.03 * k, 0.055 * k);
        }
        break;
      }
    }

    return p;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. COUTEAU CLASSIQUE — rotation axiale vive, coupes nettes & coup pic à glace
// ─────────────────────────────────────────────────────────────────────────────

class ClassicKnifeAnimator implements KnifeAnimator {
  readonly knifeType: KnifeType = 'couteau';
  private state: KnifeAnimState = 'idle';
  private timer = 0;
  private comboIndex = 0;
  private balanceTimer = 0;
  private nextBalanceAt = 4.0;
  private balanceActive = false;
  private balanceProgress = 0;
  private readonly pose = createEmptyPose();

  triggerDraw(): void {
    this.state = 'draw';
    this.timer = 0;
    this.balanceActive = false;
  }

  triggerInspect(): void {
    if (this.state === 'attack1' || this.state === 'attack2') return;
    this.state = 'inspect';
    this.timer = 0;
    this.balanceActive = false;
  }

  triggerAttack(secondary = false): void {
    if (this.state === 'attack1' && this.timer < 0.13) return;
    if (this.state === 'attack2' && this.timer < 0.24) return;
    if (!secondary) {
      this.comboIndex = (this.comboIndex + 1) % 2;
    }
    this.state = secondary ? 'attack2' : 'attack1';
    this.timer = 0;
    this.balanceActive = false;
  }

  getState(): KnifeAnimState {
    return this.state;
  }

  update(dt: number, now: number): KnifeAnimPose {
    this.timer += dt;
    const p = this.pose;
    p.rigPos.set(0, 0, 0);
    p.rigRot.set(0, 0, 0);
    p.bladePlaneSpin = 0;
    p.bladeAxisRoll = 0;
    p.bladeEdgeTilt = 0;
    p.rightWristRot.set(0, 0, 0);
    p.leftArmPos.set(0, 0, 0);
    p.leftArmRot.set(0, 0, 0);
    p.cameraPunch.pitch = 0;
    p.cameraPunch.roll = 0;

    switch (this.state) {
      case 'idle': {
        const t = now * 0.00125;
        // Légère figure en 8 souple (assassin tactile)
        p.rigPos.set(
          Math.sin(t) * 0.0032,
          Math.sin(t * 2) * 0.0018,
          Math.cos(t * 0.8) * 0.0014
        );
        p.rigRot.set(
          Math.cos(t * 0.9) * 0.009,
          Math.sin(t * 0.75) * 0.012,
          Math.sin(t * 1.1) * 0.010
        );
        p.leftArmPos.set(Math.sin(t + 0.5) * 0.0022, Math.cos(t * 1.4) * 0.0022, 0);

        // Vérification d'équilibre par roulis axial rapide
        this.balanceTimer += dt;
        if (!this.balanceActive && this.balanceTimer >= this.nextBalanceAt) {
          this.balanceActive = true;
          this.balanceProgress = 0;
          this.balanceTimer = 0;
          this.nextBalanceAt = 4.0 + Math.random() * 2.0;
        }
        if (this.balanceActive) {
          this.balanceProgress += dt / 0.85;
          if (this.balanceProgress >= 1) {
            this.balanceActive = false;
            this.balanceProgress = 0;
          } else {
            const b = this.balanceProgress;
            const env = smoothBell(b);
            p.bladeAxisRoll = Math.sin(b * Math.PI * 2) * 0.44 * env;
            p.rightWristRot.z = Math.sin(b * Math.PI * 2) * 0.14 * env;
          }
        }
        break;
      }

      case 'draw': {
        // Glisse du bas-gauche avec vrille axiale vive (360° autour de l'axe de la lame)
        const dur = 0.62;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        if (t < 0.78) {
          const k = t / 0.78;
          const ease = easeOutQuart(k);
          const inv = 1 - ease;
          p.rigPos.set(-0.13 * inv, -0.22 * inv, 0.05 * inv);
          p.rigRot.set(0.16 * inv, 0.24 * inv, 0.28 * inv);
          p.bladeAxisRoll = Math.PI * 2 * (1 - easeOutCubic(k));
          p.rightWristRot.z = -0.22 * inv;
          p.leftArmPos.set(-0.04 * inv, -0.10 * inv, 0.02 * inv);
        } else {
          const k = (t - 0.78) / 0.22;
          const lock = dampedLockBounce(k);
          p.rigPos.y = -lock * 0.012;
          p.rigRot.z = lock * 0.04;
        }
        break;
      }

      case 'inspect': {
        const dur = 1.75;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        const focus =
          t < 0.18
            ? easeOutCubic(t / 0.18)
            : t > 0.80
            ? 1 - easeInOutCubic((t - 0.80) / 0.20)
            : 1;

        p.rigPos.set(-0.062 * focus, 0.028 * focus, 0.036 * focus);
        p.rigRot.set(0.08 * focus, -0.26 * focus, 0.14 * focus);
        p.leftArmPos.set(-0.035 * focus, -0.04 * focus, 0.02 * focus);

        if (t < 0.50) {
          p.bladeAxisRoll = Math.PI * 4 * easeInOutCubic(t / 0.50);
        } else if (t < 0.82) {
          p.bladeAxisRoll = 0.52 * smoothBell((t - 0.50) / 0.32);
          p.bladeEdgeTilt = 0.16 * smoothBell((t - 0.50) / 0.32);
        }
        break;
      }

      case 'attack1': {
        // Coupes horizontales ultra-vives
        const dur = 0.32;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        const rightToLeft = this.comboIndex === 0;
        const s = rightToLeft ? 1 : -1;
        if (t < 0.14) {
          const k = easeOutCubic(t / 0.14);
          p.rigPos.set(0.06 * s * k, 0.01 * k, 0.025 * k);
          p.rigRot.set(0.04 * k, -0.20 * s * k, -0.25 * s * k);
          p.bladeAxisRoll = 0.78 * s * k;
        } else if (t < 0.36) {
          const k = easeOutQuart((t - 0.14) / 0.22);
          p.rigPos.set(
            THREE.MathUtils.lerp(0.06 * s, -0.17 * s, k),
            THREE.MathUtils.lerp(0.01, -0.025, k),
            THREE.MathUtils.lerp(0.025, -0.09, k)
          );
          p.rigRot.set(
            -0.08 * k,
            THREE.MathUtils.lerp(-0.20 * s, 0.45 * s, k),
            THREE.MathUtils.lerp(-0.25 * s, 0.35 * s, k)
          );
          p.bladeAxisRoll = 0.78 * s;
          p.rightWristRot.y = 0.22 * s * k;
          p.leftArmPos.set(-0.04 * k, -0.02 * k, 0.04 * k);
          p.cameraPunch.pitch = -0.006 * Math.sin(k * Math.PI);
          p.cameraPunch.roll = 0.010 * s * Math.sin(k * Math.PI);
        } else {
          const k = 1 - easeOutCubic((t - 0.36) / 0.64);
          p.rigPos.set(-0.17 * s * k, -0.025 * k, -0.09 * k);
          p.rigRot.set(-0.08 * k, 0.45 * s * k, 0.35 * s * k);
          p.bladeAxisRoll = 0.78 * s * k;
          p.rightWristRot.y = 0.22 * s * k;
          p.leftArmPos.set(-0.04 * k, -0.02 * k, 0.04 * k);
        }
        break;
      }

      case 'attack2': {
        // Coup lourd en prise pic à glace (retournement puis frappe descendante vers l'avant)
        const dur = 0.48;
        const t = this.timer / dur;
        if (t >= 1) {
          this.state = 'idle';
          break;
        }
        if (t < 0.22) {
          const k = easeOutCubic(t / 0.22);
          p.rigPos.set(0.03 * k, 0.11 * k, 0.02 * k);
          p.rigRot.set(0.35 * k, -0.10 * k, -0.15 * k);
          p.bladePlaneSpin = Math.PI * 0.58 * k;
          p.leftArmPos.set(-0.03 * k, 0.02 * k, 0.02 * k);
        } else if (t < 0.44) {
          const k = easeOutQuart((t - 0.22) / 0.22);
          p.rigPos.set(
            THREE.MathUtils.lerp(0.03, -0.06, k),
            THREE.MathUtils.lerp(0.11, -0.115, k),
            THREE.MathUtils.lerp(0.02, -0.145, k)
          );
          p.rigRot.set(THREE.MathUtils.lerp(0.35, -0.58, k), 0.12 * k, 0.18 * k);
          p.bladePlaneSpin = Math.PI * 0.58;
          p.leftArmPos.set(-0.05 * k, -0.04 * k, 0.05 * k);
          p.cameraPunch.pitch = -0.017 * Math.sin(k * Math.PI);
          p.cameraPunch.roll = -0.012 * Math.sin(k * Math.PI);
        } else {
          const k = 1 - easeOutCubic((t - 0.44) / 0.56);
          p.rigPos.set(-0.06 * k, -0.115 * k, -0.145 * k);
          p.rigRot.set(-0.58 * k, 0.12 * k, 0.18 * k);
          p.bladePlaneSpin = Math.PI * 0.58 * k;
          p.leftArmPos.set(-0.05 * k, -0.04 * k, 0.05 * k);
        }
        break;
      }
    }

    return p;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory & Application sur la scène Three.js
// ─────────────────────────────────────────────────────────────────────────────

export function createKnifeAnimator(knifeType: KnifeType): KnifeAnimator {
  if (knifeType === 'karambit') return new KarambitAnimator();
  if (knifeType === 'baionnette') return new BaionnetteAnimator();
  return new ClassicKnifeAnimator();
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
  return { rightHandObj, fistCenter, handHandleAxis };
}

/**
 * Aligne géométriquement la poignée du couteau (Karambit ou Baïonnette) exactement
 * dans l'axe et le creux du poing droit à partir des pixels réels du skin (`gripMeta`),
 * garantissant zéro décalage quel que soit le ratio d'image du skin.
 */
export function alignBladeWeaponToFist(
  weaponGroup: THREE.Group,
  archetype: WeaponArchetype,
  hands: FPSHandsRig,
  weaponCfg: FPSWeaponViewConfig,
  gripMeta?: WeaponGripMeta
): void {
  const { fistCenter, handHandleAxis } = getRightFistBasis(hands);

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
  const srcBlade = new THREE.Vector3(...meta.bladeDir).normalize();
  const srcNormal = new THREE.Vector3().crossVectors(srcHandle, srcBlade).normalize();
  const mSrc = new THREE.Matrix4().makeBasis(srcHandle, srcBlade, srcNormal);

  let mTarget: THREE.Matrix4;
  if (archetype === 'karambit') {
    // Prise inversée : manche coaxial aux doigts (pinky -> index), lame courbée vers l'avant-gauche et le haut
    const desiredBladeRaw = new THREE.Vector3(-0.84, 0.54, 0).normalize();
    const handBladeDir = desiredBladeRaw
      .clone()
      .addScaledVector(handHandleAxis, -desiredBladeRaw.dot(handHandleAxis))
      .normalize();
    const handNormal = new THREE.Vector3().crossVectors(handHandleAxis, handBladeDir).normalize();
    mTarget = new THREE.Matrix4().makeBasis(handHandleAxis, handBladeDir, handNormal);
  } else {
    // Prise sabre baïonnette : lame pointée vers l'avant, dos denté vers le haut
    const bayonetForward = new THREE.Vector3(-0.14, -0.12, -0.98).normalize();
    const rawUp = new THREE.Vector3(0.22, 0.97, -0.10).normalize();
    const bayonetUp = rawUp
      .clone()
      .addScaledVector(bayonetForward, -rawUp.dot(bayonetForward))
      .normalize();
    const bayonetRight = new THREE.Vector3().crossVectors(bayonetForward, bayonetUp).normalize();
    mTarget = new THREE.Matrix4().makeBasis(bayonetForward, bayonetUp, bayonetRight);
  }

  const mRot = new THREE.Matrix4().multiplyMatrices(mTarget, mSrc.transpose());
  const q = new THREE.Quaternion().setFromRotationMatrix(mRot);

  weaponGroup.quaternion.copy(q);
  weaponGroup.scale.setScalar(weaponCfg.scale);
  const gripOffset = new THREE.Vector3(...meta.gripLocalPos)
    .multiplyScalar(weaponCfg.scale)
    .applyQuaternion(q);
  weaponGroup.position.copy(fistCenter).sub(gripOffset);
}

/**
 * Capture les axes locaux exacts du couteau et les poses de repos des mains
 * immédiatement après `applyWeaponViewPose`, sans jamais altérer `cfg.scale`.
 */
export function captureKnifeRigRestData(
  archetype: WeaponArchetype,
  weaponCfg: FPSWeaponViewConfig,
  hands: FPSHandsRig,
  weaponGroup?: THREE.Group,
  gripMeta?: WeaponGripMeta
): KnifeRigRestData {
  const muzzleSide = getWeaponMuzzleSide(archetype);
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
    const bDir = new THREE.Vector3(...gripMeta.bladeDir).normalize();
    // Pour le karambit (bladeDir vers l'intérieur), bDir x hAx donne la normale où +theta lève la pointe
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

  return {
    archetype,
    gripPivot: fistCenter,
    planeNormal,
    lengthAxis,
    edgeAxis,
    baseLeftArmPos: hands.leftArm.position.clone(),
    baseLeftArmRot: hands.leftArm.rotation.clone(),
    baseRightHandRot: rightHandObj ? rightHandObj.rotation.clone() : new THREE.Euler(),
  };
}

const _qSpin = new THREE.Quaternion();
const _qPlane = new THREE.Quaternion();
const _qAxis = new THREE.Quaternion();
const _qEdge = new THREE.Quaternion();
const _tmpPivot = new THREE.Vector3();

/**
 * Applique la pose animée du couteau sur `viewModelRig`, `weaponMount` (autour du pivot
 * de prise) et les mains FPS, en laissant intacte l'échelle exacte de l'arme (`cfg.scale`).
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

  // Rotation de la lame autour du point de prise dans la main (sans toucher à scale)
  _qPlane.setFromAxisAngle(rest.planeNormal, pose.bladePlaneSpin);
  _qAxis.setFromAxisAngle(rest.lengthAxis, pose.bladeAxisRoll);
  _qEdge.setFromAxisAngle(rest.edgeAxis, pose.bladeEdgeTilt);
  _qSpin.copy(_qPlane).multiply(_qAxis).multiply(_qEdge);

  weaponMount.quaternion.copy(_qSpin);
  _tmpPivot.copy(rest.gripPivot).applyQuaternion(_qSpin);
  weaponMount.position.copy(rest.gripPivot).sub(_tmpPivot);
  weaponMount.scale.set(1, 1, 1);

  // Articulation subtile du poignet droit et de la main gauche de garde
  const rightHandObj = hands.rightArm.getObjectByName('right_hand');
  if (rightHandObj) {
    rightHandObj.rotation.set(
      rest.baseRightHandRot.x + pose.rightWristRot.x,
      rest.baseRightHandRot.y + pose.rightWristRot.y,
      rest.baseRightHandRot.z + pose.rightWristRot.z
    );
  }

  hands.leftArm.position.set(
    rest.baseLeftArmPos.x + pose.leftArmPos.x,
    rest.baseLeftArmPos.y + pose.leftArmPos.y,
    rest.baseLeftArmPos.z + pose.leftArmPos.z
  );
  hands.leftArm.rotation.set(
    rest.baseLeftArmRot.x + pose.leftArmRot.x,
    rest.baseLeftArmRot.y + pose.leftArmRot.y,
    rest.baseLeftArmRot.z + pose.leftArmRot.z
  );
}
