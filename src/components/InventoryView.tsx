import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeftRight,
  Briefcase,
  Check,
  Coins,
  Crosshair,
  HardDrive,
  Lock,
  Plus,
  Unlock,
  Sparkles,
  Trash2,
  ArrowUpRight,
  PackageOpen,
} from 'lucide-react';
import { RARITIES, RARITY_ORDER, WEAPON_CLASS_LABELS } from '../data/rarities';
import { InventoryItem, RarityId } from '../types/casino';
import { formatCredits } from '../utils/rng';
import {
  BASE_INVENTORY_CAPACITY,
  getNextStorageUpgradeCost,
  STORAGE_UPGRADE_STEP,
} from '../utils/storage';
import { WeaponSilhouette } from './WeaponSilhouette';
import { useWeaponInspector } from '../context/WeaponInspectorContext';

interface InventoryViewProps {
  items: InventoryItem[];
  inventoryCapacity?: number;
  balance?: number;
  equippedWeaponId: string | null;
  equippedKnifeId?: string | null;
  onEquipItem: (instanceId: string) => void;
  onSellItem: (instanceId: string) => void;
  onSellBulk: (rarityOnly?: RarityId) => void;
  onToggleLock: (instanceId: string) => void;
  onSendToUpgrader: (instanceId: string) => void;
  onSendToContract?: (instanceId: string) => void;
  onUpgradeStorage?: () => void;
  onGoToShop: () => void;
}

