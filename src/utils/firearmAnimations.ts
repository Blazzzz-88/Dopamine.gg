/**
 * Firearm Animation System — inspection (touche T) & rechargement avec changement de chargeur.
 *
 * Préserve la symétrie et le centrage exact du canon au repos (`0, 0, 0`),
 * tout en articulant le bras gauche (depuis l'épaule fixe via `setArmPose`),
 * le boîtier d'arme et le chargeur 3D détachable (`magazineGroup`).
 */

import * as THREE from 'three';
import { ArmHoldPose, FPSHandsRig, FPSWeaponViewConfig, getBaseArmHolds } from './fpsHandsBuilder';
import { WeaponArchetype, WeaponMagMeta } from './weapon3dBuilder';

export type FirearmAnimState = 'idle' | 'reload' | 'inspect';
export type FirearmSoundEvent =
  | 'mag_out'
  | 'mag_in'
  | 'bolt_rack'
  | 'inspect_start'
  | 'inspect_check';

export interface FirearmAnimPose {
  state: FirearmAnimState;
  /** Translation additive du viewModelRig (espace caméra) */
  rigPos: THREE.Vector3;
  /** Rotation additive du viewModelRig (Euler XYZ) */
  rigRot: THREE.Euler;
  /** Rotation supplémentaire de l'arme autour de la poignée principale (inspection / recul) */
  weaponRot: THREE.Euler;
  /** Déplacement du chargeur le long de l'axe d'extraction (`0` = enclenché, `> 0` = sorti) */
  magSlide: number;
  /** Bascule angulaire du chargeur (rock-and-lock AK-47 / décrochage) */
  magTilt: number;
  /** Visibilité explicite du chargeur (utile pour les chargeurs internes de pistolet ou échange hors champ) */
  magVisible: boolean;
  /** Pose complète du bras gauche articulé (null = pose de repos du FPSHandsRig) */
  leftArmOverride: ArmHoldPose | null;
  /** Pose complète du bras droit articulé (null = pose de repos) */
  rightArmOverride: ArmHoldPose | null;
  /** Événements sonores ponctuels émis sur cette frame */
  events: FirearmSoundEvent[];
}

export interface FirearmAnimator {
  readonly archetype: WeaponArchetype;
  update(dt: number, now: number): FirearmAnimPose;
  triggerReload(durationMs: number): void;
  triggerInspect(): void;
  cancel(): void;
  getState(): FirearmAnimState;
  isBusy(): boolean;
}

export interface FirearmRigRestData {
  archetype: WeaponArchetype;
  baseLeft: ArmHoldPose;
  baseRight: ArmHoldPose;
  rightGripPivot: THREE.Vector3;
  weaponBasePos: THREE.Vector3;
  weaponBaseQuat: THREE.Quaternion;
  magAnchorLocal: THREE.Vector3;
  magPullDirLocal: THREE.Vector3;
  magLengthLocal: number;
  magAnchorRig: THREE.Vector3;
  magPullDirRig: THREE.Vector3;
  magRigScale: number;
  isInternalMag: boolean;
  magazineGroup?: THREE.Group;
  boltTargetRig: [number, number, number];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  const c = 1 - clamp01(t);
  return 1 - c * c * c;
}

function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function smoothBell(t: number): number {
  return Math.sin(clamp01(t) * Math.PI);
}

