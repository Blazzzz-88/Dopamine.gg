import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Info,
  Lock,
  PackageOpen,
  Sparkles,
  Trash2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { CRATES } from '../data/catalog';
import { RARITIES, WEAPON_CLASS_LABELS } from '../data/rarities';
import { InventoryItem, RarityId, SkinDefinition } from '../types/casino';
import {
  createInventoryItem,
  formatCredits,
  formatProbability,
  randomFloat,
} from '../utils/rng';
import { soundEngine } from '../utils/sound';
import {
  autoPickContractItemIds,
  buildContractReelStrip,
  buildDefaultRarityPreviewStrip,
  canExecuteContract,
  getNextRarity,
  getRequiredContractCount,
  getTradeUpCrateBreakdown,
  getTradeUpPool,
  rollTradeUpOutcome,
  TRADE_UP_INPUT_RARITIES,
} from '../utils/tradeUp';
import { DropRevealModal } from './DropRevealModal';
import { RouletteReel } from './RouletteReel';
import { WeaponSilhouette } from './WeaponSilhouette';
import { useWeaponInspector } from '../context/WeaponInspectorContext';

interface ContractReelJob {
  strip: SkinDefinition[];
  winningIndex: number;
  jitter: number;
}

interface ContractViewProps {
  inventory: InventoryItem[];
  equippedWeaponId?: string | null;
  equippedKnifeId?: string | null;
  preselectedInstanceId?: string | null;
  onClearPreselected?: () => void;
  onCompleteContract: (consumedInstanceIds: string[], wonItem: InventoryItem) => void;
  onSellReward: (item: InventoryItem) => void;
  onGoToShop: () => void;
}

const WINNING_INDEX = 42;
const STRIP_LENGTH = 54;