type SortMode = 'recent' | 'value_desc' | 'rarity_desc';

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  inventoryCapacity = BASE_INVENTORY_CAPACITY,
  balance = 0,
  equippedWeaponId,
  equippedKnifeId = null,
  onEquipItem,
  onSellItem,
  onSellBulk,
  onToggleLock,
  onSendToUpgrader,
  onSendToContract,
  onUpgradeStorage,
  onGoToShop,
}) => {
  const { inspectWeapon } = useWeaponInspector();
  const [rarityFilter, setRarityFilter] = useState<'all' | RarityId>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');

  const upgradeCost = getNextStorageUpgradeCost(inventoryCapacity);
  const canAffordUpgrade = balance >= upgradeCost && Boolean(onUpgradeStorage);
  const isFull = items.length >= inventoryCapacity;
  const fillPct = Math.min(100, Math.round((items.length / Math.max(1, inventoryCapacity)) * 100));

  const equippedPrimaryItem = useMemo(
    () =>
      equippedWeaponId
        ? items.find((i) => i.instanceId === equippedWeaponId && i.weaponClass !== 'lame') ?? null
        : null,
    [items, equippedWeaponId]
  );

  const equippedKnifeItem = useMemo(
    () =>
      equippedKnifeId
        ? items.find((i) => i.instanceId === equippedKnifeId && i.weaponClass === 'lame') ?? null
        : null,
    [items, equippedKnifeId]
  );

  const totalValue = useMemo(
    () => items.reduce((acc, it) => acc + it.value, 0),
    [items]
  );

  const unlockedCommonsCount = useMemo(
    () => items.filter((i) => !i.locked && i.rarity === 'commune').length,
    [items]
  );

  const unlockedCount = useMemo(
    () => items.filter((i) => !i.locked).length,
    [items]
  );

  const filteredItems = useMemo(() => {
    const list =
      rarityFilter === 'all'
        ? items
        : items.filter((i) => i.rarity === rarityFilter);

    return [...list].sort((a, b) => {
      if (sortMode === 'value_desc') return b.value - a.value;
      if (sortMode === 'rarity_desc') {
        return RARITIES[b.rarity].order - RARITIES[a.rarity].order || b.value - a.value;
      }
      return b.obtainedAt - a.obtainedAt;
    });
  }, [items, rarityFilter, sortMode]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <section className="vault-card flex flex-col justify-between gap-5 rounded-3xl p-6 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-accent-500/25 bg-accent-500/10 px-3 py-1 text-xs font-semibold text-accent-300">
            <Briefcase className="h-3.5 w-3.5" />
            COFFRE PERSONNEL
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold text-accent-50 sm:text-3xl">
            Mon Inventaire
          </h1>
          <p className="mt-1 text-xs text-accent-100/60 sm:text-sm">
            Équipez une arme principale (touche 1) et/ou un couteau (touche 2) pour le mode Zombie FPS.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <div
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                equippedPrimaryItem
                  ? 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
                  : 'border-accent-500/20 bg-surface-base/75 text-accent-200/70'
              }`}
            >
              <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-accent-300">
                1
              </span>
              <span>
                Arme :{' '}
                <strong className="text-white">
                  {equippedPrimaryItem
                    ? `${equippedPrimaryItem.weaponName} | ${equippedPrimaryItem.name}`
                    : 'Par défaut (auto)'}
                </strong>
              </span>
            </div>

            <div
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                equippedKnifeItem
                  ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                  : 'border-accent-500/20 bg-surface-base/75 text-accent-200/70'
              }`}
            >
              <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono-num text-[10px] font-bold text-amber-300">
                2
              </span>
              <span>
                Couteau :{' '}
                <strong className="text-white">
                  {equippedKnifeItem
                    ? `${equippedKnifeItem.weaponName} | ${equippedKnifeItem.name}`
                    : 'Aucun couteau équipé'}
                </strong>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-accent-500/20 bg-surface-base px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent-200/50">
                  <HardDrive className="h-3 w-3 text-accent-400" />
                  Stockage
                </span>
                <span
                  data-testid="inventory-storage-count"
                  className={`font-mono-num text-xl font-bold ${
                    isFull
                      ? 'text-rose-300'
                      : fillPct >= 80
                      ? 'text-amber-300'
                      : 'text-accent-50'
                  }`}
                >
                  {items.length} / {inventoryCapacity}
                </span>
              </div>

              <button
                type="button"
                disabled={!canAffordUpgrade}
                onClick={() => onUpgradeStorage?.()}
                title={`Augmenter le stockage de +${STORAGE_UPGRADE_STEP} places pour ${formatCredits(upgradeCost)}`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-accent-400 to-accent2-300 px-3.5 py-2 text-xs font-extrabold text-accent-950 shadow transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                <span>Augmenter</span>
                <span className="rounded-md bg-black/15 px-1.5 py-0.5 font-mono-num text-[10px] font-bold">
                  +{STORAGE_UPGRADE_STEP} • {formatCredits(upgradeCost)}
                </span>
              </button>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-all duration-300 ${
                  isFull ? 'bg-rose-400' : fillPct >= 80 ? 'bg-amber-400' : 'bg-accent-400'
                }`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-accent-500/20 bg-surface-base px-5 py-3">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-accent-200/50">
              Valeur du coffre ({items.length} skins)
            </span>
            <span className="font-mono-num text-2xl font-bold text-accent-300">
              {formatCredits(totalValue)}
            </span>
          </div>

          {unlockedCommonsCount > 0 && (
            <button
              onClick={() => onSellBulk('commune')}
              className="flex items-center gap-2 rounded-xl border border-accent-500/25 bg-surface-base px-4 py-3 text-xs font-semibold text-accent-200 transition hover:border-accent-400/50 hover:bg-accent-500/10"
            >
              <Coins className="h-4 w-4 text-accent-400" />
              Vendre Communes ({unlockedCommonsCount})
            </button>
          )}

          {unlockedCount > 0 && (
            <button
              onClick={() => onSellBulk()}
              className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-xs font-semibold text-rose-200 transition hover:bg-rose-900/40"
            >
              <Trash2 className="h-4 w-4" />
              Tout vendre ({unlockedCount})
            </button>
          )}
        </div>
      </section>

      {isFull && (
        <div className="rounded-2xl border border-rose-400/35 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-200">
          Inventaire plein ({items.length}/{inventoryCapacity} armes) : vendez des skins ou cliquez sur{' '}
          <strong className="text-white">Augmenter</strong> pour ajouter +{STORAGE_UPGRADE_STEP} places.
        </div>
      )}

      {items.length > 0 && (
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-accent-500/15 bg-surface-panel/80 p-3 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setRarityFilter('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                rarityFilter === 'all'
                  ? 'bg-accent-400 text-accent-950'
                  : 'border border-accent-500/15 bg-surface-base text-accent-200/70 hover:text-accent-100'
              }`}
            >
              Tous ({items.length})
            </button>
            {[...RARITY_ORDER].reverse().map((rid) => {
              const r = RARITIES[rid];
              const count = items.filter((i) => i.rarity === rid).length;
              const active = rarityFilter === rid;
              return (
                <button
                  key={rid}
                  onClick={() => setRarityFilter(rid)}
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition"
                  style={{
                    borderColor: active ? r.color : 'var(--card-border)',
                    backgroundColor: active ? r.badgeBg : 'var(--surface-base)',
                    color: active ? r.color : 'var(--accent-100)',
                  }}
                >
                  {r.label} ({count})
                </button>
              );
            })}
          </div>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-xl border border-accent-500/20 bg-surface-base px-3 py-2 text-xs font-semibold text-accent-100 focus:border-accent-400 focus:outline-none"
          >
            <option value="recent">Tri : Plus récents</option>
            <option value="value_desc">Tri : Valeur décroissante</option>
            <option value="rarity_desc">Tri : Rareté décroissante</option>
          </select>
        </div>
      )}

      {items.length === 0 ? (
        <div className="vault-card flex flex-col items-center justify-center rounded-3xl p-14 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-500/25 bg-accent-500/10 text-accent-400">
            <PackageOpen className="h-8 w-8" />
          </div>
          <h3 className="mt-4 font-display text-xl font-bold text-accent-50">
            Votre inventaire est vide
          </h3>
          <p className="mt-1.5 max-w-md text-xs text-accent-100/60 sm:text-sm">
            Achetez et ouvrez des caisses dans la boutique pour collectionner des skins de rareté Commune à Secret.
          </p>
          <button
            onClick={onGoToShop}
            className="mt-6 rounded-xl bg-gradient-to-r from-accent-400 to-accent2-300 px-6 py-3 text-sm font-bold text-accent-950 shadow-[0_0_24px_var(--card-glow)] transition hover:brightness-105"
          >
            Explorer les caisses
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filteredItems.map((item) => {
              const rarity = RARITIES[item.rarity];
              const isSecret = item.rarity === 'secret';
              const isKnife = item.weaponClass === 'lame';
              const isEquipped = isKnife
                ? item.instanceId === equippedKnifeId
                : item.instanceId === equippedWeaponId;

              return (
                <motion.div
                  layout
                  key={item.instanceId}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.88 }}
                  className={`relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-surface-card/95 p-4 ${
                    isEquipped ? 'ring-2 ring-emerald-400/60' : ''
                  }`}
                  style={{
                    borderColor: isEquipped ? '#34d399' : rarity.borderColor,
                    boxShadow: isSecret ? `0 0 26px ${rarity.glowColor}` : undefined,
                  }}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1 ${isSecret ? 'secret-prism-border' : ''}`}
                    style={!isSecret ? { backgroundColor: rarity.color } : undefined}
                  />

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: rarity.badgeBg, color: rarity.color }}
                    >
                      {isSecret && <Sparkles className="h-2.5 w-2.5" />}
                      {rarity.label}
                    </span>

                    <button
                      onClick={() => onToggleLock(item.instanceId)}
                      title={item.locked ? 'Déverrouiller le skin' : 'Verrouiller le skin'}
                      className={`rounded-lg border p-1.5 transition ${
                        item.locked
                          ? 'border-accent-400/50 bg-accent-500/20 text-accent-300'
                          : 'border-accent-500/15 bg-black/25 text-accent-200/45 hover:text-accent-200'
                      }`}
                    >
                      {item.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div className="group my-3 flex items-center justify-center rounded-xl bg-surface-base/55 px-3 py-3">
                    <WeaponSilhouette
                      weaponClass={item.weaponClass}
                      accentColor={rarity.color}
                      swatches={item.swatches}
                      image={item.image}
                      alt={`${item.weaponName} ${item.name}`}
                      size="md"
                      onInspect={() => inspectWeapon(item)}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[10px] text-accent-200/55">
                      <span>{WEAPON_CLASS_LABELS[item.weaponClass]}</span>
                      <span className="font-mono-num">Float {item.floatVal.toFixed(3)}</span>
                    </div>
                    <div className="mt-0.5 truncate font-display text-sm font-bold text-accent-50">
                      {item.weaponName} | {item.name}
                    </div>
                    <div className="text-[11px] text-accent-300/65">{item.wear}</div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-accent-500/10 pt-3">
                      <span className="font-mono-num text-sm font-bold text-accent-300">
                        {formatCredits(item.value)}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onSendToUpgrader(item.instanceId)}
                          title="Tenter un Upgrade avec ce skin"
                          className="rounded-lg border border-accent-500/25 bg-accent-500/10 p-1.5 text-accent-300 transition hover:bg-accent-500/25"
                        >
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </button>
                        {onSendToContract && !item.locked && item.rarity !== 'secret' && (
                          <button
                            onClick={() => onSendToContract(item.instanceId)}
                            title="Envoyer vers un Contrat d’échange"
                            className="rounded-lg border border-accent-500/25 bg-accent-500/10 p-1.5 text-accent-300 transition hover:bg-accent-500/25"
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          disabled={item.locked}
                          onClick={() => onSellItem(item.instanceId)}
                          className="flex items-center gap-1 rounded-lg border border-accent-400/30 bg-accent-500/15 px-2.5 py-1.5 text-[11px] font-bold text-accent-200 transition hover:bg-accent-400 hover:text-accent-950 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <Coins className="h-3 w-3" />
                          Vendre
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onEquipItem(item.instanceId)}
                      title={
                        isKnife
                          ? 'Équiper ou retirer du slot 2 (Touche 2)'
                          : 'Équiper ou retirer du slot 1 (Touche 1)'
                      }
                      className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                        isEquipped
                          ? isKnife
                            ? 'border-amber-400/55 bg-amber-500/20 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.22)]'
                            : 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.22)]'
                          : 'border-accent-400/35 bg-accent-500/15 text-accent-100 hover:border-accent-300 hover:bg-accent-400 hover:text-accent-950'
                      }`}
                    >
                      {isEquipped ? (
                        <>
                          <Check className={`h-3.5 w-3.5 ${isKnife ? 'text-amber-300' : 'text-emerald-300'}`} />
                          {isKnife ? 'Équipé (Slot 2 • Couteau)' : 'Équipée (Slot 1 • Arme)'}
                        </>
                      ) : (
                        <>
                          <Crosshair className="h-3.5 w-3.5" />
                          Équiper
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
};
