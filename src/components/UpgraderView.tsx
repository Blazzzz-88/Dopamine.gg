import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, RotateCw, CheckCircle2, XCircle } from 'lucide-react';
import { CRATES } from '../data/catalog';
import { RARITIES } from '../data/rarities';
import { CrateDefinition, InventoryItem, SkinDefinition } from '../types/casino';
import {
  createInventoryItem,
  formatCredits,
  randomFloat,
} from '../utils/rng';
import { soundEngine } from '../utils/sound';
import { WeaponSilhouette } from './WeaponSilhouette';
import { useWeaponInspector } from '../context/WeaponInspectorContext';

interface TargetEntry {
  crate: CrateDefinition;
  skin: SkinDefinition;
}

interface UpgraderViewProps {
  inventory: InventoryItem[];
  preselectedInstanceId: string | null;
  onConsumeItem: (instanceId: string) => void;
  onWinUpgrade: (newItem: InventoryItem) => void;
  onRecordAttempt: (won: boolean) => void;
  onStartUpgrade?: (sourceInstanceId: string, won: boolean, wonItem: InventoryItem | null) => void;
  onResolvePendingUpgrade?: () => void;
  onGoToShop: () => void;
}

interface SpinSnapshot {
  sourceItem: InventoryItem;
  targetEntry: TargetEntry;
  candidateTargets: TargetEntry[];
  winChance: number;
}

interface ActiveSpinState {
  startTime: number;
  duration: number;
  startDeg: number;
  nextDeg: number;
  won: boolean;
  rollPct: number;
  winChance: number;
  targetEntry: TargetEntry;
  created: InventoryItem | null;
  finished: boolean;
}

