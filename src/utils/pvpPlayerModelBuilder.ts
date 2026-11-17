import * as THREE from 'three';

export interface PvpPlayer3DModel {
  root: THREE.Group;
  headGroup: THREE.Group;
  hitMeshes: THREE.Object3D[];
  setWeaponSwatches: (swatches: [string, string, string], isMelee: boolean) => void;
  getMuzzleWorldPosition: (out: THREE.Vector3) => THREE.Vector3;
  animate: (isMoving: boolean, pitch: number, dt: number, hitFlash: number) => void;
  dispose: () => void;
}

/**
 * Builds a stylized tactical 3D operator model for the 1v1 opponent.
 * Every hit mesh carries `userData.hitPart = 'head' | 'body'` for raycast hit detection.
 */
export function createPvpPlayer3DModel(
  swatches: [string, string, string] = ['#ef4444', '#991b1b', '#fca5a5']
): PvpPlayer3DModel {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const hitMeshes: THREE.Object3D[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };

  const suitMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#1e293b',
      roughness: 0.65,
      metalness: 0.2,
    })
  );
  const armorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#0f172a',
      roughness: 0.45,
      metalness: 0.55,
    })
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#f43f5e',
      emissive: '#e11d48',
      emissiveIntensity: 0.85,
      roughness: 0.3,
      metalness: 0.4,
    })
  );
  const visorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: '#fda4af',
      emissive: '#fb7185',
      emissiveIntensity: 1.4,
      roughness: 0.18,
      metalness: 0.7,
    })
  );

  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Legs
  const legGeo = trackGeo(new THREE.BoxGeometry(0.18, 0.76, 0.2));
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.13, 0.78, 0);
  const leftLeg = new THREE.Mesh(legGeo, suitMat);
  leftLeg.position.y = -0.38;
  leftLeg.userData.hitPart = 'body';
  leftLegPivot.add(leftLeg);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.13, 0.78, 0);
  const rightLeg = new THREE.Mesh(legGeo, suitMat);
  rightLeg.position.y = -0.38;
  rightLeg.userData.hitPart = 'body';
  rightLegPivot.add(rightLeg);

  bodyGroup.add(leftLegPivot, rightLegPivot);
  hitMeshes.push(leftLeg, rightLeg);

  // Torso & Tactical Vest
  const torsoGeo = trackGeo(new THREE.BoxGeometry(0.46, 0.62, 0.26));
  const torso = new THREE.Mesh(torsoGeo, suitMat);
  torso.position.y = 1.1;
  torso.userData.hitPart = 'body';

  const vestGeo = trackGeo(new THREE.BoxGeometry(0.5, 0.48, 0.3));
  const vest = new THREE.Mesh(vestGeo, armorMat);
  vest.position.y = 1.13;
  vest.userData.hitPart = 'body';

  const chestCoreGeo = trackGeo(new THREE.BoxGeometry(0.16, 0.08, 0.315));
  const chestCore = new THREE.Mesh(chestCoreGeo, accentMat);
  chestCore.position.y = 1.2;
  chestCore.userData.hitPart = 'body';

  bodyGroup.add(torso, vest, chestCore);
  hitMeshes.push(torso, vest, chestCore);

  // Head + Helmet + Visor (Faces -Z in local space when yaw = 0)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.56, 0);

  const headGeo = trackGeo(new THREE.BoxGeometry(0.28, 0.3, 0.28));
  const headMesh = new THREE.Mesh(headGeo, armorMat);
  headMesh.userData.hitPart = 'head';

  const visorGeo = trackGeo(new THREE.BoxGeometry(0.24, 0.09, 0.05));
  const visorMesh = new THREE.Mesh(visorGeo, visorMat);
  visorMesh.position.set(0, 0.03, -0.135);
  visorMesh.userData.hitPart = 'head';

  headGroup.add(headMesh, visorMesh);
  bodyGroup.add(headGroup);
  hitMeshes.push(headMesh, visorMesh);

  // Arms & Weapon Mount
  const armGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.52, 0.14));
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.31, 1.34, 0);
  const leftArm = new THREE.Mesh(armGeo, suitMat);
  leftArm.position.set(0, -0.2, -0.12);
  leftArm.rotation.x = Math.PI * 0.32;
  leftArm.userData.hitPart = 'body';
  leftArmPivot.add(leftArm);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.3, 1.34, 0);
  const rightArm = new THREE.Mesh(armGeo, suitMat);
  rightArm.position.set(0, -0.18, -0.16);
  rightArm.rotation.x = Math.PI * 0.44;
  rightArm.userData.hitPart = 'body';
  rightArmPivot.add(rightArm);

  bodyGroup.add(leftArmPivot, rightArmPivot);
  hitMeshes.push(leftArm, rightArm);

  // Stylized Crate Weapon in opponent's hands
  const weaponGroup = new THREE.Group();
  weaponGroup.position.set(0.18, 1.18, -0.34);
  const weaponBodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: swatches[0],
      roughness: 0.35,
      metalness: 0.6,
    })
  );
  const weaponAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: swatches[1],
      emissive: swatches[2],
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.7,
    })
  );

  const receiverMesh = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.08, 0.12, 0.48)),
    weaponBodyMat
  );
  const barrelMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 8)),
    weaponAccentMat
  );
  barrelMesh.rotation.x = Math.PI / 2;
  barrelMesh.position.set(0, 0.02, -0.34);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.02, -0.54);

  weaponGroup.add(receiverMesh, barrelMesh, muzzlePoint);
  bodyGroup.add(weaponGroup);

  let walkPhase = 0;

  return {
    root,
    headGroup,
    hitMeshes,
    setWeaponSwatches: (nextSwatches, isMelee) => {
      weaponBodyMat.color.set(nextSwatches[0]);
      weaponAccentMat.color.set(nextSwatches[1]);
      weaponAccentMat.emissive.set(nextSwatches[2]);
      barrelMesh.visible = !isMelee;
      receiverMesh.scale.set(1, isMelee ? 0.6 : 1, isMelee ? 0.55 : 1);
    },
    getMuzzleWorldPosition: (out) => {
      root.updateMatrixWorld(true);
      return muzzlePoint.getWorldPosition(out);
    },
    animate: (isMoving, pitch, dt, hitFlash) => {
      if (isMoving) {
        walkPhase += dt * 10.5;
        const swing = Math.sin(walkPhase) * 0.55;
        leftLegPivot.rotation.x = swing;
        rightLegPivot.rotation.x = -swing;
        leftArmPivot.rotation.x = -swing * 0.25;
      } else {
        walkPhase = 0;
        leftLegPivot.rotation.x *= 0.82;
        rightLegPivot.rotation.x *= 0.82;
        leftArmPivot.rotation.x *= 0.82;
      }

      headGroup.rotation.x = THREE.MathUtils.clamp(pitch * 0.7, -0.7, 0.7);
      weaponGroup.rotation.x = THREE.MathUtils.clamp(pitch * 0.5, -0.5, 0.5);

      const flash = Math.max(0, Math.min(1, hitFlash));
      suitMat.emissive.setHex(flash > 0.01 ? 0xef4444 : 0x000000);
      suitMat.emissiveIntensity = flash * 1.4;
      armorMat.emissive.setHex(flash > 0.01 ? 0xef4444 : 0x000000);
      armorMat.emissiveIntensity = flash * 1.2;
    },
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
