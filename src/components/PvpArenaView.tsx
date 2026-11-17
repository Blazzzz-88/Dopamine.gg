import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  Copy,
  Globe,
  KeyRound,
  Laptop,
  Loader2,
  Play,
  RotateCw,
  Shield,
  SlidersHorizontal,
  Swords,
  Trophy,
  UserCheck,
  Wifi,
  WifiOff,
} from 'lucide-react';
import * as THREE from 'three';
import { RARITIES } from '../data/rarities';
import { InventoryItem } from '../types/casino';
import {
  applyFirearmAnimPose,
  captureFirearmRigRestData,
  createFirearmAnimator,
  FirearmAnimator,
  FirearmRigRestData,
} from '../utils/firearmAnimations';
import { createFPSHands, FPSHandsRig, getFPSWeaponViewConfig } from '../utils/fpsHandsBuilder';
import {
  alignBladeWeaponToFist,
  applyKnifeAnimPose,
  captureKnifeRigRestData,
  createKnifeAnimator,
  KnifeAnimator,
  KnifeRigRestData,
  resolveKnifeType,
} from '../utils/knifeAnimations';
import {
  computePvpDamage,
  computePvpSessionCredits,
  createPvpFallbackWeapon,
  generatePvpRoomCode,
  getPvpWeaponProfile,
  normalizePvpRoomCode,
  PVP_COUNTDOWN_SECONDS,
  PVP_MATCH_WIN_REWARD,
  PVP_MAX_HP,
  PVP_ROUND_WIN_REWARD,
  PVP_ROUNDS_TO_WIN,
  PVP_SPAWN_POINTS,
} from '../utils/pvpEngine';
import {
  joinPvpLobby,
  joinPvpRoom,
  LobbySession,
  PvpPlayerProfile,
  PvpRoomSession,
} from '../utils/pvpNetwork';
import { createPvpPlayer3DModel, PvpPlayer3DModel } from '../utils/pvpPlayerModelBuilder';
import { formatCredits, randomId } from '../utils/rng';
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
  ARENA_LIMIT,
  createZombieArena,
  resolveArenaCircleCollision,
} from '../utils/zombieArenaBuilder';
import {
  applyFpsMouseDelta,
  computeShotSpreadNDC,
  FPS_MOUSE_SENSITIVITY,
  FPS_PITCH_LIMIT,
  ZombieSlot,
} from '../utils/zombieEngine';
import {
  computeEffectiveSensitivityMultiplier,
  CROSSHAIR_COLOR_PRESETS,
  CrosshairStyle,
  loadPvpControlsConfig,
  PvpControlsConfig,
  savePvpControlsConfig,
} from '../utils/pvpSettings';
import { PvpCrosshair } from './PvpCrosshair';

interface PvpArenaViewProps {
  inventory: InventoryItem[];
  equippedWeaponId?: string | null;
  equippedKnifeId?: string | null;
  balance: number;
  playerName?: string | null;
  userId?: string | null;
  onExit: (earnedCredits: number) => void;
  onGoToShop: (earnedCredits: number) => void;
}

type PvpPhase =
  | 'menu'
  | 'searching'
  | 'waiting_room'
  | 'countdown'
  | 'playing'
  | 'round_over'
  | 'match_over'
  | 'opponent_left';

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

function safeRequestPointerLock(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas || typeof canvas.requestPointerLock !== 'function') return;
  const fallback = () => {
    try {
      const res = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (res && typeof res.catch === 'function') res.catch(() => {});
    } catch {
      // Fallback to click-drag aiming
    }
  };
  try {
    const res = (
      canvas.requestPointerLock as (opts?: { unadjustedMovement?: boolean }) => unknown
    )({ unadjustedMovement: true }) as Promise<void> | undefined;
    if (res && typeof res.catch === 'function') res.catch(() => fallback());
  } catch {
    fallback();
  }
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

