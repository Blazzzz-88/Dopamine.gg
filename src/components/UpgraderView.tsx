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
  onGoToShop: () => void;
}

export const UpgraderView: React.FC<UpgraderViewProps> = ({
  inventory,
  preselectedInstanceId,
  onConsumeItem,
  onWinUpgrade,
  onRecordAttempt,
  onGoToShop,
}) => {
  const { inspectWeapon } = useWeaponInspector();
  const unlockedItems = useMemo(
    () => inventory.filter((i) => !i.locked),
    [inventory]
  );

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(
    preselectedInstanceId ?? unlockedItems[0]?.instanceId ?? null
  );

  useEffect(() => {
    if (preselectedInstanceId && unlockedItems.some((i) => i.instanceId === preselectedInstanceId)) {
      setSelectedSourceId(preselectedInstanceId);
    } else if (
      (!selectedSourceId || !unlockedItems.some((i) => i.instanceId === selectedSourceId)) &&
      unlockedItems.length > 0
    ) {
      setSelectedSourceId(unlockedItems[0].instanceId);
    }
  }, [preselectedInstanceId, unlockedItems, selectedSourceId]);

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
    if (
      candidateTargets.length > 0 &&
      !candidateTargets.some((t) => t.skin.id === selectedTargetSkinId)
    ) {
      setSelectedTargetSkinId(candidateTargets[Math.min(2, candidateTargets.length - 1)].skin.id);
    }
  }, [candidateTargets, selectedTargetSkinId]);

  const targetEntry =
    candidateTargets.find((t) => t.skin.id === selectedTargetSkinId) ??
    candidateTargets[0] ??
    null;

  const winChance = useMemo(() => {
    if (!sourceItem || !targetEntry) return 0;
    const raw = (sourceItem.value / targetEntry.skin.baseValue) * 92;
    return Number(Math.min(78, Math.max(1.0, raw)).toFixed(2));
  }, [sourceItem, targetEntry]);

  const [isSpinning, setIsSpinning] = useState(false);
  const [needleDeg, setNeedleDeg] = useState(0);
  const [resultBanner, setResultBanner] = useState<{
    won: boolean;
    message: string;
  } | null>(null);
  const currentDegRef = useRef(0);

  const handleAttemptUpgrade = () => {
    if (isSpinning || !sourceItem || !targetEntry) return;
    setIsSpinning(true);
    setResultBanner(null);
    soundEngine.playOpenStart();

    const rollPct = randomFloat() * 100;
    const won = rollPct < winChance;

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
    const startTime = performance.now();
    const duration = 3400;
    let lastTickStep = -1;

    const animate = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3.8);
      const deg = startDeg + (nextDeg - startDeg) * eased;
      currentDegRef.current = deg;
      setNeedleDeg(deg);

      const step = Math.floor(deg / 24);
      if (step !== lastTickStep) {
        if (lastTickStep !== -1) soundEngine.playTick(1 - t * 0.5);
        lastTickStep = step;
      }

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsSpinning(false);
        onConsumeItem(sourceItem.instanceId);
        onRecordAttempt(won);

        if (won) {
          const created = createInventoryItem(targetEntry.crate, targetEntry.skin, 'upgrade');
          onWinUpgrade(created);
          soundEngine.playReveal(targetEntry.skin.rarity);
          setResultBanner({
            won: true,
            message: `Succès ! Vous obtenez ${created.weaponName} | ${created.name} (${formatCredits(created.value)})`,
          });
        } else {
          soundEngine.playFail();
          setResultBanner({
            won: false,
            message: `Échec de l’upgrade (${rollPct.toFixed(1)}% vs ${winChance}% requis).`,
          });
        }
      }
    };

    requestAnimationFrame(animate);
  };

  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  const winStrokeDash = (winChance / 100) * circumference;

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

      {unlockedItems.length === 0 ? (
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
              1. Skin à miser ({unlockedItems.length})
            </h3>
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {unlockedItems.map((item) => {
                const r = RARITIES[item.rarity];
                const active = sourceItem?.instanceId === item.instanceId;
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
                {winChance.toFixed(2)}%
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

              {targetEntry && (
                <div className="group absolute inset-8 flex flex-col items-center justify-center rounded-full border border-accent-500/20 bg-surface-base/90 p-3 text-center">
                  <WeaponSilhouette
                    weaponClass={targetEntry.skin.weaponClass}
                    accentColor={RARITIES[targetEntry.skin.rarity].color}
                    image={targetEntry.skin.image}
                    alt={`${targetEntry.skin.weaponName} ${targetEntry.skin.name}`}
                    size="sm"
                    onInspect={() => inspectWeapon(targetEntry.skin)}
                  />
                  <div className="mt-1 line-clamp-1 text-[11px] font-bold text-accent-50">
                    {targetEntry.skin.name}
                  </div>
                  <div className="font-mono-num text-xs font-bold text-accent-300">
                    ~{formatCredits(targetEntry.skin.baseValue)}
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
              disabled={isSpinning || !sourceItem || !targetEntry}
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
            {candidateTargets.length === 0 ? (
              <p className="text-xs text-accent-100/60">
                Ce skin est déjà proche du sommet de valeur du catalogue !
              </p>
            ) : (
              <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                {candidateTargets.map(({ skin, crate }) => {
                  const r = RARITIES[skin.rarity];
                  const active = targetEntry?.skin.id === skin.id;
                  const mult = sourceItem
                    ? (skin.baseValue / sourceItem.value).toFixed(1)
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
