import React, { useEffect, useMemo, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowLeftRight,
  Box,
  Crosshair,
  Layers,
  Palette,
  ShieldAlert,
  Skull,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { CRATES } from '../data/catalog';
import { RARITIES, RARITY_ORDER } from '../data/rarities';
import { ThemeId, THEMES } from '../data/themes';
import { CrateDefinition, NavTab, SkinDefinition } from '../types/casino';
import { formatCredits, formatProbability } from '../utils/rng';
import { soundEngine } from '../utils/sound';
import { useWeaponInspector } from '../context/WeaponInspectorContext';
import { SkinVortex3D, VortexSkin } from './SkinVortex3D';
import { CrateCarousel3D } from './CrateCarousel3D';
import { Tilt3D } from './Tilt3D';

interface LandingHomeProps {
  themeId: ThemeId;
  onSelectTheme: (themeId: ThemeId, themeName: string) => void;
  onSelectCrate: (crate: CrateDefinition) => void;
  onExploreCrates: () => void;
  onNavigateTab: (tab: NavTab) => void;
  onOpenZombie: () => void;
}

const EASE_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

export const LandingHome: React.FC<LandingHomeProps> = ({
  themeId,
  onSelectTheme,
  onSelectCrate,
  onExploreCrates,
  onNavigateTab,
  onOpenZombie,
}) => {
  const { inspectWeapon } = useWeaponInspector();
  const reduceMotion = useReducedMotion();
  const rowARef = useRef<HTMLDivElement | null>(null);
  const rowBRef = useRef<HTMLDivElement | null>(null);
  const runwayHoverRef = useRef(false);

  // Défilé 3D piloté par inertie : ralentit et s'arrête progressivement au survol,
  // puis ré-accélère en douceur quand la souris quitte la zone.
  useEffect(() => {
    if (reduceMotion) return;
    let raf = 0;
    let last = performance.now();
    let posA = 0;
    let posB = 0;
    let speedFactor = 1;

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const target = runwayHoverRef.current ? 0 : 1;
      // Amortissement exponentiel doux (~1.1s de freinage progressif)
      const rate = runwayHoverRef.current ? 2.4 : 2.8;
      speedFactor += (target - speedFactor) * (1 - Math.exp(-dt * rate));
      if (Math.abs(target - speedFactor) < 0.001) {
        speedFactor = target;
      }

      if (speedFactor > 0) {
        posA = (posA + dt * (50 / 38) * speedFactor) % 50;
        posB = (posB + dt * (50 / 44) * speedFactor) % 50;
        if (rowARef.current) {
          rowARef.current.style.transform = `translate3d(${-posA}%, 0, 0)`;
        }
        if (rowBRef.current) {
          rowBRef.current.style.transform = `translate3d(${-50 + posB}%, 0, 0)`;
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduceMotion]);

  // Sélectionne des skins avec image réelle pour le vortex 3D & le défilé 3D
  const { vortexSkins, runwayRowA, runwayRowB, showcaseSkin, totalSkins } = useMemo(() => {
    const allSkins = CRATES.flatMap((c) => c.skins);
    const withImg = allSkins.filter((s): s is SkinDefinition & { image: string } => Boolean(s.image));

    // Privilégier les raretés hautes et les modèles variés sans doublons d'image
    const seen = new Set<string>();
    const uniqueByImg: (SkinDefinition & { image: string })[] = [];
    const sorted = [...withImg].sort(
      (a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order || b.baseValue - a.baseValue
    );
    for (const skin of sorted) {
      if (!seen.has(skin.image)) {
        seen.add(skin.image);
        uniqueByImg.push(skin);
      }
    }

    const vortex: VortexSkin[] = uniqueByImg.slice(0, 14).map((s) => ({
      image: s.image,
      rarity: s.rarity,
    }));

    const rowA = uniqueByImg.slice(0, 10);
    const rowB = uniqueByImg.slice(10, 20).length >= 6 ? uniqueByImg.slice(10, 20) : uniqueByImg.slice(0, 10).reverse();
    const signature = uniqueByImg[0] ?? allSkins[0];

    return {
      vortexSkins: vortex,
      runwayRowA: rowA,
      runwayRowB: rowB,
      showcaseSkin: signature,
      totalSkins: allSkins.length,
    };
  }, []);

  const featuredCrate = CRATES[5] ?? CRATES[CRATES.length - 1];

  const scrollToSection = (id: string) => {
    soundEngine.playClick();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-20 pb-8">
      {/* =====================================================================
          SECTION 1 : HERO MOTION DESIGN 3D
      ===================================================================== */}
      <section
        id="hero-motion"
        className="glow-border relative overflow-hidden rounded-[2rem] border border-accent-500/25 bg-gradient-to-b from-surface-elevated/90 via-surface-panel/95 to-surface-base shadow-[0_32px_90px_-24px_var(--card-glow)]"
      >
        {/* Sol 3D en perspective infinie */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-60">
          <div className="perspective-floor" />
        </div>

        {/* Scène WebGL 3D (Vortex des vrais skins du site) */}
        <div className="pointer-events-none absolute inset-0 opacity-85 lg:left-[28%]">
          <SkinVortex3D skins={vortexSkins} themeKey={themeId} className="h-full w-full" />
        </div>

        {/* Dégradé de lisibilité gauche -> droite */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-surface-base via-surface-base/85 to-surface-base/25 lg:via-surface-base/75 lg:to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-surface-base via-surface-base/55 to-transparent"
        />

        <div className="relative z-10 flex min-h-[76vh] flex-col justify-between px-6 py-10 sm:px-10 sm:py-14 lg:px-14">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            {/* Colonne gauche : Typographie cinétique & présentation du site */}
            <div className="lg:col-span-7">
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: EASE_EXPO }}
                className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-accent-400/35 bg-accent-500/10 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-300 backdrop-blur-md"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                <ShieldAlert className="h-3.5 w-3.5 text-accent-300" />
                <span>EXPÉRIENCE 100% FICTIVE • AUCUN ARGENT RÉEL</span>
              </motion.div>

              <h1 className="font-hero text-4xl font-black uppercase leading-[0.98] tracking-tight text-accent-50 sm:text-5xl lg:text-[58px]">
                <span className="block overflow-hidden">
                  <motion.span
                    className="block"
                    initial={reduceMotion ? false : { y: '110%' }}
                    animate={{ y: '0%' }}
                    transition={{ duration: 0.7, delay: 0.06, ease: EASE_EXPO }}
                  >
                    Ouvre tes caisses.
                  </motion.span>
                </span>
                <span className="block overflow-hidden">
                  <motion.span
                    className="block"
                    initial={reduceMotion ? false : { y: '110%' }}
                    animate={{ y: '0%' }}
                    transition={{ duration: 0.7, delay: 0.16, ease: EASE_EXPO }}
                  >
                    <span className="text-gradient">Inspecte en 3D.</span>
                  </motion.span>
                </span>
                <span className="block overflow-hidden">
                  <motion.span
                    className="text-outline block"
                    initial={reduceMotion ? false : { y: '110%' }}
                    animate={{ y: '0%' }}
                    transition={{ duration: 0.7, delay: 0.26, ease: EASE_EXPO }}
                  >
                    Domine l’arène.
                  </motion.span>
                </span>
              </h1>

              <motion.p
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.34, ease: EASE_EXPO }}
                className="mt-5 max-w-xl text-sm leading-relaxed text-accent-100/80 sm:text-base"
              >
                Bienvenue sur <strong className="text-accent-50">Dopamine.gg</strong> — le coffre-fort
                virtuel où chaque skin d’arme prend vie. Débloque{' '}
                <strong className="text-accent-200">{CRATES.length} caisses thématiques</strong> et{' '}
                <strong className="text-accent-200">{totalSkins} skins</strong>, inspecte chaque modèle en
                3D WebGL, multiplie tes drops avec l’<strong className="text-accent-200">Upgrader</strong>{' '}
                ou les <strong className="text-accent-200">Contrats</strong>, puis équipe ton arsenal dans
                le <strong className="text-rose-300">Mode Zombie FPS</strong>.
              </motion.p>

              {/* Boutons d'action */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.44, ease: EASE_EXPO }}
                className="mt-7 flex flex-wrap items-center gap-3"
              >
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onExploreCrates();
                  }}
                  className="btn-primary group inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-extrabold"
                >
                  <Layers className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
                  <span>Explorer les caisses</span>
                  <ArrowDownRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0.5" />
                </button>

                <button
                  type="button"
                  onClick={() => onSelectCrate(featuredCrate)}
                  className="btn-ghost group inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold"
                >
                  <Sparkles className="h-4 w-4 text-accent-400 transition-transform duration-300 group-hover:rotate-45" />
                  <span>Ouvrir « {featuredCrate.name} »</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    onOpenZombie();
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-500/35 bg-rose-500/12 px-4 py-3.5 text-sm font-bold text-rose-200 backdrop-blur-md transition hover:border-rose-400/60 hover:bg-rose-500/20"
                >
                  <Skull className="h-4 w-4 text-rose-400" />
                  <span>Mode Zombie FPS</span>
                </button>
              </motion.div>
            </div>

            {/* Colonne droite : Carte 3D flottante de présentation rapide / inspection instantanée */}
            <div className="hidden lg:col-span-5 lg:flex lg:justify-end">
              {showcaseSkin && (
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.92, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.3, ease: EASE_EXPO }}
                  className="w-full max-w-sm"
                >
                  <Tilt3D
                    max={12}
                    hoverScale={1.02}
                    className="vault-card rounded-3xl border border-accent-400/30 p-5 shadow-[0_30px_70px_-20px_rgba(0,0,0,0.85)]"
                  >
                    <div
                      className="flex items-center justify-between gap-2"
                      style={{ transform: 'translateZ(26px)' }}
                    >
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-400/35 bg-accent-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-200">
                        <Box className="h-3 w-3 text-accent-400" />
                        Aperçu 3D temps réel
                      </span>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase"
                        style={{
                          backgroundColor: RARITIES[showcaseSkin.rarity].badgeBg,
                          color: RARITIES[showcaseSkin.rarity].color,
                        }}
                      >
                        {RARITIES[showcaseSkin.rarity].label}
                      </span>
                    </div>

                    <div
                      className="my-5 flex h-40 items-center justify-center rounded-2xl border border-white/5 bg-surface-base/70 p-4"
                      style={{ transform: 'translateZ(46px)' }}
                    >
                      <img
                        src={showcaseSkin.image}
                        alt={`${showcaseSkin.weaponName} ${showcaseSkin.name}`}
                        className="animate-float max-h-32 w-full object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,0.85)]"
                      />
                    </div>

                    <div
                      className="flex items-center justify-between gap-3"
                      style={{ transform: 'translateZ(28px)' }}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-display text-sm font-bold text-accent-50">
                          {showcaseSkin.weaponName} | {showcaseSkin.name}
                        </div>
                        <div className="font-mono-num text-xs text-accent-300/80">
                          ~{formatCredits(showcaseSkin.baseValue)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playClick();
                          inspectWeapon(showcaseSkin);
                        }}
                        className="btn-primary shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold"
                      >
                        Inspecter 3D
                      </button>
                    </div>
                  </Tilt3D>
                </motion.div>
              )}
            </div>
          </div>

          {/* Barre basse : Chiffres clés + repère de scroll */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.55, ease: EASE_EXPO }}
            className="mt-10 flex flex-col items-start justify-between gap-5 border-t border-accent-500/15 pt-6 sm:flex-row sm:items-center"
          >
            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-4">
              {[
                { val: `${CRATES.length} Caisses`, lbl: 'Visuels 3D & raretés' },
                { val: `${totalSkins} Skins`, lbl: 'CS & Valorant fictifs' },
                { val: '4 Modes', lbl: 'Caisses • Up • Contrat • FPS' },
                { val: '4 Thèmes', lbl: 'Palette dynamique live' },
              ].map((stat) => (
                <div
                  key={stat.val}
                  className="rounded-xl border border-accent-500/15 bg-surface-panel/75 px-3.5 py-2 backdrop-blur-md"
                >
                  <div className="font-display text-sm font-extrabold text-accent-200 sm:text-base">
                    {stat.val}
                  </div>
                  <div className="text-[11px] text-accent-200/55">{stat.lbl}</div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollToSection('vault-carousel-section')}
              className="group flex items-center gap-3 self-center text-xs font-semibold uppercase tracking-widest text-accent-300/75 transition hover:text-accent-200 sm:self-auto"
            >
              <span>Découvrir la suite</span>
              <span className="flex h-8 w-5 justify-center rounded-full border border-accent-400/40 p-1">
                <span className="animate-scroll-cue h-1.5 w-1 rounded-full bg-accent-300" />
              </span>
            </button>
          </motion.div>
        </div>
      </section>

      {/* =====================================================================
          SECTION 2 : CARROUSEL 3D INTERACTIF DES CAISSES
      ===================================================================== */}
      <section id="vault-carousel-section" className="relative space-y-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="inline-flex items-center gap-2 font-mono-num text-[11px] font-bold uppercase tracking-[0.18em] text-accent-400">
              <span className="inline-block h-px w-8 bg-accent-400/60" />
              01 // LE COFFRE-FORT 3D
            </div>
            <h2 className="mt-2 font-hero text-2xl font-extrabold tracking-tight text-accent-50 sm:text-4xl">
              Toutes nos caisses en <span className="text-gradient">orbite 3D</span>
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-accent-100/65">
              Fais glisser l’anneau 3D pour parcourir les 8 caisses réparties sur 3 catégories. Chaque
              caisse renferme 22 skins avec tirage x1 jusqu’à x10 en simultané.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              onExploreCrates();
            }}
            className="btn-ghost self-start rounded-xl px-4 py-2.5 text-xs font-bold md:self-auto"
          >
            Filtrer par catégorie ↓
          </button>
        </div>

        <div className="vault-card relative overflow-hidden rounded-3xl px-4 py-6 sm:px-8 sm:py-8">
          <CrateCarousel3D crates={CRATES} onSelect={onSelectCrate} />
        </div>
      </section>

      {/* =====================================================================
          SECTION 3 : COMMENT FONCTIONNE LE SITE (MOTION BENTO 3D)
      ===================================================================== */}
      <section className="space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 font-mono-num text-[11px] font-bold uppercase tracking-[0.18em] text-accent-400">
            <span className="inline-block h-px w-8 bg-accent-400/60" />
            02 // COMMENT ÇA FONCTIONNE
          </div>
          <h2 className="mt-2 font-hero text-2xl font-extrabold tracking-tight text-accent-50 sm:text-4xl">
            Un écosystème complet autour de <span className="text-gradient">tes skins</span>
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-accent-100/65">
            Chaque drop obtenu dans une caisse devient une vraie pièce jouable : collectionne,
            inspecte en 3D, parie, fusionne ou pars au combat.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Pilier 1 : Ouverture de caisses */}
          <Tilt3D
            max={9}
            className="vault-card vault-card-hover group rounded-3xl p-6"
          >
            <div className="flex items-start justify-between gap-4" style={{ transform: 'translateZ(26px)' }}>
              <div>
                <span className="font-mono-num text-[11px] font-bold uppercase tracking-widest text-accent-400">
                  01 • ROULETTE PONDÉRÉE
                </span>
                <h3 className="mt-1 font-display text-xl font-bold text-accent-50">
                  Ouverture x1 à x10 &amp; Turbo
                </h3>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-400/35 bg-accent-500/15 text-accent-300">
                <Box className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-accent-100/70" style={{ transform: 'translateZ(16px)' }}>
              Lance jusqu’à 10 roulettes en parallèle, active le mode Turbo pour des tirages éclairs
              et revends ou verrouille chaque skin obtenu instantanément.
            </p>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-accent-500/10 pt-4" style={{ transform: 'translateZ(24px)' }}>
              <div className="flex -space-x-3">
                {CRATES.slice(0, 4).map((c) => (
                  c.image && (
                    <img
                      key={c.id}
                      src={c.image}
                      alt={c.name}
                      className="h-10 w-14 rounded-lg border border-white/15 bg-surface-base object-cover shadow-md transition-transform duration-300 group-hover:translate-y-[-3px]"
                    />
                  )
                ))}
              </div>
              <button
                type="button"
                onClick={onExploreCrates}
                className="rounded-xl border border-accent-400/35 bg-accent-500/15 px-3.5 py-2 text-xs font-bold text-accent-200 transition hover:bg-accent-400 hover:text-accent-950"
              >
                Ouvrir une caisse
              </button>
            </div>
          </Tilt3D>

          {/* Pilier 2 : Inspection 3D */}
          <Tilt3D
            max={9}
            className="vault-card vault-card-hover group rounded-3xl p-6"
          >
            <div className="flex items-start justify-between gap-4" style={{ transform: 'translateZ(26px)' }}>
              <div>
                <span className="font-mono-num text-[11px] font-bold uppercase tracking-widest text-accent-400">
                  02 • RENDU WEBGL INTERACTIF
                </span>
                <h3 className="mt-1 font-display text-xl font-bold text-accent-50">
                  Inspection 3D sur chaque arme
                </h3>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-400/35 bg-accent-500/15 text-accent-300">
                <Crosshair className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-accent-100/70" style={{ transform: 'translateZ(16px)' }}>
              Chaque fusil, sniper, pistolet ou karambit possède un modèle 3D dédié : fais-le tourner
              à 360°, zoome sur les gravures et consulte son niveau d’usure (Float).
            </p>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-accent-500/10 pt-4" style={{ transform: 'translateZ(24px)' }}>
              {showcaseSkin?.image && (
                <img
                  src={showcaseSkin.image}
                  alt={showcaseSkin.name}
                  className="h-11 w-28 object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.75)] transition-transform duration-300 group-hover:scale-110"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  if (showcaseSkin) inspectWeapon(showcaseSkin);
                }}
                className="rounded-xl border border-accent-400/35 bg-accent-500/15 px-3.5 py-2 text-xs font-bold text-accent-200 transition hover:bg-accent-400 hover:text-accent-950"
              >
                Tester la vue 3D
              </button>
            </div>
          </Tilt3D>

          {/* Pilier 3 : Upgrader & Contrats */}
          <Tilt3D
            max={9}
            className="vault-card vault-card-hover group rounded-3xl p-6"
          >
            <div className="flex items-start justify-between gap-4" style={{ transform: 'translateZ(26px)' }}>
              <div>
                <span className="font-mono-num text-[11px] font-bold uppercase tracking-widest text-accent-400">
                  03 • PROGRESSION &amp; FUSION
                </span>
                <h3 className="mt-1 font-display text-xl font-bold text-accent-50">
                  Upgrader de Skins &amp; Contrats
                </h3>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-accent-400/35 bg-accent-500/15 text-accent-300">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-accent-100/70" style={{ transform: 'translateZ(16px)' }}>
              Mise un skin sur l’anneau orbital pour viser x1.5 à x10, ou signe un Contrat d’échange
              en fusionnant 5 à 10 skins pour forger le palier supérieur garanti.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-accent-500/10 pt-4" style={{ transform: 'translateZ(24px)' }}>
              <button
                type="button"
                onClick={() => onNavigateTab('upgrader')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-accent-400/35 bg-accent-500/15 px-3.5 py-2 text-xs font-bold text-accent-200 transition hover:bg-accent-400 hover:text-accent-950"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Upgrader
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('contrat')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-accent-400/35 bg-accent-500/15 px-3.5 py-2 text-xs font-bold text-accent-200 transition hover:bg-accent-400 hover:text-accent-950"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Contrats
              </button>
            </div>
          </Tilt3D>

          {/* Pilier 4 : Mode Zombie FPS */}
          <Tilt3D
            max={9}
            className="vault-card vault-card-hover group rounded-3xl p-6"
          >
            <div className="flex items-start justify-between gap-4" style={{ transform: 'translateZ(26px)' }}>
              <div>
                <span className="font-mono-num text-[11px] font-bold uppercase tracking-widest text-rose-400">
                  04 • ARÈNE 3D PREMIÈRE PERSONNE
                </span>
                <h3 className="mt-1 font-display text-xl font-bold text-accent-50">
                  Mode Zombie FPS &amp; Défis
                </h3>
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-rose-400/35 bg-rose-500/15 text-rose-300">
                <Skull className="h-5 w-5" />
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-accent-100/70" style={{ transform: 'translateZ(16px)' }}>
              Équipe ton fusil (touche 1) et ton couteau (touche 2) depuis ton inventaire, affronte
              des vagues en 3D temps réel, valide 3 défis quotidiens (+3 000 CR bonus) et extrais tes gains.
            </p>
            <div className="mt-5 flex items-center justify-between gap-3 border-t border-accent-500/10 pt-4" style={{ transform: 'translateZ(24px)' }}>
              <span className="font-mono-num text-xs font-semibold text-rose-300">
                +10 à 50 CR / élimination
              </span>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  onOpenZombie();
                }}
                className="rounded-xl border border-rose-400/45 bg-rose-500/20 px-3.5 py-2 text-xs font-bold text-rose-100 transition hover:bg-rose-500 hover:text-white"
              >
                Lancer l’arène
              </button>
            </div>
          </Tilt3D>
        </div>
      </section>

      {/* =====================================================================
          SECTION 4 : DÉFILÉ 3D DE L'ARSENAL (RUNWAY INCLINÉ)
      ===================================================================== */}
      <section className="vault-card relative overflow-hidden rounded-3xl py-10">
        <div className="px-6 sm:px-10">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="inline-flex items-center gap-2 font-mono-num text-[11px] font-bold uppercase tracking-[0.18em] text-accent-400">
                <span className="inline-block h-px w-8 bg-accent-400/60" />
                03 // GALERIE EN PERSPECTIVE
              </div>
              <h2 className="mt-2 font-hero text-2xl font-extrabold text-accent-50 sm:text-3xl">
                L’arsenal en <span className="text-gradient">défilé 3D</span>
              </h2>
            </div>
            <p className="text-xs text-accent-200/60">
              Survole pour mettre en pause • Clique sur un skin pour l’ouvrir en 3D
            </p>
          </div>
        </div>

        <div
          className="relative mt-8 overflow-hidden py-6"
          style={{ perspective: '1200px' }}
          onPointerEnter={() => {
            runwayHoverRef.current = true;
          }}
          onPointerLeave={() => {
            runwayHoverRef.current = false;
          }}
        >
          <div className="runway-3d space-y-4">
            {[
              { items: runwayRowA, ref: rowARef, initialTransform: 'translate3d(0%, 0, 0)' },
              { items: runwayRowB, ref: rowBRef, initialTransform: 'translate3d(-50%, 0, 0)' },
            ].map((row, rowIdx) => (
              <div
                key={rowIdx}
                ref={row.ref}
                style={{ transform: row.initialTransform, willChange: 'transform' }}
                className="flex w-max gap-4 pr-4"
              >
                {[...row.items, ...row.items].map((skin, idx) => {
                  const rarity = RARITIES[skin.rarity];
                  return (
                    <button
                      key={`${skin.id}-${idx}`}
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        inspectWeapon(skin);
                      }}
                      className="group relative flex w-56 shrink-0 flex-col justify-between overflow-hidden rounded-2xl border bg-surface-card/90 p-3.5 text-left transition-transform duration-500 ease-[var(--ease-out-expo)] hover:-translate-y-2 hover:scale-[1.04]"
                      style={{
                        borderColor: rarity.borderColor,
                        boxShadow: `0 18px 36px -18px ${rarity.glowColor}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{ backgroundColor: rarity.badgeBg, color: rarity.color }}
                        >
                          {rarity.label}
                        </span>
                        <span className="font-mono-num text-[10px] font-bold text-accent-300/80">
                          {formatCredits(skin.baseValue)}
                        </span>
                      </div>
                      <div className="my-2.5 flex h-20 items-center justify-center">
                        <img
                          src={skin.image}
                          alt={`${skin.weaponName} ${skin.name}`}
                          loading="lazy"
                          className="max-h-16 w-full object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.8)] transition-transform duration-300 group-hover:scale-110"
                        />
                      </div>
                      <div className="truncate text-xs font-bold text-accent-50">
                        {skin.weaponName} | {skin.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-surface-card to-transparent sm:w-28" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-surface-card to-transparent sm:w-28" />
        </div>
      </section>

      {/* =====================================================================
          SECTION 5 : RARETÉS OFFICIELLES & SÉLECTEUR DE THÈMES LIVE
      ===================================================================== */}
      <section className="grid gap-6 lg:grid-cols-12">
        {/* Échelle des raretés */}
        <Tilt3D
          max={6}
          hoverScale={1.005}
          className="vault-card rounded-3xl p-6 sm:p-8 lg:col-span-7"
        >
          <div style={{ transform: 'translateZ(20px)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono-num text-[11px] font-bold uppercase tracking-[0.16em] text-accent-400">
                04 // PROBABILITÉS TRANSPARENTES
              </span>
              <span className="rounded-full border border-accent-500/20 bg-surface-base/70 px-2.5 py-0.5 font-mono-num text-[11px] text-accent-200/70">
                22 skins / caisse
              </span>
            </div>
            <h3 className="mt-2 font-display text-2xl font-bold text-accent-50">
              5 paliers de rareté vérifiables
            </h3>

            <div className="mt-5 space-y-3">
              {RARITY_ORDER.map((rid, idx) => {
                const r = RARITIES[rid];
                return (
                  <div
                    key={rid}
                    className="relative overflow-hidden rounded-2xl border px-4 py-3"
                    style={{ borderColor: r.borderColor, backgroundColor: r.bgTint }}
                  >
                    <motion.div
                      initial={reduceMotion ? false : { scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.9, delay: 0.2 + idx * 0.08, ease: EASE_EXPO }}
                      style={{
                        transformOrigin: 'left',
                        width: `${Math.max(4, r.probability)}%`,
                        backgroundColor: r.color,
                      }}
                      className="pointer-events-none absolute inset-y-0 left-0 opacity-[0.12]"
                    />
                    <div className="relative z-10 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: r.color, boxShadow: `0 0 12px ${r.color}` }}
                        />
                        <div>
                          <span className="font-display text-sm font-bold" style={{ color: r.color }}>
                            {r.label}
                          </span>
                          <span className="ml-2 text-xs text-accent-100/60">• {r.difficultyLabel}</span>
                        </div>
                      </div>
                      <span className="font-mono-num text-sm font-bold text-accent-50">
                        {formatProbability(r.probability)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Tilt3D>

        {/* Changement de thème interactif */}
        <Tilt3D
          max={6}
          hoverScale={1.005}
          className="vault-card flex flex-col justify-between rounded-3xl p-6 sm:p-8 lg:col-span-5"
        >
          <div style={{ transform: 'translateZ(20px)' }}>
            <div className="inline-flex items-center gap-2 font-mono-num text-[11px] font-bold uppercase tracking-[0.16em] text-accent-400">
              <Palette className="h-3.5 w-3.5" />
              AMBIANCE EN DIRECT
            </div>
            <h3 className="mt-2 font-display text-2xl font-bold text-accent-50">
              4 thèmes personnalisables
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-accent-100/65 sm:text-sm">
              Change la palette du site à tout moment : l’interface, les reflets 3D et le vortex
              WebGL s’adaptent instantanément.
            </p>

            <div className="mt-5 grid gap-2.5">
              {THEMES.map((t) => {
                const active = t.id === themeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTheme(t.id, t.name)}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-accent-300/70 bg-accent-500/15 shadow-[0_0_24px_-8px_var(--card-glow)]'
                        : 'border-accent-500/15 bg-surface-base/60 hover:border-accent-400/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-7 w-7 shrink-0 rounded-xl border border-white/20 shadow-inner"
                        style={{
                          background: `linear-gradient(135deg, ${t.swatchPrimary}, ${t.swatchSecondary})`,
                        }}
                      />
                      <div>
                        <div className="font-display text-sm font-bold text-accent-50">{t.name}</div>
                        <div className="text-[11px] text-accent-200/60">{t.subtitle}</div>
                      </div>
                    </div>
                    {active && (
                      <span className="rounded-full bg-accent-400 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-accent-950">
                        Actif
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              onNavigateTab('statistiques');
            }}
            className="btn-ghost mt-5 w-full rounded-xl py-3 text-xs font-bold"
            style={{ transform: 'translateZ(20px)' }}
          >
            Consulter mes statistiques &amp; probabilités →
          </button>
        </Tilt3D>
      </section>
    </div>
  );
};
