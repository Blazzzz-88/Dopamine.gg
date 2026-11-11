import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { CASE_CATEGORIES, CRATES } from '../data/catalog';
import { CategoryId, CrateDefinition } from '../types/casino';
import { CaseCard } from './CaseCard';
import { TypewriterText } from './TypewriterText';

interface CategorySectionProps {
  onSelectCrate: (crate: CrateDefinition) => void;
}

export const CategorySection: React.FC<CategorySectionProps> = ({ onSelectCrate }) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | CategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const visibleCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return CASE_CATEGORIES.filter((cat) =>
      selectedCategory === 'all' ? true : cat.id === selectedCategory
    )
      .map((cat) => {
        const crates = CRATES.filter((c) => {
          if (c.categoryId !== cat.id) return false;
          if (!q) return true;
          const matchCrate =
            c.name.toLowerCase().includes(q) ||
            c.subtitle.toLowerCase().includes(q) ||
            c.themeTag.toLowerCase().includes(q);
          const matchSkin = c.skins.some(
            (s) =>
              s.name.toLowerCase().includes(q) ||
              s.weaponName.toLowerCase().includes(q)
          );
          return matchCrate || matchSkin;
        });
        return { category: cat, crates };
      })
      .filter((entry) => entry.crates.length > 0);
  }, [selectedCategory, searchQuery]);

  return (
    <div id="categories-section" className="space-y-8">
      <div className="flex flex-col gap-4 rounded-2xl border border-accent-500/15 bg-surface-panel/85 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`relative rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
              selectedCategory === 'all'
                ? 'text-accent-950'
                : 'text-accent-100/70 hover:text-accent-200'
            }`}
          >
            {selectedCategory === 'all' && (
              <motion.span
                layoutId="cat-filter-pill"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className="absolute inset-0 rounded-xl bg-accent-400"
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Toutes ({CRATES.length})
            </span>
          </button>

          {CASE_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat.id;
            const count = CRATES.filter((c) => c.categoryId === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`relative rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
                  active
                    ? 'text-accent-950'
                    : 'text-accent-100/70 hover:text-accent-200'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="cat-filter-pill"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                    className="absolute inset-0 rounded-xl bg-accent-400"
                  />
                )}
                <span className="relative z-10">
                  {cat.name} <span className="opacity-70">({count})</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent-400/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Chercher une caisse ou un skin..."
            className="w-full rounded-xl border border-accent-500/20 bg-surface-base py-2 pl-9 pr-8 text-xs text-accent-50 placeholder:text-accent-200/35 focus:border-accent-400/60 focus:outline-none sm:text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-accent-300/60 hover:text-accent-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {visibleCategories.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-accent-500/15 bg-surface-panel/60 p-12 text-center"
          >
            <p className="text-sm text-accent-200/70">
              Aucune caisse ni skin ne correspond à « {searchQuery} ».
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-4 rounded-xl border border-accent-400/30 bg-accent-500/10 px-4 py-2 text-xs font-semibold text-accent-300 hover:bg-accent-500/20"
            >
              Réinitialiser les filtres
            </button>
          </motion.div>
        ) : (
          visibleCategories.map(({ category, crates }, catIdx) => (
            <motion.section
              key={category.id}
              layout
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.36, delay: catIdx * 0.08 }}
              className="space-y-4"
            >
              <div className="flex flex-col justify-between gap-2 border-l-2 border-accent-400/70 pl-4 sm:flex-row sm:items-end">
                <div>
                  <span className="font-mono-num text-[11px] font-bold tracking-widest text-accent-400">
                    {category.badge}
                  </span>
                  <h2 className="font-display text-2xl font-bold text-accent-50">
                    {category.name}
                  </h2>
                  <p className="mt-0.5 max-w-2xl text-xs text-accent-100/70 sm:text-sm">
                    <TypewriterText
                      persistKey={`category-${category.id}`}
                      text={category.description}
                      delayMs={180 + catIdx * 140}
                      speedMs={40}
                      triggerOnView={true}
                    />
                  </p>
                </div>
                <span className="self-start rounded-full border border-accent-500/20 bg-surface-panel/70 px-3 py-1 font-mono-num text-xs font-semibold text-accent-300 sm:self-auto">
                  {crates.length} caisses • {crates.reduce((acc, c) => acc + c.skins.length, 0)} skins
                </span>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {crates.map((crate, idx) => (
                  <CaseCard
                    key={crate.id}
                    crate={crate}
                    index={idx}
                    onSelect={onSelectCrate}
                  />
                ))}
              </div>
            </motion.section>
          ))
        )}
      </AnimatePresence>
    </div>
  );
};
