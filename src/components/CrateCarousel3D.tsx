import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { CrateDefinition } from '../types/casino';
import { formatCredits } from '../utils/rng';

interface CrateCarousel3DProps {
  crates: CrateDefinition[];
  onSelect: (crate: CrateDefinition) => void;
}

/**
 * Anneau 3D des caisses du site. Tourne seul, se fait glisser à la souris
 * ou au doigt ; la caisse de face est mise en lumière.
 */
export const CrateCarousel3D: React.FC<CrateCarousel3DProps> = ({ crates, onSelect }) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reduceMotion = useReducedMotion();
  const state = useRef({ angle: 0, velocity: 0, dragging: false, lastX: 0, moved: 0, hover: false });

  const n = crates.length;
  const step = 360 / n;

  useEffect(() => {
    const ring = ringRef.current;
    const stage = stageRef.current;
    if (!ring || !stage) return;
    let raf = 0;
    let last = performance.now();

    const radiusFor = () => {
      const cardW = stage.clientWidth < 640 ? 200 : 260;
      return Math.round(cardW / 2 / Math.tan(Math.PI / n)) + (stage.clientWidth < 640 ? 30 : 70);
    };
    let radius = radiusFor();
    const onResize = () => {
      radius = radiusFor();
    };
    window.addEventListener('resize', onResize);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = state.current;
      if (!s.dragging) {
        const auto = reduceMotion || s.hover ? 0 : -9;
        s.velocity += (auto - s.velocity) * Math.min(1, dt * 2.2);
        s.angle += s.velocity * dt;
      }
      ring.style.transform = `translateZ(${-radius}px) rotateY(${s.angle}deg)`;
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        el.style.transform = `rotateY(${i * step}deg) translateZ(${radius}px)`;
        // angle relatif à la caméra (-180..180)
        let rel = ((i * step + s.angle) % 360 + 540) % 360 - 180;
        const facing = Math.cos((rel * Math.PI) / 180); // 1 = de face
        const k = (facing + 1) / 2;
        el.style.opacity = String(0.25 + k * 0.75);
        el.style.filter = `brightness(${0.45 + k * 0.65}) saturate(${0.6 + k * 0.5})`;
        el.style.zIndex = String(Math.round(k * 100));
        el.dataset.front = Math.abs(rel) < step / 2 ? '1' : '0';
      });
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [n, step, reduceMotion]);

  const onPointerDown = (e: React.PointerEvent) => {
    const s = state.current;
    s.dragging = true;
    s.lastX = e.clientX;
    s.moved = 0;
    s.velocity = 0;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = state.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.lastX;
    s.lastX = e.clientX;
    s.moved += Math.abs(dx);
    s.angle += dx * 0.28;
    s.velocity = dx * 14;
  };
  const endDrag = () => {
    state.current.dragging = false;
  };

  const rotateBy = (dir: 1 | -1) => {
    const s = state.current;
    s.velocity = 0;
    const target = Math.round(s.angle / step) * step + dir * step;
    const start = s.angle;
    const t0 = performance.now();
    const anim = (now: number) => {
      const p = Math.min(1, (now - t0) / 520);
      const e = 1 - Math.pow(1 - p, 3);
      s.angle = start + (target - start) * e;
      if (p < 1) requestAnimationFrame(anim);
    };
    s.dragging = true;
    requestAnimationFrame(anim);
    setTimeout(() => (s.dragging = false), 540);
  };

  return (
    <div className="relative">
      <div
        ref={stageRef}
        className="relative mx-auto h-[360px] w-full cursor-grab touch-pan-y select-none active:cursor-grabbing sm:h-[440px]"
        style={{ perspective: '1400px', perspectiveOrigin: '50% 35%' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          endDrag();
          state.current.hover = false;
        }}
        onPointerEnter={() => (state.current.hover = true)}
      >
        {/* Sol réfléchissant */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[78%] h-40 w-[80%] -translate-x-1/2 rounded-[50%] blur-2xl"
          style={{
            background: 'radial-gradient(ellipse, color-mix(in srgb, var(--accent-400) 28%, transparent), transparent 70%)',
          }}
        />
        <div
          ref={ringRef}
          className="absolute left-1/2 top-1/2 h-0 w-0"
          style={{ transformStyle: 'preserve-3d' }}
        >
          {crates.map((crate, i) => (
            <div
              key={crate.id}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className="group absolute -left-[100px] -top-[150px] w-[200px] sm:-left-[130px] sm:-top-[175px] sm:w-[260px]"
              style={{ transformStyle: 'preserve-3d', willChange: 'transform, opacity' }}
            >
              <button
                type="button"
                onClick={() => {
                  if (state.current.moved > 8) return;
                  onSelect(crate);
                }}
                aria-label={`Ouvrir la caisse ${crate.name}`}
                className="block w-full overflow-hidden rounded-2xl border bg-surface-card text-left transition-transform duration-300 hover:-translate-y-2"
                style={{
                  borderColor: `${crate.accentColor}55`,
                  boxShadow: `0 30px 60px -25px ${crate.accentColor}77, 0 0 0 1px rgba(255,255,255,0.04) inset`,
                }}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[#05070d]">
                  {crate.image && (
                    <img
                      src={crate.image}
                      alt={crate.name}
                      draggable={false}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <span
                    className="absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: `${crate.accentColor}26`, color: crate.accentColor, border: `1px solid ${crate.accentColor}55` }}
                  >
                    {crate.themeTag}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-bold text-accent-50">{crate.name}</div>
                    <div className="truncate text-[11px] text-accent-200/60">{crate.skins.length} skins</div>
                  </div>
                  <span className="shrink-0 font-mono-num text-sm font-bold text-accent-300">
                    {formatCredits(crate.price)}
                  </span>
                </div>
              </button>
              {/* reflet */}
              <div
                aria-hidden
                className="pointer-events-none mt-2 h-16 overflow-hidden rounded-2xl opacity-25"
                style={{
                  transform: 'scaleY(-1)',
                  maskImage: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent 80%)',
                  WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent 80%)',
                }}
              >
                {crate.image && (
                  <img src={crate.image} alt="" draggable={false} className="h-[150px] w-full object-cover object-top sm:h-[195px]" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => rotateBy(1)}
          aria-label="Caisse précédente"
          className="btn-ghost flex h-11 w-11 items-center justify-center rounded-full text-lg"
        >
          ‹
        </button>
        <span className="text-xs font-medium text-accent-200/55">Glisse pour faire tourner</span>
        <button
          type="button"
          onClick={() => rotateBy(-1)}
          aria-label="Caisse suivante"
          className="btn-ghost flex h-11 w-11 items-center justify-center rounded-full text-lg"
        >
          ›
        </button>
      </div>
    </div>
  );
};
