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
      scale: 0.054,
      weaponPos: [-0.046, -0.008, 0.012],
      weaponRotOffset: [2.98, 2.41, -0.35],
      rigPosHip: [0.155, -0.088, -0.40],
      rigPosAds: [0.155, -0.088, -0.40],
      rigRotBase: [-0.015, 0.13, 0],
    };
  }

  // couteau (bayonet)
  return {
    scale: 0.095,
    weaponPos: [-0.0096, -0.0134, -0.0556],
    weaponRotOffset: [0.14, -0.14, -0.22],
    rigPosHip: [0.20, -0.138, -0.48],
    rigPosAds: [0.20, -0.138, -0.48],
    rigRotBase: [-0.015, 0.135, 0],
  };
}

/**
 * Generates a fine olive-camo tactical sleeve fabric texture safely
 * (returns null in Node environments without DOM canvas).
 */
function createCamoSleeveTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#4e5740';
  ctx.fillRect(0, 0, 128, 128);

  const patches: Array<[number, number, number, number, string]> = [
    [6, 12, 28, 14, '#3a422f'],
    [54, 8, 34, 18, '#666e50'],
    [96, 18, 26, 16, '#2f3526'],
    [18, 44, 36, 16, '#2d3324'],
    [72, 42, 30, 20, '#3e4732'],
    [104, 62, 24, 18, '#656c4e'],
    [8, 78, 32, 18, '#666e50'],
    [48, 76, 38, 16, '#373f2c'],
    [88, 92, 34, 22, '#2d3324'],
    [22, 106, 28, 16, '#5c6449'],
  ];
  for (const [x, y, w, h, color] of patches) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h * 0.5, w * 0.5, h * 0.5, 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(20, 24, 16, 0.16)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 128; y += 3) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 5);
  tex.needsUpdate = true;
  return tex;
}

interface FingerRig {
  proxRoot: THREE.Group;
  distRoot: THREE.Group;
}

interface ArticulatedArmHandle {
  armRoot: THREE.Group;
  handPivot: THREE.Group;
  forearmPivot: THREE.Group;
  thumbRoot: THREE.Group;
  fingers: FingerRig[];
  setHold: (opts: {
    handPos: [number, number, number];
    handRot: [number, number, number];
    shoulderTarget: [number, number, number];
    proxCurl: number;
    distCurl: number;
    indexCurl?: number;
    thumbRot?: [number, number, number];
    visible?: boolean;
  }) => void;
}

const POS_Z_AXIS = new THREE.Vector3(0, 0, 1);

