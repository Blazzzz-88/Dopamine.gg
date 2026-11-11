import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3, ShieldCheck, History, RotateCcw, Award, BookOpen, Box, Eye, Sparkles, Crosshair } from 'lucide-react';
import { RARITIES, RARITY_ORDER } from '../data/rarities';
import { CRATES, CASE_CATEGORIES } from '../data/catalog';
import { DropHistoryItem, PlayerStats } from '../types/casino';
import { formatCredits, formatProbability } from '../utils/rng';
import { TypewriterText } from './TypewriterText';

interface StatsAndGuideViewProps {
  stats: PlayerStats;
  history: DropHistoryItem[];
  onResetSession: () => void;
}

export const StatsAndGuideView: React.FC<StatsAndGuideViewProps> = ({
  stats,
  history,
  onResetSession,
}) => {
  const playerDrops = history.filter((h) => h.isPlayer);
  const netBalance = stats.totalWonValue - stats.totalSpent;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <section className="vault-card flex flex-col justify-between gap-4 rounded-3xl p-6 sm:flex-row sm:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-accent-500/25 bg-accent-500/10 px-3 py-1 text-xs font-semibold text-accent-300">
            <BarChart3 className="h-3.5 w-3.5" />
            TRANSPARENCE &amp; STATISTIQUES
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold text-accent-50 sm:text-3xl">
            Système de Raretés &amp; Historique
          </h1>
          <p className="mt-1 text-xs text-accent-100/70 sm:text-sm">
            <TypewriterText
              persistKey="stats-header"
              delayMs={160}
              speedMs={38}
              triggerOnView={false}
              text={`Architecture complète : ${CASE_CATEGORIES.length} catégories, ${CRATES.length} caisses thématiques et ${CRATES.reduce((sum, c) => sum + c.skins.length, 0)} skins d’armes fictives uniques.`}
            />
          </p>
        </div>

        <button
          onClick={onResetSession}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-accent-500/20 bg-surface-base px-4 py-2.5 text-xs font-semibold text-accent-200/75 transition hover:border-rose-400/40 hover:text-rose-200 sm:self-auto"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Réinitialiser la session fictive
        </button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Caisses ouvertes', val: stats.casesOpened, color: 'text-accent-50' },
          { label: 'Total misé (fictif)', val: formatCredits(stats.totalSpent), color: 'text-accent-200' },
          {
            label: 'Bilan estimé',
            val: `${netBalance >= 0 ? '+' : ''}${formatCredits(netBalance)}`,
            color: netBalance >= 0 ? 'text-accent-300' : 'text-rose-300',
          },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.06 }}
            whileHover={{ y: -3 }}
            className="vault-card vault-card-hover rounded-2xl p-5"
          >
            <span className="text-xs font-medium text-accent-200/55">{card.label}</span>
            <div className={`mt-1 font-mono-num text-2xl font-bold ${card.color}`}>
              {card.val}
            </div>
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18 }}
          whileHover={{ y: -3 }}
          className="vault-card vault-card-hover rounded-2xl p-5"
        >
          <span className="text-xs font-medium text-accent-200/55">Meilleur tirage</span>
          <div className="mt-1 flex items-center gap-1.5 font-mono-num text-xl font-bold text-amber-300">
            <Award className="h-5 w-5 shrink-0" />
            {stats.bestDropValue > 0 ? formatCredits(stats.bestDropValue) : '—'}
          </div>
          {stats.bestDropName && (
            <div className="mt-0.5 truncate text-[11px] text-accent-100/60">
              {stats.bestDropName}
            </div>
          )}
        </motion.div>
      </div>

      {/* Explication interactive du fonctionnement du casino */}
      <section className="vault-card rounded-3xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-accent-400" />
          <h2 className="font-display text-lg font-bold text-accent-50">
            Comment fonctionne le casino Dopamine.gg ?
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Box,
              title: '1. Ouverture de caisses',
              delay: 80,
              desc: 'Choisissez parmi 6 caisses à thème, lancez la roulette animée et découvrez la rareté exacte tirée par le générateur.',
            },
            {
              icon: Eye,
              title: '2. Modèles 3D & Inventaire',
              delay: 260,
              desc: 'Cliquez sur n’importe quelle arme pour la tourner à 360° en 3D, gérez vos 25 emplacements extensibles et équipez votre favori.',
            },
            {
              icon: Sparkles,
              title: '3. Upgrader Orbital',
              delay: 440,
              desc: 'Risquez un skin de votre inventaire sur la roue probabiliste pour viser une arme bien plus rare avec multiplicateur.',
            },
            {
              icon: Crosshair,
              title: '4. Arène Zombie FPS',
              delay: 620,
              desc: 'Utilisez votre arme 3D en vue FPS (tir, visée, rechargement, inspection T) pour éliminer des vagues et extraire des crédits.',
            },
          ].map((step, idx) => {
            const StepIcon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: idx * 0.07 }}
                className="rounded-2xl border border-accent-500/15 bg-surface-base/65 p-4"
              >
                <div className="mb-2 flex items-center gap-2 text-xs font-bold text-accent-300">
                  <StepIcon className="h-4 w-4 text-accent-400" />
                  {step.title}
                </div>
                <p className="text-xs leading-relaxed text-accent-100/70">
                  <TypewriterText
                    persistKey={`guide-step-${idx}`}
                    text={step.desc}
                    delayMs={step.delay}
                    speedMs={36}
                    triggerOnView={true}
                  />
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="vault-card rounded-3xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-accent-400" />
          <h2 className="font-display text-lg font-bold text-accent-50">
            Probabilités officielles &amp; vos tirages obtenus
          </h2>
        </div>

        <div className="space-y-3">
          {RARITY_ORDER.map((rid) => {
            const r = RARITIES[rid];
            const count = stats.rarityCounts[rid] ?? 0;
            const pctPlayer =
              stats.casesOpened > 0 ? ((count / stats.casesOpened) * 100).toFixed(2) : '0.00';

            return (
              <div
                key={rid}
                className="rounded-2xl border p-4"
                style={{ borderColor: r.borderColor, backgroundColor: r.bgTint }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: r.color, boxShadow: `0 0 10px ${r.color}` }}
                    />
                    <div>
                      <span className="font-display text-sm font-bold" style={{ color: r.color }}>
                        {r.label}
                      </span>
                      <span className="ml-2 text-xs text-accent-100/60">
                        — {r.difficultyLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-5 font-mono-num text-xs">
                    <span className="text-accent-100/75">
                      Taux officiel : <strong className="text-accent-50">{formatProbability(r.probability)}</strong>
                    </span>
                    <span className="text-accent-200">
                      Vos drops : <strong>{count}</strong> ({pctPlayer}%)
                    </span>
                  </div>
                </div>

                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-black/40">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${r.probability}%` }}
                    transition={{ duration: 0.75, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: r.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="vault-card rounded-3xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-accent-400" />
            <h2 className="font-display text-lg font-bold text-accent-50">
              Journal de vos tirages récents ({playerDrops.length})
            </h2>
          </div>
        </div>

        {playerDrops.length === 0 ? (
          <p className="text-xs text-accent-100/55">
            Aucun tirage enregistré pour l’instant. Ouvrez votre première caisse pour voir l’historique ici.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-accent-500/15 text-accent-200/55">
                  <th className="py-2.5 pr-4">Skin obtenu</th>
                  <th className="py-2.5 pr-4">Caisse</th>
                  <th className="py-2.5 pr-4">Rareté</th>
                  <th className="py-2.5 pr-4">Valeur</th>
                  <th className="py-2.5">Empreinte RNG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-accent-500/10">
                {playerDrops.slice(0, 20).map((d) => {
                  const r = RARITIES[d.rarity];
                  return (
                    <tr key={d.id} className="hover:bg-white/[0.02]">
                      <td className="py-2.5 pr-4 font-semibold text-accent-50">
                        {d.weaponName} | {d.skinName}
                      </td>
                      <td className="py-2.5 pr-4 text-accent-100/70">{d.crateName}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase"
                          style={{ backgroundColor: r.badgeBg, color: r.color }}
                        >
                          {r.label}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-mono-num font-bold text-accent-300">
                        {formatCredits(d.value)}
                      </td>
                      <td className="py-2.5 font-mono-num text-[11px] text-accent-200/45">
                        #{d.seedHash}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </motion.div>
  );
};
