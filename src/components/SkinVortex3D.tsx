import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RarityId } from '../types/casino';
import { RARITIES } from '../data/rarities';

export interface VortexSkin {
  image: string;
  rarity: RarityId;
}

interface SkinVortex3DProps {
  skins: VortexSkin[];
  /** Change à chaque changement de thème pour relire les couleurs CSS */
  themeKey: string;
  className?: string;
}

function readCssColor(name: string, fallback: string): THREE.Color {
  if (typeof window === 'undefined') return new THREE.Color(fallback);
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  try {
    return new THREE.Color(v || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function makeGlowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Scène WebGL : les vrais skins du site tournent en hélice autour d'un noyau
 * lumineux. La caméra suit la souris. Repli CSS si WebGL est indisponible.
 */
export const SkinVortex3D: React.FC<SkinVortex3DProps> = ({ skins, themeKey, className = '' }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const themeUpdaterRef = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || skins.length === 0) return;
    if (typeof window === 'undefined' || typeof window.WebGLRenderingContext === 'undefined') {
      setFailed(true);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch {
      setFailed(true);
      return;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 14, 30);
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 15);

    const disposables: { dispose: () => void }[] = [];
    const glowTex = makeGlowTexture();
    disposables.push(glowTex);

    // ---- Noyau central ----
    const core = new THREE.Group();
    scene.add(core);
    const icoGeo = new THREE.IcosahedronGeometry(1.35, 1);
    const icoMat = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.55 });
    const ico = new THREE.Mesh(icoGeo, icoMat);
    core.add(ico);
    const innerGeo = new THREE.OctahedronGeometry(0.7, 0);
    const innerMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    core.add(inner);
    const coreGlowMat = new THREE.SpriteMaterial({
      map: glowTex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
    });
    const coreGlow = new THREE.Sprite(coreGlowMat);
    coreGlow.scale.set(7, 7, 1);
    core.add(coreGlow);
    disposables.push(icoGeo, icoMat, innerGeo, innerMat, coreGlowMat);

    // Anneaux orbitaux
    const ringMats: THREE.MeshBasicMaterial[] = [];
    const rings: THREE.Mesh[] = [];
    [2.4, 3.1].forEach((r, i) => {
      const g = new THREE.TorusGeometry(r, 0.012, 8, 160);
      const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45 - i * 0.12 });
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.x = Math.PI / 2.4 + i * 0.5;
      mesh.rotation.y = i * 0.6;
      core.add(mesh);
      rings.push(mesh);
      ringMats.push(m);
      disposables.push(g, m);
    });

    // ---- Hélice de skins ----
    const helix = new THREE.Group();
    scene.add(helix);
    const loader = new THREE.TextureLoader();
    const count = skins.length;
    const items: { mesh: THREE.Mesh; glow: THREE.Sprite; baseY: number; phase: number }[] = [];
    skins.forEach((skin, i) => {
      const angle = (i / count) * Math.PI * 2 * 2.1;
      const y = count > 1 ? (i / (count - 1) - 0.5) * 7.2 : 0;
      const radius = 5.2 + Math.sin(i * 1.7) * 0.5;
      const planeGeo = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(planeGeo, mat);
      mesh.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      mesh.lookAt(0, y, 0);
      mesh.rotateY(Math.PI / 2);
      mesh.rotateZ(Math.sin(i) * 0.25);
      helix.add(mesh);

      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color(RARITIES[skin.rarity].color),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.32,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.position.copy(mesh.position);
      glow.scale.set(3.4, 2.2, 1);
      helix.add(glow);

      disposables.push(planeGeo, mat, glowMat);
      items.push({ mesh, glow, baseY: y, phase: i * 0.9 });

      loader.load(skin.image, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const img = tex.image as { width: number; height: number };
        const aspect = img && img.height ? img.width / img.height : 2.5;
        const w = Math.min(3.4, 1.15 * aspect);
        mesh.scale.set(w, w / aspect, 1);
        mat.map = tex;
        mat.needsUpdate = true;
        disposables.push(tex);
      });
    });

    // ---- Particules ----
    const pCount = window.innerWidth < 768 ? 380 : 750;
    const positions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      const r = 2 + Math.random() * 11;
      const a = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.06,
      map: glowTex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
    });
    const points = new THREE.Points(pGeo, pMat);
    scene.add(points);
    disposables.push(pGeo, pMat);

    // ---- Couleurs du thème ----
    const applyTheme = () => {
      const a = readCssColor('--accent-400', '#38bdf8');
      const b = readCssColor('--accent2-300', '#a5b4fc');
      icoMat.color.copy(a);
      innerMat.color.copy(b);
      coreGlowMat.color.copy(a);
      ringMats.forEach((m, i) => m.color.copy(i % 2 ? b : a));
      pMat.color.copy(a.clone().lerp(new THREE.Color('#ffffff'), 0.25));
    };
    applyTheme();
    themeUpdaterRef.current = applyTheme;

    // ---- Interaction ----
    const pointer = { x: 0, y: 0 };
    const onPointerMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Recule la caméra sur les écrans étroits pour garder l'hélice entière
      camera.position.z = w / h < 0.9 ? 21 : w / h < 1.3 ? 17 : 15;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(mount);

    let visible = true;
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
          })
        : null;
    io?.observe(mount);

    // ---- Boucle ----
    const clock = new THREE.Clock();
    let raf = 0;
    let intro = 0;
    const speed = reduceMotion ? 0.04 : 0.16;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible || document.hidden) {
        clock.getDelta();
        return;
      }
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      intro = Math.min(1, intro + dt * 0.6);
      const ease = 1 - Math.pow(1 - intro, 3);

      helix.rotation.y += dt * speed;
      helix.scale.setScalar(0.6 + ease * 0.4);
      points.rotation.y -= dt * speed * 0.35;
      core.rotation.y += dt * 0.5;
      ico.rotation.x += dt * 0.3;
      inner.rotation.y -= dt * 1.2;
      rings[0].rotation.z += dt * 0.4;
      rings[1].rotation.z -= dt * 0.3;
      const pulse = 1 + Math.sin(t * 2) * 0.06;
      coreGlow.scale.set(7 * pulse, 7 * pulse, 1);

      items.forEach((it) => {
        const bob = Math.sin(t * 1.1 + it.phase) * 0.18;
        it.mesh.position.y = it.baseY + bob;
        it.glow.position.y = it.baseY + bob;
        const m = it.mesh.material as THREE.MeshBasicMaterial;
        if (m.map) m.opacity = Math.min(1, m.opacity + dt * 1.4) * ease;
      });

      camera.position.x += (pointer.x * 2.2 - camera.position.x) * 0.04;
      camera.position.y += (-pointer.y * 1.4 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointerMove);
      ro?.disconnect();
      io?.disconnect();
      themeUpdaterRef.current = null;
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [skins]);

  useEffect(() => {
    // laisse le temps au data-theme d'être appliqué avant de relire les variables
    const id = requestAnimationFrame(() => themeUpdaterRef.current?.());
    return () => cancelAnimationFrame(id);
  }, [themeKey]);

  if (failed) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        {skins.slice(0, 5).map((s, i) => (
          <img
            key={s.image}
            src={s.image}
            alt=""
            className="animate-float absolute w-[38%] object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.7)]"
            style={{
              transform: `translate(${(i - 2) * 22}%, ${(i % 2 ? -1 : 1) * 40}%) rotate(${(i - 2) * 6}deg)`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
      </div>
    );
  }

  return <div ref={mountRef} className={className} aria-hidden />;
};