export const UpgraderView: React.FC<UpgraderViewProps> = ({
  inventory,
  preselectedInstanceId,
  onConsumeItem,
  onWinUpgrade,
  onRecordAttempt,
  onStartUpgrade,
  onResolvePendingUpgrade,
  onGoToShop,
}) => {
  const { inspectWeapon } = useWeaponInspector();
  const unlockedItems = useMemo(
    () => inventory.filter((i) => !i.locked),
    [inventory]
  );

  const [isSpinning, setIsSpinning] = useState(false);
  const [spinningSnapshot, setSpinningSnapshot] = useState<SpinSnapshot | null>(null);

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    preselectedInstanceId ?? unlockedItems[0]?.instanceId ?? null
  );

  useEffect(() => {
    if (isSpinning) return;
    if (preselectedInstanceId && unlockedItems.some((i) => i.instanceId === preselectedInstanceId)) {
      setSelectedSourceId(preselectedInstanceId);
    } else if (
      (!selectedSourceId || !unlockedItems.some((i) => i.instanceId === selectedSourceId)) &&
      unlockedItems.length > 0
    ) {
      setSelectedSourceId(unlockedItems[0].instanceId);
    }
  }, [preselectedInstanceId, unlockedItems, selectedSourceId, isSpinning]);

  const sourceItem = unlockedItems.find((i) => i.instanceId === selectedSourceId) ?? null;

  const allTargets: TargetEntry[] = useMemo(() => {
    const entries: TargetEntry[] = [];
    for (const crate of CRATES) {
      for (const skin of crate.skins) {
        entries.push({ crate, skin });
      }
    }
    return entries.sort((a, b) => a.skin.baseValue - b.skin.baseValue);
  }, []);

  const candidateTargets = useMemo(() => {
    if (!sourceItem) return allTargets.slice(0, 12);
    const higher = allTargets.filter((t) => t.skin.baseValue >= sourceItem.value * 1.25);
    return higher.slice(0, 24);
  }, [allTargets, sourceItem]);

  const [selectedTargetSkinId, setSelectedTargetSkinId] = useState<string>(
    () => candidateTargets[2]?.skin.id ?? candidateTargets[0]?.skin.id ?? ''
  );

  useEffect(() => {
    if (isSpinning) return;
    if (
      candidateTargets.length > 0 &&
      !candidateTargets.some((t) => t.skin.id === selectedTargetSkinId)
    ) {
      setSelectedTargetSkinId(candidateTargets[Math.min(2, candidateTargets.length - 1)].skin.id);
    }
  }, [candidateTargets, selectedTargetSkinId, isSpinning]);

  const targetEntry =
    candidateTargets.find((t) => t.skin.id === selectedTargetSkinId) ??
    candidateTargets[0] ??
    null;

  const winChance = useMemo(() => {
    if (!sourceItem || !targetEntry) return 0;
    const raw = (sourceItem.value / targetEntry.skin.baseValue) * 92;
    return Number(Math.min(78, Math.max(1.0, raw)).toFixed(2));
  }, [sourceItem, targetEntry]);

  const [needleDeg, setNeedleDeg] = useState(0);
  const [resultBanner, setResultBanner] = useState<{
    won: boolean;
    message: string;
  } | null>(null);
  const currentDegRef = useRef(0);
  const animRafRef = useRef<number>(0);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeSpinRef = useRef<ActiveSpinState | null>(null);

  const callbacksRef = useRef({
    onWinUpgrade,
    onResolvePendingUpgrade,
  });
  callbacksRef.current = {
    onWinUpgrade,
    onResolvePendingUpgrade,
  };

  const finishSpin = () => {
    const spin = activeSpinRef.current;
    if (!spin || spin.finished) return;
    spin.finished = true;
    activeSpinRef.current = null;

    if (animRafRef.current) {
      cancelAnimationFrame(animRafRef.current);
      animRafRef.current = 0;
    }
    if (animTimeoutRef.current) {
      clearTimeout(animTimeoutRef.current);
      animTimeoutRef.current = null;
    }

    currentDegRef.current = spin.nextDeg;
    setNeedleDeg(spin.nextDeg);
    setIsSpinning(false);
    setSpinningSnapshot(null);

    if (spin.won && spin.created) {
      if (callbacksRef.current.onResolvePendingUpgrade) {
        callbacksRef.current.onResolvePendingUpgrade();
      } else {
        callbacksRef.current.onWinUpgrade(spin.created);
      }
      soundEngine.playReveal(spin.targetEntry.skin.rarity);
      setResultBanner({
        won: true,
        message: `Succès ! Vous obtenez ${spin.created.weaponName} | ${spin.created.name} (${formatCredits(spin.created.value)})`,
      });
    } else {
      soundEngine.playFail();
      setResultBanner({
        won: false,
        message: `Échec de l’upgrade (${spin.rollPct.toFixed(1)}% vs ${spin.winChance}% requis).`,
      });
    }
  };

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) return;
      const spin = activeSpinRef.current;
      if (!spin || spin.finished) return;

      const elapsed = Math.max(0, Date.now() - spin.startTime);
      const t = Math.min(1, elapsed / spin.duration);
      if (t >= 1) {
        finishSpin();
      } else {
        const eased = 1 - Math.pow(1 - t, 3.8);
        const deg = spin.startDeg + (spin.nextDeg - spin.startDeg) * eased;
        currentDegRef.current = deg;
        setNeedleDeg(deg);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (animRafRef.current) {
        cancelAnimationFrame(animRafRef.current);
        animRafRef.current = 0;
      }
      if (animTimeoutRef.current) {
        clearTimeout(animTimeoutRef.current);
        animTimeoutRef.current = null;
      }
      activeSpinRef.current = null;
    };
  }, []);

  const handleAttemptUpgrade = () => {
    if (isSpinning || activeSpinRef.current || !sourceItem || !targetEntry) return;

    const rollPct = randomFloat() * 100;
    const won = rollPct < winChance;
    const created = won
      ? createInventoryItem(targetEntry.crate, targetEntry.skin, 'upgrade')
      : null;

    const arcAngle = (winChance / 100) * 360;
    let landingAngleOnCircle = 0;

    if (won) {
      const pad = Math.min(4, arcAngle * 0.15);
      landingAngleOnCircle = pad + randomFloat() * Math.max(1, arcAngle - pad * 2);
    } else {
      const loseSpan = 360 - arcAngle;
      const pad = Math.min(4, loseSpan * 0.12);
      landingAngleOnCircle = arcAngle + pad + randomFloat() * Math.max(1, loseSpan - pad * 2);
    }

    const baseTurns = 5 * 360;
    const currentMod = ((currentDegRef.current % 360) + 360) % 360;
    const deltaToTarget = (landingAngleOnCircle - currentMod + 360) % 360;
    const nextDeg = currentDegRef.current + baseTurns + deltaToTarget;

    const startDeg = currentDegRef.current;
    const startTime = Date.now();
    const duration = 3400;
    let lastTickStep = -1;

    setSpinningSnapshot({
      sourceItem,
      targetEntry,
      candidateTargets,
      winChance,
    });
    setIsSpinning(true);
    setResultBanner(null);
    soundEngine.playOpenStart();

    // Consommer le skin et enregistrer la tentative dès le lancement (empêche le reset via Alt+Tab / changement d'onglet / F5)
    if (onStartUpgrade) {
      onStartUpgrade(sourceItem.instanceId, won, created);
    } else {
      onConsumeItem(sourceItem.instanceId);
      onRecordAttempt(won);
    }

    activeSpinRef.current = {
      startTime,
      duration,
      startDeg,
      nextDeg,
      won,
      rollPct,
      winChance,
      targetEntry,
      created,
      finished: false,
    };

    const animate = () => {
      const spin = activeSpinRef.current;
      if (!spin || spin.finished) return;

      const t = Math.min(1, Math.max(0, (Date.now() - spin.startTime) / spin.duration));
      const eased = 1 - Math.pow(1 - t, 3.8);
      const deg = spin.startDeg + (spin.nextDeg - spin.startDeg) * eased;
      currentDegRef.current = deg;
      setNeedleDeg(deg);

      const step = Math.floor(deg / 24);
      if (step !== lastTickStep) {
        if (lastTickStep !== -1 && !document.hidden) soundEngine.playTick(1 - t * 0.5);
        lastTickStep = step;
      }

      if (t < 1) {
        animRafRef.current = requestAnimationFrame(animate);
      } else {
        finishSpin();
      }
    };

    animTimeoutRef.current = setTimeout(finishSpin, duration + 60);
    animRafRef.current = requestAnimationFrame(animate);
  };

  const displaySourceItem = spinningSnapshot?.sourceItem ?? sourceItem;
  const displayTargetEntry = spinningSnapshot?.targetEntry ?? targetEntry;
  const displayCandidateTargets = spinningSnapshot?.candidateTargets ?? candidateTargets;
  const displayWinChance = spinningSnapshot?.winChance ?? winChance;

  const displayedSourceItems = useMemo(() => {
    if (
      spinningSnapshot &&
      !unlockedItems.some((i) => i.instanceId === spinningSnapshot.sourceItem.instanceId)
    ) {
      return [spinningSnapshot.sourceItem, ...unlockedItems];
    }
    return unlockedItems;
  }, [spinningSnapshot, unlockedItems]);

  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  const winStrokeDash = (displayWinChance / 100) * circumference;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <section className="vault-card rounded-3xl p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-500/25 bg-accent-500/10 px-3 py-1 text-xs font-semibold text-accent-300">
          <Sparkles className="h-3.5 w-3.5" />
          ATELIER D’AMÉLIORATION
        </div>
        <h1 className="mt-2 font-display text-2xl font-bold text-accent-50 sm:text-3xl">
          Upgrader Orbital
        </h1>
        <p className="mt-1 max-w-2xl text-xs text-accent-100/65 sm:text-sm">
          Misez un skin déverrouillé de votre inventaire pour tenter d’obtenir une arme d’un palier supérieur. Plus l’écart de valeur est grand, plus l’arc de réussite rétrécit.
        </p>
      </section>

      {unlockedItems.length === 0 && !isSpinning ? (
        <div className="vault-card rounded-3xl p-12 text-center">
          {resultBanner && (
            <div
              className={`mx-auto mb-5 flex max-w-md items-center justify-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold ${
                resultBanner.won
                  ? 'border-accent-400/50 bg-accent-500/15 text-accent-200'
                  : 'border-rose-400/40 bg-rose-500/15 text-rose-200'
              }`}
            >
              {resultBanner.won ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
              )}
              <span>{resultBanner.message}</span>
            </div>
          )}
          <p className="text-sm text-accent-100/70">
            Vous avez besoin d’au moins un skin déverrouillé dans votre inventaire pour utiliser l’Upgrader.
          </p>
          <button
            onClick={onGoToShop}
            className="mt-5 rounded-xl bg-accent-400 px-6 py-3 text-sm font-bold text-accent-950 transition hover:bg-accent-300"
          >
            Ouvrir des caisses
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="vault-card rounded-2xl p-4 lg:col-span-4">
            <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-accent-300">
              1. Skin à miser ({displayedSourceItems.length})
            </h3>
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {displayedSourceItems.map((item) => {
                const r = RARITIES[item.rarity];
                const active = displaySourceItem?.instanceId === item.instanceId;
                return (
                  <button
                    key={item.instanceId}
                    disabled={isSpinning}
                    onClick={() => setSelectedSourceId(item.instanceId)}
                    className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-left transition ${
                      active
                        ? 'border-accent-400 bg-accent-500/15'
                        : 'border-accent-500/10 bg-surface-base hover:border-accent-500/30'
                    }`}
                  >
                    <div className="min-w-0">
                      <span
                        className="text-[10px] font-bold uppercase"
                        style={{ color: r.color }}
                      >
                        {r.label}
                      </span>
                      <div className="truncate text-xs font-bold text-accent-50">
                        {item.weaponName} | {item.name}
                      </div>
                    </div>
                    <span className="ml-2 shrink-0 font-mono-num text-xs font-bold text-accent-300">
                      {formatCredits(item.value)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="vault-card flex flex-col items-center justify-between rounded-2xl p-6 lg:col-span-4">
            <div className="text-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-accent-200/60">
                Probabilité de succès
              </span>
              <div className="font-mono-num text-3xl font-extrabold text-accent-300">
                {displayWinChance.toFixed(2)}%
              </div>
            </div>

            <div className="relative my-6 flex h-56 w-56 items-center justify-center">
              <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
                <circle
                  cx="110"
                  cy="110"
                  r={radius}
                  fill="none"
                  stroke="color-mix(in srgb, var(--accent-400) 14%, transparent)"
                  strokeWidth="16"
                />
                <circle
                  cx="110"
                  cy="110"
                  r={radius}
                  fill="none"
                  stroke="var(--accent-400)"
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={`${winStrokeDash} ${circumference}`}
                  className="drop-shadow-[0_0_12px_var(--accent-400)] transition-all duration-300"
                />
              </svg>

              <div
                className="pointer-events-none absolute inset-0 flex items-start justify-center"
                style={{ transform: `rotate(${needleDeg}deg)` }}
              >
                <div className="mt-1 h-7 w-2 rounded-full bg-white shadow-[0_0_14px_#fff]" />
              </div>

              {displayTargetEntry && (
                <div className="group absolute inset-8 flex flex-col items-center justify-center rounded-full border border-accent-500/20 bg-surface-base/90 p-3 text-center">
                  <WeaponSilhouette
                    weaponClass={displayTargetEntry.skin.weaponClass}
                    accentColor={RARITIES[displayTargetEntry.skin.rarity].color}
                    image={displayTargetEntry.skin.image}
                    alt={`${displayTargetEntry.skin.weaponName} ${displayTargetEntry.skin.name}`}
                    size="sm"
                    onInspect={() => inspectWeapon(displayTargetEntry.skin)}
                  />
                  <div className="mt-1 line-clamp-1 text-[11px] font-bold text-accent-50">
                    {displayTargetEntry.skin.name}
                  </div>
                  <div className="font-mono-num text-xs font-bold text-accent-300">
                    ~{formatCredits(displayTargetEntry.skin.baseValue)}
                  </div>
                </div>
              )}
            </div>

            {resultBanner && (
              <div
                className={`mb-4 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                  resultBanner.won
                    ? 'border-accent-400/50 bg-accent-500/15 text-accent-200'
                    : 'border-rose-400/40 bg-rose-500/15 text-rose-200'
                }`}
              >
                {resultBanner.won ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-400" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                )}
                <span>{resultBanner.message}</span>
              </div>
            )}

            <button
              disabled={isSpinning || !displaySourceItem || !displayTargetEntry}
              onClick={handleAttemptUpgrade}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-400 to-accent2-300 py-3.5 text-sm font-extrabold text-accent-950 shadow-[0_0_24px_var(--card-glow)] transition hover:brightness-105 disabled:opacity-50"
            >
              <RotateCw className={`h-4 w-4 ${isSpinning ? 'animate-spin' : ''}`} />
              {isSpinning ? 'Rotation...' : 'Tenter l’Upgrade'}
            </button>
          </div>

          <div className="vault-card rounded-2xl p-4 lg:col-span-4">
            <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-accent-300">
              2. Cible souhaitée
            </h3>
            {displayCandidateTargets.length === 0 ? (
              <p className="text-xs text-accent-100/60">
                Ce skin est déjà proche du sommet de valeur du catalogue !
              </p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {displayCandidateTargets.map(({ skin, crate }) => {
                  const r = RARITIES[skin.rarity];
                  const active = displayTargetEntry?.skin.id === skin.id;
                  const mult = displaySourceItem
                    ? (skin.baseValue / displaySourceItem.value).toFixed(1)
                    : '1.0';
                  return (
                    <button
                      key={skin.id}
                      disabled={isSpinning}
                      onClick={() => setSelectedTargetSkinId(skin.id)}
                      className={`flex w-full items-center justify-between rounded-xl border p-2.5 text-left transition ${
                        active
                          ? 'border-accent-400 bg-accent-500/15'
                          : 'border-accent-500/10 bg-surface-base hover:border-accent-500/30'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[10px] font-bold uppercase"
                            style={{ color: r.color }}
                          >
                            {r.label}
                          </span>
                          <span className="text-[10px] text-accent-200/40">
                            • {crate.name}
                          </span>
                        </div>
                        <div className="truncate text-xs font-bold text-accent-50">
                          {skin.weaponName} | {skin.name}
                        </div>
                      </div>

                      <div className="ml-2 flex shrink-0 items-center gap-2 text-right">
                        <span className="rounded bg-accent-500/15 px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-accent-300">
                          {mult}x
                        </span>
                        <ArrowRight className="h-3 w-3 text-accent-400/50" />
                        <span className="font-mono-num text-xs font-bold text-accent-200">
                          {formatCredits(skin.baseValue)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
};
