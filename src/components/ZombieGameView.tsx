import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Coins,
  Crosshair,
  Flame,
  Play,
  RotateCw,
  Shield,
  Skull,
} from 'lucide-react';
import * as THREE from 'three';
import { CRATES } from '../data/catalog';
import { RARITIES } from '../data/rarities';
import { InventoryItem } from '../types/casino';
import { createFPSHands, FPSHandsRig, getFPSWeaponViewConfig } from '../utils/fpsHandsBuilder';
import {
  applyFirearmAnimPose,
  captureFirearmRigRestData,
  createFirearmAnimator,
  FirearmAnimator,
  FirearmRigRestData,
} from '../utils/firearmAnimations';
import {
  alignBladeWeaponToFist,
  applyKnifeAnimPose,
  captureKnifeRigRestData,
  createKnifeAnimator,
  KnifeAnimator,
  KnifeRigRestData,
  resolveKnifeType,
} from '../utils/knifeAnimations';
import { formatCredits } from '../utils/rng';
import { soundEngine } from '../utils/sound';
import {
  buildWeapon3DModel,
  createStudioEnvironment,
  getWeaponMuzzleSide,
  resolveWeaponArchetype,
  Weapon3DModel,
  WeaponArchetype,
  WeaponGripMeta,
} from '../utils/weapon3dBuilder';
import {
  applyFpsMouseDelta,
  computeZombieReward,
  FPS_MOUSE_SENSITIVITY,
  FPS_PITCH_LIMIT,
  getWeaponCombatProfile,
  resolveZombieExitPayout,
  resolveZombieLoadout,
  rollZombieTier,
  ZOMBIE_TIERS,
  ZombieSlot,
  ZombieTier,
} from '../utils/zombieEngine';
import {
  createZombie3DModel,
  createZombieAssetBank,
  Zombie3DModel,
} from '../utils/zombieModelBuilder';
import {
  ARENA_LIMIT,
  createZombieArena,
  isPointClearOfObstacles,
  resolveArenaCircleCollision,
  stepZombieTowardPlayer,
} from '../utils/zombieArenaBuilder';

interface ZombieGameViewProps {
  inventory: InventoryItem[];
  equippedWeaponId?: string | null;
  equippedKnifeId?: string | null;
  balance: number;
  onExit: (bankedCredits: number) => void;
  onGoToShop: (bankedCredits: number) => void;
}

interface KillFeedEntry {
  id: number;
  tierLabel: string;
  reward: number;
  headshot: boolean;
  color: string;
}

/** Requests unadjusted raw FPS pointer lock with graceful fallback if unsupported. */
function safeRequestPointerLock(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas || typeof canvas.requestPointerLock !== 'function') return;
  const fallbackPlainLock = () => {
    try {
      const res = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (res && typeof res.catch === 'function') {
        res.catch(() => {});
      }
    } catch {
      // Fallback to click-drag camera aiming if pointer lock is blocked
    }
  };

  try {
    const withOptions = (
      canvas.requestPointerLock as (opts?: { unadjustedMovement?: boolean }) => unknown
    )({ unadjustedMovement: true }) as Promise<void> | undefined;
    if (withOptions && typeof withOptions.catch === 'function') {
      withOptions.catch(() => fallbackPlainLock());
    }
  } catch {
    fallbackPlainLock();
  }
}

interface ActiveZombie {
  id: number;
  tier: ZombieTier;
  hp: number;
  maxHp: number;
  speed: number;
  reward: number;
  steerSign: number;
  root: THREE.Group;
  model: Zombie3DModel;
  hitFlash: number;
  bobPhase: number;
}

