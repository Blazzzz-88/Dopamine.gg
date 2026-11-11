import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Coins, RotateCcw, Sparkles, X } from 'lucide-react';
import { RARITIES, WEAPON_CLASS_LABELS } from '../data/rarities';
import { InventoryItem } from '../types/casino';
import { formatCredits } from '../utils/rng';
import { WeaponSilhouette } from './WeaponSilhouette';
import { useWeaponInspector } from '../context/WeaponInspectorContext';

interface DropRevealModalProps {
  items: InventoryItem[];
  cratePrice: number;
  canReopen: boolean;
  onKeepAll: () => void;
  onSellItem: (instanceId: string) => void;
  onSellAll: () => void;
  onReopen: () => void;
}

export const DropRevealModal: React.FC<DropRevealModalProps> = ({
  items,
  cratePrice,
  canReopen,
  onKeepAll,
  onSellItem,
  onSellAll,
  onReopen,
}) => {
  const { inspectWeapon } = useWeaponInspector();
  if (items.length === 0) return null;

  const totalValue = items.reduce((sum, it) => sum + it.value, 0);
  const highestOrder = Math.max(...items.map((it) => RARITIES[it.rarity].order));
  const highlightItem =
    items.find((it) => RARITIES[it.rarity].order === highestOrder) ?? items[0];
  const highlightRarity = RARITIES[highlightItem.rarity];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          className="relative w-full max-w-3xl overflow-hidden rounded-3xl border bg-surface-panel p-6 shadow-2xl sm:p-8"
          style={{
            borderColor: highlightRarity.borderColor,
            boxShadow: `0 0 80px -15px ${highlightRarity.glowColor}`,
          }}
        >
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: [0.22, 0.4, 0.22] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="pointer-events-none absolute left-1/2 top-0 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
            style={{ background: highlightRarity.color }}
          />

          <button
            onClick={onKeepAll}
            className="absolute right-4 top-4 rounded-xl border border-accent-500/20 bg-surface-base/70 p-2 text-accent-200/70 transition hover:text-accent-100"
            title="Garder dans l’inventaire"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative z-10 text-center">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest"
              style={{
                borderColor: highlightRarity.borderColor,
                backgroundColor: highlightRarity.badgeBg,
                color: highlightRarity.color,
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {items.length > 1
                ? `${items.length} skins obtenus !`
                : `Tirage ${highlightRarity.label} !`}
            </span>

            <h3 className="mt-3 font-display text-2xl font-bold text-accent-50 sm:text-3xl">
              {items.length === 1
                ? `${highlightItem.weaponName} | ${highlightItem.name}`
                : 'Résumé de l’ouverture'}
            </h3>
            <p className="mt-1 text-xs text-accent-200/60">
              Valeur totale estimée :{' '}
              <span className="font-mono-num font-bold text-accent-300">
                {formatCredits(totalValue)}
              </span>
            </p>
          </div>

          <div
            className={`relative z-10 mt-6 grid gap-4 ${
              items.length === 1
                ? 'mx-auto max-w-md grid-cols-1'
                : items.length === 2
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'grid-cols-1 sm:grid-cols-3'
            }`}
          >
            {items.map((item, idx) => {
              const r = RARITIES[item.rarity];
              const isSecret = item.rarity === 'secret';
              return (
                <motion.div
                  key={item.instanceId}
                  initial={{ opacity: 0, y: 16, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: idx * 0.08 }}
                  className="relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-surface-card p-4"
                  style={{ borderColor: r.borderColor }}
                >
                  <div
                    className={`absolute inset-x-0 top-0 h-1 ${isSecret ? 'secret-prism-border' : ''}`}
                    style={!isSecret ? { backgroundColor: r.color } : undefined}
                  />

                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                      style={{ backgroundColor: r.badgeBg, color: r.color }}
                    >
                      {r.label}
                    </span>
                    <span className="font-mono-num text-[11px] text-accent-200/55">
                      Float {item.floatVal.toFixed(4)}
                    </span>
                  </div>

                  <div className="group my-4 flex flex-col items-center">
                    <WeaponSilhouette
                      weaponClass={item.weaponClass}
                      accentColor={r.color}
                      swatches={item.swatches}
                      image={item.image}
                      alt={`${item.weaponName} ${item.name}`}
                      size={items.length === 1 ? 'lg' : 'md'}
                      onInspect={() => inspectWeapon(item)}
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-accent-300/70">
                      {WEAPON_CLASS_LABELS[item.weaponClass]} • {item.wear}
                    </div>
                    <div className="font-display text-base font-bold text-accent-50">
                      {item.weaponName} | {item.name}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-accent-100/55">
                      {item.tagline}
                    </p>

                    <div className="mt-3 flex items-center justify-between border-t border-accent-500/10 pt-3">
                      <span className="font-mono-num text-sm font-bold text-accent-300">
                        {formatCredits(item.value)}
                      </span>
                      {items.length > 1 && (
                        <button
                          onClick={() => onSellItem(item.instanceId)}
                          className="flex items-center gap-1 rounded-lg border border-accent-500/25 bg-accent-500/10 px-2.5 py-1 text-[11px] font-semibold text-accent-200 transition hover:bg-accent-500/25"
                        >
                          <Coins className="h-3 w-3" />
                          Vendre
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="relative z-10 mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onKeepAll}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent-400 to-accent2-300 px-5 py-2.5 text-sm font-bold text-accent-950 shadow-[0_0_24px_var(--card-glow)] transition hover:brightness-105"
            >
              <Check className="h-4 w-4 stroke-[2.5]" />
              Garder dans l’inventaire
            </button>

            <button
              onClick={onSellAll}
              className="flex items-center gap-2 rounded-xl border border-accent-400/35 bg-accent-500/15 px-5 py-2.5 text-sm font-semibold text-accent-200 transition hover:bg-accent-500/25"
            >
              <Coins className="h-4 w-4 text-accent-400" />
              Tout vendre (+{formatCredits(totalValue)})
            </button>

            {canReopen && (
              <button
                onClick={onReopen}
                className="flex items-center gap-2 rounded-xl border border-accent-500/20 bg-surface-card px-4 py-2.5 text-sm font-semibold text-accent-100/80 transition hover:border-accent-400/40 hover:text-accent-100"
              >
                <RotateCcw className="h-4 w-4" />
                Rouvrir ({formatCredits(cratePrice * items.length)})
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
