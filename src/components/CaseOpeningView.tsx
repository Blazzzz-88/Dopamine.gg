import React, { useCallback, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Zap,
  Sparkles,
  Wallet,
  Info,
  PackageOpen,
} from 'lucide-react';
import { CASE_CATEGORIES } from '../data/catalog';
import { RARITIES, RARITY_ORDER, WEAPON_CLASS_LABELS } from '../data/rarities';
import {
  CrateDefinition,
  InventoryItem,
  RarityId,
  SkinDefinition,
} from '../types/casino';
import {
  buildReelStrip,
  createInventoryItem,
  formatCredits,
  formatProbability,
  getSkinProbabilityInCrate,
  randomFloat,
  rollSkinFromCrate,
} from '../utils/rng';
import { soundEngine } from '../utils/sound';
import { BASE_INVENTORY_CAPACITY } from '../utils/storage';
import { CrateEmblem } from './CrateEmblem';
import { DropRevealModal } from './DropRevealModal';
import { RouletteReel } from './RouletteReel';
import { WeaponSilhouette } from './WeaponSilhouette';
import { useWeaponInspector } from '../context/WeaponInspectorContext';

interface ReelJob {
  strip: SkinDefinition[];
  winningIndex: number;
  winningSkin: SkinDefinition;
  jitter: number;
}

interface CaseOpeningViewProps {
  crate: CrateDefinition;
  balance: number;
  inventoryCount?: number;
  inventoryCapacity?: number;
  onBack: () => void;
  onSpendCredits: (amount: number) => boolean;
  onAddItemsToInventory: (items: InventoryItem[], crateName: string) => void;
  onSellItemsFromReveal: (itemsToKeep: InventoryItem[], soldValue: number) => void;
}

export type OpenQuantity = 1 | 2 | 3 | 5 | 10;
export const OPEN_QUANTITIES: readonly OpenQuantity[] = [1, 2, 3, 5, 10];

const WINNING_INDEX = 42;
const STRIP_LENGTH = 54;

