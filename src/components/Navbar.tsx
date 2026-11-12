import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeftRight,
  Box,
  Briefcase,
  Sparkles,
  BarChart3,
  Plus,
  Skull,
  ChevronDown,
  Volume2,
  VolumeX,
  ShieldCheck,
  Palette,
  User,
  Trophy,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { ThemeId, THEMES } from '../data/themes';
import { NavTab } from '../types/casino';
import { formatCredits } from '../utils/rng';
import { soundEngine } from '../utils/sound';

interface NavbarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  balance: number;
  inventoryCount: number;
  inventoryCapacity?: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenZombie: () => void;
  onOpenChallenges: () => void;
  challengesCompletedCount?: number;
  themeId: ThemeId;
  onSelectTheme: (themeId: ThemeId, themeName: string) => void;
  onOpenAuth: () => void;
  userEmail: string | null;
  username: string | null;
  cloudSyncStatus?: 'synced' | 'saving' | 'idle';
}

const NAV_ITEMS: { id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'boutique', label: 'Caisses', icon: Box },
  { id: 'inventaire', label: 'Inventaire', icon: Briefcase },
  { id: 'upgrader', label: 'Upgrader', icon: Sparkles },
  { id: 'contrat', label: 'Contrats', icon: ArrowLeftRight },
  { id: 'statistiques', label: 'Raretés & Stats', icon: BarChart3 },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  balance,
  inventoryCount,
  inventoryCapacity = 25,
  soundEnabled,
  onToggleSound,
  onOpenZombie,
  onOpenChallenges,
  challengesCompletedCount = 0,
  themeId,
  onSelectTheme,
  onOpenAuth,
  userEmail,
  username,
  cloudSyncStatus = 'idle',
}) => {
  const [creditMenuOpen, setCreditMenuOpen] = useState(false);
  const creditMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!creditMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (creditMenuRef.current && !creditMenuRef.current.contains(e.target as Node)) {
        setCreditMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCreditMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [creditMenuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-accent-500/15 bg-surface-base/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Brand */}
        <button
          onClick={() => onTabChange('boutique')}
          className="group flex items-center gap-3 text-left focus:outline-none"
        >
          <motion.div
            whileHover={{ rotate: 8, scale: 1.08 }}
            transition={{ type: 'spring', stiffness: 360, damping: 20 }}
            className="animate-aura-pulse relative flex h-10 w-10 items-center justify-center rounded-xl border border-accent-400/35 bg-accent-950/75"
          >
            <motion.svg
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
              viewBox="0 0 36 36"
              className="h-6 w-6"
              fill="none"
            >
              <polygon
                points="18,3 31,12 26,31 10,31 5,12"
                stroke="var(--accent-400)"
                strokeWidth="2.2"
                fill="color-mix(in srgb, var(--accent-400) 18%, transparent)"
              />
              <polygon
                points="18,9 24,14 21,25 15,25 12,14"
                fill="var(--accent-300)"
                fillOpacity="0.7"
              />
            </motion.svg>
          </motion.div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-bold tracking-tight text-accent-50">
                Dopamine<span className="text-accent-400">.gg</span>
              </span>
              <span className="hidden items-center gap-1 rounded-full border border-accent-500/25 bg-accent-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-300 sm:inline-flex">
                <ShieldCheck className="h-3 w-3" />
                100% Sécurisé
              </span>
            </div>
            <p className="text-[11px] text-accent-200/55">
              Casino virtuel d’ouverture de caisses
            </p>
          </div>
        </button>

        {/* Main Navigation Tabs */}
        <nav className="order-3 flex w-full flex-wrap items-center justify-between gap-1 rounded-xl border border-accent-500/15 bg-surface-panel/90 p-1 lg:order-2 lg:w-auto lg:flex-nowrap lg:justify-center">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-colors sm:px-3.5 sm:text-sm lg:flex-initial ${
                  isActive
                    ? 'text-accent-950'
                    : 'text-accent-100/70 hover:text-accent-200'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="active-nav-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 rounded-lg bg-gradient-to-r from-accent-400 to-accent2-300 shadow-[0_0_20px_var(--card-glow)]"
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.id === 'inventaire' && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 font-mono-num text-[11px] font-bold ${
                        isActive
                          ? 'bg-accent-950/20 text-accent-950'
                          : inventoryCount >= inventoryCapacity
                          ? 'bg-rose-500/25 text-rose-200'
                          : 'bg-accent-500/20 text-accent-300'
                      }`}
                    >
                      {inventoryCount}/{inventoryCapacity}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Right Controls: Theme Palette + Sound + Balance */}
        <div className="order-2 flex items-center gap-2 lg:order-3">
          {/* Theme Switcher */}
          <div
            className="hidden items-center gap-1.5 rounded-xl border border-accent-500/20 bg-surface-panel px-2.5 py-1.5 sm:flex"
            title="Changer la combinaison de couleurs"
          >
            <Palette className="mr-0.5 h-3.5 w-3.5 text-accent-300/70" />
            {THEMES.map((t) => {
              const selected = t.id === themeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTheme(t.id, t.name)}
                  title={`${t.name} — ${t.subtitle}`}
                  aria-label={`Thème ${t.name}`}
                  className={`relative h-5 w-5 rounded-full transition-transform hover:scale-110 ${
                    selected ? 'ring-2 ring-white ring-offset-2 ring-offset-surface-panel scale-110' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${t.swatchPrimary}, ${t.swatchSecondary})`,
                  }}
                />
              );
            })}
          </div>

          <button
            onClick={onToggleSound}
            title={soundEnabled ? 'Couper les effets sonores' : 'Activer les effets sonores'}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-accent-500/20 bg-surface-panel text-accent-300/80 transition hover:border-accent-400/50 hover:text-accent-200"
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-accent-500/40" />}
          </button>

          {/* Bouton Compte / Cloud */}
          <button
            onClick={onOpenAuth}
            title={
              userEmail
                ? `Connecté (${username || userEmail}) - ${cloudSyncStatus === 'saving' ? 'Sauvegarde...' : 'Sauvegardé'}`
                : 'Connexion / Sauvegarde Cloud'
            }
            className={`flex items-center gap-1.5 h-10 px-3 rounded-xl border transition ${
              userEmail
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                : 'border-accent-500/25 bg-surface-panel text-accent-200 hover:border-accent-400/50 hover:bg-accent-500/10'
            }`}
          >
            <User className="h-4 w-4 text-emerald-400" />
            <span className="hidden md:inline text-xs font-semibold max-w-[100px] truncate">
              {username || (userEmail ? 'Compte' : 'Connexion')}
            </span>
            {userEmail && (
              <span className="ml-0.5" title={cloudSyncStatus === 'saving' ? 'Sauvegarde cloud en cours...' : 'Synchronisé'}>
                {cloudSyncStatus === 'saving' ? (
                  <RefreshCw className="h-3 w-3 animate-spin text-amber-400" />
                ) : (
                  <Cloud className="h-3 w-3 text-emerald-400" />
                )}
              </span>
            )}
          </button>

          <div
            ref={creditMenuRef}
            className="relative flex items-center gap-2 rounded-xl border border-accent-500/25 bg-surface-panel p-1 pl-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <div className="flex flex-col">
              <span className="text-[10px] font-medium uppercase tracking-wider text-accent-300/60">
                Solde
              </span>
              <motion.span
                key={balance}
                initial={{ opacity: 0.7, y: -3 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-mono-num text-sm font-bold text-accent-300 sm:text-base"
              >
                {formatCredits(balance)}
              </motion.span>
            </div>
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setCreditMenuOpen((v) => !v);
              }}
              aria-expanded={creditMenuOpen}
              aria-haspopup="menu"
              aria-label="Gagner des crédits"
              title="Gagner des crédits"
              className="flex items-center gap-1 rounded-lg bg-accent-400 px-2.5 py-2 text-xs font-bold text-accent-950 transition hover:bg-accent-300 active:scale-95"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-150 ${creditMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {creditMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-2xl border border-accent-500/30 bg-surface-card/95 p-1.5 shadow-[0_18px_45px_rgba(0,0,0,0.75)] backdrop-blur-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    soundEngine.playClick();
                    setCreditMenuOpen(false);
                    onOpenZombie();
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition hover:bg-rose-500/15"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-400/35 bg-rose-500/15 text-rose-300">
                      <Skull className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-display text-xs font-bold uppercase tracking-wider text-accent-50">
                        Zombie
                      </div>
                      <div className="text-[10px] text-accent-200/65">
                        +10 à 50 CR / élimination
                      </div>
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    soundEngine.playClick();
                    setCreditMenuOpen(false);
                    onOpenChallenges();
                  }}
                  className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition hover:bg-amber-500/15"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-400/35 bg-amber-500/15 text-amber-300">
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-display text-xs font-bold uppercase tracking-wider text-accent-50">
                        Défis
                      </div>
                      <div className="text-[10px] text-accent-200/65">
                        +500 CR / défi • Bonus +3 000 CR
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono-num text-[10px] font-bold ${
                      challengesCompletedCount >= 3
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {challengesCompletedCount}/3
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile compact theme switcher row */}
      <div className="flex items-center justify-center gap-2 border-t border-accent-500/10 py-1.5 sm:hidden">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-accent-200/50">
          Couleurs :
        </span>
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTheme(t.id, t.name)}
            aria-label={`Thème ${t.name}`}
            className={`h-4 w-4 rounded-full transition ${
              t.id === themeId ? 'ring-2 ring-white ring-offset-1 ring-offset-surface-base' : 'opacity-65'
            }`}
            style={{
              background: `linear-gradient(135deg, ${t.swatchPrimary}, ${t.swatchSecondary})`,
            }}
          />
        ))}
      </div>
    </header>
  );
};
