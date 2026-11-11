import React from 'react';
import { Box } from 'lucide-react';
import { WeaponClass } from '../types/casino';
import { soundEngine } from '../utils/sound';

interface WeaponSilhouetteProps {
  weaponClass: WeaponClass;
  accentColor: string;
  swatches?: [string, string, string];
  image?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onInspect?: () => void;
}

/**
 * Displays the transparent full-weapon cutout when available (with optional click-to-inspect
 * 3D view), or a clean schematic blueprint silhouette placeholder.
 */
export const WeaponSilhouette: React.FC<WeaponSilhouetteProps> = ({
  weaponClass,
  accentColor,
  swatches,
  image,
  alt = 'Modèle d’arme',
  size = 'md',
  className = '',
  onInspect,
}) => {
  const heightClass =
    size === 'sm' ? 'h-16 w-full' : size === 'lg' ? 'h-40 w-full max-w-sm' : 'h-24 w-full';

  if (image) {
    const imgElement = (
      <div className={`relative flex items-center justify-center ${heightClass}`}>
        {/* Soft rarity glow behind transparent weapon cutout */}
        <div
          className="pointer-events-none absolute inset-2 rounded-full opacity-25 blur-xl transition-opacity duration-300 group-hover:opacity-45"
          style={{ background: accentColor }}
        />
        <img
          src={image}
          alt={alt}
          loading="lazy"
          className="relative z-10 max-h-full max-w-full object-contain drop-shadow-[0_10px_18px_rgba(0,0,0,0.68)] transition-transform duration-300 group-hover:scale-[1.04]"
        />
        {onInspect && size !== 'sm' && (
          <span className="pointer-events-none absolute right-0 top-0 z-20 inline-flex items-center gap-1 rounded-md border border-accent-400/35 bg-black/65 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-200 opacity-0 backdrop-blur-xs transition-opacity duration-200 group-hover:opacity-100">
            <Box className="h-2.5 w-2.5 text-accent-300" />
            3D
          </span>
        )}
      </div>
    );

    return (
      <div className={`relative flex w-full flex-col items-center justify-center ${className}`}>
        {onInspect ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              soundEngine.playClick();
              onInspect();
            }}
            title={`Inspecter ${alt} en 3D`}
            aria-label={`Inspecter ${alt} en 3D`}
            className="group relative flex w-full cursor-zoom-in items-center justify-center rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/70"
          >
            {imgElement}
          </button>
        ) : (
          imgElement
        )}

        {swatches && size !== 'sm' && (
          <div className="mt-2 flex items-center gap-1" title="Palette chromatique du skin">
            {swatches.map((hex, i) => (
              <span
                key={i}
                className="h-1.5 w-4 rounded-full border border-white/15"
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const svgClass =
    size === 'sm' ? 'h-12 w-24' : size === 'lg' ? 'h-28 w-56' : 'h-20 w-40';

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 180 76"
        className={`${svgClass} overflow-visible`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={`wp-${weaponClass}-${accentColor.replace('#', '')}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={swatches?.[0] ?? accentColor} stopOpacity="0.45" />
            <stop offset="60%" stopColor={swatches?.[1] ?? '#0D2118'} stopOpacity="0.85" />
            <stop offset="100%" stopColor={swatches?.[2] ?? accentColor} stopOpacity="0.35" />
          </linearGradient>
        </defs>

        <line x1="8" y1="38" x2="172" y2="38" stroke={accentColor} strokeOpacity="0.12" strokeDasharray="3 3" />
        <line x1="90" y1="6" x2="90" y2="70" stroke={accentColor} strokeOpacity="0.12" strokeDasharray="3 3" />

        {weaponClass === 'fusil' && (
          <g stroke={accentColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path
              d="M20 34 L46 31 L56 26 H112 L117 31 H154 V35 H122 L116 40 H98 L93 56 L84 55 L88 40 H67 L61 52 H53 L56 40 H44 L22 48 L17 45 Z"
              fill={`url(#wp-${weaponClass}-${accentColor.replace('#', '')})`}
            />
            <rect x="69" y="20" width="22" height="5" rx="1" strokeOpacity="0.7" />
            <line x1="126" y1="31" x2="126" y2="35" strokeOpacity="0.6" />
          </g>
        )}

        {weaponClass === 'sniper' && (
          <g stroke={accentColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path
              d="M12 37 L42 33 L54 29 H104 L110 33 H168 V36 H114 L106 41 H86 L82 54 H74 L77 41 H55 L46 49 L14 48 Z"
              fill={`url(#wp-${weaponClass}-${accentColor.replace('#', '')})`}
            />
            <rect x="62" y="18" width="38" height="7" rx="2" fill={accentColor} fillOpacity="0.16" />
            <line x1="72" y1="25" x2="72" y2="29" />
            <line x1="90" y1="25" x2="90" y2="29" />
            <line x1="120" y1="36" x2="128" y2="49" strokeOpacity="0.75" />
          </g>
        )}

        {weaponClass === 'pm' && (
          <g stroke={accentColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path
              d="M32 32 L54 27 H114 L120 32 H142 V37 H118 L112 42 H94 L90 58 H81 L84 42 H66 L61 55 H53 L57 41 H32 Z"
              fill={`url(#wp-${weaponClass}-${accentColor.replace('#', '')})`}
            />
            <rect x="70" y="21" width="18" height="5" rx="1" strokeOpacity="0.75" />
            <circle cx="130" cy="34.5" r="1.5" fill={accentColor} />
          </g>
        )}

        {weaponClass === 'pistolet' && (
          <g stroke={accentColor} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
            <path
              d="M54 24 H126 V34 H104 L96 42 H82 L76 60 H61 L67 39 H54 Z"
              fill={`url(#wp-${weaponClass}-${accentColor.replace('#', '')})`}
            />
            <line x1="60" y1="29" x2="118" y2="29" strokeOpacity="0.55" />
            <path d="M84 39 H93 L91 46 H81" strokeOpacity="0.7" />
          </g>
        )}

        {weaponClass === 'pompe' && (
          <g stroke={accentColor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
            <path
              d="M18 42 L45 34 L58 29 H152 V34 H104 L98 41 H74 L68 52 H58 L62 41 H45 L22 50 Z"
              fill={`url(#wp-${weaponClass}-${accentColor.replace('#', '')})`}
            />
            <rect x="92" y="35" width="32" height="5" rx="1.5" fill={accentColor} fillOpacity="0.2" />
            <line x1="128" y1="31.5" x2="150" y2="31.5" strokeOpacity="0.6" />
          </g>
        )}

        {weaponClass === 'lame' && (
          <g stroke={accentColor} strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round">
            <path
              d="M36 52 C44 43 56 38 66 40 C86 24 118 18 144 21 C130 35 104 45 78 47 L62 52 C53 56 44 58 36 52 Z"
              fill={`url(#wp-${weaponClass}-${accentColor.replace('#', '')})`}
            />
            <circle cx="44" cy="51" r="4.5" fill="var(--surface-base)" stroke={accentColor} strokeWidth="1.5" />
            <path d="M74 42 C96 34 118 27 136 23" strokeOpacity="0.65" />
          </g>
        )}
      </svg>

      {swatches && size !== 'sm' && (
        <div className="mt-1 flex items-center gap-1" title="Palette chromatique du skin">
          {swatches.map((hex, i) => (
            <span
              key={i}
              className="h-1.5 w-4 rounded-full border border-white/10"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
