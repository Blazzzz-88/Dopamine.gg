import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles, Layers } from 'lucide-react';
import { CrateDefinition } from '../types/casino';
import { RARITIES, RARITY_ORDER } from '../data/rarities';
import { formatCredits } from '../utils/rng';
import { CrateEmblem } from './CrateEmblem';
import { useWeaponInspector } from '../context/WeaponInspectorContext';
import { soundEngine } from '../utils/sound';
import { Tilt3D } from './Tilt3D';

interface CaseCardProps {
  crate: CrateDefinition;
  index: number;
  onSelect: (crate: CrateDefinition) => void;
}

export const CaseCard: React.FC<CaseCardProps> = ({ crate, index, onSelect }) => {
  const { inspectWeapon } = useWeaponInspector();
  const imageSkins = [...crate.skins.filter((s) => Boolean(s.image))].sort(
    (a, b) => RARITIES[b.rarity].order - RARITIES[a.rarity].order
  );
  const featuredSkin = imageSkins[0] ?? crate.skins.find((s) => s.rarity === 'secret');
  const featuredRarity = featuredSkin ? RARITIES[featuredSkin.rarity] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: Math.min(index * 0.06, 0.3) }}
      className="h-full"
    >
      <Tilt3D max={8} hoverScale={1.016} glare className="h-full rounded-2xl">
        <article
          onClick={() => onSelect(crate)}
          style={{ transformStyle: 'preserve-3d' }}
          className="vault-card vault-card-hover group relative flex h-full cursor-pointer flex-col justify-between rounded-2xl p-5"
        >
          {/* Couche de fond décorative confinée dans un wrapper overflow-hidden */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <div
              className="absolute -right-12 -top-12 h-44 w-44 rounded-full opacity-20 blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-50"
              style={{ background: crate.accentColor }}
            />
            <div
              className="animate-scanner-beam absolute inset-y-0 left-0 w-24 opacity-25"
              style={{
                background: `linear-gradient(90deg, transparent, ${crate.accentColor}28, transparent)`,
              }}
            />
          </div>

          <div className="relative z-10" style={{ transformStyle: 'preserve-3d' }}>
            <div
              className="flex items-center justify-between gap-2"
              style={{ transform: 'translateZ(18px)' }}
            >
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide"
                style={{
                  borderColor: `${crate.accentColor}40`,
                  backgroundColor: `${crate.accentColor}15`,
                  color: crate.accentColor,
                }}
              >
                <Sparkles className="h-3 w-3" />
                {crate.themeTag}
              </span>

              <span className="inline-flex items-center gap-1 rounded-full border border-accent-500/20 bg-surface-base/60 px-2.5 py-0.5 font-mono-num text-[11px] font-medium text-accent-200/80">
                <Layers className="h-3 w-3 text-accent-400" />
                {crate.skins.length} skins
              </span>
            </div>

            <div
              className="my-4 flex items-center justify-center"
              style={{ transform: 'translateZ(34px)' }}
            >
              {crate.image ? (
                <CrateEmblem
                  type={crate.emblemType}
                  accentColor={crate.accentColor}
                  image={crate.image}
                  alt={`Caisse 3D ${crate.name}`}
                  className="aspect-[4/3] w-full"
                />
              ) : (
                <div className="animate-float transition-transform duration-300 group-hover:scale-105">
                  <CrateEmblem type={crate.emblemType} accentColor={crate.accentColor} size={118} />
                </div>
              )}
            </div>

            <div style={{ transform: 'translateZ(18px)' }}>
              <h3 className="font-display text-xl font-bold tracking-tight text-accent-50 transition-colors group-hover:text-accent-300">
                {crate.name}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-accent-300/75">{crate.subtitle}</p>
              <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-accent-100/60">
                {crate.description}
              </p>
            </div>

            {featuredSkin && featuredRarity && (
              <div className="mt-4 space-y-2" style={{ transform: 'translateZ(26px)' }}>
                <div
                  className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 backdrop-blur-xs"
                  style={{
                    borderColor: featuredRarity.borderColor,
                    backgroundColor: featuredRarity.bgTint,
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {featuredSkin.image && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          soundEngine.playClick();
                          inspectWeapon(featuredSkin);
                        }}
                        title={`Inspecter ${featuredSkin.weaponName} | ${featuredSkin.name} en 3D`}
                        aria-label={`Inspecter ${featuredSkin.weaponName} ${featuredSkin.name} en 3D`}
                        className="shrink-0 cursor-zoom-in rounded-lg p-0.5 transition hover:bg-white/10"
                      >
                        <img
                          src={featuredSkin.image}
                          alt={`${featuredSkin.weaponName} ${featuredSkin.name}`}
                          className="h-11 w-24 object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.75)] transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-110"
                        />
                      </button>
                    )}
                    <div className="min-w-0">
                      <div
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: featuredRarity.color }}
                      >
                        Vedette • {featuredRarity.label} ({featuredRarity.probability}%)
                      </div>
                      <div className="truncate text-xs font-semibold text-accent-50">
                        {featuredSkin.weaponName} | {featuredSkin.name}
                      </div>
                    </div>
                  </div>
                  <span
                    className="shrink-0 font-mono-num text-xs font-bold"
                    style={{ color: featuredRarity.color }}
                  >
                    ~{formatCredits(featuredSkin.baseValue)}
                  </span>
                </div>

                {imageSkins.length > 1 && (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-accent-500/10 bg-surface-base/55 px-3 py-1.5">
                    <span className="text-[10px] font-semibold text-accent-200/65">
                      {imageSkins.length} modèles 3D
                    </span>
                    <div className="flex items-center gap-1.5">
                      {imageSkins.slice(0, 4).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            soundEngine.playClick();
                            inspectWeapon(s);
                          }}
                          title={`Inspecter ${s.weaponName} | ${s.name} en 3D`}
                          aria-label={`Inspecter ${s.weaponName} ${s.name} en 3D`}
                          className="cursor-zoom-in rounded p-0.5 transition hover:bg-white/10"
                        >
                          <img
                            src={s.image}
                            alt={`${s.weaponName} ${s.name}`}
                            className="h-7 w-12 object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.7)] transition-transform duration-200 hover:scale-110"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            className="relative z-10 mt-5 border-t border-accent-500/10 pt-4"
            style={{ transform: 'translateZ(20px)' }}
          >
            <div className="mb-3 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-base">
              {RARITY_ORDER.map((rid) => (
                <div
                  key={rid}
                  style={{
                    width: `${RARITIES[rid].probability}%`,
                    backgroundColor: RARITIES[rid].color,
                  }}
                  title={`${RARITIES[rid].label} : ${RARITIES[rid].probability}%`}
                />
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-accent-200/50">
                  Prix de la caisse
                </span>
                <span className="font-mono-num text-lg font-bold text-accent-300">
                  {formatCredits(crate.price)}
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(crate);
                }}
                className="relative overflow-hidden rounded-xl bg-accent-500/15 px-4 py-2.5 text-xs font-bold text-accent-200 ring-1 ring-accent-400/35 transition group-hover:bg-accent-400 group-hover:text-accent-950"
              >
                <span className="sheen-overlay relative z-10 flex items-center gap-1.5">
                  Ouvrir
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </div>
          </div>
        </article>
      </Tilt3D>
    </motion.div>
  );
};