function interpolateArmPose(a: ArmHoldPose, b: ArmHoldPose, t: number): ArmHoldPose {
  const k = clamp01(t);
  const trA = a.thumbRot ?? [0.1, -0.2, 0.16];
  const trB = b.thumbRot ?? trA;
  return {
    handPos: [
      lerp(a.handPos[0], b.handPos[0], k),
      lerp(a.handPos[1], b.handPos[1], k),
      lerp(a.handPos[2], b.handPos[2], k),
    ],
    handRot: [
      lerp(a.handRot[0], b.handRot[0], k),
      lerp(a.handRot[1], b.handRot[1], k),
      lerp(a.handRot[2], b.handRot[2], k),
    ],
    shoulderTarget: [
      lerp(a.shoulderTarget[0], b.shoulderTarget[0], k),
      lerp(a.shoulderTarget[1], b.shoulderTarget[1], k),
      lerp(a.shoulderTarget[2], b.shoulderTarget[2], k),
    ],
    proxCurl: lerp(a.proxCurl, b.proxCurl, k),
    distCurl: lerp(a.distCurl, b.distCurl, k),
    indexCurl:
      a.indexCurl !== undefined || b.indexCurl !== undefined
        ? lerp(a.indexCurl ?? a.proxCurl, b.indexCurl ?? b.proxCurl, k)
        : undefined,
    thumbRot: [lerp(trA[0], trB[0], k), lerp(trA[1], trB[1], k), lerp(trA[2], trB[2], k)],
    visible: b.visible !== false || k < 0.94,
  };
}

/**
 * Capture la pose de repos d'une arme à feu et les repères locaux/rig de son chargeur
 * afin de piloter précisément la main gauche lors du retrait et de l'insertion du chargeur.
 */
export function captureFirearmRigRestData(
  archetype: WeaponArchetype,
  weaponCfg: FPSWeaponViewConfig,
  weaponGroup: THREE.Group,
  magMeta?: WeaponMagMeta,
  magazineGroup?: THREE.Group
): FirearmRigRestData {
  weaponGroup.updateMatrix();
  const baseHolds = getBaseArmHolds(archetype);

  const fallbackMeta: WeaponMagMeta = magMeta ?? {
    anchorLocalPos: [archetype === 'pistolet' ? -0.9 : -0.15, -0.1, 0],
    pullDirLocal: [archetype === 'ak47' ? -0.25 : 0, -1, 0],
    magLengthLocal: 0.9,
    isInternal: archetype === 'pistolet',
  };

  const magAnchorLocal = new THREE.Vector3(...fallbackMeta.anchorLocalPos);
  const magPullDirLocal = new THREE.Vector3(...fallbackMeta.pullDirLocal).normalize();
  const magAnchorRig = magAnchorLocal.clone().applyMatrix4(weaponGroup.matrix);
  const magPullDirRig = magPullDirLocal
    .clone()
    .transformDirection(weaponGroup.matrix)
    .normalize();

  let boltTargetRig: [number, number, number] = [-0.03, 0.032, 0.05];
  if (archetype === 'ak47') boltTargetRig = [-0.036, 0.032, 0.015];
  else if (archetype === 'awp') boltTargetRig = [-0.032, 0.036, 0.045];
  else if (archetype === 'pistolet') boltTargetRig = [-0.024, 0.054, 0.075];
  else if (archetype === 'mac10') boltTargetRig = [-0.022, 0.064, 0.012];

  return {
    archetype,
    baseLeft: baseHolds.left,
    baseRight: baseHolds.right,
    rightGripPivot: new THREE.Vector3(...baseHolds.right.handPos),
    weaponBasePos: weaponGroup.position.clone(),
    weaponBaseQuat: weaponGroup.quaternion.clone(),
    magAnchorLocal,
    magPullDirLocal,
    magLengthLocal: fallbackMeta.magLengthLocal,
    magAnchorRig,
    magPullDirRig,
    magRigScale: weaponCfg.scale,
    isInternalMag: Boolean(fallbackMeta.isInternal),
    magazineGroup,
    boltTargetRig,
  };
}