interface TracerBeam {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface ImpactSpark {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

function createMuzzleFlashTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const cx = size * 0.5;
    const cy = size * 0.5;
    const rad = ctx.createRadialGradient(cx, cy, 2, cx, cy, cx);
    rad.addColorStop(0, 'rgba(255, 255, 240, 1)');
    rad.addColorStop(0.24, 'rgba(253, 224, 71, 0.92)');
    rad.addColorStop(0.55, 'rgba(249, 115, 22, 0.45)');
    rad.addColorStop(1, 'rgba(249, 115, 22, 0)');
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(255, 247, 214, 0.85)';
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((i * Math.PI) / 4);
      ctx.beginPath();
      ctx.ellipse(0, 0, cx * 0.92, 4.5 - (i % 2) * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function applyWeaponViewPose(
  weaponGroup: THREE.Group,
  archetype: WeaponArchetype,
  hands: FPSHandsRig,
  gripMeta?: WeaponGripMeta
) {
  const cfg = getFPSWeaponViewConfig(archetype);
  hands.applyPose(archetype);

  if (archetype === 'karambit' || archetype === 'couteau') {
    alignBladeWeaponToFist(weaponGroup, archetype, hands, cfg, gripMeta);
    return;
  }

  const muzzleSide = getWeaponMuzzleSide(archetype);
  weaponGroup.rotation.set(
    cfg.weaponRotOffset[0],
    (muzzleSide === 'left' ? -Math.PI / 2 : Math.PI / 2) + cfg.weaponRotOffset[1],
    cfg.weaponRotOffset[2]
  );
  weaponGroup.scale.setScalar(cfg.scale);
  weaponGroup.position.set(cfg.weaponPos[0], cfg.weaponPos[1], cfg.weaponPos[2]);
}

export const ZombieGameView: React.FC<ZombieGameViewProps> = ({
  inventory,
  equippedWeaponId,
  equippedKnifeId,
  balance,
  onExit,
  onGoToShop,
}) => {
  const starterWeapon: InventoryItem = useMemo(() => {
    const fallbackSkin = CRATES[0].skins[0];
    return {
      instanceId: 'starter_fallback',
      skinId: fallbackSkin.id,
      crateId: CRATES[0].id,
      crateName: 'Équipement de secours',
      name: `${fallbackSkin.name} (Secours)`,
      weaponName: fallbackSkin.weaponName,
      weaponClass: fallbackSkin.weaponClass,
      rarity: fallbackSkin.rarity,
      wear: 'Neuf d’usine',
      floatVal: 0.01,
      value: 0,
      swatches: fallbackSkin.swatches,
      tagline: fallbackSkin.tagline,
      image: fallbackSkin.image,
      obtainedAt: 0,
      locked: false,
      source: 'ouverture',
    };
  }, []);

  // Equipped 2-slot loadout configured in Inventaire -> Équiper (1 = Arme, 2 = Couteau)
  const loadout = useMemo(
    () => resolveZombieLoadout(inventory, equippedWeaponId, equippedKnifeId, starterWeapon),
    [inventory, equippedWeaponId, equippedKnifeId, starterWeapon]
  );

  const primaryProfile = useMemo(
    () =>
      getWeaponCombatProfile(
        loadout.primary.weaponClass,
        loadout.primary.weaponName,
        loadout.primary.rarity
      ),
    [loadout.primary]
  );

  const [activeSlot, setActiveSlot] = useState<ZombieSlot>(() => loadout.initialSlot);
  const effectiveSlot: ZombieSlot = activeSlot === 2 && loadout.knife ? 2 : 1;
  const equippedItem = effectiveSlot === 2 && loadout.knife ? loadout.knife : loadout.primary;

  const combatProfile = useMemo(
    () =>
      getWeaponCombatProfile(
        equippedItem.weaponClass,
        equippedItem.weaponName,
        equippedItem.rarity
      ),
    [equippedItem]
  );

  const primaryAmmoRef = useRef<number>(primaryProfile.magSize);
  const loadoutRef = useRef(loadout);
  loadoutRef.current = loadout;
  const effectiveSlotRef = useRef<ZombieSlot>(effectiveSlot);
  effectiveSlotRef.current = effectiveSlot;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [hp, setHp] = useState(100);
  const [ammo, setAmmo] = useState(combatProfile.magSize);
  const [reloading, setReloading] = useState(false);
  const [sessionEarned, setSessionEarned] = useState(0);
  const [lostCredits, setLostCredits] = useState(0);
  const [kills, setKills] = useState(0);
  const [wave, setWave] = useState(1);
  const [hitmarker, setHitmarker] = useState<'none' | 'body' | 'crit'>('none');
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [floatingReward, setFloatingReward] = useState<{ id: number; amount: number; headshot: boolean } | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  const onGoToShopRef = useRef(onGoToShop);
  onGoToShopRef.current = onGoToShop;

  const extractedRef = useRef(false);
  const wasPointerLockedRef = useRef(false);
  const suppressPointerExitRef = useRef(false);

  const equippedRef = useRef(equippedItem);
  equippedRef.current = equippedItem;

  const combatRef = useRef(combatProfile);
  combatRef.current = combatProfile;

  const gameStateRef = useRef({
    hp: 100,
    ammo: combatProfile.magSize,
    reloading: false,
    reloadEndAt: 0,
    lastShotAt: 0,
    mouseDown: false,
    adsZoom: false,
    adsBlend: 0,
    muzzleFlashTimer: 0,
    kills: 0,
    wave: 1,
    sessionEarned: 0,
    recoilZ: 0,
    recoilPitch: 0,
    meleeSwing: 0,
    yaw: 0,
    pitch: 0,
    posX: 0,
    posZ: 4,
    posY: 1.65,
    velY: 0,
    bobTime: 0,
    nextId: 1,
    gameOver: false,
  });

  const swapWeaponFnRef = useRef<((item: InventoryItem) => void) | null>(null);
  const resetArenaFnRef = useRef<(() => void) | null>(null);
  /** Animateur procédural couteau actif (null si l'arme n'est pas un couteau) */
  const knifeAnimatorRef = useRef<KnifeAnimator | null>(null);
  const knifeRestRef = useRef<KnifeRigRestData | null>(null);
  /** Animateur procédural arme à feu actif (rechargement chargeur & inspection T) */
  const firearmAnimatorRef = useRef<FirearmAnimator | null>(null);
  const firearmRestRef = useRef<FirearmRigRestData | null>(null);

  const beginFirearmReload = useCallback((now: number, reloadMs: number) => {
    const st = gameStateRef.current;
    st.reloading = true;
    st.reloadEndAt = now + reloadMs;
    setReloading(true);
    if (firearmAnimatorRef.current) {
      firearmAnimatorRef.current.triggerReload(reloadMs);
    } else {
      soundEngine.playReload();
    }
  }, []);

  const exitToCasino = useCallback((goShop = false) => {
    if (extractedRef.current) return;
    extractedRef.current = true;
    const st = gameStateRef.current;
    // Credits farmed during the run are ONLY awarded if the player survives (lost on death)
    const payout = resolveZombieExitPayout(st.gameOver, st.sessionEarned);
    suppressPointerExitRef.current = true;
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
    if (goShop) onGoToShopRef.current(payout);
    else onExitRef.current(payout);
  }, []);

  useEffect(() => {
    primaryAmmoRef.current = primaryProfile.magSize;
  }, [primaryProfile]);

  useEffect(() => {
    const profile = getWeaponCombatProfile(
      equippedItem.weaponClass,
      equippedItem.weaponName,
      equippedItem.rarity
    );
    const nextAmmo = profile.isMelee ? 0 : primaryAmmoRef.current;
    gameStateRef.current.ammo = nextAmmo;
    gameStateRef.current.reloading = false;
    gameStateRef.current.adsZoom = false;
    gameStateRef.current.adsBlend = 0;
    gameStateRef.current.muzzleFlashTimer = 0;
    gameStateRef.current.meleeSwing = 0;
    firearmAnimatorRef.current?.cancel();
    setAmmo(nextAmmo);
    setReloading(false);
    swapWeaponFnRef.current?.(equippedItem);
  }, [equippedItem]);

  const switchToSlot = useCallback((targetSlot: ZombieSlot) => {
    const st = gameStateRef.current;
    if (st.gameOver) return;
    if (targetSlot === 1) {
      if (effectiveSlotRef.current === 1) return;
      const primaryItem = loadoutRef.current.primary;
      effectiveSlotRef.current = 1;
      equippedRef.current = primaryItem;
      st.reloading = false;
      st.adsZoom = false;
      st.meleeSwing = 0;
      setReloading(false);
      soundEngine.playBoltRack(
        resolveWeaponArchetype(primaryItem.weaponClass, primaryItem.weaponName)
      );
      swapWeaponFnRef.current?.(primaryItem);
      setActiveSlot(1);
      return;
    }

    const knifeItem = loadoutRef.current.knife;
    if (!knifeItem) return;
    if (effectiveSlotRef.current !== 2) {
      effectiveSlotRef.current = 2;
      equippedRef.current = knifeItem;
      st.reloading = false;
      st.adsZoom = false;
      firearmAnimatorRef.current?.cancel();
      setReloading(false);
      swapWeaponFnRef.current?.(knifeItem);
      setActiveSlot(2);
    } else {
      const kAnim = knifeAnimatorRef.current;
      if (kAnim) {
        kAnim.triggerDraw();
        soundEngine.playKnifeDraw(kAnim.knifeType);
      }
    }
  }, []);

  // Échap -> Casino; 1 -> Arme principale; 2 -> Couteau; R -> recharger; T / F -> inspecter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        soundEngine.playClick();
        exitToCasino(false);
        return;
      }
      const keyLower = e.key.toLowerCase();
      const st = gameStateRef.current;
      const prof = combatRef.current;
      if (st.gameOver) return;

      if (e.code === 'Digit1' || e.code === 'Numpad1' || e.key === '1' || e.key === '&') {
        switchToSlot(1);
        return;
      }
      if (e.code === 'Digit2' || e.code === 'Numpad2' || e.key === '2' || e.key === 'é') {
        switchToSlot(2);
        return;
      }

      if (keyLower === 'r') {
        if (prof.isMelee) {
          knifeAnimatorRef.current?.triggerInspect();
        } else if (!st.reloading && st.ammo < prof.magSize) {
          beginFirearmReload(performance.now(), prof.reloadMs);
        }
      } else if (keyLower === 't') {
        if (prof.isMelee) {
          knifeAnimatorRef.current?.triggerInspect();
        } else if (!st.reloading) {
          firearmAnimatorRef.current?.triggerInspect();
        }
      } else if (keyLower === 'f' && prof.isMelee) {
        knifeAnimatorRef.current?.triggerInspect();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exitToCasino, beginFirearmReload, switchToSlot]);