export const PvpArenaView: React.FC<PvpArenaViewProps> = ({
  inventory,
  equippedWeaponId,
  equippedKnifeId,
  balance,
  playerName,
  userId,
  onExit,
  onGoToShop,
}) => {
  const clientId = useMemo(
    () => (userId ? `u_${userId}_${randomId('c').slice(-4)}` : randomId('guest')),
    [userId]
  );
  const [pseudo, setPseudo] = useState<string>(
    () => playerName?.trim() || `Agent-${clientId.slice(-4).toUpperCase()}`
  );

  // Separate crate firearms and crate knives so user can pick from their won crate items
  const crateFirearms = useMemo(
    () => inventory.filter((item) => item.weaponClass !== 'lame'),
    [inventory]
  );
  const crateKnives = useMemo(
    () => inventory.filter((item) => item.weaponClass === 'lame'),
    [inventory]
  );

  const fallbackWeapon = useMemo(() => createPvpFallbackWeapon(), []);
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string>(
    () =>
      (equippedWeaponId && crateFirearms.find((i) => i.instanceId === equippedWeaponId)?.instanceId) ||
      crateFirearms[0]?.instanceId ||
      fallbackWeapon.instanceId
  );
  const [selectedKnifeId, setSelectedKnifeId] = useState<string | null>(
    () =>
      (equippedKnifeId && crateKnives.find((i) => i.instanceId === equippedKnifeId)?.instanceId) ||
      crateKnives[0]?.instanceId ||
      null
  );

  const primaryItem = useMemo(
    () => crateFirearms.find((i) => i.instanceId === selectedPrimaryId) || crateFirearms[0] || fallbackWeapon,
    [crateFirearms, selectedPrimaryId, fallbackWeapon]
  );
  const knifeItem = useMemo(
    () => (selectedKnifeId ? crateKnives.find((i) => i.instanceId === selectedKnifeId) || null : null),
    [crateKnives, selectedKnifeId]
  );

  const [activeSlot, setActiveSlot] = useState<ZombieSlot>(1);
  const effectiveSlot: ZombieSlot = activeSlot === 2 && knifeItem ? 2 : 1;
  const equippedItem = effectiveSlot === 2 && knifeItem ? knifeItem : primaryItem;

  const primaryProfile = useMemo(() => getPvpWeaponProfile(primaryItem), [primaryItem]);
  const combatProfile = useMemo(() => getPvpWeaponProfile(equippedItem), [equippedItem]);

  // Networking & Match State
  const [phase, setPhase] = useState<PvpPhase>('menu');
  const [roomCode, setRoomCode] = useState<string>('');
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(true);
  const [lobbyWaitingCount, setLobbyWaitingCount] = useState<number>(1);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [opponentProfile, setOpponentProfile] = useState<PvpPlayerProfile | null>(null);

  // Round & Combat HUD
  const [round, setRound] = useState<number>(1);
  const [countdown, setCountdown] = useState<number>(PVP_COUNTDOWN_SECONDS);
  const [myScore, setMyScore] = useState<number>(0);
  const [opponentScore, setOpponentScore] = useState<number>(0);
  const [myHp, setMyHp] = useState<number>(PVP_MAX_HP);
  const [opponentHp, setOpponentHp] = useState<number>(PVP_MAX_HP);
  const [ammo, setAmmo] = useState<number>(primaryProfile.magSize);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [isScoped, setIsScoped] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [hitmarker, setHitmarker] = useState<{ key: number; headshot: boolean; dmg: number } | null>(null);
  const [damageFlash, setDamageFlash] = useState<boolean>(false);
  const [roundWinnerSide, setRoundWinnerSide] = useState<'me' | 'opponent' | null>(null);
  const [rematchVoted, setRematchVoted] = useState<boolean>(false);
  const [opponentRematchVoted, setOpponentRematchVoted] = useState<boolean>(false);
  const [earnedCredits, setEarnedCredits] = useState<number>(0);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [controlsConfig, setControlsConfig] = useState<PvpControlsConfig>(() =>
    loadPvpControlsConfig()
  );

  const updateControlsConfig = useCallback(
    (updater: (prev: PvpControlsConfig) => PvpControlsConfig) => {
      setControlsConfig((prev) => {
        const next = updater(prev);
        savePvpControlsConfig(next);
        return next;
      });
    },
    []
  );

  const controlsConfigRef = useRef(controlsConfig);
  controlsConfigRef.current = controlsConfig;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const lobbyRef = useRef<LobbySession | null>(null);
  const roomRef = useRef<PvpRoomSession | null>(null);

  // Mutable refs for 60fps Three.js loop
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const roundRef = useRef(round);
  roundRef.current = round;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;
  const myScoreRef = useRef(myScore);
  myScoreRef.current = myScore;
  const opponentScoreRef = useRef(opponentScore);
  opponentScoreRef.current = opponentScore;
  const equippedRef = useRef(equippedItem);
  equippedRef.current = equippedItem;
  const combatProfileRef = useRef(combatProfile);
  combatProfileRef.current = combatProfile;
  const primaryAmmoRef = useRef(primaryProfile.magSize);
  const effectiveSlotRef = useRef(effectiveSlot);
  effectiveSlotRef.current = effectiveSlot;
  const isScopedRef = useRef(isScoped);
  isScopedRef.current = isScoped;

  const firearmAnimatorRef = useRef<FirearmAnimator | null>(null);
  const firearmRestRef = useRef<FirearmRigRestData | null>(null);
  const knifeAnimatorRef = useRef<KnifeAnimator | null>(null);
  const knifeRestRef = useRef<KnifeRigRestData | null>(null);
  const swapWeaponFnRef = useRef<((item: InventoryItem) => void) | null>(null);
  const opponentModelRef = useRef<PvpPlayer3DModel | null>(null);
  const spawnOpponentTracerFnRef = useRef<
    ((origin: THREE.Vector3, dir: THREE.Vector3) => void) | null
  >(null);

  const gameStateRef = useRef({
    hp: PVP_MAX_HP,
    oppHp: PVP_MAX_HP,
    posX: PVP_SPAWN_POINTS[0].x,
    posY: 0,
    velY: 0,
    posZ: PVP_SPAWN_POINTS[0].z,
    yaw: PVP_SPAWN_POINTS[0].yaw,
    pitch: 0,
    isMoving: false,
    isCrouching: false,
    isGrounded: true,
    lastShotAt: 0,
    reloadingUntil: 0,
    muzzleFlashTimer: 0,
    recoilPitch: 0,
    recoilKick: 0,
    // Remote opponent interpolated transform
    oppTargetX: PVP_SPAWN_POINTS[1].x,
    oppTargetZ: PVP_SPAWN_POINTS[1].z,
    oppTargetYaw: PVP_SPAWN_POINTS[1].yaw,
    oppTargetPitch: 0,
    oppX: PVP_SPAWN_POINTS[1].x,
    oppZ: PVP_SPAWN_POINTS[1].z,
    oppYaw: PVP_SPAWN_POINTS[1].yaw,
    oppPitch: 0,
    oppIsMoving: false,
    oppHitFlash: 0,
    lastNetSendAt: 0,
  });

  // Reset ammo when primary weapon changes
  useEffect(() => {
    primaryAmmoRef.current = primaryProfile.magSize;
    setAmmo(primaryProfile.magSize);
    setIsReloading(false);
    gameStateRef.current.reloadingUntil = 0;
  }, [primaryProfile]);

  useEffect(() => {
    swapWeaponFnRef.current?.(equippedItem);
    setIsScoped(false);
  }, [equippedItem]);

  const localProfile: PvpPlayerProfile = useMemo(
    () => ({
      clientId,
      name: pseudo.trim() || 'Agent',
      weaponName: equippedItem.weaponName,
      skinName: equippedItem.name,
      rarity: equippedItem.rarity,
      swatches: equippedItem.swatches,
      isMelee: combatProfile.isMelee,
    }),
    [clientId, pseudo, equippedItem, combatProfile.isMelee]
  );

  const localProfileRef = useRef(localProfile);
  localProfileRef.current = localProfile;

  // Broadcast updated weapon when player swaps slot or weapon
  useEffect(() => {
    if (phase === 'countdown' || phase === 'playing' || phase === 'waiting_room') {
      roomRef.current?.sendHello(localProfile);
    }
  }, [localProfile, phase]);

  const positionPlayersForRound = useCallback((hostFlag: boolean) => {
    const myIdx = hostFlag ? 0 : 1;
    const oppIdx = hostFlag ? 1 : 0;
    const mySpawn = PVP_SPAWN_POINTS[myIdx];
    const oppSpawn = PVP_SPAWN_POINTS[oppIdx];
    const st = gameStateRef.current;

    st.hp = PVP_MAX_HP;
    st.oppHp = PVP_MAX_HP;
    st.posX = mySpawn.x;
    st.posY = 0;
    st.velY = 0;
    st.posZ = mySpawn.z;
    st.yaw = mySpawn.yaw;
    st.pitch = 0;
    st.recoilPitch = 0;
    st.recoilKick = 0;
    st.reloadingUntil = 0;

    st.oppTargetX = oppSpawn.x;
    st.oppTargetZ = oppSpawn.z;
    st.oppTargetYaw = oppSpawn.yaw;
    st.oppTargetPitch = 0;
    st.oppX = oppSpawn.x;
    st.oppZ = oppSpawn.z;
    st.oppYaw = oppSpawn.yaw;
    st.oppPitch = 0;
    st.oppIsMoving = false;
    st.oppHitFlash = 0;

    primaryAmmoRef.current = primaryProfile.magSize;
    setAmmo(primaryProfile.magSize);
    setIsReloading(false);
    setIsScoped(false);
    setMyHp(PVP_MAX_HP);
    setOpponentHp(PVP_MAX_HP);
    setRoundWinnerSide(null);
  }, [primaryProfile.magSize]);

  const startRoundCountdown = useCallback(
    (nextRound: number, hostFlag: boolean) => {
      positionPlayersForRound(hostFlag);
      setRound(nextRound);
      setCountdown(PVP_COUNTDOWN_SECONDS);
      setPhase('countdown');
    },
    [positionPlayersForRound]
  );

  // Countdown timer effect
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      setPhase('playing');
      soundEngine.playClick();
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdown((c) => c - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [phase, countdown]);

  // Round-over -> next round transition
  useEffect(() => {
    if (phase !== 'round_over') return;
    const timer = window.setTimeout(() => {
      const nextR = roundRef.current + 1;
      startRoundCountdown(nextR, isHostRef.current);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [phase, startRoundCountdown]);

  const finishRound = useCallback(
    (winnerSide: 'me' | 'opponent') => {
      if (phaseRef.current !== 'playing') return;
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      setRoundWinnerSide(winnerSide);

      const nextMyScore = myScoreRef.current + (winnerSide === 'me' ? 1 : 0);
      const nextOppScore = opponentScoreRef.current + (winnerSide === 'opponent' ? 1 : 0);
      setMyScore(nextMyScore);
      setOpponentScore(nextOppScore);

      if (nextMyScore >= PVP_ROUNDS_TO_WIN || nextOppScore >= PVP_ROUNDS_TO_WIN) {
        const wonMatch = nextMyScore >= PVP_ROUNDS_TO_WIN;
        setEarnedCredits((prev) => prev + computePvpSessionCredits(nextMyScore, wonMatch));
        setRematchVoted(false);
        setOpponentRematchVoted(false);
        setPhase('match_over');
      } else {
        setPhase('round_over');
      }
    },
    []
  );

  const connectToRoom = useCallback(
    (code: string, hostFlag: boolean) => {
      lobbyRef.current?.leave();
      lobbyRef.current = null;
      roomRef.current?.leave();

      setRoomCode(code);
      setIsHost(hostFlag);
      setMyScore(0);
      setOpponentScore(0);
      setOpponentProfile(null);
      setRematchVoted(false);
      setOpponentRematchVoted(false);
      setPhase('waiting_room');

      const session = joinPvpRoom(code, clientId, localProfileRef.current, {
        onStatusChange: (status) => {
          if (status === 'connected') {
            startRoundCountdown(1, hostFlag);
          }
        },
        onOpponentHello: (profile) => {
          setOpponentProfile(profile);
          opponentModelRef.current?.setWeaponSwatches(profile.swatches, profile.isMelee);
        },
        onOpponentState: (st) => {
          const g = gameStateRef.current;
          g.oppTargetX = st.x;
          g.oppTargetZ = st.z;
          g.oppTargetYaw = st.yaw;
          g.oppTargetPitch = st.pitch;
          g.oppIsMoving = st.isMoving;
        },
        onOpponentShoot: (shoot) => {
          if (shoot.round !== roundRef.current) return;
          spawnOpponentTracerFnRef.current?.(
            new THREE.Vector3(...shoot.origin),
            new THREE.Vector3(...shoot.dir)
          );
          if (shoot.hitTarget && shoot.damage && phaseRef.current === 'playing') {
            const g = gameStateRef.current;
            g.hp = Math.max(0, g.hp - shoot.damage);
            setMyHp(g.hp);
            setDamageFlash(true);
            window.setTimeout(() => setDamageFlash(false), 180);
            soundEngine.playHitmarker(shoot.hitPart === 'head');
            if (g.hp <= 0) {
              roomRef.current?.sendRoundControl({
                clientId,
                action: 'round_win',
                round: roundRef.current,
                winnerId: shoot.clientId,
              });
              finishRound('opponent');
            }
          }
        },
        onRoundControl: (pkt) => {
          if (pkt.action === 'round_win' && pkt.round === roundRef.current) {
            if (pkt.winnerId === clientId) {
              finishRound('me');
            } else {
              finishRound('opponent');
            }
          } else if (pkt.action === 'rematch_vote') {
            setOpponentRematchVoted(true);
          }
        },
        onOpponentLeft: () => {
          if (document.pointerLockElement) {
            document.exitPointerLock?.();
          }
          setPhase('opponent_left');
        },
      });

      roomRef.current = session;
    },
    [clientId, finishRound, startRoundCountdown]
  );

  // Trigger rematch when both players voted
  useEffect(() => {
    if (phase === 'match_over' && rematchVoted && opponentRematchVoted) {
      setMyScore(0);
      setOpponentScore(0);
      setRematchVoted(false);
      setOpponentRematchVoted(false);
      startRoundCountdown(1, isHostRef.current);
    }
  }, [phase, rematchVoted, opponentRematchVoted, startRoundCountdown]);

  const handleStartQuickMatch = () => {
    soundEngine.playClick();
    lobbyRef.current?.leave();
    setPhase('searching');
    lobbyRef.current = joinPvpLobby(
      clientId,
      localProfile.name,
      localProfile.weaponName,
      (count) => setLobbyWaitingCount(count),
      (matchedCode, hostFlag) => {
        connectToRoom(matchedCode, hostFlag);
      }
    );
  };

  const handleCreatePrivateRoom = () => {
    soundEngine.playClick();
    const code = generatePvpRoomCode();
    connectToRoom(code, true);
  };

  const handleJoinPrivateRoom = () => {
    const normalized = normalizePvpRoomCode(joinCodeInput);
    if (normalized.length < 3) return;
    soundEngine.playClick();
    connectToRoom(normalized, false);
  };

  const handleCancelSearchOrRoom = () => {
    soundEngine.playClick();
    lobbyRef.current?.leave();
    lobbyRef.current = null;
    roomRef.current?.leave();
    roomRef.current = null;
    setPhase('menu');
  };

  const handleCopyCode = () => {
    if (!roomCode || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    window.setTimeout(() => setCopiedCode(false), 1800);
  };

  // Cleanup channels on unmount
  useEffect(() => {
    return () => {
      lobbyRef.current?.leave();
      roomRef.current?.leave();
    };
  }, []);

  // Main Three.js 1v1 Arena FPS Engine
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

    const hemi = new THREE.HemisphereLight('#bae6fd', '#111827', 0.9);
    scene.add(hemi);
    const dirLight = new THREE.DirectionalLight('#f8fafc', 1.5);
    dirLight.position.set(14, 24, 12);
    scene.add(dirLight);
    const rimLight = new THREE.DirectionalLight('#fb7185', 0.55);
    rimLight.position.set(-16, 12, -16);
    scene.add(rimLight);

    const maxAniso = renderer.capabilities?.getMaxAnisotropy?.() ?? 8;
    const arena = createZombieArena(maxAniso);
    scene.add(arena.group);

    // Opponent 3D Operator Model
    const opponentModel = createPvpPlayer3DModel();
    opponentModel.root.visible = false;
    scene.add(opponentModel.root);
    opponentModelRef.current = opponentModel;

    // First-person Viewmodel
    const viewModelRig = new THREE.Group();
    camera.add(viewModelRig);
    const fpsHands = createFPSHands();
    viewModelRig.add(fpsHands.group);
    const weaponMount = new THREE.Group();
    viewModelRig.add(weaponMount);

    const muzzleAnchor = new THREE.Group();
    weaponMount.add(muzzleAnchor);
    const muzzleFlashTex = createMuzzleFlashTexture();
    const muzzleFlashGeo = new THREE.PlaneGeometry(0.18, 0.18);
    const muzzleFlashMat = new THREE.MeshBasicMaterial({
      map: muzzleFlashTex,
      color: '#fde047',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const muzzleFlashGroup = new THREE.Group();
    muzzleFlashGroup.visible = false;
    const flashFront = new THREE.Mesh(muzzleFlashGeo, muzzleFlashMat);
    const flashSideH = new THREE.Mesh(muzzleFlashGeo, muzzleFlashMat);
    flashSideH.rotation.y = Math.PI / 2;
    const flashSideV = new THREE.Mesh(muzzleFlashGeo, muzzleFlashMat);
    flashSideV.rotation.x = Math.PI / 2;
    muzzleFlashGroup.add(flashFront, flashSideH, flashSideV);
    muzzleAnchor.add(muzzleFlashGroup);

    // Weapon cache
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
    let activeWeaponModel: Weapon3DModel | null = null;
    let swapToken = 0;

    const getKey = (item: InventoryItem) =>
      `${item.instanceId}::${item.image ?? ''}::${item.weaponName}::${item.rarity}`;

    const activateEntry = (entry: CachedWeaponEntry) => {
      for (const c of weaponCache.values()) {
        c.model.group.visible = c === entry;
      }
      weaponMount.position.set(0, 0, 0);
      weaponMount.quaternion.identity();
      weaponMount.scale.set(1, 1, 1);

      activeWeaponModel = entry.model;
      applyWeaponViewPose(entry.model.group, entry.arch, fpsHands, entry.model.gripMeta);
      const cfg = getFPSWeaponViewConfig(entry.arch);

      if (!entry.isFirearm) {
        firearmAnimatorRef.current = null;
        firearmRestRef.current = null;
        knifeAnimatorRef.current = entry.knifeAnim;
        knifeRestRef.current = entry.knifeRest;
        if (entry.knifeAnim) {
          entry.knifeAnim.triggerDraw(true);
          soundEngine.playKnifeDraw(entry.knifeAnim.knifeType);
        }
      } else {
        knifeAnimatorRef.current = null;
        knifeRestRef.current = null;
        firearmAnimatorRef.current = entry.firearmAnim;
        firearmRestRef.current = entry.firearmRest;
        muzzleAnchor.position.copy(entry.muzzleMountPos);
        viewModelRig.position.set(...cfg.rigPosHip);
        viewModelRig.rotation.set(...cfg.rigRotBase);
      }
    };

    const loadWeapon = (item: InventoryItem) => {
      if (!item.image) return;
      const token = ++swapToken;
      const key = getKey(item);
      const cached = weaponCache.get(key);
      if (cached) {
        if (activeWeaponModel !== cached.model) activateEntry(cached);
        return;
      }
      const arch = resolveWeaponArchetype(item.weaponClass, item.weaponName);
      const isFirearm = arch !== 'karambit' && arch !== 'couteau';
      buildWeapon3DModel(item.image, item.weaponClass, item.weaponName, maxAniso, {
        singleHeroComponent: true,
        separateMagazine: isFirearm,
        rarity: item.rarity,
        maxTextureSize: 1024,
      })
        .then((built) => {
          if (cancelled) {
            built.dispose();
            return;
          }
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

          const entry: CachedWeaponEntry = {
            key,
            item,
            arch,
            isFirearm,
            model: built,
            muzzleMountPos,
            knifeAnim: !isFirearm ? createKnifeAnimator(resolveKnifeType(item.weaponName)) : null,
            knifeRest: !isFirearm
              ? captureKnifeRigRestData(arch, getFPSWeaponViewConfig(arch), fpsHands, built.group, built.gripMeta)
              : null,
            firearmAnim: isFirearm ? createFirearmAnimator(arch) : null,
            firearmRest: isFirearm
              ? captureFirearmRigRestData(
                  arch,
                  getFPSWeaponViewConfig(arch),
                  built.group,
                  built.magMeta,
                  built.magazineGroup
                )
              : null,
          };
          weaponCache.set(key, entry);
          if (token === swapToken) activateEntry(entry);
        })
        .catch(() => {});
    };

    swapWeaponFnRef.current = loadWeapon;
    loadWeapon(equippedRef.current);

    // Tracers & Sparks
    const tracers: TracerBeam[] = [];
    const sparks: ImpactSpark[] = [];
    const tracerGeo = new THREE.CylinderGeometry(0.004, 0.011, 1, 6, 1);
    const sparkGeo = new THREE.PlaneGeometry(0.11, 0.11);
    const raycaster = new THREE.Raycaster();

    const spawnTracer = (start: THREE.Vector3, end: THREE.Vector3, colorHex: string) => {
      const dist = start.distanceTo(end);
      if (dist < 0.1) return;
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(tracerGeo, mat);
      mesh.position.copy(start).lerp(end, 0.5);
      mesh.scale.set(1, dist, 1);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        end.clone().sub(start).normalize()
      );
      scene.add(mesh);
      tracers.push({ mesh, mat, life: 0.12, maxLife: 0.12 });
    };

    const spawnImpact = (pos: THREE.Vector3, colorHex: string) => {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.position.copy(pos);
      mesh.lookAt(camera.position);
      scene.add(mesh);
      sparks.push({ mesh, mat, life: 0.18, maxLife: 0.18 });
    };

    spawnOpponentTracerFnRef.current = (origin, dir) => {
      const end = origin.clone().addScaledVector(dir.clone().normalize(), 45);
      spawnTracer(origin, end, '#fb7185');
      soundEngine.playGunshot(false, false);
    };

    // Input state
    const keys = new Set<string>();
    let mouseDown = false;
    let keyFireHeld = false;
    let isDraggingLook = false;
    let lastClientX = 0;
    let lastClientY = 0;
    let hasFreeLookSample = false;
    let skipPostLockMoves = 0;

    const clearStuckInputs = () => {
      keys.clear();
      mouseDown = false;
      keyFireHeld = false;
      isDraggingLook = false;
      hasFreeLookSample = false;
    };

    const triggerReload = () => {
      const profile = combatProfileRef.current;
      const st = gameStateRef.current;
      if (profile.isMelee || profile.magSize <= 0) return;
      if (primaryAmmoRef.current >= profile.magSize || st.reloadingUntil > 0) return;
      st.reloadingUntil = performance.now() + profile.reloadMs;
      setIsReloading(true);
      soundEngine.playReload();
      firearmAnimatorRef.current?.triggerReload(profile.reloadMs);
    };

    const performShoot = () => {
      if (phaseRef.current !== 'playing') return;
      const st = gameStateRef.current;
      const now = performance.now();
      const profile = combatProfileRef.current;

      if (st.reloadingUntil > 0) return;
      if (now - st.lastShotAt < profile.fireRateMs) return;

      if (!profile.isMelee && primaryAmmoRef.current <= 0) {
        triggerReload();
        return;
      }

      st.lastShotAt = now;
      if (!profile.isMelee) {
        primaryAmmoRef.current -= 1;
        setAmmo(primaryAmmoRef.current);
        st.muzzleFlashTimer = 0.05;
        st.recoilPitch += profile.recoilKick * 0.065;
        st.recoilKick += profile.recoilKick;
        soundEngine.playGunshot(profile.suppressed, profile.isSniper);
      } else {
        st.recoilKick += 0.12;
        const secondary = Math.random() < 0.35;
        knifeAnimatorRef.current?.triggerAttack(secondary);
        soundEngine.playMeleeSlash(secondary, knifeAnimatorRef.current?.knifeType ?? 'couteau');
      }

      // Compute ray with spread
      const spreadNDC = computeShotSpreadNDC({
        profile,
        isAiming: isScopedRef.current,
        isMoving: st.isMoving,
        isAirborne: !st.isGrounded,
      });

      raycaster.setFromCamera(new THREE.Vector2(spreadNDC.rx, spreadNDC.ry), camera);
      raycaster.far = profile.range;

      // Check world occluders first
      const wallHits = raycaster.intersectObjects(arena.occluders, true);
      const maxWallDist = wallHits.length > 0 ? wallHits[0].distance : profile.range;

      let hitTarget = false;
      let hitPart: 'head' | 'body' = 'body';
      let damage = 0;
      let hitPoint = raycaster.ray.origin
        .clone()
        .addScaledVector(raycaster.ray.direction, Math.min(maxWallDist, 45));

      if (opponentModel.root.visible) {
        const oppHits = raycaster.intersectObjects(opponentModel.hitMeshes, false);
        if (oppHits.length > 0 && oppHits[0].distance < maxWallDist) {
          hitTarget = true;
          hitPart = oppHits[0].object.userData.hitPart === 'head' ? 'head' : 'body';
          damage = computePvpDamage(profile, hitPart, oppHits[0].distance);
          hitPoint = oppHits[0].point;

          st.oppHitFlash = 1;
          st.oppHp = Math.max(0, st.oppHp - damage);
          setOpponentHp(st.oppHp);
          setHitmarker({ key: Date.now(), headshot: hitPart === 'head', dmg: damage });
          soundEngine.playHitmarker(hitPart === 'head');
          spawnImpact(hitPoint, hitPart === 'head' ? '#fbbf24' : '#f43f5e');
        } else if (wallHits.length > 0) {
          spawnImpact(wallHits[0].point, '#38bdf8');
        }
      }

      if (!profile.isMelee) {
        const muzzleWorld = new THREE.Vector3();
        muzzleAnchor.getWorldPosition(muzzleWorld);
        spawnTracer(muzzleWorld, hitPoint, '#38bdf8');
      }

      roomRef.current?.sendShoot({
        clientId,
        origin: [raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z],
        dir: [raycaster.ray.direction.x, raycaster.ray.direction.y, raycaster.ray.direction.z],
        hitTarget,
        hitPart,
        damage,
        round: roundRef.current,
      });

      if (!profile.isMelee && primaryAmmoRef.current <= 0) {
        triggerReload();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'playing' && phaseRef.current !== 'countdown') return;
      keys.add(e.code);
      if (e.code === 'KeyR') triggerReload();
      if (e.code === 'Digit1') setActiveSlot(1);
      if (e.code === 'Digit2' && knifeItem) setActiveSlot(2);
      if (e.code === 'Space' && gameStateRef.current.isGrounded && phaseRef.current === 'playing') {
        gameStateRef.current.velY = 6.2;
        gameStateRef.current.isGrounded = false;
      }
      // Trackpad-friendly keyboard fire (F / E) & AWP scope (V)
      if (controlsConfigRef.current.trackpadMode) {
        if ((e.code === 'KeyF' || e.code === 'KeyE') && phaseRef.current === 'playing') {
          keyFireHeld = true;
          performShoot();
        }
        if (e.code === 'KeyV' && combatProfileRef.current.isSniper && phaseRef.current === 'playing') {
          setIsScoped((v) => !v);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
      if (e.code === 'KeyF' || e.code === 'KeyE') {
        keyFireHeld = false;
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (phaseRef.current !== 'playing' && phaseRef.current !== 'countdown') return;
      if (e.target !== renderer.domElement) return;
      if (e.button === 2) {
        if (combatProfileRef.current.isSniper) setIsScoped((v) => !v);
        return;
      }
      if (e.button === 0) {
        mouseDown = true;
        isDraggingLook = true;
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        if (!document.pointerLockElement) {
          safeRequestPointerLock(renderer.domElement);
        }
        performShoot();
      }
    };

    const onMouseUp = () => {
      mouseDown = false;
      isDraggingLook = false;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (phaseRef.current !== 'playing' && phaseRef.current !== 'countdown') return;
      const cfgCtrl = controlsConfigRef.current;
      let dx = 0;
      let dy = 0;
      let isDragFallback = false;

      if (document.pointerLockElement === renderer.domElement) {
        if (skipPostLockMoves > 0) {
          skipPostLockMoves -= 1;
          return;
        }
        dx = e.movementX || 0;
        dy = e.movementY || 0;
      } else if (isDraggingLook) {
        if ((e.buttons & 1) === 0) {
          isDraggingLook = false;
          mouseDown = false;
          return;
        }
        dx = e.clientX - lastClientX;
        dy = e.clientY - lastClientY;
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        isDragFallback = true;
      } else if (cfgCtrl.trackpadMode && e.target === renderer.domElement) {
        // Trackpad free-aim: glide finger on trackpad without needing to hold click
        if (!hasFreeLookSample) {
          lastClientX = e.clientX;
          lastClientY = e.clientY;
          hasFreeLookSample = true;
          return;
        }
        dx = e.clientX - lastClientX;
        dy = e.clientY - lastClientY;
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        isDragFallback = true;
      } else {
        hasFreeLookSample = false;
        return;
      }

      if (cfgCtrl.trackpadMode && Math.hypot(dx, dy) < 1.5) {
        dx *= 0.72;
        dy *= 0.72;
      }

      const st = gameStateRef.current;
      const sensMult = computeEffectiveSensitivityMultiplier(
        cfgCtrl.sensitivity,
        cfgCtrl.trackpadMode
      );
      const baseSens = isDragFallback
        ? FPS_MOUSE_SENSITIVITY * 1.15 * sensMult
        : FPS_MOUSE_SENSITIVITY * sensMult;

      const next = applyFpsMouseDelta(
        st.yaw,
        st.pitch,
        dx,
        dy,
        camera.fov,
        baseSens,
        isDragFallback ? 350 : undefined
      );
      if (!next.ignoredSpike) {
        st.yaw = next.yaw;
        st.pitch = next.pitch;
      }
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      setIsLocked(locked);
      if (locked) {
        skipPostLockMoves = 2;
      }
      hasFreeLookSample = false;
    };

    const onVisibilityChange = () => {
      if (document.hidden) clearStuckInputs();
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    const onResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 320);
      const h = Math.max(container.clientHeight, 240);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', clearStuckInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);

    let lastTime = performance.now();

    const tick = (now: number) => {
      if (cancelled) return;
      rafId = requestAnimationFrame(tick);

      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const st = gameStateRef.current;
      const curPhase = phaseRef.current;

      // Reload completion
      if (st.reloadingUntil > 0 && now >= st.reloadingUntil) {
        st.reloadingUntil = 0;
        primaryAmmoRef.current = combatProfileRef.current.magSize;
        setAmmo(primaryAmmoRef.current);
        setIsReloading(false);
      }

      // Auto-fire for automatic weapons
      if ((mouseDown || keyFireHeld) && curPhase === 'playing' && combatProfileRef.current.automatic) {
        performShoot();
      }

      // Movement (locked during menu/countdown)
      st.isCrouching = keys.has('ControlLeft') || keys.has('KeyC');
      let moveX = 0;
      let moveZ = 0;
      if (curPhase === 'playing') {
        const fwdX = -Math.sin(st.yaw);
        const fwdZ = -Math.cos(st.yaw);
        const rightX = Math.cos(st.yaw);
        const rightZ = -Math.sin(st.yaw);

        if (keys.has('KeyW') || keys.has('KeyZ') || keys.has('ArrowUp')) {
          moveX += fwdX;
          moveZ += fwdZ;
        }
        if (keys.has('KeyS') || keys.has('ArrowDown')) {
          moveX -= fwdX;
          moveZ -= fwdZ;
        }
        if (keys.has('KeyA') || keys.has('KeyQ') || keys.has('ArrowLeft')) {
          moveX -= rightX;
          moveZ -= rightZ;
        }
        if (keys.has('KeyD') || keys.has('ArrowRight')) {
          moveX += rightX;
          moveZ += rightZ;
        }
      }

      const len = Math.hypot(moveX, moveZ);
      st.isMoving = len > 0.01;
      if (st.isMoving) {
        const speed = st.isCrouching ? 3.8 : keys.has('ShiftLeft') ? 4.4 : 6.6;
        const nx = st.posX + (moveX / len) * speed * dt;
        const nz = st.posZ + (moveZ / len) * speed * dt;
        const resolved = resolveArenaCircleCollision(nx, nz, 0.45, arena.colliders, ARENA_LIMIT);
        st.posX = resolved.x;
        st.posZ = resolved.z;
      }

      // Gravity & jump
      if (!st.isGrounded || st.posY > 0) {
        st.velY -= 18.0 * dt;
        st.posY += st.velY * dt;
        if (st.posY <= 0) {
          st.posY = 0;
          st.velY = 0;
          st.isGrounded = true;
        }
      }

      // Camera transform
      if (curPhase === 'menu' || curPhase === 'searching' || curPhase === 'waiting_room') {
        const orbitT = now * 0.00018;
        camera.position.set(Math.cos(orbitT) * 16, 7.5, Math.sin(orbitT) * 16);
        camera.lookAt(0, 1.2, 0);
        viewModelRig.visible = false;
        opponentModel.root.visible = false;
      } else {
        viewModelRig.visible = !isScopedRef.current;
        opponentModel.root.visible = true;
        const eyeHeight = (st.isCrouching ? 1.15 : 1.62) + st.posY;
        camera.position.set(st.posX, eyeHeight, st.posZ);
        camera.rotation.set(
          THREE.MathUtils.clamp(st.pitch + st.recoilPitch, -FPS_PITCH_LIMIT, FPS_PITCH_LIMIT),
          st.yaw,
          0
        );
        camera.fov = THREE.MathUtils.lerp(camera.fov, isScopedRef.current ? 22 : 62, 0.25);
        camera.updateProjectionMatrix();
      }

      st.recoilPitch *= Math.pow(0.01, dt);
      st.recoilKick *= Math.pow(0.015, dt);

      // Muzzle flash
      if (st.muzzleFlashTimer > 0) {
        st.muzzleFlashTimer -= dt;
        muzzleFlashGroup.visible = true;
      } else {
        muzzleFlashGroup.visible = false;
      }

      // Viewmodel animation
      const cfg = getFPSWeaponViewConfig(
        resolveWeaponArchetype(equippedRef.current.weaponClass, equippedRef.current.weaponName)
      );
      if (firearmAnimatorRef.current && firearmRestRef.current) {
        applyFirearmAnimPose(
          viewModelRig,
          weaponMount,
          fpsHands,
          firearmRestRef.current,
          cfg.rigPosHip,
          cfg.rigRotBase,
          firearmAnimatorRef.current.update(dt, now)
        );
      } else if (knifeAnimatorRef.current && knifeRestRef.current) {
        applyKnifeAnimPose(
          viewModelRig,
          weaponMount,
          fpsHands,
          knifeRestRef.current,
          cfg.rigPosHip,
          cfg.rigRotBase,
          knifeAnimatorRef.current.update(dt, now)
        );
      }

      // Interpolate remote opponent
      if (opponentModel.root.visible) {
        const lerpAlpha = 1 - Math.exp(-16 * dt);
        st.oppX = THREE.MathUtils.lerp(st.oppX, st.oppTargetX, lerpAlpha);
        st.oppZ = THREE.MathUtils.lerp(st.oppZ, st.oppTargetZ, lerpAlpha);
        st.oppYaw = THREE.MathUtils.lerp(st.oppYaw, st.oppTargetYaw, lerpAlpha);
        st.oppPitch = THREE.MathUtils.lerp(st.oppPitch, st.oppTargetPitch, lerpAlpha);
        st.oppHitFlash = Math.max(0, st.oppHitFlash - dt * 5);

        opponentModel.root.position.set(st.oppX, 0, st.oppZ);
        opponentModel.root.rotation.y = st.oppYaw;
        opponentModel.animate(st.oppIsMoving, st.oppPitch, dt, st.oppHitFlash);
      }

      // Send local state over Supabase Realtime (~25Hz)
      if ((curPhase === 'playing' || curPhase === 'countdown') && now - st.lastNetSendAt >= 40) {
        st.lastNetSendAt = now;
        roomRef.current?.sendState({
          clientId,
          x: st.posX,
          y: st.posY,
          z: st.posZ,
          yaw: st.yaw,
          pitch: st.pitch,
          isMoving: st.isMoving,
          isMelee: combatProfileRef.current.isMelee,
        });
      }

      // Update tracers & sparks
      for (let i = tracers.length - 1; i >= 0; i--) {
        const tr = tracers[i];
        tr.life -= dt;
        if (tr.life <= 0) {
          scene.remove(tr.mesh);
          tr.mat.dispose();
          tracers.splice(i, 1);
        } else {
          tr.mat.opacity = (tr.life / tr.maxLife) * 0.9;
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i];
        sp.life -= dt;
        if (sp.life <= 0) {
          scene.remove(sp.mesh);
          sp.mat.dispose();
          sparks.splice(i, 1);
        } else {
          sp.mat.opacity = sp.life / sp.maxLife;
        }
      }

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', clearStuckInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock?.();
      }
      for (const c of weaponCache.values()) c.model.dispose();
      opponentModel.dispose();
      fpsHands.dispose();
      arena.dispose();
      studioEnv.dispose();
      tracerGeo.dispose();
      sparkGeo.dispose();
      muzzleFlashGeo.dispose();
      muzzleFlashMat.dispose();
      muzzleFlashTex.dispose();
      renderer.dispose();
    };
  }, [clientId, knifeItem]);

  const activeRarity = RARITIES[equippedItem.rarity];

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#060911] text-white select-none">
      {/* 3D Arena Canvas */}
      <div ref={stageRef} className="absolute inset-0 h-full w-full" />

      {webglError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/90 text-sm text-slate-300">
          {webglError}
        </div>
      )}

      {/* Damage Vignette */}
      {damageFlash && (
        <div className="pointer-events-none absolute inset-0 border-[12px] border-rose-500/55 bg-rose-600/15" />
      )}

      {/* AWP Scope Overlay */}
      {isScoped && phase === 'playing' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-[72vmin] w-[72vmin] rounded-full border-2 border-cyan-300/60 shadow-[0_0_0_9999px_rgba(3,7,18,0.86)]">
            <div className="relative h-full w-full">
              <div className="absolute inset-x-0 top-1/2 h-px bg-cyan-300/50" />
              <div className="absolute inset-y-0 left-1/2 w-px bg-cyan-300/50" />
            </div>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <div className="relative z-20 flex items-center justify-between gap-4 border-b border-white/10 bg-slate-950/65 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (document.pointerLockElement) document.exitPointerLock?.();
              onExit(earnedCredits);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour Casino
          </button>
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-cyan-400" />
            <span className="font-display text-sm font-bold tracking-wide text-white">
              ARÈNE 1V1 EN LIGNE
            </span>
          </div>
          {roomCode && (
            <span className="rounded-lg border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-0.5 font-mono text-xs font-bold text-cyan-300">
              Salon : {roomCode}
            </span>
          )}
        </div>

        {/* Live Match Scoreboard */}
        {(phase === 'countdown' || phase === 'playing' || phase === 'round_over' || phase === 'match_over') && (
          <div className="flex items-center gap-4 rounded-xl border border-white/15 bg-slate-900/90 px-4 py-1.5">
            <div className="text-right">
              <div className="text-[11px] font-bold text-emerald-300">{localProfile.name}</div>
              <div className="text-[10px] text-slate-400">{equippedItem.weaponName}</div>
            </div>
            <div className="flex items-center gap-2 font-mono text-lg font-black">
              <span className="text-emerald-400">{myScore}</span>
              <span className="text-slate-500">:</span>
              <span className="text-rose-400">{opponentScore}</span>
            </div>
            <div className="text-left">
              <div className="text-[11px] font-bold text-rose-300">
                {opponentProfile?.name || 'Adversaire'}
              </div>
              <div className="text-[10px] text-slate-400">
                {opponentProfile?.weaponName || 'En attente...'}
              </div>
            </div>
            <span className="ml-2 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-300">
              Manche {round}
            </span>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
            Solde : {formatCredits(balance + earnedCredits)}
          </div>
        </div>
      </div>

      {/* Center Crosshair & Hitmarker */}
      {phase === 'playing' && !isScoped && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <PvpCrosshair config={controlsConfig.crosshair} />
            {hitmarker && (
              <motion.div
                key={hitmarker.key}
                initial={{ scale: 1.4, opacity: 1 }}
                animate={{ scale: 1, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={`absolute -top-7 font-mono text-xs font-black ${
                  hitmarker.headshot ? 'text-amber-300' : 'text-white'
                }`}
              >
                {hitmarker.headshot ? `HEADSHOT -${hitmarker.dmg}` : `-${hitmarker.dmg}`}
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Countdown Banner */}
      <AnimatePresence>
        {phase === 'countdown' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center"
          >
            <div className="rounded-3xl border border-cyan-400/40 bg-slate-950/80 px-10 py-6 text-center backdrop-blur-xl">
              <div className="text-xs font-bold uppercase tracking-widest text-cyan-300">
                Manche {round} • Premier à {PVP_ROUNDS_TO_WIN}
              </div>
              <div className="mt-2 font-mono text-6xl font-black text-white">
                {countdown > 0 ? countdown : 'GO !'}
              </div>
              <div className="mt-2 text-xs text-slate-300">
                Cliquez dans l’arène pour verrouiller la visée FPS
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Round Over Banner */}
      {phase === 'round_over' && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="rounded-3xl border border-white/20 bg-slate-950/85 px-10 py-6 text-center backdrop-blur-xl">
            <div
              className={`font-display text-3xl font-black uppercase ${
                roundWinnerSide === 'me' ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {roundWinnerSide === 'me' ? 'Manche gagnée !' : 'Manche perdue'}
            </div>
            {roundWinnerSide === 'me' && (
              <div className="mt-1 text-sm font-bold text-amber-300">
                +{PVP_ROUND_WIN_REWARD} CR
              </div>
            )}
            <div className="mt-2 text-xs text-slate-400">Prochaine manche imminente...</div>
          </div>
        </div>
      )}

      {/* In-Game Bottom HUD */}
      {(phase === 'playing' || phase === 'countdown') && (
        <div className="pointer-events-none relative z-20 mt-auto flex items-end justify-between p-5">
          {/* HP Bars */}
          <div className="flex flex-col gap-2 rounded-2xl border border-white/15 bg-slate-950/75 p-3.5 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <Shield className="h-4 w-4 text-emerald-400" />
              <span className="w-16 text-xs font-bold text-emerald-300">VOUS</span>
              <div className="h-2.5 w-36 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-emerald-400 transition-all duration-150"
                  style={{ width: `${(myHp / PVP_MAX_HP) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-xs font-bold">{myHp}</span>
            </div>
            <div className="flex items-center gap-3">
              <Swords className="h-4 w-4 text-rose-400" />
              <span className="w-16 truncate text-xs font-bold text-rose-300">
                {opponentProfile?.name || 'ENNEMI'}
              </span>
              <div className="h-2.5 w-36 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-rose-500 transition-all duration-150"
                  style={{ width: `${(opponentHp / PVP_MAX_HP) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right font-mono text-xs font-bold">{opponentHp}</span>
            </div>
            {(!isLocked || controlsConfig.trackpadMode) && (
              <div className="mt-1 text-[10px] text-cyan-300/85">
                {controlsConfig.trackpadMode
                  ? 'Mode Trackpad : Glisser pour viser • [F] / [E] Tirer • [V] Viser (AWP) • [R] Recharger'
                  : 'Cliquez sur l’écran pour viser • ZQSD/WASD • R Recharger • 1/2 Armes'}
              </div>
            )}
          </div>

          {/* Equipped Crate Weapon HUD */}
          <div
            className="flex items-center gap-4 rounded-2xl border bg-slate-950/80 px-4 py-3 backdrop-blur-md"
            style={{ borderColor: activeRarity.borderColor }}
          >
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: activeRarity.color }}>
                {activeRarity.label} • {equippedItem.crateName}
              </div>
              <div className="font-display text-sm font-bold text-white">{equippedItem.name}</div>
              <div className="text-[11px] text-slate-400">
                [1] {primaryItem.weaponName} {knifeItem ? `• [2] ${knifeItem.weaponName}` : ''}
              </div>
            </div>
            <div className="text-right font-mono">
              {combatProfile.isMelee ? (
                <span className="text-lg font-black text-cyan-300">MÊLÉE</span>
              ) : isReloading ? (
                <span className="flex items-center gap-1 text-sm font-bold text-amber-300">
                  <RotateCw className="h-4 w-4 animate-spin" /> RECHARGE
                </span>
              ) : (
                <div>
                  <span className="text-2xl font-black text-white">{ammo}</span>
                  <span className="text-xs text-slate-400"> / {combatProfile.magSize}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lobby / Matchmaking / Waiting / Match Over Overlays */}
      {(phase === 'menu' ||
        phase === 'searching' ||
        phase === 'waiting_room' ||
        phase === 'match_over' ||
        phase === 'opponent_left') && (
        <div className="relative z-30 flex flex-1 items-center justify-center overflow-y-auto p-4">
          <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-3xl border border-white/15 bg-slate-950/88 p-5 shadow-2xl backdrop-blur-2xl sm:p-7">
            {phase === 'menu' && (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/35 bg-cyan-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                      <Wifi className="h-3.5 w-3.5" /> Multijoueur en ligne • Arène Zombie
                    </div>
                    <h2 className="mt-2 font-display text-2xl font-black text-white sm:text-3xl">
                      Duel 1V1 avec vos armes de caisses
                    </h2>
                    <p className="mt-1 text-xs text-slate-300">
                      Premier à {PVP_ROUNDS_TO_WIN} manches • +{PVP_ROUND_WIN_REWARD} CR / manche • +{PVP_MATCH_WIN_REWARD} CR victoire
                    </p>
                  </div>
                </div>

                {/* Pseudo + Loadout selection */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Pseudo en arène
                    </label>
                    <input
                      type="text"
                      value={pseudo}
                      maxLength={18}
                      onChange={(e) => setPseudo(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Arme principale (Caisses)
                    </label>
                    <select
                      value={primaryItem.instanceId}
                      onChange={(e) => setSelectedPrimaryId(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white focus:border-cyan-400 focus:outline-none"
                    >
                      {crateFirearms.length === 0 ? (
                        <option value={fallbackWeapon.instanceId}>
                          {fallbackWeapon.name} (Arme de secours)
                        </option>
                      ) : (
                        crateFirearms.map((item) => (
                          <option key={item.instanceId} value={item.instanceId}>
                            {item.weaponName} — {item.name} ({RARITIES[item.rarity].label})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {crateKnives.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Couteau (Slot 2)
                    </label>
                    <select
                      value={selectedKnifeId || ''}
                      onChange={(e) => setSelectedKnifeId(e.target.value || null)}
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white focus:border-cyan-400 focus:outline-none"
                    >
                      {crateKnives.map((k) => (
                        <option key={k.instanceId} value={k.instanceId}>
                          {k.weaponName} — {k.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Sensibilité, Mode Trackpad & Personnalisation Crosshair */}
                <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/65 p-4 sm:grid-cols-2">
                  {/* Left: Sensitivity & Laptop Trackpad */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Sensibilité & Contrôles
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-300">
                        <span>Sensibilité (base Zombie)</span>
                        <span className="font-mono font-bold text-cyan-300">
                          {controlsConfig.sensitivity.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.25}
                        max={2.0}
                        step={0.05}
                        value={controlsConfig.sensitivity}
                        onChange={(e) =>
                          updateControlsConfig((prev) => ({
                            ...prev,
                            sensitivity: parseFloat(e.target.value),
                          }))
                        }
                        aria-label="Sensibilité 1V1"
                        className="w-full accent-cyan-400"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        updateControlsConfig((prev) => ({
                          ...prev,
                          trackpadMode: !prev.trackpadMode,
                        }))
                      }
                      aria-pressed={controlsConfig.trackpadMode}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
                        controlsConfig.trackpadMode
                          ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                          : 'border-white/10 bg-slate-950/60 text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Laptop className="h-4 w-4 shrink-0 text-emerald-400" />
                        <div>
                          <div className="text-xs font-bold">Mode Trackpad PC Portable</div>
                          <div className="text-[10px] text-slate-400">
                            Visée libre sans clic, [F]/[E] pour tirer, [V] scope
                          </div>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                          controlsConfig.trackpadMode
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {controlsConfig.trackpadMode ? 'ACTIF' : 'OFF'}
                      </span>
                    </button>
                  </div>

                  {/* Right: Crosshair Customizer */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                        Crosshair
                      </span>
                      <div className="flex h-10 w-16 items-center justify-center rounded-lg border border-white/15 bg-[#0a1220]">
                        <PvpCrosshair config={controlsConfig.crosshair} />
                      </div>
                    </div>

                    {/* Style */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          { id: 'cross', label: 'Croix' },
                          { id: 'dot', label: 'Point' },
                          { id: 'cross-dot', label: 'Croix+Pt' },
                          { id: 'circle', label: 'Cercle' },
                        ] as { id: CrosshairStyle; label: string }[]
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            updateControlsConfig((prev) => ({
                              ...prev,
                              crosshair: { ...prev.crosshair, style: opt.id },
                            }))
                          }
                          className={`rounded-lg border px-1.5 py-1 text-[10px] font-bold transition ${
                            controlsConfig.crosshair.style === opt.id
                              ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                              : 'border-white/10 bg-slate-950/60 text-slate-400 hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Colors */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-400">Couleur :</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {CROSSHAIR_COLOR_PRESETS.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            title={c.label}
                            aria-label={`Couleur crosshair ${c.label}`}
                            onClick={() =>
                              updateControlsConfig((prev) => ({
                                ...prev,
                                crosshair: { ...prev.crosshair, color: c.hex },
                              }))
                            }
                            className={`h-5 w-5 rounded-full border transition ${
                              controlsConfig.crosshair.color === c.hex
                                ? 'scale-110 border-white ring-2 ring-cyan-400/70'
                                : 'border-white/25 opacity-80 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Size, Thickness, Gap */}
                    <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-400">
                      <label className="block">
                        Taille ({controlsConfig.crosshair.size})
                        <input
                          type="range"
                          min={3}
                          max={16}
                          value={controlsConfig.crosshair.size}
                          onChange={(e) =>
                            updateControlsConfig((prev) => ({
                              ...prev,
                              crosshair: { ...prev.crosshair, size: Number(e.target.value) },
                            }))
                          }
                          className="w-full accent-cyan-400"
                        />
                      </label>
                      <label className="block">
                        Épaisseur ({controlsConfig.crosshair.thickness})
                        <input
                          type="range"
                          min={1}
                          max={4}
                          value={controlsConfig.crosshair.thickness}
                          onChange={(e) =>
                            updateControlsConfig((prev) => ({
                              ...prev,
                              crosshair: { ...prev.crosshair, thickness: Number(e.target.value) },
                            }))
                          }
                          className="w-full accent-cyan-400"
                        />
                      </label>
                      <label className="block">
                        Écart ({controlsConfig.crosshair.gap})
                        <input
                          type="range"
                          min={0}
                          max={10}
                          value={controlsConfig.crosshair.gap}
                          onChange={(e) =>
                            updateControlsConfig((prev) => ({
                              ...prev,
                              crosshair: { ...prev.crosshair, gap: Number(e.target.value) },
                            }))
                          }
                          className="w-full accent-cyan-400"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Play Modes */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleStartQuickMatch}
                    className="flex items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-cyan-500/25 transition hover:brightness-110 active:scale-[0.98]"
                  >
                    <Globe className="h-5 w-5" />
                    Matchmaking Rapide
                  </button>

                  <button
                    type="button"
                    onClick={handleCreatePrivateRoom}
                    className="flex items-center justify-center gap-2.5 rounded-2xl border border-white/20 bg-white/10 px-5 py-4 text-sm font-black uppercase tracking-wider text-white transition hover:bg-white/15 active:scale-[0.98]"
                  >
                    <KeyRound className="h-5 w-5 text-amber-300" />
                    Créer un salon privé
                  </button>
                </div>

                {/* Join Private Room by Code */}
                <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/70 p-2.5">
                  <input
                    type="text"
                    placeholder="Entrer un code de salon (ex: K7P9M)..."
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    className="flex-1 bg-transparent px-2 text-sm font-mono font-bold uppercase text-white placeholder:font-sans placeholder:normal-case placeholder:text-slate-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleJoinPrivateRoom}
                    disabled={normalizePvpRoomCode(joinCodeInput).length < 3}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-black uppercase text-slate-950 transition hover:bg-amber-300 disabled:opacity-40"
                  >
                    <Play className="h-3.5 w-3.5" /> Rejoindre
                  </button>
                </div>
              </div>
            )}

            {phase === 'searching' && (
              <div className="py-8 text-center">
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-cyan-400" />
                <h3 className="mt-4 font-display text-xl font-bold text-white">
                  Recherche d’un adversaire en ligne...
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Joueurs actuellement en file : <strong className="text-cyan-300">{lobbyWaitingCount}</strong>
                </p>
                <button
                  type="button"
                  onClick={handleCancelSearchOrRoom}
                  className="mt-6 rounded-xl border border-white/20 px-5 py-2 text-xs font-bold text-slate-300 hover:bg-white/10"
                >
                  Annuler
                </button>
              </div>
            )}

            {phase === 'waiting_room' && (
              <div className="py-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/35 bg-amber-500/15 text-amber-300">
                  <KeyRound className="h-7 w-7" />
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-white">
                  En attente de l’adversaire...
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  Partagez ce code à votre ami pour lancer le 1V1 dans l’arène Zombie :
                </p>
                <div className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-cyan-400/40 bg-slate-900 px-6 py-3">
                  <span className="font-mono text-2xl font-black tracking-widest text-cyan-300">
                    {roomCode}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="rounded-lg bg-white/10 p-2 text-slate-200 hover:bg-white/20"
                    title="Copier le code"
                  >
                    {copiedCode ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={handleCancelSearchOrRoom}
                    className="rounded-xl border border-white/20 px-5 py-2 text-xs font-bold text-slate-300 hover:bg-white/10"
                  >
                    Quitter le salon
                  </button>
                </div>
              </div>
            )}

            {phase === 'match_over' && (
              <div className="py-4 text-center">
                <Trophy
                  className={`mx-auto h-14 w-14 ${
                    myScore >= PVP_ROUNDS_TO_WIN ? 'text-amber-400' : 'text-slate-500'
                  }`}
                />
                <h3 className="mt-3 font-display text-3xl font-black uppercase text-white">
                  {myScore >= PVP_ROUNDS_TO_WIN ? 'Victoire 1V1 !' : 'Défaite'}
                </h3>
                <div className="mt-2 font-mono text-2xl font-black">
                  <span className="text-emerald-400">{myScore}</span>
                  <span className="mx-2 text-slate-500">-</span>
                  <span className="text-rose-400">{opponentScore}</span>
                </div>
                <div className="mt-2 text-sm font-bold text-amber-300">
                  Crédits gagnés : +{formatCredits(earnedCredits)}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={rematchVoted}
                    onClick={() => {
                      setRematchVoted(true);
                      roomRef.current?.sendRoundControl({
                        clientId,
                        action: 'rematch_vote',
                        round: roundRef.current,
                      });
                    }}
                    className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-black uppercase text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
                  >
                    <UserCheck className="h-4 w-4" />
                    {rematchVoted
                      ? opponentRematchVoted
                        ? 'Lancement...'
                        : 'En attente de l’adversaire...'
                      : 'Revanche'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelSearchOrRoom}
                    className="rounded-xl border border-white/20 px-5 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/10"
                  >
                    Menu 1V1
                  </button>
                  <button
                    type="button"
                    onClick={() => onGoToShop(earnedCredits)}
                    className="rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-black uppercase text-slate-950 hover:bg-emerald-400"
                  >
                    Boutique Caisses
                  </button>
                </div>
              </div>
            )}

            {phase === 'opponent_left' && (
              <div className="py-6 text-center">
                <WifiOff className="mx-auto h-12 w-12 text-rose-400" />
                <h3 className="mt-3 font-display text-xl font-bold text-white">
                  L’adversaire a quitté le salon
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  Crédits conservés : +{formatCredits(earnedCredits)}
                </p>
                <div className="mt-6 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleCancelSearchOrRoom}
                    className="rounded-xl bg-cyan-500 px-5 py-2.5 text-xs font-black uppercase text-slate-950"
                  >
                    Retour au menu 1V1
                  </button>
                  <button
                    type="button"
                    onClick={() => onExit(earnedCredits)}
                    className="rounded-xl border border-white/20 px-5 py-2.5 text-xs font-bold text-slate-200"
                  >
                    Retour Casino
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