export function createFirearmAnimator(archetype: WeaponArchetype): FirearmAnimator {
  let state: FirearmAnimState = 'idle';
  let elapsed = 0;
  let duration = 1.15;
  let emittedFlags = {
    magOut: false,
    magIn: false,
    boltRack: false,
    inspectStart: false,
    inspectCheck: false,
  };

  const baseHolds = getBaseArmHolds(archetype);

  const resetFlags = () => {
    emittedFlags = {
      magOut: false,
      magIn: false,
      boltRack: false,
      inspectStart: false,
      inspectCheck: false,
    };
  };

  const triggerReload = (durationMs: number) => {
    state = 'reload';
    elapsed = 0;
    duration = Math.max(0.65, durationMs / 1000);
    resetFlags();
  };

  const triggerInspect = () => {
    // Le rechargement est prioritaire sur une nouvelle inspection
    if (state === 'reload') return;
    state = 'inspect';
    elapsed = 0;
    duration =
      archetype === 'awp'
        ? 3.5
        : archetype === 'pistolet'
        ? 3.0
        : archetype === 'mac10'
        ? 2.8
        : 3.3;
    resetFlags();
  };

  const cancel = () => {
    state = 'idle';
    elapsed = 0;
    resetFlags();
  };

  const createIdlePose = (events: FirearmSoundEvent[] = []): FirearmAnimPose => ({
    state: 'idle',
    rigPos: new THREE.Vector3(),
    rigRot: new THREE.Euler(),
    weaponRot: new THREE.Euler(),
    magSlide: 0,
    magTilt: 0,
    magVisible: archetype !== 'pistolet',
    leftArmOverride: null,
    rightArmOverride: null,
    events,
  });

  const updateReload = (dt: number): FirearmAnimPose => {
    elapsed += dt;
    const u = clamp01(elapsed / duration);
    const events: FirearmSoundEvent[] = [];

    if (!emittedFlags.magOut && u >= 0.18) {
      emittedFlags.magOut = true;
      events.push('mag_out');
    }
    if (!emittedFlags.magIn && u >= 0.72) {
      emittedFlags.magIn = true;
      events.push('mag_in');
    }
    if (!emittedFlags.boltRack && u >= 0.84) {
      emittedFlags.boltRack = true;
      events.push('bolt_rack');
    }

    if (u >= 1) {
      state = 'idle';
      return createIdlePose(events);
    }

    // 1. Mouvement du châssis (inclinaison pour exposer le puits de chargeur + chocs mécaniques)
    const cantWeight =
      u < 0.16
        ? easeOutCubic(u / 0.16)
        : u < 0.80
        ? 1.0
        : 1 - easeInOutCubic((u - 0.80) / 0.20);

    // Chocs tactiles: extraction (u=0.20), verrouillage chargeur (u=0.73), armement culasse (u=0.85)
    const ejectKick = u >= 0.18 && u <= 0.28 ? -smoothBell((u - 0.18) / 0.10) * 0.012 : 0;
    const seatSlap = u >= 0.72 && u <= 0.80 ? smoothBell((u - 0.72) / 0.08) * 0.018 : 0;
    const boltKickZ = u >= 0.83 && u <= 0.94 ? smoothBell((u - 0.83) / 0.11) * 0.022 : 0;

    const isHandgun = archetype === 'pistolet' || archetype === 'mac10';
    const rigPos = new THREE.Vector3(
      -0.042 * cantWeight,
      (-0.018 + (isHandgun ? 0.014 : 0)) * cantWeight + ejectKick + seatSlap,
      0.024 * cantWeight + boltKickZ
    );
    const rigRot = new THREE.Euler(
      (isHandgun ? 0.26 : 0.20) * cantWeight + seatSlap * 1.4,
      (-0.16) * cantWeight,
      (-0.32) * cantWeight - ejectKick * 2.0
    );

    // 2. Animation réelle du chargeur 3D (déverrouillage -> descente hors écran -> nouveau chargeur -> enclenchement)
    let magSlide = 0;
    let magTilt = 0;
    let magVisible = archetype !== 'pistolet';
    const isAK = archetype === 'ak47';

    if (u < 0.17) {
      magSlide = 0;
      magTilt = 0;
    } else if (u < 0.43) {
      // Phase d'extraction : glisse hors du puits puis tombe hors champ bas
      const k = clamp01((u - 0.17) / 0.26);
      const easeK = k * k * 1.35 + k * 0.45;
      magSlide = easeK * 2.2;
      magTilt = isAK ? smoothBell(Math.min(1, k * 1.5)) * -0.26 : k * -0.14;
      magVisible = true;
    } else if (u < 0.51) {
      // Transition hors écran pour saisir un chargeur plein
      magSlide = 2.6;
      magTilt = isAK ? -0.22 : 0;
      magVisible = false;
    } else if (u < 0.74) {
      // Remontée et insertion droite du chargeur neuf dans le puits
      const k = easeOutCubic((u - 0.51) / 0.23);
      magSlide = (1 - k) * 2.35;
      magTilt = isAK ? (1 - k) * -0.24 : 0;
      magVisible = true;
    } else {
      magSlide = 0;
      magTilt = 0;
      magVisible = archetype !== 'pistolet';
    }

    // Pose abstraite de la main gauche pilotée par `magSlide` (ciblée sur `magAnchorRig` dans applyFirearmAnimPose!)
    // On encode les angles de doigts/poignet ici; `handPos` sera raffiné sur la géométrie réelle du chargeur dans applyPose
    const holdLeft = baseHolds.left;
    const grabMagHand: ArmHoldPose = {
      handPos: [holdLeft.handPos[0], holdLeft.handPos[1], holdLeft.handPos[2]],
      handRot: [0.12, -0.18, 1.48],
      shoulderTarget: [-0.46, -0.32, 0.36],
      proxCurl: -1.35,
      distCurl: -1.16,
      thumbRot: [0.18, -0.18, 0.22],
      visible: true,
    };

    const offscreenMagHand: ArmHoldPose = {
      handPos: [-0.14, -0.34, 0.04],
      handRot: [0.18, -0.12, 1.38],
      shoulderTarget: [-0.50, -0.38, 0.36],
      proxCurl: -1.42,
      distCurl: -1.24,
      thumbRot: [0.16, -0.16, 0.20],
      visible: true,
    };

    const boltHand: ArmHoldPose = {
      handPos: [holdLeft.handPos[0], holdLeft.handPos[1], holdLeft.handPos[2]],
      handRot: [-0.18, -0.36, 1.74],
      shoulderTarget: [-0.44, -0.24, 0.34],
      proxCurl: -1.22,
      distCurl: -1.04,
      thumbRot: [0.14, -0.22, 0.16],
      visible: true,
    };

    let leftArmOverride: ArmHoldPose;
    if (u < 0.17) {
      // Main quitte la garde et descend saisir le chargeur engagé
      leftArmOverride = interpolateArmPose(holdLeft, grabMagHand, easeOutCubic(u / 0.17));
      // Signal spécial encodé via shoulderTarget/flag: `magAnchor` suivi dès u >= 0.08
      leftArmOverride.indexCurl = lerp(0, 1, easeOutCubic(u / 0.17));
    } else if (u < 0.43) {
      // Main accompagne le chargeur vide vers le bas puis descend sous le cadre
      const k = clamp01((u - 0.17) / 0.26);
      leftArmOverride = interpolateArmPose(grabMagHand, offscreenMagHand, k * k);
      leftArmOverride.indexCurl = 1;
    } else if (u < 0.51) {
      leftArmOverride = { ...offscreenMagHand, indexCurl: 1 };
    } else if (u < 0.74) {
      // Main remonte avec le nouveau chargeur jusque dans le puits
      const k = easeOutCubic((u - 0.51) / 0.23);
      leftArmOverride = interpolateArmPose(offscreenMagHand, grabMagHand, k);
      leftArmOverride.indexCurl = 1;
    } else if (u < 0.89) {
      // Main monte armer le levier / verrou de culasse (ou la glissière)
      const k = easeInOutCubic((u - 0.74) / 0.15);
      leftArmOverride = interpolateArmPose(grabMagHand, boltHand, k);
      leftArmOverride.indexCurl = 2 + k; // code >= 2 => cible `boltTargetRig` dans applyPose
    } else {
      // Retour à la garde de tir normale (ou descente hors champ sur MAC-10)
      const k = easeInOutCubic((u - 0.89) / 0.11);
      leftArmOverride = interpolateArmPose(boltHand, holdLeft, k);
      leftArmOverride.indexCurl = 3 + k; // retour depuis `boltTargetRig` vers `holdLeft`
    }

    return {
      state: 'reload',
      rigPos,
      rigRot,
      weaponRot: new THREE.Euler(),
      magSlide,
      magTilt,
      magVisible,
      leftArmOverride,
      rightArmOverride: null,
      events,
    };
  };

  const updateInspect = (dt: number): FirearmAnimPose => {
    elapsed += dt;
    const u = clamp01(elapsed / duration);
    const events: FirearmSoundEvent[] = [];

    if (!emittedFlags.inspectStart && u >= 0.02) {
      emittedFlags.inspectStart = true;
      events.push('inspect_start');
    }
    if (!emittedFlags.inspectCheck && u >= 0.48) {
      emittedFlags.inspectCheck = true;
      events.push('inspect_check');
    }

    if (u >= 1) {
      state = 'idle';
      return createIdlePose(events);
    }

    // Courbe enveloppe globale propre (départ doux -> plateau d'exposition -> retour verrouillé)
    const liftEnv =
      u < 0.18
        ? easeOutCubic(u / 0.18)
        : u < 0.82
        ? 1
        : 1 - easeInOutCubic((u - 0.82) / 0.18);

    // Exposition des deux faces du skin 3D
    let sideSweep = 0;
    if (u >= 0.16 && u < 0.36) {
      sideSweep = -easeInOutCubic((u - 0.16) / 0.20);
    } else if (u >= 0.36 && u < 0.64) {
      const k = easeInOutCubic((u - 0.36) / 0.28);
      sideSweep = lerp(-1, 1.15, k);
    } else if (u >= 0.64 && u < 0.84) {
      const k = easeInOutCubic((u - 0.64) / 0.20);
      sideSweep = lerp(1.15, 0, k);
    }

    // Mini vérification tactile du chargeur (AR-15 / AK-47 / MAC-10) au milieu de l'inspection
    let inspectMagSlide = 0;
    if (archetype === 'ar15' || archetype === 'ar15_sil' || archetype === 'ak47' || archetype === 'mac10') {
      if (u >= 0.44 && u <= 0.60) {
        inspectMagSlide = smoothBell((u - 0.44) / 0.16) * 0.24;
      }
    }

    let rigPos: THREE.Vector3;
    let rigRot: THREE.Euler;

    if (archetype === 'pistolet') {
      rigPos = new THREE.Vector3(-0.088 * liftEnv, 0.052 * liftEnv, 0.085 * liftEnv);
      rigRot = new THREE.Euler(
        (0.10 + 0.14 * sideSweep) * liftEnv,
        (0.68 - 0.36 * sideSweep) * liftEnv,
        (-0.12 + 0.68 * sideSweep) * liftEnv
      );
    } else if (archetype === 'mac10') {
      rigPos = new THREE.Vector3(-0.084 * liftEnv, 0.044 * liftEnv, 0.072 * liftEnv);
      rigRot = new THREE.Euler(
        (0.24 + 0.10 * sideSweep) * liftEnv,
        (0.64 - 0.34 * sideSweep) * liftEnv,
        0.74 * sideSweep * liftEnv
      );
    } else if (archetype === 'awp') {
      rigPos = new THREE.Vector3(-0.078 * liftEnv, 0.036 * liftEnv, 0.058 * liftEnv);
      rigRot = new THREE.Euler(
        (0.10 + 0.08 * sideSweep) * liftEnv,
        (0.58 - 0.24 * sideSweep) * liftEnv,
        (-0.10 + 0.56 * sideSweep) * liftEnv
      );
    } else {
      // AR-15 / AR-15 Silencieux / AK-47
      rigPos = new THREE.Vector3(-0.076 * liftEnv, 0.032 * liftEnv, 0.052 * liftEnv);
      rigRot = new THREE.Euler(
        (0.08 + 0.08 * sideSweep) * liftEnv,
        (0.56 - 0.26 * sideSweep) * liftEnv,
        (-0.10 + 0.62 * sideSweep) * liftEnv
      );
    }

    // Garde la main gauche cohérente avec l'inspection (abaissée sur pistolet, vérification chargeur sur fusils)
    const holdLeft = baseHolds.left;
    const magCheckBlend = inspectMagSlide > 0 ? clamp01(inspectMagSlide / 0.24) : 0;
    const inspectLeft: ArmHoldPose =
      archetype === 'pistolet'
        ? {
            ...holdLeft,
            handPos: [
              holdLeft.handPos[0] - 0.14 * liftEnv,
              holdLeft.handPos[1] - 0.16 * liftEnv,
              holdLeft.handPos[2] + 0.04 * liftEnv,
            ],
            handRot: [holdLeft.handRot[0], holdLeft.handRot[1], holdLeft.handRot[2] - 0.35 * liftEnv],
            shoulderTarget: [-0.46, -0.34, 0.36],
            proxCurl: lerp(holdLeft.proxCurl, -0.55, liftEnv),
            distCurl: lerp(holdLeft.distCurl, -0.45, liftEnv),
          }
        : archetype === 'mac10'
        ? holdLeft
        : {
            ...holdLeft,
            handPos: [
              holdLeft.handPos[0] - 0.012 * Math.abs(sideSweep),
              holdLeft.handPos[1] - 0.068 * magCheckBlend,
              holdLeft.handPos[2] + 0.095 * magCheckBlend + 0.01 * liftEnv,
            ],
            handRot: [
              holdLeft.handRot[0] + 0.10 * magCheckBlend,
              holdLeft.handRot[1] - 0.10 * liftEnv,
              holdLeft.handRot[2] - 0.22 * magCheckBlend,
            ],
          };

    return {
      state: 'inspect',
      rigPos,
      rigRot,
      weaponRot: new THREE.Euler(),
      magSlide: inspectMagSlide,
      magTilt: 0,
      magVisible: archetype !== 'pistolet',
      leftArmOverride: archetype === 'mac10' ? null : inspectLeft,
      rightArmOverride: null,
      events,
    };
  };

  return {
    archetype,
    update(dt: number) {
      if (state === 'reload') return updateReload(dt);
      if (state === 'inspect') return updateInspect(dt);
      return createIdlePose();
    },
    triggerReload,
    triggerInspect,
    cancel,
    getState() {
      return state;
    },
    isBusy() {
      return state !== 'idle';
    },
  };
}