export const ContractView: React.FC<ContractViewProps> = ({
  inventory,
  equippedWeaponId = null,
  equippedKnifeId = null,
  preselectedInstanceId = null,
  onClearPreselected,
  onCompleteContract,
  onSellReward,
  onGoToShop,
}) => {
  const { inspectWeapon } = useWeaponInspector();

  const unlockedEligibleItems = useMemo(
    () => inventory.filter((it) => !it.locked && getNextRarity(it.rarity) !== null),
    [inventory]
  );

  const lockedEligibleCount = useMemo(
    () => inventory.filter((it) => it.locked && getNextRarity(it.rarity) !== null).length,
    [inventory]
  );

  const secretCount = useMemo(
    () => inventory.filter((it) => it.rarity === 'secret').length,
    [inventory]
  );

  const countsByRarity = useMemo(() => {
    const counts: Record<RarityId, number> = {
      commune: 0,
      rare: 0,
      mythique: 0,
      legendaire: 0,
      secret: 0,
    };
    for (const item of unlockedEligibleItems) {
      counts[item.rarity] += 1;
    }
    return counts;
  }, [unlockedEligibleItems]);

  const [activeRarity, setActiveRarity] = useState<RarityId>(() => {
    if (preselectedInstanceId) {
      const found = unlockedEligibleItems.find((i) => i.instanceId === preselectedInstanceId);
      if (found) return found.rarity;
    }
    const readyTier = TRADE_UP_INPUT_RARITIES.find(
      (r) => countsByRarity[r] >= getRequiredContractCount(r)
    );
    if (readyTier) return readyTier;
    const anyTier = TRADE_UP_INPUT_RARITIES.find((r) => countsByRarity[r] > 0);
    return anyTier ?? 'mythique';
  });

  const [crateFilter, setCrateFilter] = useState<'all' | string>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (preselectedInstanceId) {
      const found = unlockedEligibleItems.find((i) => i.instanceId === preselectedInstanceId);
      if (found) return [found.instanceId];
    }
    return [];
  });

  const [turboMode, setTurboMode] = useState(false);
  const [spinId, setSpinId] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [activeReelJob, setActiveReelJob] = useState<ContractReelJob | null>(null);
  const [pendingReveal, setPendingReveal] = useState<InventoryItem | null>(null);

  const pendingContractRef = useRef<{
    consumedIds: string[];
    wonItem: InventoryItem;
  } | null>(null);

  // Sync incoming item from Inventory shortcut
  useEffect(() => {
    if (!preselectedInstanceId) return;
    const found = unlockedEligibleItems.find((i) => i.instanceId === preselectedInstanceId);
    if (found) {
      setActiveRarity(found.rarity);
      setCrateFilter('all');
      setSelectedIds([found.instanceId]);
      setSpinId(0);
      setActiveReelJob(null);
    }
    onClearPreselected?.();
  }, [preselectedInstanceId, unlockedEligibleItems, onClearPreselected]);

  // Keep selectedIds valid if inventory changes externally
  useEffect(() => {
    const validSet = new Set(
      unlockedEligibleItems
        .filter((i) => i.rarity === activeRarity)
        .map((i) => i.instanceId)
    );
    setSelectedIds((prev) => {
      const filtered = prev.filter((id) => validSet.has(id));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [unlockedEligibleItems, activeRarity]);

  const unlockedOfActiveRarity = useMemo(
    () => unlockedEligibleItems.filter((i) => i.rarity === activeRarity),
    [unlockedEligibleItems, activeRarity]
  );

  const availableCratesForRarity = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const item of unlockedOfActiveRarity) {
      const existing = map.get(item.crateId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(item.crateId, { id: item.crateId, name: item.crateName, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [unlockedOfActiveRarity]);

  useEffect(() => {
    if (
      crateFilter !== 'all' &&
      !availableCratesForRarity.some((c) => c.id === crateFilter)
    ) {
      setCrateFilter('all');
    }
  }, [crateFilter, availableCratesForRarity]);

  const filteredCandidates = useMemo(() => {
    if (crateFilter === 'all') return unlockedOfActiveRarity;
    return unlockedOfActiveRarity.filter((i) => i.crateId === crateFilter);
  }, [unlockedOfActiveRarity, crateFilter]);

  const selectedItems = useMemo(() => {
    const byId = new Map(unlockedOfActiveRarity.map((i) => [i.instanceId, i]));
    return selectedIds
      .map((id) => byId.get(id))
      .filter((it): it is InventoryItem => Boolean(it));
  }, [selectedIds, unlockedOfActiveRarity]);

  const targetRarity = getNextRarity(activeRarity) ?? 'legendaire';
  const requiredCount = getRequiredContractCount(activeRarity);
  const inputMeta = RARITIES[activeRarity];
  const targetMeta = RARITIES[targetRarity];

  const crateBreakdown = useMemo(
    () => getTradeUpCrateBreakdown(selectedItems),
    [selectedItems]
  );

  const pool = useMemo(() => getTradeUpPool(selectedItems), [selectedItems]);

  const crateNameBySkinId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const crate of CRATES) {
      for (const skin of crate.skins) {
        map[skin.id] = crate.name;
      }
    }
    return map;
  }, []);

  const poolSignature = useMemo(
    () =>
      selectedItems
        .map((it) => it.crateId)
        .sort()
        .join('|'),
    [selectedItems]
  );

  const previewStrip = useMemo(() => {
    if (pool.length > 0) {
      return buildContractReelStrip(pool, pool[0].skin, STRIP_LENGTH, WINNING_INDEX);
    }
    return buildDefaultRarityPreviewStrip(targetRarity, STRIP_LENGTH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetRarity, poolSignature]);

  const displayedStrip = spinId > 0 && activeReelJob ? activeReelJob.strip : previewStrip;
  const displayedWinningIndex =
    spinId > 0 && activeReelJob ? activeReelJob.winningIndex : WINNING_INDEX;
  const displayedJitter = spinId > 0 && activeReelJob ? activeReelJob.jitter : 0;

  const totalInputValue = useMemo(
    () => selectedItems.reduce((sum, it) => sum + it.value, 0),
    [selectedItems]
  );

  const contractReady = canExecuteContract(selectedItems);
  const durationMs = turboMode ? 1550 : 4700;

  const resetReelToPreview = () => {
    setSpinId(0);
    setActiveReelJob(null);
  };

  const handleSelectRarityTab = (rarity: RarityId) => {
    if (isSpinning || rarity === activeRarity) return;
    soundEngine.playClick();
    setActiveRarity(rarity);
    setCrateFilter('all');
    setSelectedIds([]);
    resetReelToPreview();
  };

  const handleToggleItem = (instanceId: string) => {
    if (isSpinning) return;
    soundEngine.playClick();
    resetReelToPreview();
    setSelectedIds((prev) => {
      if (prev.includes(instanceId)) {
        return prev.filter((id) => id !== instanceId);
      }
      if (prev.length >= requiredCount) {
        return prev;
      }
      return [...prev, instanceId];
    });
  };

  const handleRemoveSlot = (instanceId: string) => {
    if (isSpinning) return;
    soundEngine.playClick();
    resetReelToPreview();
    setSelectedIds((prev) => prev.filter((id) => id !== instanceId));
  };

  const handleAutoFill = () => {
    if (isSpinning) return;
    soundEngine.playClick();
    resetReelToPreview();
    const nextIds = autoPickContractItemIds(
      unlockedEligibleItems,
      activeRarity,
      selectedIds,
      crateFilter
    );
    setSelectedIds(nextIds);
  };

  const handleClearSelection = () => {
    if (isSpinning || selectedIds.length === 0) return;
    soundEngine.playClick();
    resetReelToPreview();
    setSelectedIds([]);
  };

  const handleSignContract = useCallback(() => {
    if (isSpinning || !canExecuteContract(selectedItems)) return;
    const outcome = rollTradeUpOutcome(selectedItems);
    const currentPool = getTradeUpPool(selectedItems);
    if (!outcome || currentPool.length === 0) return;

    const strip = buildContractReelStrip(
      currentPool,
      outcome.skin,
      STRIP_LENGTH,
      WINNING_INDEX
    );
    const jitter = Math.round((randomFloat() - 0.5) * 56);
    const wonItem = createInventoryItem(outcome.crate, outcome.skin, 'contrat');
    const consumedIds = selectedItems.map((it) => it.instanceId);

    pendingContractRef.current = { consumedIds, wonItem };
    soundEngine.playOpenStart();
    setPendingReveal(null);
    setActiveReelJob({
      strip,
      winningIndex: WINNING_INDEX,
      jitter,
    });
    setIsSpinning(true);
    setSpinId((prev) => prev + 1);
  }, [isSpinning, selectedItems]);

  const handleSpinComplete = useCallback(() => {
    setIsSpinning(false);
    const pending = pendingContractRef.current;
    if (!pending) return;
    pendingContractRef.current = null;

    soundEngine.playReveal(pending.wonItem.rarity);
    onCompleteContract(pending.consumedIds, pending.wonItem);
    setSelectedIds([]);

    setTimeout(() => {
      setPendingReveal(pending.wonItem);
    }, 320);
  }, [onCompleteContract]);

  const handleKeepReward = () => {
    soundEngine.playClick();
    setPendingReveal(null);
  };

  const handleSellRewardFromModal = () => {
    if (!pendingReveal) return;
    soundEngine.playCash();
    onSellReward(pendingReveal);
    setPendingReveal(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header & Rarity Tier Selector */}
      <section className="vault-card rounded-3xl p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-500/25 bg-accent-500/10 px-3 py-1 text-xs font-semibold text-accent-300">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              CONTRAT D’ÉCHANGE • {requiredCount} POUR 1
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-accent-50 sm:text-3xl">
              Contrat d’Échange
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-accent-100/65 sm:text-sm">
              Échangez <strong className="text-accent-200">5 skins déverrouillés</strong> (ou{' '}
              <strong className="text-accent-200">10 Légendaires</strong> pour un Secret) d’une même rareté contre{' '}
              <strong className="text-accent-200">1 skin aléatoire</strong> de la rareté supérieure issu des caisses
              correspondantes. Toutes les raretés sont éligibles, à l’exception de{' '}
              <span style={{ color: RARITIES.secret.color }} className="font-semibold">
                Secret
              </span>
              .
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {TRADE_UP_INPUT_RARITIES.map((rid) => {
              const fromMeta = RARITIES[rid];
              const nextId = getNextRarity(rid)!;
              const toMeta = RARITIES[nextId];
              const tierRequired = getRequiredContractCount(rid);
              const count = countsByRarity[rid];
              const active = activeRarity === rid;

              return (
                <button
                  key={rid}
                  type="button"
                  disabled={isSpinning}
                  onClick={() => handleSelectRarityTab(rid)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition disabled:opacity-50 ${
                    active ? 'shadow-[0_0_20px_var(--card-glow)]' : 'opacity-80 hover:opacity-100'
                  }`}
                  style={{
                    borderColor: active ? toMeta.color : 'var(--card-border)',
                    backgroundColor: active ? toMeta.bgTint : 'var(--surface-base)',
                  }}
                >
                  <span style={{ color: fromMeta.color }}>{fromMeta.label}</span>
                  <ArrowRight className="h-3 w-3 text-accent-200/50" />
                  <span style={{ color: toMeta.color }}>{toMeta.label}</span>
                  <span
                    className={`ml-0.5 rounded-md px-1.5 py-0.5 font-mono-num text-[10px] ${
                      count >= tierRequired
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-white/10 text-accent-200/75'
                    }`}
                  >
                    {count}/{tierRequired}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Roulette Stage (strictly target rarity skins) */}
      <section className="vault-card relative overflow-hidden rounded-3xl p-5 sm:p-8">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-15 blur-[80px]"
          style={{ background: targetMeta.color }}
        />

        <div className="relative z-10 mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider"
              style={{
                borderColor: targetMeta.borderColor,
                backgroundColor: targetMeta.badgeBg,
                color: targetMeta.color,
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Roulette {targetMeta.label}
            </span>

            {crateBreakdown.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {crateBreakdown.map(({ crate, probability }) => (
                  <span
                    key={crate.id}
                    className="rounded-lg border border-accent-500/20 bg-surface-base/80 px-2.5 py-1 text-[11px] font-semibold text-accent-100/85"
                  >
                    {crate.name}{' '}
                    <span className="font-mono-num font-bold text-accent-300">
                      ({probability.toFixed(0)}%)
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-accent-200/60">
                Sélectionnez {requiredCount} skins{' '}
                <strong style={{ color: inputMeta.color }}>{inputMeta.label}</strong> pour cibler leur(s) caisse(s)
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={isSpinning}
            onClick={() => {
              soundEngine.playClick();
              setTurboMode((v) => !v);
            }}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition ${
              turboMode
                ? 'border-accent-400/60 bg-accent-500/20 text-accent-200 shadow-[0_0_16px_var(--card-glow)]'
                : 'border-accent-500/20 bg-surface-base text-accent-200/60 hover:text-accent-200'
            } disabled:opacity-50`}
          >
            <Zap className="h-3.5 w-3.5" />
            Mode Rapide
          </button>
        </div>

        <div className="relative z-10">
          <RouletteReel
            strip={displayedStrip}
            winningIndex={displayedWinningIndex}
            spinId={spinId}
            isSpinning={isSpinning}
            durationMs={durationMs}
            jitterOffset={displayedJitter}
            needleColor={targetMeta.color}
            crateNameBySkinId={crateNameBySkinId}
            onSpinComplete={handleSpinComplete}
          />
        </div>

        <div className="relative z-10 mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-accent-200/65">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-accent-400/80" />
            <span>
              Cette roulette contient uniquement des skins{' '}
              <strong style={{ color: targetMeta.color }}>{targetMeta.label}</strong>
              {crateBreakdown.length > 0
                ? ` issus de : ${crateBreakdown.map((b) => b.crate.name).join(', ')}.`
                : ' (aperçu du palier cible).'}
            </span>
          </div>

          {spinId > 0 && !isSpinning && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                resetReelToPreview();
              }}
              className="rounded-lg border border-accent-500/25 bg-surface-base px-3 py-1.5 text-xs font-semibold text-accent-200 transition hover:border-accent-400/50"
            >
              Préparer un autre contrat
            </button>
          )}
        </div>
      </section>

      {/* Builder: Inventory Picker + 5 Contract Slots */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Eligible Skins Picker */}
        <section className="vault-card rounded-2xl p-5 lg:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-accent-300">
                1. Sélectionnez {requiredCount} skins{' '}
                <span style={{ color: inputMeta.color }}>{inputMeta.label}</span> (
                {unlockedOfActiveRarity.length} disponible
                {unlockedOfActiveRarity.length > 1 ? 's' : ''})
              </h2>
              {(lockedEligibleCount > 0 || secretCount > 0) && (
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-accent-200/50">
                  <Lock className="h-3 w-3" />
                  Les skins verrouillés et les skins Secret ne sont pas utilisables.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {availableCratesForRarity.length > 1 && (
                <select
                  aria-label="Filtrer par caisse"
                  disabled={isSpinning}
                  value={crateFilter}
                  onChange={(e) => setCrateFilter(e.target.value)}
                  className="rounded-xl border border-accent-500/20 bg-surface-base px-3 py-1.5 text-xs font-semibold text-accent-100 focus:border-accent-400 focus:outline-none disabled:opacity-50"
                >
                  <option value="all">
                    Toutes les caisses ({unlockedOfActiveRarity.length})
                  </option>
                  {availableCratesForRarity.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.count})
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                disabled={
                  isSpinning ||
                  filteredCandidates.length === 0 ||
                  selectedItems.length >= requiredCount
                }
                onClick={handleAutoFill}
                className="inline-flex items-center gap-1.5 rounded-xl border border-accent-400/35 bg-accent-500/15 px-3 py-1.5 text-xs font-bold text-accent-200 transition hover:bg-accent-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Auto-remplir ({requiredCount})
              </button>

              {selectedIds.length > 0 && (
                <button
                  type="button"
                  disabled={isSpinning}
                  onClick={handleClearSelection}
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-950/30 px-2.5 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-900/40 disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Vider
                </button>
              )}
            </div>
          </div>

          {unlockedOfActiveRarity.length === 0 ? (
            <div className="rounded-2xl border border-accent-500/15 bg-surface-base/70 p-10 text-center">
              <PackageOpen className="mx-auto h-9 w-9 text-accent-400/70" />
              <h3 className="mt-3 font-display text-base font-bold text-accent-50">
                Aucun skin {inputMeta.label} déverrouillé
              </h3>
              <p className="mt-1 text-xs text-accent-100/60">
                {unlockedEligibleItems.length > 0
                  ? 'Sélectionnez une autre rareté ci-dessus ou ouvrez de nouvelles caisses.'
                  : 'Ouvrez des caisses dans la boutique pour obtenir des skins à échanger.'}
              </p>
              <button
                type="button"
                onClick={onGoToShop}
                className="mt-4 rounded-xl bg-accent-400 px-5 py-2.5 text-xs font-bold text-accent-950 transition hover:bg-accent-300"
              >
                Ouvrir des caisses
              </button>
            </div>
          ) : (
            <div className="grid max-h-[440px] gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {filteredCandidates.map((item) => {
                const slotIndex = selectedIds.indexOf(item.instanceId);
                const isSelected = slotIndex !== -1;
                const isFull = selectedIds.length >= requiredCount;
                const disabled = isSpinning || (!isSelected && isFull);
                const isEquipped =
                  item.instanceId === equippedWeaponId || item.instanceId === equippedKnifeId;

                return (
                  <button
                    key={item.instanceId}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleToggleItem(item.instanceId)}
                    className={`group relative flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                      isSelected
                        ? 'border-accent-400 bg-accent-500/15 ring-1 ring-accent-400/50'
                        : 'border-accent-500/15 bg-surface-base/85 hover:border-accent-400/40'
                    } disabled:cursor-not-allowed disabled:opacity-45`}
                  >
                    <div className="flex h-14 w-16 shrink-0 items-center justify-center rounded-lg bg-black/30 p-1">
                      <WeaponSilhouette
                        weaponClass={item.weaponClass}
                        accentColor={inputMeta.color}
                        swatches={item.swatches}
                        image={item.image}
                        alt={`${item.weaponName} ${item.name}`}
                        size="sm"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-bold uppercase"
                          style={{ color: inputMeta.color }}
                        >
                          {inputMeta.label}
                        </span>
                        <span className="truncate text-[10px] text-accent-200/50">
                          • {item.crateName}
                        </span>
                        {isEquipped && (
                          <span className="rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] font-bold text-emerald-300">
                            Équipé
                          </span>
                        )}
                      </div>
                      <div className="truncate text-xs font-bold text-accent-50">
                        {item.weaponName} | {item.name}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[10px] text-accent-200/55">
                        <span className="truncate">{item.wear}</span>
                        <span className="ml-2 shrink-0 font-mono-num font-bold text-accent-300">
                          {formatCredits(item.value)}
                        </span>
                      </div>
                    </div>

                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[11px] font-extrabold ${
                        isSelected
                          ? 'border-accent-300 bg-accent-400 text-accent-950'
                          : 'border-accent-500/20 bg-black/25 text-accent-200/40'
                      }`}
                    >
                      {isSelected ? <Check className="h-3.5 w-3.5 stroke-[2.5]" /> : '+'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: 5 Contract Slots + Summary + Execute */}
        <section className="vault-card flex flex-col justify-between rounded-2xl p-5 lg:col-span-5">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold uppercase tracking-wider text-accent-300">
                2. Emplacements du contrat ({selectedItems.length}/{requiredCount})
              </h2>
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
                style={{ backgroundColor: targetMeta.badgeBg, color: targetMeta.color }}
              >
                → 1× {targetMeta.label}
              </span>
            </div>

            <div className={`space-y-2 ${requiredCount > 5 ? 'max-h-[380px] overflow-y-auto pr-1' : ''}`}>
              {Array.from({ length: requiredCount }, (_, idx) => {
                const item = selectedItems[idx];
                if (!item) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="flex h-14 items-center justify-between rounded-xl border border-dashed border-accent-500/25 bg-surface-base/45 px-3.5 text-xs text-accent-200/45"
                    >
                      <span>
                        Emplacement #{idx + 1} — Skin{' '}
                        <span style={{ color: inputMeta.color }}>{inputMeta.label}</span>
                      </span>
                      <span className="font-mono-num text-[10px] uppercase">Vide</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={item.instanceId}
                    className="flex h-14 items-center justify-between gap-2.5 rounded-xl border bg-surface-base/90 px-3"
                    style={{ borderColor: inputMeta.borderColor }}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent-500/20 font-mono-num text-[10px] font-bold text-accent-300">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-accent-50">
                          {item.weaponName} | {item.name}
                        </div>
                        <div className="truncate text-[10px] text-accent-200/55">
                          {item.crateName} • Float {item.floatVal.toFixed(3)}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono-num text-xs font-bold text-accent-300">
                        {formatCredits(item.value)}
                      </span>
                      <button
                        type="button"
                        disabled={isSpinning}
                        onClick={() => handleRemoveSlot(item.instanceId)}
                        title="Retirer du contrat"
                        aria-label={`Retirer ${item.weaponName} ${item.name}`}
                        className="rounded-lg border border-accent-500/20 bg-black/30 p-1 text-accent-200/65 transition hover:border-rose-400/50 hover:text-rose-200 disabled:opacity-40"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 space-y-4 border-t border-accent-500/15 pt-4">
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-accent-200/70">
                <span>Valeur totale engagée</span>
                <span className="font-mono-num font-bold text-accent-100">
                  {formatCredits(totalInputValue)}
                </span>
              </div>
              <div className="flex items-center justify-between text-accent-200/70">
                <span>Gain garanti</span>
                <span className="font-bold" style={{ color: targetMeta.color }}>
                  1× Skin {targetMeta.label} aléatoire
                </span>
              </div>
            </div>

            <button
              type="button"
              disabled={!contractReady || isSpinning}
              onClick={handleSignContract}
              className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-accent-400 via-accent-300 to-accent2-300 py-3.5 text-sm font-extrabold text-accent-950 shadow-[0_0_26px_var(--card-glow)] transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="sheen-overlay relative z-10 flex items-center justify-center gap-2">
                <ArrowLeftRight className="h-4 w-4" />
                {isSpinning
                  ? 'Échange en cours...'
                  : contractReady
                  ? `Signer le Contrat (${requiredCount} ${inputMeta.label} → 1 ${targetMeta.label})`
                  : `Sélectionnez encore ${requiredCount - selectedItems.length} skin${
                      requiredCount - selectedItems.length > 1 ? 's' : ''
                    }`}
              </span>
            </button>
          </div>
        </section>
      </div>

      {/* Possible Target Outcomes Preview */}
      {pool.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-bold text-accent-50">
                Skins {targetMeta.label} obtenables ({pool.length})
              </h2>
              <p className="text-xs text-accent-100/55">
                Tirage aléatoire pondéré uniquement parmi les skins {targetMeta.label} de{' '}
                {crateBreakdown.length === 1
                  ? `la caisse ${crateBreakdown[0].crate.name}`
                  : 'vos caisses sélectionnées'}{' '}
                • Cliquez sur une arme pour l’inspecter en 3D.
              </p>
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {pool.map(({ crate, skin, probability }) => {
              const isSecret = skin.rarity === 'secret';
              return (
                <div
                  key={`${crate.id}-${skin.id}`}
                  className="relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-surface-card/90 p-4 transition hover:-translate-y-0.5"
                  style={{
                    borderColor: targetMeta.borderColor,
                    boxShadow: isSecret ? `0 0 24px ${targetMeta.glowColor}` : undefined,
                  }}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1 ${isSecret ? 'secret-prism-border' : ''}`}
                    style={!isSecret ? { backgroundColor: targetMeta.color } : undefined}
                  />

                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: targetMeta.badgeBg, color: targetMeta.color }}
                    >
                      {isSecret && <Sparkles className="h-2.5 w-2.5" />}
                      {targetMeta.label}
                    </span>
                    <span className="font-mono-num text-[11px] font-bold text-accent-200">
                      {formatProbability(probability)}
                    </span>
                  </div>

                  <div className="group my-3 flex items-center justify-center rounded-xl bg-surface-base/55 px-3 py-3">
                    <WeaponSilhouette
                      weaponClass={skin.weaponClass}
                      accentColor={targetMeta.color}
                      swatches={skin.swatches}
                      image={skin.image}
                      alt={`${skin.weaponName} ${skin.name}`}
                      size="md"
                      onInspect={() => inspectWeapon(skin)}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-1 text-[10px] text-accent-300/70">
                      <span>{WEAPON_CLASS_LABELS[skin.weaponClass]}</span>
                      <span className="truncate text-accent-200/55">{crate.name}</span>
                    </div>
                    <div className="truncate font-display text-sm font-bold text-accent-50">
                      {skin.weaponName} | {skin.name}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-accent-500/10 pt-2">
                      <span className="text-[10px] uppercase tracking-wider text-accent-200/45">
                        Valeur base
                      </span>
                      <span className="font-mono-num text-xs font-bold text-accent-300">
                        ~{formatCredits(skin.baseValue)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <DropRevealModal
        items={pendingReveal ? [pendingReveal] : []}
        cratePrice={0}
        canReopen={false}
        onKeepAll={handleKeepReward}
        onSellItem={handleSellRewardFromModal}
        onSellAll={handleSellRewardFromModal}
        onReopen={() => {}}
      />
    </motion.div>
  );
};