function buildArticulatedArm(
  side: 'left' | 'right',
  sleeveTex: THREE.CanvasTexture | null,
  accentHex: string
): ArticulatedArmHandle {
  const s = side === 'right' ? 1 : -1;
  const armRoot = new THREE.Group();
  armRoot.name = side === 'right' ? 'fps_right_arm' : 'fps_left_arm';

  const sleeveMat = new THREE.MeshStandardMaterial({
    color: sleeveTex ? '#cfd3c2' : '#4a533c',
    ...(sleeveTex ? { map: sleeveTex } : {}),
    roughness: 0.90,
    metalness: 0.04,
  });
  const cuffMat = new THREE.MeshStandardMaterial({
    color: '#434b38',
    roughness: 0.85,
    metalness: 0.05,
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: '#464742',
    roughness: 0.72,
    metalness: 0.06,
  });
  const palmGripMat = new THREE.MeshStandardMaterial({
    color: '#2c2f2c',
    roughness: 0.80,
    metalness: 0.08,
  });
  const knuckleArmorMat = new THREE.MeshStandardMaterial({
    color: '#373a36',
    roughness: 0.48,
    metalness: 0.22,
  });
  const strapMat = new THREE.MeshStandardMaterial({
    color: '#252825',
    roughness: 0.74,
    metalness: 0.12,
  });
  const trimStitchMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.55,
    metalness: 0.18,
    emissive: accentHex,
    emissiveIntensity: 0.06,
  });

  // 1. Sleek Anatomical Gloved Hand centered at grip origin (0,0,0)
  const handPivot = new THREE.Group();
  handPivot.name = `${side}_hand`;
  armRoot.add(handPivot);

  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), gloveMat);
  palm.scale.set(0.90, 0.35, 0.98);
  palm.position.set(0, 0, -0.002);
  handPivot.add(palm);

  const innerGripPad = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), palmGripMat);
  innerGripPad.scale.set(0.86, 0.25, 0.86);
  innerGripPad.position.set(0, -0.005, -0.003);
  handPivot.add(innerGripPad);

  const knuckle = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.034, 4, 8), knuckleArmorMat);
  knuckle.rotation.z = Math.PI / 2;
  knuckle.position.set(0, 0.007, -0.021);
  handPivot.add(knuckle);

  const wristStrap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.020, 0.028, 12), strapMat);
  wristStrap.rotation.x = Math.PI / 2;
  wristStrap.scale.set(1.02, 1.0, 0.72);
  wristStrap.position.set(0, 0, 0.024);
  handPivot.add(wristStrap);

  const fingers: FingerRig[] = [];
  const fingerOffsets = [-0.017, -0.0055, 0.006, 0.017];
  const proxLen = [0.018, 0.020, 0.018, 0.015];
  const distLen = [0.014, 0.016, 0.014, 0.012];

  fingerOffsets.forEach((fx, idx) => {
    const proxRoot = new THREE.Group();
    proxRoot.position.set(fx * s, 0.001, -0.024);

    const proxMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.0050, proxLen[idx], 4, 8),
      palmGripMat
    );
    proxMesh.rotation.x = Math.PI / 2;
    proxMesh.position.set(0, 0, -proxLen[idx] * 0.52);
    proxRoot.add(proxMesh);

    const distRoot = new THREE.Group();
    distRoot.position.set(0, 0, -proxLen[idx]);
    const distMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.0045, distLen[idx], 4, 8),
      gloveMat
    );
    distMesh.rotation.x = Math.PI / 2;
    distMesh.position.set(0, 0, -distLen[idx] * 0.55);
    distRoot.add(distMesh);

    proxRoot.add(distRoot);
    handPivot.add(proxRoot);
    fingers.push({ proxRoot, distRoot });
  });

  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(-0.023 * s, 0.001, -0.004);

  const thumbBase = new THREE.Mesh(new THREE.CapsuleGeometry(0.0062, 0.020, 4, 8), gloveMat);
  thumbBase.rotation.x = Math.PI / 2;
  thumbBase.position.set(0, 0, -0.012);
  thumbRoot.add(thumbBase);

  const thumbTip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0054, 0.014, 4, 8), palmGripMat);
  thumbTip.rotation.x = Math.PI / 2;
  thumbTip.position.set(0, -0.002, -0.026);
  thumbRoot.add(thumbTip);

  handPivot.add(thumbRoot);

  // 2. Seamlessly Joined Forearm + Anatomical Oval Tapered Cuff + Camo Sleeve
  const forearmPivot = new THREE.Group();
  forearmPivot.name = `${side}_forearm`;
  armRoot.add(forearmPivot);

  const cuffHem = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0038, 8, 16), cuffMat);
  cuffHem.scale.set(1.0, 0.80, 1.0);
  cuffHem.position.set(0, 0, 0.008);
  forearmPivot.add(cuffHem);

  const cuffBand = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.025, 0.042, 14), cuffMat);
  cuffBand.rotation.x = Math.PI / 2;
  cuffBand.scale.set(1.0, 1.0, 0.80);
  cuffBand.position.set(0, 0, 0.029);
  forearmPivot.add(cuffBand);

  const cuffStitch = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.0015, 6, 16), trimStitchMat);
  cuffStitch.scale.set(1.0, 0.80, 1.0);
  cuffStitch.position.set(0, 0, 0.012);
  forearmPivot.add(cuffStitch);

  const sleeveLen = 0.52;
  const sleeveBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.040, sleeveLen, 14),
    sleeveMat
  );
  sleeveBody.rotation.x = Math.PI / 2;
  sleeveBody.scale.set(1.0, 1.0, 0.82);
  sleeveBody.position.set(0, 0, 0.050 + sleeveLen * 0.5);
  forearmPivot.add(sleeveBody);

  const wristLocal = new THREE.Vector3(0, 0, 0.032);
  const wristInArmRoot = new THREE.Vector3();
  const dirToShoulder = new THREE.Vector3();
  const targetVec = new THREE.Vector3();

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
      const pCurl = idx === 0 && indexCurl !== undefined ? indexCurl : proxCurl + idx * 0.04;
      f.proxRoot.rotation.x = pCurl;
      f.distRoot.rotation.x = idx === 0 && indexCurl !== undefined ? indexCurl * 0.65 : distCurl;
    });
    thumbRoot.rotation.set(thumbRot[0], thumbRot[1], thumbRot[2]);

    wristInArmRoot.copy(wristLocal).applyEuler(handPivot.rotation);
    forearmPivot.position.copy(wristInArmRoot);

    targetVec.set(shoulderTarget[0] - handPos[0], shoulderTarget[1] - handPos[1], shoulderTarget[2] - handPos[2]);
    dirToShoulder.subVectors(targetVec, wristInArmRoot).normalize();
    forearmPivot.quaternion.setFromUnitVectors(POS_Z_AXIS, dirToShoulder);
  };

  return {
    armRoot,
    handPivot,
    forearmPivot,
    thumbRoot,
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
        handPos: [0.020, 0.000, 0.104],
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

  const isKarambit = archetype === 'karambit';
  return {
    right: {
      handPos: isKarambit ? [-0.004, -0.002, 0.032] : [-0.004, -0.016, 0.048],
      handRot: isKarambit ? [1.14, 0.44, -1.78] : [-0.86, 0.20, -1.34],
      shoulderTarget: isKarambit ? [0.34, -0.21, 0.34] : [0.27, -0.22, 0.42],
      proxCurl: isKarambit ? -1.66 : -1.64,
      distCurl: isKarambit ? -1.44 : -1.42,
      indexCurl: -1.52,
      thumbRot: isKarambit ? [0.24, -0.34, 0.22] : [0.20, -0.32, 0.22],
      visible: true,
    },
    left: {
      handPos: isKarambit ? [-0.26, -0.072, 0.01] : [-0.26, -0.075, 0.02],
      handRot: isKarambit ? [-0.28, -0.42, 0.96] : [-0.26, -0.40, 0.90],
      shoulderTarget: [-0.46, -0.24, 0.34],
      proxCurl: -0.98,
      distCurl: -0.84,
      thumbRot: [0.14, 0.18, -0.16],
      visible: true,
    },
  };
}

/**
 * Creates 3D articulated First-Person player hands & camo sleeves (no torso/head)
 * posed per weapon archetype with seamless wrist-to-shoulder forearm aiming so
 * the left and right arms never intersect each other or weapon meshes.
 */
export function createFPSHands(accentHex = '#38bdf8'): FPSHandsRig {
  const group = new THREE.Group();
  group.name = 'fps_hands_root';

  const sleeveTex = createCamoSleeveTexture();
  const right = buildArticulatedArm('right', sleeveTex, accentHex);
  const left = buildArticulatedArm('left', sleeveTex, accentHex);
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
      sleeveTex?.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    },
  };
}
