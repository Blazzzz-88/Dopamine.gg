import React, { useEffect, useRef, useState } from 'react';
import { RARITIES, WEAPON_CLASS_LABELS } from '../data/rarities';
import { SkinDefinition } from '../types/casino';
import { soundEngine } from '../utils/sound';
import { WeaponSilhouette } from './WeaponSilhouette';

const CARD_WIDTH = 152;
const CARD_GAP = 10;
const SLOT_STEP = CARD_WIDTH + CARD_GAP;

interface RouletteReelProps {
  strip: SkinDefinition[];
  winningIndex: number;
  spinId: number;
  isSpinning: boolean;
  durationMs: number;
  jitterOffset: number;
  onSpinComplete?: () => void;
}

export const RouletteReel: React.FC<RouletteReelProps> = ({
  strip,
  winningIndex,
  spinId,
  isSpinning,
  durationMs,
  jitterOffset,
  onSpinComplete,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [landed, setLanded] = useState(false);
  const onCompleteRef = useRef(onSpinComplete);
  onCompleteRef.current = onSpinComplete;

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track || strip.length === 0) return;

    const containerWidth = container.clientWidth || 760;
    const initialX = -(3 * SLOT_STEP + CARD_WIDTH / 2 - containerWidth / 2);

    if (!isSpinning || spinId === 0) {
      setLanded(false);
      track.style.transform = `translate3d(${initialX}px, 0, 0)`;
      return;
    }

    setLanded(false);
    const targetX = -(
      winningIndex * SLOT_STEP +
      CARD_WIDTH / 2 -
      containerWidth / 2 +
      jitterOffset
    );

    let rafId = 0;
    const startTime = performance.now();
    let lastTickSlot = -1;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - progress, 4.2);
      const currentX = initialX + (targetX - initialX) * eased;

      track.style.transform = `translate3d(${currentX}px, 0, 0)`;

      const centerInTrack = -currentX + containerWidth / 2;
      const activeSlot = Math.floor(centerInTrack / SLOT_STEP);
      if (activeSlot !== lastTickSlot) {
        if (lastTickSlot !== -1) {
          soundEngine.playTick(1 - progress * 0.6);
        }
        lastTickSlot = activeSlot;
      }

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        track.style.transform = `translate3d(${targetX}px, 0, 0)`;
        setLanded(true);
        onCompleteRef.current?.();
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [spinId, isSpinning, strip, winningIndex, durationMs, jitterOffset]);

  return (
    <div
      ref={containerRef}
      className="relative h-44 w-full overflow-hidden rounded-2xl border border-accent-500/25 bg-surface-base shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]"
    >
      <div className="bg-vault-grid pointer-events-none absolute inset-0 opacity-60" />

      {/* Center Laser Needle */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center justify-between">
        <div className="h-3 w-3 -translate-y-1.5 rotate-45 bg-accent-400 shadow-[0_0_12px_var(--accent-400)]" />
        <div className="h-full w-[2px] bg-gradient-to-b from-accent-300 via-accent-400/80 to-accent-300 shadow-[0_0_14px_var(--accent-400)]" />
        <div className="h-3 w-3 translate-y-1.5 rotate-45 bg-accent-400 shadow-[0_0_12px_var(--accent-400)]" />
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="flex h-full items-center will-change-transform"
        style={{ gap: `${CARD_GAP}px` }}
      >
        {strip.map((skin, idx) => {
          const rarity = RARITIES[skin.rarity];
          const isWinnerSlot = landed && idx === winningIndex;
          const isSecret = skin.rarity === 'secret';

          return (
            <div
              key={`${skin.id}-${idx}`}
              style={{
                width: `${CARD_WIDTH}px`,
                minWidth: `${CARD_WIDTH}px`,
                borderColor: isWinnerSlot ? rarity.color : rarity.borderColor,
                backgroundColor: isWinnerSlot ? rarity.bgTint : 'rgba(12, 18, 34, 0.9)',
                boxShadow: isWinnerSlot ? `0 0 28px ${rarity.glowColor}` : undefined,
              }}
              className={`relative flex h-36 flex-col justify-between overflow-hidden rounded-xl border p-2.5 transition-shadow duration-300 ${
                isWinnerSlot ? 'ring-2 ring-white/30' : ''
              }`}
            >
              <div
                className={`absolute inset-x-0 top-0 h-1 ${isSecret ? 'secret-prism-border' : ''}`}
                style={!isSecret ? { backgroundColor: rarity.color } : undefined}
              />

              <div className="flex items-center justify-between gap-1 pt-0.5">
                <span
                  className="truncate text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: rarity.color }}
                >
                  {rarity.label}
                </span>
                <span className="truncate text-[9px] text-accent-100/45">
                  {WEAPON_CLASS_LABELS[skin.weaponClass]}
                </span>
              </div>

              <div className="flex items-center justify-center px-1 py-0.5">
                <WeaponSilhouette
                  weaponClass={skin.weaponClass}
                  accentColor={rarity.color}
                  swatches={skin.swatches}
                  image={skin.image}
                  alt={`${skin.weaponName} ${skin.name}`}
                  size="sm"
                />
              </div>

              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold text-accent-50">
                  {skin.name}
                </div>
                <div className="truncate text-[10px] text-accent-200/55">
                  {skin.weaponName}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Left & Right vignette */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-24 bg-gradient-to-r from-surface-base via-surface-base/75 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-24 bg-gradient-to-l from-surface-base via-surface-base/75 to-transparent" />
    </div>
  );
};