export const CaseOpeningView: React.FC<CaseOpeningViewProps> = ({
  crate,
  balance,
  inventoryCount = 0,
  inventoryCapacity = BASE_INVENTORY_CAPACITY,
  onBack,
  onSpendCredits,
  onAddItemsToInventory,
  onSellItemsFromReveal,
}) => {
  const { inspectWeapon } = useWeaponInspector();
  const [quantity, setQuantity] = useState<OpenQuantity>(1);
  const [turboMode, setTurboMode] = useState(false);
  const [rarityFilter, setRarityFilter] = useState<'all' | RarityId>('all');

  const [spinId, setSpinId] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [reelJobs, setReelJobs] = useState<ReelJob[]>(() => {
    const sample = crate.skins[0];
    return [
      {
        strip: buildReelStrip(crate, sample, STRIP_LENGTH, WINNING_INDEX),
        winningIndex: WINNING_INDEX,
        winningSkin: sample,
        jitter: 0,
      },
    ];
  });

  const [pendingReveal, setPendingReveal] = useState<InventoryItem[]>([]);
  const completedCountRef = useRef(0);
  const activeBatchRef = useRef<InventoryItem[]>([]);

  const category = CASE_CATEGORIES.find((c) => c.id === crate.categoryId);
  const totalCost = crate.price * quantity;
  const canAfford = balance >= totalCost;
  const availableSlots = Math.max(0, inventoryCapacity - inventoryCount);
  const hasSpaceForQty = availableSlots >= quantity;
  const durationMs = turboMode ? 1550 : 4700;

  const handleQuantityChange = (q: OpenQuantity) => {
    if (isSpinning) return;
    soundEngine.playClick();
    setQuantity(q);
    setReelJobs(
      Array.from({ length: q }, (_, i) => {
        const sample = crate.skins[(i * 5) % crate.skins.length];
        return {
          strip: buildReelStrip(crate, sample, STRIP_LENGTH, WINNING_INDEX),
          winningIndex: WINNING_INDEX,
          winningSkin: sample,
          jitter: 0,
        };
      })
    );
    setSpinId(0);
  };

  const startSpin = useCallback(
    (qtyOverride?: number) => {
      if (isSpinning) return;
      const qty = qtyOverride ?? quantity;
      const cost = crate.price * qty;

      if (inventoryCount + qty > inventoryCapacity) {
        soundEngine.playFail();
        return;
      }

      if (!onSpendCredits(cost)) {
        soundEngine.playFail();
        return;
      }

      soundEngine.playOpenStart();
      completedCountRef.current = 0;

      const jobs: ReelJob[] = [];
      const createdItems: InventoryItem[] = [];

      for (let i = 0; i < qty; i++) {
        const winningSkin = rollSkinFromCrate(crate);
        const strip = buildReelStrip(crate, winningSkin, STRIP_LENGTH, WINNING_INDEX);
        const jitter = Math.round((randomFloat() - 0.5) * 56);
        jobs.push({
          strip,
          winningIndex: WINNING_INDEX,
          winningSkin,
          jitter,
        });
        createdItems.push(createInventoryItem(crate, winningSkin, 'ouverture'));
      }

      activeBatchRef.current = createdItems;
      setPendingReveal([]);
      setReelJobs(jobs);
      setIsSpinning(true);
      setSpinId((prev) => prev + 1);
    },
    [isSpinning, quantity, crate, onSpendCredits, inventoryCount, inventoryCapacity]
  );

  const handleOneReelDone = useCallback(() => {
    completedCountRef.current += 1;
    if (completedCountRef.current >= activeBatchRef.current.length) {
      setIsSpinning(false);
      const batch = activeBatchRef.current;
      const highestOrder = Math.max(...batch.map((it) => RARITIES[it.rarity].order));
      const best = batch.find((it) => RARITIES[it.rarity].order === highestOrder);
      if (best) {
        soundEngine.playReveal(best.rarity);
      }
      onAddItemsToInventory(batch, crate.name);
      setTimeout(() => {
        setPendingReveal(batch);
      }, 320);
    }
  }, [crate.name, onAddItemsToInventory]);

  const sortedLoot = useMemo(() => {
    const list =
      rarityFilter === 'all'
        ? crate.skins
        : crate.skins.filter((s) => s.rarity === rarityFilter);
    return [...list].sort(
      (a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order || b.baseValue - a.baseValue
    );
  }, [crate.skins, rarityFilter]);

  const handleKeepAll = () => {
    soundEngine.playClick();
    setPendingReveal([]);
  };

  const handleSellSingleFromModal = (instanceId: string) => {
    const target = pendingReveal.find((i) => i.instanceId === instanceId);
    if (!target) return;
    soundEngine.playCash();
    const remaining = pendingReveal.filter((i) => i.instanceId !== instanceId);
    onSellItemsFromReveal([target], target.value);
    setPendingReveal(remaining);
  };

  const handleSellAllFromModal = () => {
    if (pendingReveal.length === 0) return;
    soundEngine.playCash();
    const sum = pendingReveal.reduce((acc, i) => acc + i.value, 0);
    onSellItemsFromReveal(pendingReveal, sum);
    setPendingReveal([]);
  };

  const handleReopenFromModal = () => {
    const qty = pendingReveal.length || quantity;
    setPendingReveal([]);
    setTimeout(() => startSpin(qty), 60);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          disabled={isSpinning}
          className="inline-flex items-center gap-2 rounded-xl border border-accent-500/20 bg-surface-panel px-4 py-2 text-xs font-semibold text-accent-200 transition hover:border-accent-400/50 hover:text-accent-100 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux catégories
        </button>

        {category && (
          <span className="rounded-full border border-accent-500/20 bg-surface-panel/80 px-3 py-1 font-mono-num text-xs font-semibold text-accent-300">
            {category.badge} • {category.name}
          </span>
        )}
      </div>

      <section className="vault-card relative overflow-hidden rounded-3xl p-5 sm:p-8">
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full opacity-15 blur-[80px]"
          style={{ background: crate.accentColor }}
        />

        <div className="relative z-10 flex flex-col gap-6 border-b border-accent-500/15 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <div
              className={
                crate.image
                  ? 'group shrink-0'
                  : 'shrink-0 rounded-2xl border border-accent-500/20 bg-surface-base/90 p-3'
              }
            >
              <CrateEmblem
                type={crate.emblemType}
                accentColor={crate.accentColor}
                image={crate.image}
                alt={`Caisse 3D ${crate.name}`}
                size={88}
                className={crate.image ? 'aspect-[4/3] w-36 sm:w-44' : ''}
              />
            </div>
            <div>
              <span
                className="inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  borderColor: `${crate.accentColor}40`,
                  backgroundColor: `${crate.accentColor}15`,
                  color: crate.accentColor,
                }}
              >
                {crate.themeTag} • {crate.skins.length} skins
              </span>
              <h1 className="mt-1.5 font-display text-2xl font-bold text-accent-50 sm:text-3xl">
                {crate.name}
              </h1>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-accent-100/65 sm:text-sm">
                {crate.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-xl border border-accent-500/20 bg-surface-base p-1">
              {OPEN_QUANTITIES.map((q) => (
                <button
                  key={q}
                  disabled={isSpinning}
                  onClick={() => handleQuantityChange(q)}
                  className={`rounded-lg px-2.5 sm:px-3 py-1.5 font-mono-num text-xs font-bold transition ${
                    quantity === q
                      ? 'bg-accent-400 text-accent-950 shadow'
                      : 'text-accent-200/70 hover:text-accent-100'
                  } disabled:opacity-50`}
                >
                  {q}x
                </button>
              ))}
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
        </div>

        <div
          className={`relative z-10 mt-6 space-y-3 ${
            reelJobs.length > 2
              ? 'max-h-[560px] overflow-y-auto pr-1 sm:pr-2'
              : ''
          }`}
        >
          {reelJobs.map((job, idx) => (
            <div key={idx} className="relative">
              {reelJobs.length > 1 && (
                <div className="pointer-events-none absolute left-3 top-2.5 z-40 rounded-md border border-accent-500/25 bg-surface-base/85 px-2 py-0.5 font-mono-num text-[10px] font-bold text-accent-300 shadow-sm backdrop-blur-xs">
                  Caisse #{idx + 1}
                </div>
              )}
              <RouletteReel
                strip={job.strip}
                winningIndex={job.winningIndex}
                spinId={spinId}
                isSpinning={isSpinning}
                durationMs={durationMs}
                jitterOffset={job.jitter}
                muteSound={idx > 0}
                onSpinComplete={handleOneReelDone}
              />
            </div>
          ))}
        </div>

        <div className="relative z-10 mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 text-xs text-accent-200/60">
            <Info className="h-4 w-4 text-accent-400/80" />
            <span>
              Tirage pondéré transparent :{' '}
              {RARITY_ORDER.map((rid) => `${formatProbability(RARITIES[rid].probability)} ${RARITIES[rid].label}`).join(' • ')}
            </span>
          </div>

          <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
            {!hasSpaceForQty && !isSpinning && (
              <div className="flex items-center gap-1.5 rounded-xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-xs font-bold text-rose-200">
                <PackageOpen className="h-4 w-4" />
                {availableSlots === 0
                  ? `Inventaire plein (${inventoryCount}/${inventoryCapacity})`
                  : `Places insuffisantes (${availableSlots} libre${availableSlots > 1 ? 's' : ''})`}
              </div>
            )}

            {!canAfford && !isSpinning && (
              <div className="flex items-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-xs font-bold text-amber-200">
                <Wallet className="h-4 w-4" />
                Solde insuffisant
              </div>
            )}

            <button
              disabled={isSpinning || !canAfford || !hasSpaceForQty}
              onClick={() => startSpin()}
              className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-accent-400 via-accent-300 to-accent2-300 px-7 py-3.5 text-sm font-extrabold text-accent-950 shadow-[0_0_30px_var(--card-glow)] transition hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto"
            >
              <span className="sheen-overlay relative z-10 flex items-center justify-center gap-2">
                <PackageOpen className="h-4 w-4" />
                {isSpinning
                  ? 'Ouverture en cours...'
                  : `Acheter & Ouvrir (${formatCredits(totalCost)})`}
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-xl font-bold text-accent-50">
              Contenu complet de la caisse ({crate.skins.length} skins)
            </h2>
            <p className="text-xs text-accent-100/55">
              Cliquez sur la photo d’une arme pour l’inspecter en 3D • Taux de drop et valeurs de base.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setRarityFilter('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                rarityFilter === 'all'
                  ? 'bg-accent-400 text-accent-950'
                  : 'border border-accent-500/20 bg-surface-panel text-accent-200/70 hover:text-accent-100'
              }`}
            >
              Tous ({crate.skins.length})
            </button>
            {[...RARITY_ORDER].reverse().map((rid) => {
              const r = RARITIES[rid];
              const active = rarityFilter === rid;
              const count = crate.skins.filter((s) => s.rarity === rid).length;
              return (
                <button
                  key={rid}
                  onClick={() => setRarityFilter(rid)}
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition"
                  style={{
                    borderColor: active ? r.color : 'var(--card-border)',
                    backgroundColor: active ? r.badgeBg : 'var(--surface-panel)',
                    color: active ? r.color : 'var(--accent-100)',
                  }}
                >
                  {r.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {sortedLoot.map((skin) => {
            const rarity = RARITIES[skin.rarity];
            const prob = getSkinProbabilityInCrate(crate, skin);
            const isSecret = skin.rarity === 'secret';

            return (
              <div
                key={skin.id}
                className="relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-surface-card/90 p-4 transition hover:-translate-y-0.5"
                style={{
                  borderColor: rarity.borderColor,
                  boxShadow: isSecret ? `0 0 24px ${rarity.glowColor}` : undefined,
                }}
              >
                <div
                  className={`absolute inset-x-0 top-0 h-1 ${isSecret ? 'secret-prism-border' : ''}`}
                  style={!isSecret ? { backgroundColor: rarity.color } : undefined}
                />

                <div className="flex items-center justify-between gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                    style={{ backgroundColor: rarity.badgeBg, color: rarity.color }}
                  >
                    {isSecret && <Sparkles className="h-2.5 w-2.5" />}
                    {rarity.label}
                  </span>
                  <span className="font-mono-num text-[11px] font-semibold text-accent-100/70">
                    {formatProbability(prob)}
                  </span>
                </div>

                <div className="group my-3 flex items-center justify-center rounded-xl bg-surface-base/55 px-3 py-3">
                  <WeaponSilhouette
                    weaponClass={skin.weaponClass}
                    accentColor={rarity.color}
                    swatches={skin.swatches}
                    image={skin.image}
                    alt={`${skin.weaponName} ${skin.name}`}
                    size="md"
                    onInspect={() => inspectWeapon(skin)}
                  />
                </div>

                <div>
                  <div className="text-[11px] font-medium text-accent-300/70">
                    {WEAPON_CLASS_LABELS[skin.weaponClass]}
                  </div>
                  <div className="truncate font-display text-sm font-bold text-accent-50">
                    {skin.weaponName} | {skin.name}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-accent-100/50">
                    {skin.tagline}
                  </p>
                  <div className="mt-3 flex items-center justify-between border-t border-accent-500/10 pt-2.5">
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

      <DropRevealModal
        items={pendingReveal}
        cratePrice={crate.price}
        canReopen={
          balance >= crate.price * (pendingReveal.length || 1) &&
          availableSlots >= (pendingReveal.length || 1)
        }
        onKeepAll={handleKeepAll}
        onSellItem={handleSellSingleFromModal}
        onSellAll={handleSellAllFromModal}
        onReopen={handleReopenFromModal}
      />
    </motion.div>
  );
};
