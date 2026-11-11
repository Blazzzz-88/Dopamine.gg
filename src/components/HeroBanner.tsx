import React from 'react';
import { motion } from 'framer-motion';
import { Layers, ShieldAlert, Sparkles, ArrowDownRight } from 'lucide-react';
import { RARITIES, RARITY_ORDER } from '../data/rarities';
import { formatProbability } from '../utils/rng';
import { TypewriterText } from './TypewriterText';

interface HeroBannerProps {
  onExploreClick: () => void;
  onOpenFeaturedCrate: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  onExploreClick,
  onOpenFeaturedCrate,
}) => {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-accent-500/25 bg-gradient-to-br from-surface-elevated via-surface-panel to-surface-base p-6 shadow-[0_24px_70px_-20px_var(--card-glow)] sm:p-10">
      {/* Animated ambient themed orbs & holographic sweep */}
      <motion.div
        animate={{ scale: [1, 1.16, 1], x: [0, -18, 0], y: [0, 14, 0], opacity: [0.22, 0.38, 0.22] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent-500/25 blur-[90px]"
      />
      <motion.div
        animate={{ scale: [1, 1.18, 1], x: [0, 20, 0], y: [0, -12, 0], opacity: [0.16, 0.28, 0.16] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
        className="pointer-events-none absolute -bottom-24 left-12 h-64 w-64 rounded-full bg-accent2-400/20 blur-[80px]"
      />
      <div className="animate-scanner-beam pointer-events-none absolute inset-y-0 left-0 w-48 bg-gradient-to-r from-transparent via-accent-400/10 to-transparent" />

      <div className="relative z-10 grid items-center gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent-400/30 bg-accent-500/10 px-3 py-1 text-xs font-semibold text-accent-300 shadow-[0_0_18px_-6px_var(--card-glow)]"
          >
            <motion.span
              animate={{ rotate: [0, 12, -12, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-flex"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
            </motion.span>
            EXPÉRIENCE 100% FICTIVE • AUCUN ARGENT RÉEL
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.06 }}
            className="font-display text-3xl font-bold tracking-tight text-accent-50 sm:text-4xl lg:text-[42px] lg:leading-[1.12]"
          >
            L’arsenal virtuel nouvelle génération,{' '}
            <span className="animate-gradient-x bg-gradient-to-r from-accent-300 via-accent2-300 to-accent-400 bg-clip-text text-transparent">
              épuré &amp; animé.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="mt-4 min-h-[4.6rem] max-w-2xl text-sm leading-relaxed text-accent-100/75 sm:text-base"
          >
            <TypewriterText
              persistKey="hero-intro"
              delayMs={260}
              speedMs={38}
              triggerOnView={false}
              segments={[
                { text: 'Explorez ' },
                { text: '3 catégories distinctes', strong: true, className: 'text-accent-50' },
                { text: ' et ' },
                { text: '6 caisses thématiques', strong: true, className: 'text-accent-50' },
                { text: ' contenant chacune ' },
                { text: '22 skins d’armes fictives', strong: true, className: 'text-accent-200' },
                { text: '. Tentez de décrocher les pièces ' },
                { text: 'Légendaires (1%)', italic: true, className: 'text-amber-300' },
                { text: ' ou l’introuvable palier ' },
                { text: 'Secret (0,025%)', italic: true, className: 'text-rose-300' },
                { text: ' et affrontez des vagues en Zombie FPS pour remporter des crédits.' },
              ]}
            />
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-6 flex flex-wrap items-center gap-3"
          >
            <motion.button
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={onExploreClick}
              className="animate-aura-pulse group relative overflow-hidden rounded-xl bg-gradient-to-r from-accent-400 to-accent2-300 px-5 py-3 text-sm font-bold text-accent-950 transition hover:brightness-105"
            >
              <span className="sheen-overlay relative z-10 flex items-center gap-2">
                <Layers className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
                Parcourir les 3 catégories
              </span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={onOpenFeaturedCrate}
              className="group relative flex items-center gap-2 overflow-hidden rounded-xl border border-accent-400/30 bg-accent-950/55 px-5 py-3 text-sm font-semibold text-accent-200 transition hover:border-accent-400/60 hover:bg-accent-900/45"
            >
              <Sparkles className="h-4 w-4 text-accent-400 transition-transform duration-300 group-hover:rotate-45 group-hover:scale-110" />
              Ouvrir « Abysse Prismatique »
              <ArrowDownRight className="h-4 w-4 opacity-70 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
            </motion.button>
          </motion.div>
        </div>

        {/* Right: Clean Architectural Rarity Ladder */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.15 }}
          className="relative overflow-hidden rounded-2xl border border-accent-500/20 bg-surface-base/85 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] lg:col-span-5"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-accent-300/85">
              Échelle officielle des raretés
            </span>
            <span className="font-mono-num text-[11px] text-accent-200/50">
              22 skins / caisse
            </span>
          </div>

          <div className="space-y-2.5">
            {RARITY_ORDER.map((rid, idx) => {
              const r = RARITIES[rid];
              return (
                <motion.div
                  key={rid}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: 0.22 + idx * 0.08 }}
                  whileHover={{ x: 4, scale: 1.01 }}
                  className="relative overflow-hidden rounded-xl border px-3 py-2 transition-colors"
                  style={{ borderColor: r.borderColor, backgroundColor: r.bgTint }}
                >
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.85, delay: 0.38 + idx * 0.09, ease: 'easeOut' }}
                    style={{
                      transformOrigin: 'left',
                      width: `${Math.max(4, r.probability)}%`,
                      backgroundColor: r.color,
                    }}
                    className="pointer-events-none absolute inset-y-0 left-0 opacity-[0.09]"
                  />
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <motion.span
                        animate={{ scale: [1, 1.28, 1], opacity: [0.85, 1, 0.85] }}
                        transition={{ duration: 2.2, repeat: Infinity, delay: idx * 0.28 }}
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: r.color,
                          boxShadow: `0 0 12px ${r.color}`,
                        }}
                      />
                      <div>
                        <div className="text-xs font-bold" style={{ color: r.color }}>
                          {r.label}
                        </div>
                        <div className="text-[11px] text-accent-100/55">{r.difficultyLabel}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono-num text-xs font-bold text-accent-50">
                        {formatProbability(r.probability)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
};
