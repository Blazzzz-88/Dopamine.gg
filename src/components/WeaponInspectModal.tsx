import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Box,
  Compass,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RARITIES, WEAPON_CLASS_LABELS } from '../data/rarities';
import { InspectableWeapon } from '../context/WeaponInspectorContext';
import {
  buildWeapon3DModel,
  createStudioEnvironment,
  Weapon3DModel,
} from '../utils/weapon3dBuilder';
import { formatCredits } from '../utils/rng';
import { soundEngine } from '../utils/sound';

interface WeaponInspectModalProps {
  weapon: InspectableWeapon | null;
  onClose: () => void;
}

type CameraPresetId = 'angle34' | 'front' | 'back' | 'top' | 'muzzle';

const CAMERA_PRESETS: Array<{ id: CameraPresetId; label: string }> = [
  { id: 'angle34', label: 'Vue 3/4' },
  { id: 'front', label: 'Profil Avant' },
  { id: 'back', label: 'Profil Arrière' },
  { id: 'top', label: 'Dessus' },
  { id: 'muzzle', label: 'Axe Canon' },
];

export const WeaponInspectModal: React.FC<WeaponInspectModalProps> = ({ weapon, onClose }) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const autoRotateRef = useRef(true);
  const setPresetRef = useRef<((preset: CameraPresetId) => void) | null>(null);

  const [autoRotate, setAutoRotate] = useState(true);
  const [activePreset, setActivePreset] = useState<CameraPresetId>('angle34');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    if (!weapon) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        soundEngine.playClick();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [weapon, onClose]);

  useEffect(() => {
    const container = stageRef.current;
    if (!weapon || !weapon.image || !container) return;

    let cancelled = false;
    let rafId = 0;
    let renderer: THREE.WebGLRenderer | null = null;
    let composer: EffectComposer | null = null;
    let msaaRT: THREE.WebGLRenderTarget | null = null;
    let controls: OrbitControls | null = null;
    let modelHandle: Weapon3DModel | null = null;
    let studioEnv: { texture: THREE.Texture; dispose: () => void } | null = null;
    let ringGeo: THREE.RingGeometry | null = null;
    let ringMat: THREE.MeshBasicMaterial | null = null;
    let ringOuterGeo: THREE.RingGeometry | null = null;
    let ringOuterMat: THREE.MeshBasicMaterial | null = null;
    let particlesGeo: THREE.BufferGeometry | null = null;
    let particlesMat: THREE.PointsMaterial | null = null;
    let resizeObserver: ResizeObserver | null = null;

    setLoading(true);
    setErrorMsg(null);
    setActivePreset('angle34');
    setAutoRotate(true);
    autoRotateRef.current = true;

    try {
      const width = Math.max(container.clientWidth, 320);
      const height = Math.max(container.clientHeight, 320);

      // Guard cleanly against headless DOM environments (like jsdom) with zero stderr noise
      const probeCanvas = document.createElement('canvas');
      const hasWebGL =
        Boolean(probeCanvas.getContext('webgl2')) ||
        Boolean(probeCanvas.getContext('webgl')) ||
        Boolean(probeCanvas.getContext('experimental-webgl'));
      if (!hasWebGL) {
        throw new Error('WebGL unavailable');
      }

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.5);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.98;

      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.cursor = 'grab';

      const scene = new THREE.Scene();

      studioEnv = createStudioEnvironment(renderer);
      scene.environment = studioEnv.texture;

      const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 40);

      // Post-processing HDR composer (4x MSAA + subtle studio specular bloom)
      try {
        scene.background = new THREE.Color('#060a17');
        msaaRT = new THREE.WebGLRenderTarget(
          Math.max(1, Math.round(width * pixelRatio)),
          Math.max(1, Math.round(height * pixelRatio)),
          { type: THREE.HalfFloatType, samples: 4 }
        );
        composer = new EffectComposer(renderer, msaaRT);
        composer.setPixelRatio(pixelRatio);
        composer.setSize(width, height);
        composer.addPass(new RenderPass(scene, camera));
        composer.addPass(
          new UnrealBloomPass(new THREE.Vector2(width, height), 0.08, 0.35, 1.02)
        );
        composer.addPass(new OutputPass());
      } catch {
        composer = null;
        scene.background = null;
      }
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.enablePan = true;
      controls.minDistance = 1.45;
      controls.maxDistance = 8.5;
      controls.minPolarAngle = 0.06;
      controls.maxPolarAngle = Math.PI - 0.06;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 1.35;

      controls.addEventListener('start', () => {
        if (renderer) renderer.domElement.style.cursor = 'grabbing';
        if (autoRotateRef.current) {
          autoRotateRef.current = false;
          setAutoRotate(false);
        }
      });
      controls.addEventListener('end', () => {
        if (renderer) renderer.domElement.style.cursor = 'grab';
      });

      // Three-point showcase lighting + rarity colored rim light
      const rarityColor = new THREE.Color(RARITIES[weapon.rarity].color);
      const ambient = new THREE.AmbientLight('#dce7ff', 0.42);
      scene.add(ambient);

      const keyLight = new THREE.DirectionalLight('#ffffff', 1.15);
      keyLight.position.set(2.8, 3.0, 5.8);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight('#93c5fd', 0.85);
      fillLight.position.set(-4.0, 1.5, 3.0);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(rarityColor, 1.05);
      rimLight.position.set(-1.5, 2.2, -4.5);
      scene.add(rimLight);

      const overheadSheen = new THREE.DirectionalLight('#f8fafc', 0.55);
      overheadSheen.position.set(0.4, 5.2, 0.8);
      scene.add(overheadSheen);

      const modelSize = new THREE.Vector3(4.0, 1.4, 0.4);
      const applyPreset = (preset: CameraPresetId) => {
        if (!controls) return;
        const vFov = (camera.fov * Math.PI) / 180;
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.6, camera.aspect));
        const fitMargin = 1.42;

        let spanW = modelSize.x;
        let spanH = modelSize.y;
        if (preset === 'angle34') {
          spanW = modelSize.x * 0.96 + modelSize.z * 0.45;
          spanH = modelSize.y * 0.95 + modelSize.z * 0.25;
        } else if (preset === 'top') {
          spanW = modelSize.x;
          spanH = Math.max(modelSize.z * 1.35, 1.1);
        } else if (preset === 'muzzle') {
          spanW = Math.max(modelSize.z * 2.4, modelSize.x * 0.52);
          spanH = modelSize.y;
        }

        const distV = (spanH * 0.5 * fitMargin) / Math.tan(vFov / 2);
        const distH = (spanW * 0.5 * fitMargin) / Math.tan(hFov / 2);
        const frontFaceOffset =
          preset === 'top' ? modelSize.y * 0.5 : preset === 'muzzle' ? modelSize.x * 0.45 : 0;
        const dist = clampDist(Math.max(distV, distH, 3.8) + frontFaceOffset, 3.8, 10.5);
        controls.maxDistance = Math.max(11.0, dist * 1.8);
        controls.target.set(0, 0, 0);

        if (preset === 'angle34') {
          camera.position.set(dist * 0.40, dist * 0.22, dist * 0.89);
        } else if (preset === 'front') {
          camera.position.set(0, 0.04, dist);
        } else if (preset === 'back') {
          camera.position.set(0, 0.04, -dist);
        } else if (preset === 'top') {
          camera.position.set(0, dist * 0.98, 0.24);
        } else {
          camera.position.set(-dist * 0.92, dist * 0.14, dist * 0.36);
        }
        controls.update();
      };

      setPresetRef.current = (preset: CameraPresetId) => {
        setActivePreset(preset);
        applyPreset(preset);
      };

      applyPreset('angle34');

      const maxAniso = Math.min(16, renderer.capabilities.getMaxAnisotropy() || 8);
      buildWeapon3DModel(weapon.image, weapon.weaponClass, weapon.weaponName, maxAniso, {
        rarity: weapon.rarity,
      })
        .then((built) => {
          if (cancelled || !renderer) {
            built.dispose();
            return;
          }
          modelHandle = built;
          scene.add(built.group);

          // Fit frustum cleanly around actual bounding box & place holographic pedestal rings
          const box = new THREE.Box3().setFromObject(built.group);
          box.getSize(modelSize);
          const pedY = Math.min(-0.65, box.min.y - 0.38);

          ringGeo = new THREE.RingGeometry(1.55, 1.60, 96);
          ringMat = new THREE.MeshBasicMaterial({
            color: rarityColor,
            transparent: true,
            opacity: 0.36,
            side: THREE.DoubleSide,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = pedY;
          scene.add(ring);

          ringOuterGeo = new THREE.RingGeometry(2.05, 2.075, 96);
          ringOuterMat = new THREE.MeshBasicMaterial({
            color: '#93c5fd',
            transparent: true,
            opacity: 0.20,
            side: THREE.DoubleSide,
          });
          const ringOuter = new THREE.Mesh(ringOuterGeo, ringOuterMat);
          ringOuter.rotation.x = -Math.PI / 2;
          ringOuter.position.y = pedY;
          scene.add(ringOuter);

          // Subtle floating rarity aura dust motes around showcase stage
          const pCount = 48;
          const pPos = new Float32Array(pCount * 3);
          for (let i = 0; i < pCount; i++) {
            const a = (i / pCount) * Math.PI * 2 + (i % 5) * 0.4;
            const rad = 1.15 + ((i * 7) % 13) * 0.11;
            pPos[i * 3] = Math.cos(a) * rad;
            pPos[i * 3 + 1] = pedY + 0.08 + ((i * 11) % 17) * 0.095;
            pPos[i * 3 + 2] = Math.sin(a) * rad * 0.72;
          }
          particlesGeo = new THREE.BufferGeometry();
          particlesGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
          particlesMat = new THREE.PointsMaterial({
            color: rarityColor,
            size: 0.028,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          });
          const particles = new THREE.Points(particlesGeo, particlesMat);
          scene.add(particles);

          applyPreset('angle34');
          setLoading(false);
        })
        .catch((err) => {
          if (!cancelled) {
            setLoading(false);
            setErrorMsg(err instanceof Error ? err.message : 'Rendu 3D indisponible.');
          }
        });

      const handleResize = () => {
        if (!container || !renderer) return;
        const w = Math.max(container.clientWidth, 320);
        const h = Math.max(container.clientHeight, 320);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        composer?.setSize(w, h);
      };

      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);

      const animate = () => {
        if (cancelled || !renderer || !controls) return;
        controls.autoRotate = autoRotateRef.current;
        controls.update();
        if (composer) composer.render();
        else renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      };
      rafId = requestAnimationFrame(animate);
    } catch {
      setLoading(false);
      setErrorMsg('WebGL indisponible dans cet environnement — affichage 2D de secours.');
    }

    return () => {
      cancelled = true;
      setPresetRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      controls?.dispose();
      modelHandle?.dispose();
      ringGeo?.dispose();
      ringMat?.dispose();
      ringOuterGeo?.dispose();
      ringOuterMat?.dispose();
      particlesGeo?.dispose();
      particlesMat?.dispose();
      studioEnv?.dispose();
      composer?.dispose();
      msaaRT?.dispose();
      renderer?.dispose();
      if (container) container.innerHTML = '';
    };
  }, [weapon]);

  if (!weapon) return null;

  const rarity = RARITIES[weapon.rarity];
  const isSecret = weapon.rarity === 'secret';

  return (
    <AnimatePresence>
      <motion.div
        key="weapon-inspect-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => {
          soundEngine.playClick();
          onClose();
        }}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label={`Inspection 3D : ${weapon.weaponName} ${weapon.name}`}
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          onClick={(e) => e.stopPropagation()}
          className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl border bg-surface-card shadow-[0_30px_90px_rgba(0,0,0,0.85)]"
          style={{
            borderColor: rarity.borderColor,
            boxShadow: `0 0 55px ${rarity.glowColor}, 0 30px 90px rgba(0,0,0,0.85)`,
          }}
        >
          {/* Top rarity bar */}
          <div
            className={`h-1.5 w-full ${isSecret ? 'secret-prism-border' : ''}`}
            style={!isSecret ? { backgroundColor: rarity.color } : undefined}
          />

          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-accent-500/15 bg-surface-base/75 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                style={{
                  borderColor: rarity.borderColor,
                  backgroundColor: rarity.badgeBg,
                  color: rarity.color,
                }}
              >
                <Box className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: rarity.badgeBg, color: rarity.color }}
                  >
                    {isSecret && <Sparkles className="h-2.5 w-2.5" />}
                    {rarity.label}
                  </span>
                  <span className="text-xs font-medium text-accent-300/75">
                    {WEAPON_CLASS_LABELS[weapon.weaponClass]}
                  </span>
                  {weapon.wear && (
                    <span className="rounded bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-accent-100/75">
                      {weapon.wear}
                    </span>
                  )}
                </div>
                <h2 className="truncate font-display text-lg font-extrabold text-accent-50 sm:text-xl">
                  {weapon.weaponName} | {weapon.name}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-accent-200/50">
                  {weapon.value !== undefined ? 'Valeur inventaire' : 'Valeur estimée'}
                </div>
                <div className="font-mono-num text-sm font-extrabold text-accent-300 sm:text-base">
                  {formatCredits(weapon.value ?? weapon.baseValue ?? 0)}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onClose();
                }}
                aria-label="Fermer l’inspection 3D"
                className="rounded-xl border border-accent-500/20 bg-surface-panel p-2 text-accent-200/75 transition hover:border-accent-400/50 hover:text-accent-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* 3D Interactive Stage */}
          <div className="relative h-[380px] w-full select-none overflow-hidden bg-[radial-gradient(ellipse_at_center,rgba(30,41,69,0.55)_0%,rgba(6,10,20,0.96)_72%)] sm:h-[460px]">
            {/* Ambient radial glow matching weapon rarity */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-3xl"
              style={{ background: rarity.color }}
            />

            {/* WebGL mount */}
            <div
              ref={stageRef}
              data-testid="weapon-3d-stage"
              className="relative z-10 h-full w-full"
            />

            {/* Loading spinner overlay */}
            {loading && !errorMsg && (
              <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/35 backdrop-blur-xs">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent-400/30 border-t-accent-400" />
                <span className="text-xs font-semibold text-accent-200">
                  Sculpture du modèle 3D haute fidélité...
                </span>
              </div>
            )}

            {/* Graceful fallback if WebGL is unavailable */}
            {errorMsg && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 p-6 text-center">
                {weapon.image && (
                  <img
                    src={weapon.image}
                    alt={`${weapon.weaponName} ${weapon.name}`}
                    className="max-h-56 max-w-full object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,0.8)]"
                  />
                )}
                <p className="max-w-md rounded-xl border border-accent-500/20 bg-surface-base/80 px-4 py-2 text-xs text-accent-200/80">
                  {errorMsg}
                </p>
              </div>
            )}

            {/* Top-left hint badge */}
            <div className="pointer-events-none absolute left-4 top-3 z-20 hidden items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 text-[11px] text-accent-100/75 backdrop-blur-md sm:inline-flex">
              <Compass className="h-3.5 w-3.5 text-accent-400" />
              <span>Glisser : rotation 360° • Molette : zoom • Clic droit : déplacer</span>
            </div>

            {/* Top-right studio palette swatches */}
            <div className="pointer-events-none absolute right-4 top-3 z-20 flex items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-3 py-1.5 backdrop-blur-md">
              {weapon.swatches.map((hex, i) => (
                <span
                  key={i}
                  className="h-2.5 w-4 rounded-full border border-white/20"
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
          </div>

          {/* Bottom Controls Bar */}
          <div className="flex flex-col justify-between gap-3 border-t border-accent-500/15 bg-surface-base/85 px-5 py-3.5 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="line-clamp-1 text-xs text-accent-100/70">{weapon.tagline}</p>
              {weapon.floatVal !== undefined && (
                <div className="mt-0.5 font-mono-num text-[11px] text-accent-300/75">
                  Float : {weapon.floatVal.toFixed(6)}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setPresetRef.current?.(preset.id);
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    activePreset === preset.id
                      ? 'border-accent-400/60 bg-accent-500/20 text-accent-200'
                      : 'border-accent-500/15 bg-surface-panel text-accent-200/70 hover:text-accent-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setAutoRotate((v) => !v);
                }}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  autoRotate
                    ? 'border-accent-400/50 bg-accent-500/20 text-accent-200'
                    : 'border-accent-500/15 bg-surface-panel text-accent-200/70 hover:text-accent-100'
                }`}
              >
                {autoRotate ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                Rotation
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setAutoRotate(true);
                  autoRotateRef.current = true;
                  setPresetRef.current?.('angle34');
                }}
                title="Réinitialiser la caméra"
                className="inline-flex items-center gap-1 rounded-lg border border-accent-500/15 bg-surface-panel px-2.5 py-1.5 text-[11px] font-semibold text-accent-200/75 transition hover:border-accent-400/40 hover:text-accent-50"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

function clampDist(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