const _qWeaponRot = new THREE.Quaternion();
const _tmpPivot = new THREE.Vector3();
const _tmpPull = new THREE.Vector3();
const _qMagTilt = new THREE.Quaternion();
const _axisZ = new THREE.Vector3(0, 0, 1);

/**
 * Applique l'animation de rechargement / d'inspection à `viewModelRig`, `weaponMount`,
 * `magazineGroup` et aux bras articulés `FPSHandsRig`.
 */
export function applyFirearmAnimPose(
  viewModelRig: THREE.Group,
  weaponMount: THREE.Group,
  hands: FPSHandsRig,
  rest: FirearmRigRestData,
  baseRigPos: [number, number, number],
  baseRigRot: [number, number, number],
  pose: FirearmAnimPose,
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

  // Rotation additionnelle de présentation (autour de la poignée principale pour ne jamais décoller la main droite)
  _qWeaponRot.setFromEuler(pose.weaponRot);
  weaponMount.quaternion.copy(_qWeaponRot);
  _tmpPivot.copy(rest.rightGripPivot).applyQuaternion(_qWeaponRot);
  weaponMount.position.copy(rest.rightGripPivot).sub(_tmpPivot);
  weaponMount.scale.set(1, 1, 1);

  // Déplacement & inclinaison du chargeur 3D dans le repère de l'arme
  if (rest.magazineGroup) {
    rest.magazineGroup.visible = pose.magVisible;
    const travel = pose.magSlide * rest.magLengthLocal;
    _tmpPull.copy(rest.magPullDirLocal).multiplyScalar(travel);
    rest.magazineGroup.position.copy(rest.magAnchorLocal).add(_tmpPull);

    if (rest.isInternalMag) {
      const qAlign = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, -1, 0),
        rest.magPullDirLocal
      );
      _qMagTilt.setFromAxisAngle(_axisZ, pose.magTilt);
      rest.magazineGroup.quaternion.copy(qAlign).multiply(_qMagTilt);
    } else {
      rest.magazineGroup.rotation.set(0, 0, pose.magTilt);
    }
  }

  // Bras droit
  if (pose.rightArmOverride) {
    hands.setArmPose('right', pose.rightArmOverride);
  } else {
    hands.setArmPose('right', rest.baseRight);
  }

  // Bras gauche : suit précisément la trajectoire 3D du chargeur ou de la culasse pendant le rechargement
  if (pose.leftArmOverride) {
    const code = pose.leftArmOverride.indexCurl;
    if (pose.state === 'reload' && code !== undefined) {
      const depthFrac = rest.isInternalMag ? pose.magSlide : 0.45 + pose.magSlide * 0.72;
      const magWorldInRigX =
        rest.magAnchorRig.x + rest.magPullDirRig.x * (rest.magRigScale * rest.magLengthLocal * depthFrac) - 0.026;
      const magWorldInRigY =
        rest.magAnchorRig.y + rest.magPullDirRig.y * (rest.magRigScale * rest.magLengthLocal * depthFrac) - 0.012;
      const magWorldInRigZ =
        rest.magAnchorRig.z + rest.magPullDirRig.z * (rest.magRigScale * rest.magLengthLocal * depthFrac) + 0.010;

      const resolvedPose: ArmHoldPose = { ...pose.leftArmOverride, indexCurl: undefined };

      if (code <= 1.01) {
        // Phase de saisie / descente / remontée avec le chargeur
        const t = clamp01(code);
        resolvedPose.handPos = [
          lerp(rest.baseLeft.handPos[0], magWorldInRigX, t),
          lerp(rest.baseLeft.handPos[1], magWorldInRigY, t),
          lerp(rest.baseLeft.handPos[2], magWorldInRigZ, t),
        ];
      } else if (code < 3.0) {
        // Transition chargeur -> levier d'armement / glissière (+ recul léger vers arrière en fin d'armement)
        const k = clamp01(code - 2.0);
        const rackPull = k > 0.45 ? Math.sin(((k - 0.45) / 0.55) * Math.PI) * 0.048 : 0;
        resolvedPose.handPos = [
          lerp(magWorldInRigX, rest.boltTargetRig[0], k),
          lerp(magWorldInRigY, rest.boltTargetRig[1], k),
          lerp(magWorldInRigZ, rest.boltTargetRig[2] + rackPull, k),
        ];
      } else {
        // Retour levier -> pose de repos du bras gauche
        const k = clamp01(code - 3.0);
        resolvedPose.handPos = [
          lerp(rest.boltTargetRig[0], rest.baseLeft.handPos[0], k),
          lerp(rest.boltTargetRig[1], rest.baseLeft.handPos[1], k),
          lerp(rest.boltTargetRig[2], rest.baseLeft.handPos[2], k),
        ];
        if (!rest.baseLeft.visible && k > 0.85) {
          resolvedPose.visible = false;
        }
      }
      hands.setArmPose('left', resolvedPose);
    } else {
      hands.setArmPose('left', pose.leftArmOverride);
    }
  } else {
    hands.setArmPose('left', rest.baseLeft);
  }
}