  // Main Three.js FPS Engine lifecycle
  useEffect(() => {
    const container = stageRef.current;
    if (!container) return;

    const probeCanvas = document.createElement('canvas');
    const hasWebGL =
      Boolean(probeCanvas.getContext('webgl2')) ||
      Boolean(probeCanvas.getContext('webgl')) ||
      Boolean(probeCanvas.getContext('experimental-webgl'));
    if (!hasWebGL) {
      setWebglError('WebGL indisponible dans cet environnement.');
      return;
    }

    let cancelled = false;
    let rafId = 0;

    const width = Math.max(container.clientWidth, 480);
    const height = Math.max(container.clientHeight, 360);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.cursor = 'crosshair';
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#070b14');
    scene.fog = new THREE.FogExp2('#070b14', 0.021);

    const studioEnv = createStudioEnvironment(renderer);
    scene.environment = studioEnv.texture;

    const camera = new THREE.PerspectiveCamera(62, width / height, 0.05, 160);
    camera.rotation.order = 'YXZ';
    scene.add(camera);

    // Arena Lighting
    const ambient = new THREE.AmbientLight('#93c5fd', 0.48);
    scene.add(ambient);

    const overheadKey = new THREE.DirectionalLight('#e0f2fe', 1.25);
    overheadKey.position.set(10, 22, 12);
    scene.add(overheadKey);

    const rimLight = new THREE.DirectionalLight('#60a5fa', 0.55);
    rimLight.position.set(-14, 18, -18);
    scene.add(rimLight);

    const redZoneLight = new THREE.PointLight('#f43f5e', 14, 34, 1.5);
    redZoneLight.position.set(-12, 5.2, -14);
    scene.add(redZoneLight);

    const cyanZoneLight = new THREE.PointLight('#22d3ee', 12, 34, 1.5);
    cyanZoneLight.position.set(12, 5.2, -14);
    scene.add(cyanZoneLight);

    // Subtle tactical helmet fill light to catch detailed zombie anatomy & wet wounds
    const playerFillLight = new THREE.PointLight('#dbeafe', 2.4, 16, 1.5);
    playerFillLight.position.set(0, 0.12, -0.35);
    camera.add(playerFillLight);

    // Sleek 3D Architectural Arena (strictly preserves 44x44 perimeter & ARENA_LIMIT = 18.5)
    const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy() || 8);
    const arena = createZombieArena(maxAniso);
    scene.add(arena.group);

    // ViewModel Rig: strictly 3D Player Hands + Equipped 3D Weapon attached to camera
    const viewModelRig = new THREE.Group();
    viewModelRig.position.set(0.162, -0.128, -0.40);
    viewModelRig.rotation.set(0, 0, 0);
    camera.add(viewModelRig);

    const viewModelAmbient = new THREE.PointLight('#e2e8f0', 1.4, 2.5);
    viewModelAmbient.position.set(-0.2, 0.45, 0.45);
    camera.add(viewModelAmbient);

    const fpsHands = createFPSHands('#38bdf8');
    viewModelRig.add(fpsHands.group);

    const weaponMount = new THREE.Group();
    viewModelRig.add(weaponMount);

    // Dynamic 3D muzzle anchor synced to each firearm's exact barrel tip
    const muzzleAnchor = new THREE.Object3D();
    muzzleAnchor.position.set(0, 0.04, -0.45);
    weaponMount.add(muzzleAnchor);

    const muzzleFlashLight = new THREE.PointLight('#fbbf24', 0, 8, 2);
    muzzleAnchor.add(muzzleFlashLight);

    const muzzleFlashTex = createMuzzleFlashTexture();
    const muzzleFlashGeo = new THREE.PlaneGeometry(0.16, 0.16);
    const muzzleFlashMat = new THREE.MeshBasicMaterial({
      map: muzzleFlashTex,
      color: '#fff7d6',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const muzzleFlashGroup = new THREE.Group();
    muzzleFlashGroup.visible = false;
    const flashFront = new THREE.Mesh(muzzleFlashGeo, muzzleFlashMat);
    flashFront.position.set(0, 0, -0.01);
    const flashSideH = new THREE.Mesh(muzzleFlashGeo, muzzleFlashMat);
    flashSideH.rotation.y = Math.PI / 2;
    flashSideH.scale.set(1.15, 0.55, 1);
    flashSideH.position.set(0, 0, -0.055);
    const flashSideV = new THREE.Mesh(muzzleFlashGeo, muzzleFlashMat);
    flashSideV.rotation.x = Math.PI / 2;
    flashSideV.rotation.z = Math.PI / 2;
    flashSideV.scale.set(1.15, 0.55, 1);
    flashSideV.position.set(0, 0, -0.055);
    muzzleFlashGroup.add(flashFront, flashSideH, flashSideV);
    muzzleAnchor.add(muzzleFlashGroup);

    interface CachedWeaponEntry {
      key: string;
      item: InventoryItem;
      arch: WeaponArchetype;
      isFirearm: boolean;
      model: Weapon3DModel;
      muzzleMountPos: THREE.Vector3;
      knifeAnim: KnifeAnimator | null;
      knifeRest: KnifeRigRestData | null;
      firearmAnim: FirearmAnimator | null;
      firearmRest: FirearmRigRestData | null;
    }

    const weaponCache = new Map<string, CachedWeaponEntry>();
    const inFlightBuilds = new Map<string, Promise<CachedWeaponEntry | null>>();
    let activeWeaponModel: Weapon3DModel | null = null;
    let swapToken = 0;
    let preloadTimerId: number | null = null;

    const getWeaponCacheKey = (item: InventoryItem) =>
      `${item.instanceId}::${item.image ?? ''}::${item.weaponName}::${item.rarity}`;

    const warmEntryGpu = (group: THREE.Group) => {
      try {
        if (typeof renderer.initTexture !== 'function') return;
        const seen = new Set<THREE.Texture>();
        group.traverse((obj) => {
          if (
            obj instanceof THREE.Mesh &&
            !Array.isArray(obj.material) &&
            obj.material instanceof THREE.MeshPhysicalMaterial
          ) {
            const m = obj.material;
            for (const tex of [m.map, m.roughnessMap, m.metalnessMap, m.normalMap]) {
              if (tex && !seen.has(tex)) {
                seen.add(tex);
                renderer.initTexture(tex);
              }
            }
          }
        });
      } catch {
        // Ignorer en environnement headless/mock sans contexte WebGL réel
      }
    };

    const ensureWeaponEntry = (
      item: InventoryItem,
      isCurrentTarget: () => boolean
    ): Promise<CachedWeaponEntry | null> => {
      if (!item.image) return Promise.resolve(null);
      const key = getWeaponCacheKey(item);
      const existing = weaponCache.get(key);
      if (existing) return Promise.resolve(existing);

      const pending = inFlightBuilds.get(key);
      if (pending) return pending;

      const arch = resolveWeaponArchetype(item.weaponClass, item.weaponName);
      const isFirearm = arch !== 'karambit' && arch !== 'couteau';

      const buildPromise = buildWeapon3DModel(item.image, item.weaponClass, item.weaponName, maxAniso, {
        singleHeroComponent: true,
        separateMagazine: isFirearm,
        rarity: item.rarity,
        maxTextureSize: 1024,
      })
        .then((built): CachedWeaponEntry | null => {
          inFlightBuilds.delete(key);
          if (cancelled) {
            built.dispose();
            return null;
          }

          const shouldRestoreCurrent = !isCurrentTarget() && activeWeaponModel !== null;
          const curArch = resolveWeaponArchetype(
            equippedRef.current.weaponClass,
            equippedRef.current.weaponName
          );

          built.group.visible = false;
          applyWeaponViewPose(built.group, arch, fpsHands, built.gripMeta);
          weaponMount.add(built.group);

          const muzzleMountPos = new THREE.Vector3(0, 0.04, -0.45);
          if (built.muzzleLocalPos && isFirearm) {
            built.group.updateMatrix();
            muzzleMountPos
              .set(built.muzzleLocalPos[0], built.muzzleLocalPos[1], built.muzzleLocalPos[2])
              .applyMatrix4(built.group.matrix);
          }

          let knifeAnim: KnifeAnimator | null = null;
          let knifeRest: KnifeRigRestData | null = null;
          let firearmAnim: FirearmAnimator | null = null;
          let firearmRest: FirearmRigRestData | null = null;

          if (!isFirearm) {
            knifeAnim = createKnifeAnimator(resolveKnifeType(item.weaponName));
            knifeRest = captureKnifeRigRestData(
              arch,
              getFPSWeaponViewConfig(arch),
              fpsHands,
              built.group,
              built.gripMeta
            );
          } else {
            firearmAnim = createFirearmAnimator(arch);
            firearmRest = captureFirearmRigRestData(
              arch,
              getFPSWeaponViewConfig(arch),
              built.group,
              built.magMeta,
              built.magazineGroup
            );
          }

          if (shouldRestoreCurrent) {
            fpsHands.applyPose(curArch);
          }

          warmEntryGpu(built.group);

          const entry: CachedWeaponEntry = {
            key,
            item,
            arch,
            isFirearm,
            model: built,
            muzzleMountPos,
            knifeAnim,
            knifeRest,
            firearmAnim,
            firearmRest,
          };
          weaponCache.set(key, entry);
          return entry;
        })
        .catch(() => {
          inFlightBuilds.delete(key);
          return null;
        });

      inFlightBuilds.set(key, buildPromise);
      return buildPromise;
    };

    const activateWeaponEntry = (entry: CachedWeaponEntry) => {
      for (const cached of weaponCache.values()) {
        cached.model.group.visible = cached === entry;
      }
      weaponMount.position.set(0, 0, 0);
      weaponMount.quaternion.identity();
      weaponMount.scale.set(1, 1, 1);

      activeWeaponModel = entry.model;
      applyWeaponViewPose(entry.model.group, entry.arch, fpsHands, entry.model.gripMeta);

      muzzleFlashGroup.visible = false;
      gameStateRef.current.muzzleFlashTimer = 0;

      const cfg = getFPSWeaponViewConfig(entry.arch);
      if (!entry.isFirearm) {
        firearmAnimatorRef.current = null;
        firearmRestRef.current = null;
        knifeAnimatorRef.current = entry.knifeAnim;
        knifeRestRef.current = entry.knifeRest;
        if (entry.knifeAnim) {
          entry.knifeAnim.triggerDraw();
          soundEngine.playKnifeDraw(entry.knifeAnim.knifeType);
          if (entry.knifeRest) {
            applyKnifeAnimPose(
              viewModelRig,
              weaponMount,
              fpsHands,
              entry.knifeRest,
              cfg.rigPosHip,
              cfg.rigRotBase,
              entry.knifeAnim.update(0, performance.now())
            );
          }
        }
      } else {
        knifeAnimatorRef.current = null;
        knifeRestRef.current = null;
        firearmAnimatorRef.current = entry.firearmAnim;
        firearmRestRef.current = entry.firearmRest;
        firearmAnimatorRef.current?.cancel();
        muzzleAnchor.position.copy(entry.muzzleMountPos);
        viewModelRig.position.set(...cfg.rigPosHip);
        viewModelRig.rotation.set(...cfg.rigRotBase);
      }

      stageRef.current?.setAttribute('data-weapon-ready', entry.item.weaponName);
      stageRef.current?.removeAttribute('data-weapon-loading');
    };

    const scheduleOtherSlotPreload = () => {
      if (preloadTimerId !== null) window.clearTimeout(preloadTimerId);
      preloadTimerId = window.setTimeout(() => {
        preloadTimerId = null;
        if (cancelled) return;
        const lo = loadoutRef.current;
        const candidates = [lo.primary, lo.knife].filter(Boolean) as InventoryItem[];
        for (const cand of candidates) {
          if (cand.image && typeof Image !== 'undefined') {
            const imgPre = new Image();
            imgPre.src = cand.image;
          }
          if (!weaponCache.has(getWeaponCacheKey(cand))) {
            void ensureWeaponEntry(cand, () => false);
          }
        }
      }, 60);
    };

    const loadEquippedWeapon3D = (item: InventoryItem) => {
      if (!item.image) return;
      const token = ++swapToken;
      const key = getWeaponCacheKey(item);
      const cached = weaponCache.get(key);
      if (cached) {
        if (activeWeaponModel === cached.model) {
          stageRef.current?.setAttribute('data-weapon-ready', item.weaponName);
          stageRef.current?.removeAttribute('data-weapon-loading');
          return;
        }
        // Changement de slot instantané (0 reconstruction géométrique, 0 upload GPU)
        activateWeaponEntry(cached);
        return;
      }

      stageRef.current?.setAttribute('data-weapon-loading', '1');
      ensureWeaponEntry(item, () => !cancelled && token === swapToken)
        .then((entry) => {
          if (cancelled || token !== swapToken || !entry) {
            if (!cancelled && token === swapToken) {
              stageRef.current?.removeAttribute('data-weapon-loading');
            }
            return;
          }
          activateWeaponEntry(entry);
          scheduleOtherSlotPreload();
        })
        .catch(() => {
          if (!cancelled && token === swapToken) {
            stageRef.current?.removeAttribute('data-weapon-loading');
          }
        });
    };

    swapWeaponFnRef.current = loadEquippedWeapon3D;
    loadEquippedWeapon3D(equippedRef.current);

    // Active Zombie Pool, Bullet Tracers & Impact Sparks
    const zombieAssetBank = createZombieAssetBank(maxAniso);
    const zombies: ActiveZombie[] = [];
    const tracers: TracerBeam[] = [];
    const sparks: ImpactSpark[] = [];
    const tracerGeo = new THREE.CylinderGeometry(0.004, 0.011, 1, 6, 1);
    const sparkGeo = new THREE.PlaneGeometry(0.11, 0.11);
    const raycaster = new THREE.Raycaster();

    const disposeZombie = (z: ActiveZombie) => {
      scene.remove(z.root);
      z.model.dispose();
    };

    const spawnOneZombie = () => {
      const st = gameStateRef.current;
      const tier = rollZombieTier(st.wave);
      const meta = ZOMBIE_TIERS[tier];
      const reward = computeZombieReward(tier);
      const model = createZombie3DModel(tier, zombieAssetBank);
      const root = model.root;

      // Spawn along arena perimeter away from player and clear of solid buildings/pillars
      const zRadius = 0.42 * meta.scale;
      let sx = THREE.MathUtils.clamp(st.posX + 15, -ARENA_LIMIT, ARENA_LIMIT);
      let sz = THREE.MathUtils.clamp(st.posZ - 15, -ARENA_LIMIT, ARENA_LIMIT);
      for (let attempt = 0; attempt < 16; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 14 + Math.random() * 6;
        const cx = THREE.MathUtils.clamp(st.posX + Math.cos(angle) * dist, -ARENA_LIMIT, ARENA_LIMIT);
        const cz = THREE.MathUtils.clamp(st.posZ + Math.sin(angle) * dist, -ARENA_LIMIT, ARENA_LIMIT);
        sx = cx;
        sz = cz;
        if (isPointClearOfObstacles(cx, cz, zRadius + 0.15, arena.colliders, ARENA_LIMIT)) {
          break;
        }
      }
      const safeSpawn = resolveArenaCircleCollision(sx, sz, zRadius, arena.colliders, ARENA_LIMIT);
      root.position.set(safeSpawn.x, 0, safeSpawn.z);
      scene.add(root);

      const id = st.nextId++;
      zombies.push({
        id,
        tier,
        hp: meta.maxHp + (st.wave - 1) * 12,
        maxHp: meta.maxHp + (st.wave - 1) * 12,
        speed: meta.speed + Math.min(1.4, (st.wave - 1) * 0.14),
        reward,
        steerSign: id % 2 === 0 ? 1 : -1,
        root,
        model,
        hitFlash: 0,
        bobPhase: Math.random() * Math.PI * 2,
      });
    };

    // Initial zombie wave
    for (let i = 0; i < 6; i++) spawnOneZombie();

    resetArenaFnRef.current = () => {
      for (const z of zombies) disposeZombie(z);
      zombies.length = 0;
      const st = gameStateRef.current;
      st.hp = 100;
      st.kills = 0;
      st.wave = 1;
      st.sessionEarned = 0;
      st.gameOver = false;
      st.posX = 0;
      st.posZ = 4;
      st.posY = 1.65;
      st.velY = 0;
      const primaryProf = getWeaponCombatProfile(
        loadoutRef.current.primary.weaponClass,
        loadoutRef.current.primary.weaponName,
        loadoutRef.current.primary.rarity
      );
      primaryAmmoRef.current = primaryProf.magSize;
      st.ammo = combatRef.current.magSize;
      st.reloading = false;
      st.adsZoom = false;
      st.adsBlend = 0;
      st.muzzleFlashTimer = 0;
      firearmAnimatorRef.current?.cancel();
      muzzleFlashGroup.visible = false;
      setHp(100);
      setKills(0);
      setWave(1);
      setSessionEarned(0);
      setLostCredits(0);
      setKillFeed([]);
      setGameOver(false);
      setAmmo(combatRef.current.magSize);
      setReloading(false);
      for (let i = 0; i < 6; i++) spawnOneZombie();
    };

    // Input Tracking (WASD + ZQSD + Arrows + Raw PointerLock/Drag)
    const keysDown = new Set<string>();
    let dragLastX = 0;
    let dragLastY = 0;
    let skipPostLockMoves = 0;

    const onKeyDown = (e: KeyboardEvent) => {
      keysDown.add(e.code);
      keysDown.add(e.key.toLowerCase());
      if (e.code === 'Space' && gameStateRef.current.posY <= 1.66) {
        gameStateRef.current.velY = 5.4;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.delete(e.code);
      keysDown.delete(e.key.toLowerCase());
    };

    const fireWeapon = (now: number, secondary = false) => {
      const st = gameStateRef.current;
      const prof = combatRef.current;
      if (st.gameOver || st.reloading) return;
      const cooldown = prof.isMelee && secondary ? prof.fireRateMs * 1.4 : prof.fireRateMs;
      if (now - st.lastShotAt < cooldown) return;

      if (!prof.isMelee && st.ammo <= 0) {
        beginFirearmReload(now, prof.reloadMs);
        return;
      }

      if (!prof.isMelee && firearmAnimatorRef.current?.getState() === 'inspect') {
        firearmAnimatorRef.current.cancel();
      }

      st.lastShotAt = now;
      if (prof.isMelee) {
        st.meleeSwing = 1.0;
        const kAnim = knifeAnimatorRef.current;
        soundEngine.playMeleeSlash(secondary, kAnim?.knifeType ?? 'couteau');
        kAnim?.triggerAttack(secondary);
      } else {
        st.ammo -= 1;
        primaryAmmoRef.current = st.ammo;
        setAmmo(st.ammo);
        st.recoilZ = prof.recoilKick;
        st.recoilPitch = prof.recoilKick * 0.45;
        st.pitch = THREE.MathUtils.clamp(
          st.pitch + prof.recoilKick * 0.16,
          -FPS_PITCH_LIMIT,
          FPS_PITCH_LIMIT
        );
        muzzleFlashLight.intensity = prof.suppressed ? 2.5 : 8.5;
        soundEngine.playGunshot(prof.suppressed, prof.isSniper);

        if (st.ammo === 0) {
          beginFirearmReload(now, prof.reloadMs);
        }
      }

      // Ensure camera matrix matches latest mouse delta before raycasting flick shots
      camera.position.set(st.posX, st.posY, st.posZ);
      camera.rotation.set(st.pitch, st.yaw, 0);
      camera.updateMatrixWorld(true);

      // Raycast along aim direction (+ slight weapon spread unless ADS sniper)
      const spreadScale = st.adsZoom ? 0.25 : 1.0;
      const rx = (Math.random() - 0.5) * prof.spreadRad * spreadScale;
      const ry = (Math.random() - 0.5) * prof.spreadRad * spreadScale;
      raycaster.setFromCamera(new THREE.Vector2(rx, ry), camera);
      raycaster.far = prof.range;

      const envHits = raycaster.intersectObjects(arena.occluders, false);
      const envDist = envHits.length > 0 ? envHits[0].distance : prof.range;
      const zRoots = zombies.map((z) => z.root);
      const hits = raycaster.intersectObjects(zRoots, true);
      const hitZombieDist = hits.length > 0 ? hits[0].distance : Infinity;
      const zombieNotBlocked = hits.length > 0 && hitZombieDist <= envDist + 0.02;

      // Bullet tracer, 3D muzzle flash & impact spark for firearms
      if (!prof.isMelee) {
        const muzzleWorldPos = new THREE.Vector3();
        muzzleAnchor.getWorldPosition(muzzleWorldPos);

        muzzleFlashGroup.visible = true;
        st.muzzleFlashTimer = prof.suppressed ? 0.032 : 0.052;
        muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
        const flashScale = prof.suppressed
          ? 0.42
          : prof.isSniper
          ? 1.35
          : prof.archetype === 'pistolet'
          ? 0.78
          : 1.0;
        muzzleFlashGroup.scale.setScalar(flashScale * (0.9 + Math.random() * 0.25));
        muzzleFlashMat.opacity = prof.suppressed ? 0.42 : 0.96;

        const hasImpact = zombieNotBlocked || envHits.length > 0;
        const hitPoint = zombieNotBlocked
          ? hits[0].point.clone()
          : envHits.length > 0
          ? envHits[0].point.clone()
          : raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, 42);

        const forwardProj = new THREE.Vector3()
          .subVectors(hitPoint, muzzleWorldPos)
          .dot(raycaster.ray.direction);
        const tracerEndPos =
          forwardProj < 0.35
            ? muzzleWorldPos.clone().addScaledVector(raycaster.ray.direction, 0.85)
            : hitPoint;

        const segVec = new THREE.Vector3().subVectors(tracerEndPos, muzzleWorldPos);
        const segLen = Math.max(0.25, segVec.length());
        const segDir = segVec.normalize();
        const maxLife = prof.isSniper ? 0.11 : 0.07;

        const tMat = new THREE.MeshBasicMaterial({
          color: prof.suppressed ? '#bae6fd' : '#fef08a',
          transparent: true,
          opacity: prof.suppressed ? 0.55 : 0.92,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const tMesh = new THREE.Mesh(tracerGeo, tMat);
        tMesh.position.copy(muzzleWorldPos).addScaledVector(segDir, segLen * 0.5);
        tMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), segDir);
        const beamRadius = prof.isSniper ? 1.45 : prof.suppressed ? 0.75 : 1.0;
        tMesh.scale.set(beamRadius, segLen, beamRadius);
        scene.add(tMesh);
        tracers.push({ mesh: tMesh, mat: tMat, life: maxLife, maxLife });

        if (hasImpact) {
          const sMat = new THREE.MeshBasicMaterial({
            map: muzzleFlashTex,
            color: zombieNotBlocked ? '#fda4af' : '#fde047',
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const sMesh = new THREE.Mesh(sparkGeo, sMat);
          sMesh.position.copy(hitPoint).addScaledVector(raycaster.ray.direction, -0.05);
          sMesh.lookAt(camera.position);
          sMesh.rotateZ(Math.random() * Math.PI * 2);
          sMesh.scale.setScalar(prof.isSniper ? 1.4 : 0.85);
          scene.add(sMesh);
          sparks.push({ mesh: sMesh, mat: sMat, life: 0.095, maxLife: 0.095 });
        }
      }

      if (zombieNotBlocked) {
        const hitObj = hits[0].object;
        const isHead = hitObj.userData?.part === 'head';
        let hitZombie: ActiveZombie | undefined;
        for (const z of zombies) {
          let p: THREE.Object3D | null = hitObj;
          while (p) {
            if (p === z.root) {
              hitZombie = z;
              break;
            }
            p = p.parent;
          }
          if (hitZombie) break;
        }

        if (hitZombie) {
          const meleeMult = prof.isMelee && secondary ? 1.45 : 1.0;
          const dmg = Math.round(prof.damage * meleeMult * (isHead ? prof.headshotMult : 1));
          hitZombie.hp -= dmg;
          hitZombie.hitFlash = 0.14;
          // Knockback zombie smoothly away from bullet impact while respecting arena colliders
          const kbDir = raycaster.ray.direction.clone().setY(0).normalize();
          const kbDist = prof.isSniper ? 1.1 : prof.isMelee && secondary ? 0.85 : 0.42;
          const zRadius = 0.42 * ZOMBIE_TIERS[hitZombie.tier].scale;
          const kbResolved = resolveArenaCircleCollision(
            hitZombie.root.position.x + kbDir.x * kbDist,
            hitZombie.root.position.z + kbDir.z * kbDist,
            zRadius,
            arena.colliders,
            ARENA_LIMIT
          );
          hitZombie.root.position.x = kbResolved.x;
          hitZombie.root.position.z = kbResolved.z;

          setHitmarker(isHead ? 'crit' : 'body');
          setTimeout(() => setHitmarker('none'), 110);
          soundEngine.playHitmarker(isHead);

          if (hitZombie.hp <= 0) {
            const reward = hitZombie.reward;
            const meta = ZOMBIE_TIERS[hitZombie.tier];
            disposeZombie(hitZombie);
            const idx = zombies.indexOf(hitZombie);
            if (idx >= 0) zombies.splice(idx, 1);

            st.kills += 1;
            st.sessionEarned += reward;
            st.wave = Math.floor(st.kills / 8) + 1;
            setKills(st.kills);
            setSessionEarned(st.sessionEarned);
            setWave(st.wave);
            soundEngine.playZombieKill();

            const fid = Date.now() + Math.random();
            setFloatingReward({ id: fid, amount: reward, headshot: isHead });
            setKillFeed((prev) => [
              {
                id: fid,
                tierLabel: meta.label,
                reward,
                headshot: isHead,
                color: meta.color,
              },
              ...prev.slice(0, 4),
            ]);
          }
        }
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.target !== renderer.domElement) return;
      if (e.button === 2) {
        e.preventDefault();
        if (combatRef.current.isMelee) {
          if (document.pointerLockElement !== renderer.domElement) {
            safeRequestPointerLock(renderer.domElement);
          }
          fireWeapon(performance.now(), true);
        } else {
          if (firearmAnimatorRef.current?.getState() === 'inspect') {
            firearmAnimatorRef.current.cancel();
          }
          gameStateRef.current.adsZoom = true;
        }
        return;
      }
      if (e.button !== 0) return;
      e.preventDefault();
      if (document.pointerLockElement !== renderer.domElement) {
        safeRequestPointerLock(renderer.domElement);
      }
      dragLastX = e.clientX;
      dragLastY = e.clientY;
      gameStateRef.current.mouseDown = true;
      fireWeapon(performance.now(), false);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) gameStateRef.current.adsZoom = false;
      if (e.button === 0) gameStateRef.current.mouseDown = false;
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onPreventDrag = (e: Event) => e.preventDefault();

    const clearStuckInputs = () => {
      keysDown.clear();
      gameStateRef.current.mouseDown = false;
      gameStateRef.current.adsZoom = false;
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearStuckInputs();
    };

    const onMouseMove = (e: MouseEvent) => {
      const st = gameStateRef.current;
      if (document.pointerLockElement === renderer.domElement) {
        if (skipPostLockMoves > 0) {
          skipPostLockMoves -= 1;
          return;
        }
        const next = applyFpsMouseDelta(st.yaw, st.pitch, e.movementX, e.movementY, camera.fov);
        if (!next.ignoredSpike) {
          st.yaw = next.yaw;
          st.pitch = next.pitch;
        }
      } else if (st.mouseDown) {
        if ((e.buttons & 1) === 0) {
          st.mouseDown = false;
          return;
        }
        const dx = e.clientX - dragLastX;
        const dy = e.clientY - dragLastY;
        dragLastX = e.clientX;
        dragLastY = e.clientY;
        const next = applyFpsMouseDelta(
          st.yaw,
          st.pitch,
          dx,
          dy,
          camera.fov,
          FPS_MOUSE_SENSITIVITY * 1.15,
          350
        );
        if (!next.ignoredSpike) {
          st.yaw = next.yaw;
          st.pitch = next.pitch;
        }
      }
    };

    const onPointerLockChange = () => {
      const nowLocked = document.pointerLockElement === renderer.domElement;
      const wasLocked = wasPointerLockedRef.current;
      wasPointerLockedRef.current = nowLocked;
      setPointerLocked(nowLocked);
      if (nowLocked) {
        suppressPointerExitRef.current = false;
        skipPostLockMoves = 2;
      } else if (wasLocked && !suppressPointerExitRef.current) {
        // Browser consumed Escape to exit pointer lock -> return immediately to Casino
        exitToCasino(false);
      }
      suppressPointerExitRef.current = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', clearStuckInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    renderer.domElement.addEventListener('dragstart', onPreventDrag);

    const handleResize = () => {
      if (!container) return;
      const nw = Math.max(container.clientWidth, 480);
      const nh = Math.max(container.clientHeight, 360);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    const resizeObs = new ResizeObserver(handleResize);
    resizeObs.observe(container);

    let lastTime = performance.now();
    let lastSpawnAt = lastTime;

    const tick = (now: number) => {
      if (cancelled) return;
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const st = gameStateRef.current;
      const prof = combatRef.current;

      // Finish reload timer
      if (st.reloading && now >= st.reloadEndAt) {
        st.reloading = false;
        st.ammo = prof.magSize;
        primaryAmmoRef.current = prof.magSize;
        setReloading(false);
        setAmmo(prof.magSize);
      }

      // Automatic weapon firing (or continuous melee slashing when pointer-locked)
      if (st.mouseDown && (prof.automatic || (prof.isMelee && document.pointerLockElement === renderer.domElement))) {
        fireWeapon(now, false);
      }

      // Smooth ADS sniper/rifle zoom FOV (never zoom on knives or mid-reload/inspect)
      const activeFirearmAnim = firearmAnimatorRef.current;
      const firearmBusy = Boolean(activeFirearmAnim && activeFirearmAnim.isBusy());
      const targetFov = st.adsZoom && !prof.isMelee && !st.reloading && !firearmBusy ? (prof.isSniper ? 26 : 44) : 62;
      if (Math.abs(camera.fov - targetFov) > 0.1) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 14));
        camera.updateProjectionMatrix();
      }

      // FPS Movement (supports both QWERTY WASD & AZERTY ZQSD + Arrows)
      let moveForward = 0;
      let moveRight = 0;
      if (keysDown.has('KeyW') || keysDown.has('z') || keysDown.has('ArrowUp')) moveForward += 1;
      if (keysDown.has('KeyS') || keysDown.has('s') || keysDown.has('ArrowDown')) moveForward -= 1;
      if (keysDown.has('KeyA') || keysDown.has('q') || keysDown.has('ArrowLeft')) moveRight -= 1;
      if (keysDown.has('KeyD') || keysDown.has('d') || keysDown.has('ArrowRight')) moveRight += 1;

      const sprint = keysDown.has('ShiftLeft') || keysDown.has('ShiftRight') ? 1.45 : 1.0;
      const moveLen = Math.hypot(moveForward, moveRight);
      if (!st.gameOver && moveLen > 0) {
        moveForward /= moveLen;
        moveRight /= moveLen;
        const speed = 5.8 * sprint;
        const sinY = Math.sin(st.yaw);
        const cosY = Math.cos(st.yaw);
        const nextX = st.posX + (moveRight * cosY - moveForward * sinY) * speed * dt;
        const nextZ = st.posZ + (-moveRight * sinY - moveForward * cosY) * speed * dt;
        const resolved = resolveArenaCircleCollision(
          nextX,
          nextZ,
          0.45,
          arena.colliders,
          ARENA_LIMIT
        );
        st.posX = resolved.x;
        st.posZ = resolved.z;
        st.bobTime += dt * (sprint > 1 ? 13 : 9);
      }

      // Simple vertical jump/gravity
      if (st.posY > 1.65 || st.velY > 0) {
        st.velY -= 16 * dt;
        st.posY += st.velY * dt;
        if (st.posY <= 1.65) {
          st.posY = 1.65;
          st.velY = 0;
        }
      }

      camera.position.set(st.posX, st.posY, st.posZ);
      camera.rotation.set(st.pitch, st.yaw, 0);

      // ViewModel Procedural Spring Animations (Idle sway, walk bob, recoil, melee slash, reload)
      st.recoilZ = THREE.MathUtils.lerp(st.recoilZ, 0, Math.min(1, dt * 16));
      st.recoilPitch = THREE.MathUtils.lerp(st.recoilPitch, 0, Math.min(1, dt * 14));
      st.meleeSwing = Math.max(0, st.meleeSwing - dt * 3.8);
      muzzleFlashLight.intensity = Math.max(0, muzzleFlashLight.intensity - dt * 75);
      if (st.muzzleFlashTimer > 0) {
        st.muzzleFlashTimer = Math.max(0, st.muzzleFlashTimer - dt);
        if (st.muzzleFlashTimer <= 0) {
          muzzleFlashGroup.visible = false;
        } else {
          const maxFlash = prof.suppressed ? 0.032 : 0.052;
          muzzleFlashMat.opacity = (st.muzzleFlashTimer / maxFlash) * (prof.suppressed ? 0.42 : 0.96);
        }
      }

      const viewCfg = getFPSWeaponViewConfig(prof.archetype);
      const targetAds = st.adsZoom && !prof.isMelee && !st.reloading && !firearmBusy ? 1 : 0;
      st.adsBlend = THREE.MathUtils.lerp(st.adsBlend, targetAds, Math.min(1, dt * 16));
      const baseX = THREE.MathUtils.lerp(viewCfg.rigPosHip[0], viewCfg.rigPosAds[0], st.adsBlend);
      const baseY = THREE.MathUtils.lerp(viewCfg.rigPosHip[1], viewCfg.rigPosAds[1], st.adsBlend);
      const baseZ = THREE.MathUtils.lerp(viewCfg.rigPosHip[2], viewCfg.rigPosAds[2], st.adsBlend);

      const bobMul = 1 - st.adsBlend * 0.72;
      const walkBobX =
        (moveLen > 0 ? Math.sin(st.bobTime) * 0.012 : Math.sin(now * 0.0022) * 0.003) * bobMul;
      const walkBobY =
        (moveLen > 0 ? Math.abs(Math.cos(st.bobTime)) * -0.014 : Math.cos(now * 0.0018) * 0.003) *
        bobMul;
      const slashArc = Math.sin(st.meleeSwing * Math.PI);

      // ── Couteau : animation procédurale dédiée (préserve cfg.scale) ──
      const knifeAnim = knifeAnimatorRef.current;
      const knifeRest = knifeRestRef.current;
      const firearmRest = firearmRestRef.current;
      if (knifeAnim && knifeRest && activeWeaponModel) {
        const knifePose = knifeAnim.update(dt, now);
        const moveBobX = moveLen > 0 ? Math.sin(st.bobTime) * 0.011 : 0;
        const moveBobY = moveLen > 0 ? Math.abs(Math.cos(st.bobTime)) * -0.013 : 0;
        applyKnifeAnimPose(
          viewModelRig,
          weaponMount,
          fpsHands,
          knifeRest,
          [baseX, baseY, baseZ],
          [viewCfg.rigRotBase[0], viewCfg.rigRotBase[1], viewCfg.rigRotBase[2]],
          knifePose,
          moveBobX,
          moveBobY
        );
        camera.rotation.x += knifePose.cameraPunch.pitch;
        camera.rotation.z = knifePose.cameraPunch.roll;
      } else if (activeFirearmAnim && firearmRest && activeWeaponModel) {
        // ── Armes à feu : canon droit + rechargement (changement de chargeur 3D) & inspection (T) ──
        const fPose = activeFirearmAnim.update(dt, now);
        for (const ev of fPose.events) {
          if (ev === 'mag_out') soundEngine.playMagOut(prof.archetype);
          else if (ev === 'mag_in') soundEngine.playMagIn(prof.archetype);
          else if (ev === 'bolt_rack') soundEngine.playBoltRack(prof.archetype);
          else if (ev === 'inspect_start') soundEngine.playWeaponInspect(prof.archetype);
          else if (ev === 'inspect_check') soundEngine.playMagIn(prof.archetype);
        }
        const rotMul = 1 - st.adsBlend;
        const animBobMul = fPose.state === 'inspect' ? 0.35 : fPose.state === 'reload' ? 0.55 : 1.0;
        applyFirearmAnimPose(
          viewModelRig,
          weaponMount,
          fpsHands,
          firearmRest,
          [baseX, baseY, baseZ + st.recoilZ],
          [
            viewCfg.rigRotBase[0] * rotMul + st.recoilPitch,
            viewCfg.rigRotBase[1] * rotMul,
            viewCfg.rigRotBase[2] * rotMul,
          ],
          fPose,
          walkBobX * animBobMul,
          walkBobY * animBobMul
        );
      } else {
        // ── Fallback chargement asynchrone initial du modèle 3D ──
        const reloadDip = st.reloading ? -0.18 : 0;
        const reloadRoll = st.reloading ? 0.45 : 0;
        viewModelRig.position.set(
          baseX + walkBobX - slashArc * 0.24,
          baseY + walkBobY + reloadDip + slashArc * 0.06,
          baseZ + st.recoilZ - slashArc * 0.18
        );
        const rotMul = 1 - st.adsBlend;
        viewModelRig.rotation.set(
          viewCfg.rigRotBase[0] * rotMul + st.recoilPitch - slashArc * 0.42,
          viewCfg.rigRotBase[1] * rotMul + slashArc * 0.52,
          viewCfg.rigRotBase[2] * rotMul + reloadRoll - slashArc * 0.35
        );
      }

      // Update Bullet Tracers & Impact Sparks
      for (let t = tracers.length - 1; t >= 0; t--) {
        tracers[t].life -= dt;
        if (tracers[t].life <= 0) {
          scene.remove(tracers[t].mesh);
          tracers[t].mat.dispose();
          tracers.splice(t, 1);
        } else {
          tracers[t].mat.opacity = (tracers[t].life / tracers[t].maxLife) * 0.92;
        }
      }
      for (let s = sparks.length - 1; s >= 0; s--) {
        sparks[s].life -= dt;
        if (sparks[s].life <= 0) {
          scene.remove(sparks[s].mesh);
          sparks[s].mat.dispose();
          sparks.splice(s, 1);
        } else {
          const ratio = sparks[s].life / sparks[s].maxLife;
          sparks[s].mat.opacity = ratio * 0.9;
          sparks[s].mesh.scale.setScalar(0.85 + (1 - ratio) * 0.65);
        }
      }

      // Spawn Zombie Targets up to wave cap
      const maxActive = Math.min(14, 5 + st.wave);
      if (!st.gameOver && zombies.length < maxActive && now - lastSpawnAt > 1100) {
        spawnOneZombie();
        lastSpawnAt = now;
      }

      // Advance Zombies smoothly toward player
      for (const z of zombies) {
        if (st.gameOver) continue;
        const dx = st.posX - z.root.position.x;
        const dz = st.posZ - z.root.position.z;
        const dist = Math.hypot(dx, dz) || 1;
        z.root.rotation.y = Math.atan2(dx, dz);

        const isAttacking = dist <= 1.75;
        if (dist > 1.45) {
          const zRadius = 0.42 * ZOMBIE_TIERS[z.tier].scale;
          const nextPos = stepZombieTowardPlayer(
            z.root.position.x,
            z.root.position.z,
            st.posX,
            st.posZ,
            z.speed * dt,
            zRadius,
            z.steerSign,
            arena.colliders,
            ARENA_LIMIT
          );
          z.root.position.x = nextPos.x;
          z.root.position.z = nextPos.z;
          z.bobPhase += dt * z.speed * 3.8;
          z.root.position.y = 0;
        } else {
          // Damage player gently at close range
          st.hp = Math.max(0, st.hp - 22 * dt);
          setHp(Math.ceil(st.hp));
          if (st.hp <= 0 && !st.gameOver) {
            // Death wipes ALL unbanked session credits from this run
            const lost = st.sessionEarned;
            st.gameOver = true;
            st.sessionEarned = 0;
            setLostCredits(lost);
            setSessionEarned(0);
            setGameOver(true);
            suppressPointerExitRef.current = true;
            if (document.pointerLockElement) {
              document.exitPointerLock?.();
            }
          }
        }

        const flinch = z.hitFlash > 0 ? z.hitFlash / 0.14 : 0;
        z.model.animate(z.bobPhase, dt, { isAttacking, flinch });
        z.model.setHitFlash(flinch);
        if (z.hitFlash > 0) {
          z.hitFlash = Math.max(0, z.hitFlash - dt);
        }
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      swapWeaponFnRef.current = null;
      resetArenaFnRef.current = null;
      knifeAnimatorRef.current = null;
      knifeRestRef.current = null;
      firearmAnimatorRef.current = null;
      firearmRestRef.current = null;
      if (preloadTimerId !== null) window.clearTimeout(preloadTimerId);
      if (rafId) cancelAnimationFrame(rafId);
      suppressPointerExitRef.current = true;
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock?.();
      }
      resizeObs.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', clearStuckInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      renderer.domElement.removeEventListener('dragstart', onPreventDrag);

      for (const entry of weaponCache.values()) {
        weaponMount.remove(entry.model.group);
        entry.model.dispose();
      }
      weaponCache.clear();
      inFlightBuilds.clear();
      activeWeaponModel = null;
      fpsHands.dispose();
      for (const z of zombies) disposeZombie(z);
      zombieAssetBank.dispose();
      for (const t of tracers) {
        scene.remove(t.mesh);
        t.mat.dispose();
      }
      for (const s of sparks) {
        scene.remove(s.mesh);
        s.mat.dispose();
      }
      tracerGeo.dispose();
      sparkGeo.dispose();
      muzzleFlashGeo.dispose();
      muzzleFlashMat.dispose();
      muzzleFlashTex.dispose();
      arena.dispose();
      studioEnv.dispose();
      renderer.dispose();
      if (container) container.innerHTML = '';
    };
  }, []);

  const handleLockToPlay = useCallback(() => {
    const canvas = stageRef.current?.querySelector('canvas');
    safeRequestPointerLock(canvas);
  }, []);

  const equippedRarity = RARITIES[equippedItem.rarity];

  return (
    <div className="relative flex min-h-screen flex-col bg-[#050811] text-accent-50">
      {/* Compact FPS Header Bar */}
      <header className="relative z-30 flex flex-wrap items-center justify-between gap-3 border-b border-accent-500/20 bg-surface-base/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              exitToCasino(false);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-accent-500/25 bg-surface-panel px-3.5 py-2 text-xs font-bold text-accent-100 transition hover:border-accent-400/50 hover:text-accent-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au Casino (Échap)
          </button>

          <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5">
            <Skull className="h-4 w-4 text-rose-400" />
            <span className="font-display text-xs font-bold uppercase tracking-wider text-rose-200 sm:text-sm">
              Mode Zombie FPS
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            title="Crédits remportés uniquement si vous survivez et retournez au casino"
            className="flex items-center gap-2 rounded-xl border border-amber-400/30 bg-surface-panel px-3 py-1.5 text-xs"
          >
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="text-accent-200/75">Butin à sécuriser :</span>
            <span className="font-mono-num font-extrabold text-amber-300">
              +{formatCredits(sessionEarned)}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-accent-500/20 bg-surface-panel px-3 py-1.5 text-xs">
            <Flame className="h-4 w-4 text-rose-400" />
            <span className="font-mono-num font-bold text-accent-50">
              {kills} élim. • Vague {wave}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-accent-400/35 bg-surface-panel px-3.5 py-1.5 text-xs">
            <span className="text-accent-200/65">Solde casino :</span>
            <span className="font-mono-num font-extrabold text-accent-300">
              {formatCredits(balance)}
            </span>
          </div>
        </div>
      </header>

      {/* Main Full-Bleed FPS Viewport */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={stageRef}
          data-testid="zombie-fps-stage"
          className="h-[calc(100vh-58px)] min-h-[520px] w-full select-none bg-[#060a14]"
        />

        {webglError && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Skull className="h-10 w-10 text-rose-400" />
            <p className="max-w-md rounded-xl border border-accent-500/25 bg-surface-card/90 px-4 py-3 text-xs text-accent-200">
              {webglError}
            </p>
          </div>
        )}

        {/* Center Crosshair + Hitmarker */}
        {!gameOver && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <Crosshair
                className={`h-6 w-6 transition-transform duration-75 ${
                  hitmarker === 'crit'
                    ? 'scale-125 text-amber-300 drop-shadow-[0_0_8px_#fbbf24]'
                    : hitmarker === 'body'
                    ? 'scale-110 text-rose-400'
                    : 'text-white/75'
                }`}
              />
              {floatingReward && (
                <motion.div
                  key={floatingReward.id}
                  initial={{ opacity: 1, y: -12 }}
                  animate={{ opacity: 0, y: -42 }}
                  transition={{ duration: 0.7 }}
                  className="absolute -top-6 whitespace-nowrap font-mono-num text-sm font-extrabold text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
                >
                  +{floatingReward.amount} CR {floatingReward.headshot ? '• CRIT' : ''}
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* Top-Right Kill Feed */}
        <div className="pointer-events-none absolute right-4 top-4 z-20 flex flex-col items-end gap-1.5">
          <AnimatePresence>
            {killFeed.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/65 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="text-accent-100">{entry.tierLabel}</span>
                {entry.headshot && <span className="text-[10px] font-bold text-amber-300">TÊTE</span>}
                <span className="font-mono-num font-bold text-emerald-300">+{entry.reward} CR</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Bottom-Left Player HP + Controls Hint */}
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-col gap-2">
          <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/65 px-3.5 py-2 backdrop-blur-md">
            <Shield className={`h-4 w-4 ${hp > 40 ? 'text-emerald-400' : 'text-rose-400'}`} />
            <div className="h-2 w-28 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-all duration-150 ${
                  hp > 40 ? 'bg-emerald-400' : 'bg-rose-500'
                }`}
                style={{ width: `${hp}%` }}
              />
            </div>
            <span className="font-mono-num text-xs font-bold text-white">{hp} PV</span>
          </div>
          <div className="hidden rounded-lg border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] text-accent-100/75 backdrop-blur-md sm:block">
            {combatProfile.isMelee
              ? `ZQSD / WASD : bouger • Clic G : coup rapide • Clic D : coup lourd • T / F / R : inspecter • 1 : arme • 2 : dégainer • Échap : retour au casino`
              : `ZQSD / WASD : bouger • Clic : tirer • Clic droit : viser • R : recharger • T : inspecter • 1 : arme • 2 : couteau • Échap : retour au casino`}
          </div>
        </div>

        {/* Bottom-Right 2-Slot Loadout & Active Ammo HUD */}
        <div className="pointer-events-none absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/75 px-4 py-2.5 backdrop-blur-md">
            {equippedItem.image && (
              <img
                src={equippedItem.image}
                alt={equippedItem.name}
                className="h-10 w-20 object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]"
              />
            )}
            <div>
              <div
                className="text-[10px] font-bold uppercase tracking-wider"
                style={{ color: equippedRarity.color }}
              >
                {equippedRarity.label} • Slot {effectiveSlot}
              </div>
              <div className="font-display text-xs font-bold text-white sm:text-sm">
                {equippedItem.weaponName} | {equippedItem.name}
              </div>
              <div className="font-mono-num text-xs font-bold text-accent-300">
                {combatProfile.isMelee
                  ? 'CORPS-À-CORPS ∞'
                  : reloading
                  ? 'RECHARGEMENT...'
                  : `${ammo} / ${combatProfile.magSize}`}
              </div>
            </div>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => switchToSlot(1)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs transition backdrop-blur-md ${
                effectiveSlot === 1
                  ? 'border-emerald-400/70 bg-emerald-500/20 text-white shadow-[0_0_14px_rgba(52,211,153,0.28)]'
                  : 'border-white/15 bg-black/65 text-accent-200/75 hover:border-white/30'
              }`}
            >
              <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono-num text-[10px] font-extrabold text-emerald-300">
                1
              </span>
              <span className="max-w-[120px] truncate font-semibold">
                {loadout.primary.weaponName}
              </span>
            </button>

            <button
              type="button"
              disabled={!loadout.knife}
              onClick={() => switchToSlot(2)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-xs transition backdrop-blur-md ${
                !loadout.knife
                  ? 'cursor-not-allowed border-white/10 bg-black/45 text-accent-200/40'
                  : effectiveSlot === 2
                  ? 'border-amber-400/70 bg-amber-500/20 text-white shadow-[0_0_14px_rgba(251,191,36,0.28)]'
                  : 'border-white/15 bg-black/65 text-accent-200/75 hover:border-amber-400/45'
              }`}
            >
              <span className="rounded bg-black/50 px-1.5 py-0.5 font-mono-num text-[10px] font-extrabold text-amber-300">
                2
              </span>
              <span className="max-w-[130px] truncate font-semibold">
                {loadout.knife ? loadout.knife.weaponName : 'Couteau vide'}
              </span>
            </button>
          </div>
        </div>

        {/* Aim / Lock helper bar when pointer isn't locked */}
        {!pointerLocked && !gameOver && (
          <div className="pointer-events-none absolute inset-x-0 top-5 z-20 flex justify-center">
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-accent-400/35 bg-surface-card/90 px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.75)] backdrop-blur-md">
              <button
                type="button"
                onClick={handleLockToPlay}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-400 to-accent2-300 px-4 py-2 text-xs font-extrabold text-accent-950 shadow transition hover:brightness-105"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                Visée FPS 360° (Cliquer ici)
              </button>
              {inventory.length === 0 && (
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    exitToCasino(true);
                  }}
                  className="rounded-xl border border-accent-400/35 bg-surface-base px-3.5 py-2 text-xs font-bold text-accent-100 transition hover:border-accent-400/60"
                >
                  Ouvrir des caisses
                </button>
              )}
            </div>
          </div>
        )}

        {/* Defeat Overlay: Player loses ALL farmed session credits on death */}
        {gameOver && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
            <div className="w-full max-w-md rounded-3xl border border-rose-500/40 bg-surface-card p-6 text-center shadow-2xl">
              <Skull className="mx-auto h-12 w-12 text-rose-400" />
              <h2 className="mt-3 font-display text-2xl font-extrabold text-white">
                Vous êtes mort !
              </h2>
              <p className="mt-2 text-xs text-accent-100/75">
                Vous avez succombé après <strong>{kills}</strong> élimination(s). Tout le butin
                récolté durant cette partie (<strong className="text-rose-300">{formatCredits(lostCredits)}</strong>)
                est perdu — <strong>0 CR</strong> crédité sur votre solde.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    resetArenaFnRef.current?.();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-400 to-accent2-300 px-5 py-2.5 text-xs font-extrabold text-accent-950"
                >
                  <RotateCw className="h-4 w-4" />
                  Rejouer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    exitToCasino(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-accent-500/25 bg-surface-base px-5 py-2.5 text-xs font-bold text-accent-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Retour au Casino (Échap)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
