import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  Coins,
  Crosshair,
  Flame,
  Play,
  ShieldCheck,
  Skull,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { DailyChallengesState, ZombieChallengeCategory } from '../types/casino';
import { formatCredits } from '../utils/rng';
import { soundEngine } from '../utils/sound';
import {
  CHALLENGE_REWARD_CREDITS,
  DAILY_BONUS_CREDITS,
  DAILY_CHALLENGES_LIMIT,
  ensureTodayChallenges,
  formatChallengeProgressValue,
  formatCountdownMs,
  getChallengeDefinition,
  getMsUntilNextDay,
} from '../utils/zombieChallenges';

interface ChallengesModalProps {
  isOpen: boolean;
  dailyChallenges: DailyChallengesState;
  balance: number;
  onClose: () => void;
  onPlayZombie: () => void;
  onSyncDateRollover?: () => void;
}

const CATEGORY_ICON: Record<
  ZombieChallengeCategory,
  React.ComponentType<{ className?: string }>
> = {
  combat: Crosshair,
  survie: Flame,
  maitrise: ShieldCheck,
};

export const ChallengesModal: React.FC<ChallengesModalProps> = ({
  isOpen,
  dailyChallenges,
  balance,
  onClose,
  onPlayZombie,
  onSyncDateRollover,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    const currentNow = Date.now();
    setNowMs(currentNow);
    onSyncDateRollover?.();

    const timer = window.setInterval(() => {
      const next = Date.now();
      setNowMs(next);
    }, 1000);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose, onSyncDateRollover]);

  const activeState = ensureTodayChallenges(dailyChallenges, nowMs);
  const completedCount = activeState.challenges.filter((c) => c.completed).length;
  const allCompleted = completedCount === DAILY_CHALLENGES_LIMIT;
  const countdown = formatCountdownMs(getMsUntilNextDay(nowMs));
  const earnedToday =
    completedCount * CHALLENGE_REWARD_CREDITS +
    (activeState.bonusClaimed ? DAILY_BONUS_CREDITS : 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Défis quotidiens du Mode Zombie"
            initial={{ scale: 0.94, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="vault-card relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl p-6 shadow-2xl sm:p-7"
          >
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                onClose();
              }}
              aria-label="Fermer les défis"
              className="absolute right-4 top-4 rounded-xl border border-accent-500/20 bg-surface-base/75 p-2 text-accent-200/70 transition hover:text-accent-100"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/35 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
              <Trophy className="h-3.5 w-3.5" />
              DÉFIS QUOTIDIENS • MODE ZOMBIE
            </div>

            <div className="mt-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h2 className="font-display text-2xl font-bold text-accent-50">
                  Défis du jour
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-accent-100/70">
                  Réalisez les <strong>3 défis quotidiens</strong> en Mode Zombie. Chaque défi
                  rapporte <strong className="text-emerald-300">+{formatCredits(CHALLENGE_REWARD_CREDITS)}</strong> et
                  compléter les 3 débloque un bonus de <strong className="text-amber-300">+{formatCredits(DAILY_BONUS_CREDITS)}</strong> !
                </p>
              </div>
              <div className="shrink-0 rounded-xl border border-accent-500/20 bg-surface-base/90 px-3 py-2 text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-accent-200/55">
                  Solde actuel
                </div>
                <div className="font-mono-num text-sm font-bold text-accent-300">
                  {formatCredits(balance)}
                </div>
              </div>
            </div>

            {/* Daily Limit & Countdown Info */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-accent-500/15 bg-surface-panel/90 px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-accent-500/15 px-2 py-0.5 font-mono-num text-[11px] font-bold text-accent-300">
                  Max {DAILY_CHALLENGES_LIMIT} / jour
                </span>
                <span className="text-accent-100/80">
                  Progression :{' '}
                  <strong className={allCompleted ? 'text-emerald-300' : 'text-accent-50'}>
                    {completedCount} / {DAILY_CHALLENGES_LIMIT} complétés
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono-num text-[11px] text-accent-200/75">
                <Clock className="h-3.5 w-3.5 text-accent-300" />
                <span>Renouvellement dans {countdown}</span>
              </div>
            </div>

            {/* Bonus 3/3 Banner */}
            <div
              className={`mt-4 rounded-2xl border p-4 transition ${
                activeState.bonusClaimed
                  ? 'border-emerald-400/45 bg-emerald-500/10'
                  : 'border-amber-400/35 bg-gradient-to-r from-amber-500/12 via-surface-panel to-surface-panel'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                      activeState.bonusClaimed
                        ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                        : 'border-amber-400/40 bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {activeState.bonusClaimed ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Sparkles className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="font-display text-sm font-bold text-accent-50">
                      Récompense Finale ({completedCount}/{DAILY_CHALLENGES_LIMIT} défis)
                    </div>
                    <div className="text-[11px] text-accent-100/70">
                      {activeState.bonusClaimed
                        ? 'Tous les défis du jour sont complétés ! Revenez demain pour de nouveaux défis.'
                        : 'Complétez les 3 défis quotidiens pour remporter le bonus spécial.'}
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono-num text-xs font-extrabold ${
                    activeState.bonusClaimed
                      ? 'bg-emerald-400/20 text-emerald-300'
                      : 'bg-amber-400/20 text-amber-300'
                  }`}
                >
                  <Coins className="h-3.5 w-3.5" />
                  {activeState.bonusClaimed
                    ? `+${formatCredits(DAILY_BONUS_CREDITS)} reçus`
                    : `+${formatCredits(DAILY_BONUS_CREDITS)}`}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {activeState.challenges.map((c, idx) => (
                  <div
                    key={c.id}
                    className={`h-1.5 rounded-full transition-all ${
                      c.completed
                        ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                        : 'bg-white/10'
                    }`}
                    aria-label={`Défi ${idx + 1} ${c.completed ? 'terminé' : 'en cours'}`}
                  />
                ))}
              </div>
            </div>

            {/* 3 Daily Challenges List */}
            <div className="mt-4 space-y-3">
              {activeState.challenges.map((item) => {
                const def = getChallengeDefinition(item.id);
                if (!def) return null;
                const Icon = CATEGORY_ICON[def.category];
                const pct = Math.min(100, Math.round((item.progress / def.target) * 100));

                return (
                  <div
                    key={def.id}
                    data-testid={`challenge-card-${def.id}`}
                    className={`rounded-2xl border p-4 transition ${
                      item.completed
                        ? 'border-emerald-400/40 bg-emerald-500/8'
                        : 'border-accent-500/20 bg-surface-panel/90'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                            item.completed
                              ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                              : 'border-rose-400/30 bg-rose-500/15 text-rose-300'
                          }`}
                        >
                          {item.completed ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <Icon className="h-5 w-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-display text-sm font-bold text-accent-50">
                              {def.title}
                            </h3>
                            <span className="rounded-md border border-white/10 bg-surface-base/80 px-2 py-0.5 text-[10px] font-semibold text-accent-200/75">
                              {def.scopeLabel}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-accent-100/75">{def.description}</p>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono-num text-xs font-extrabold ${
                            item.completed
                              ? 'bg-emerald-400/20 text-emerald-300'
                              : 'bg-accent-400/15 text-accent-300'
                          }`}
                        >
                          {item.completed
                            ? `✓ +${formatCredits(def.reward)}`
                            : `+${formatCredits(def.reward)}`}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="font-mono-num font-semibold text-accent-100/80">
                          {formatChallengeProgressValue(def, item.progress)}
                        </span>
                        <span
                          className={`font-mono-num font-bold ${
                            item.completed ? 'text-emerald-300' : 'text-accent-300'
                          }`}
                        >
                          {item.completed ? 'Terminé' : `${pct}%`}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-base">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            item.completed
                              ? 'bg-emerald-400'
                              : 'bg-gradient-to-r from-rose-400 via-amber-400 to-accent-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer Info & CTA */}
            <div className="mt-5 flex flex-col justify-between gap-3 border-t border-accent-500/15 pt-4 sm:flex-row sm:items-center">
              <div className="text-[11px] leading-relaxed text-accent-200/70">
                {earnedToday > 0 ? (
                  <span>
                    Gains défis du jour :{' '}
                    <strong className="text-emerald-300">+{formatCredits(earnedToday)}</strong>{' '}
                    déjà crédités sur votre solde.
                  </span>
                ) : (
                  <span>
                    Maximum 3 défis par jour. Les crédits gagnés sont versés immédiatement dès
                    validation.
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onClose();
                  }}
                  className="rounded-xl border border-accent-500/25 bg-surface-base px-4 py-2.5 text-xs font-bold text-accent-200 transition hover:border-accent-400/50 hover:text-accent-50"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onPlayZombie();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 via-amber-500 to-accent-400 px-4 py-2.5 text-xs font-extrabold text-slate-950 shadow-lg transition hover:brightness-110"
                >
                  {allCompleted ? (
                    <>
                      <Skull className="h-4 w-4" />
                      Jouer en Zombie
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Lancer le Mode Zombie
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
