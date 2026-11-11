import React from 'react';
import { EmblemType } from '../types/casino';

interface CrateEmblemProps {
  type: EmblemType;
  accentColor: string;
  image?: string;
  alt?: string;
  size?: number;
  className?: string;
}

export const CrateEmblem: React.FC<CrateEmblemProps> = ({
  type,
  accentColor,
  image,
  alt = 'Caisse 3D',
  size = 112,
  className = '',
}) => {
  if (image) {
    const hasCustomSizing = /\b(w-|h-|aspect-)/.test(className);
    return (
      <div
        className={`relative overflow-hidden rounded-2xl border bg-[#060912] select-none transition-all duration-300 ${className}`}
        style={{
          borderColor: `${accentColor}45`,
          boxShadow: `0 14px 32px -12px rgba(0,0,0,0.88), 0 0 28px -10px ${accentColor}42`,
          ...(hasCustomSizing ? {} : { width: Math.round(size * 1.34), height: size }),
        }}
      >
        <div
          className="pointer-events-none absolute -inset-4 rounded-full opacity-25 blur-2xl transition-opacity duration-300 group-hover:opacity-50"
          style={{ background: accentColor }}
        />
        <img
          src={image}
          alt={alt}
          loading="lazy"
          className="animate-float relative z-10 h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.07]"
        />
        <div className="sheen-overlay pointer-events-none absolute inset-0 z-20 rounded-2xl shadow-[inset_0_0_24px_rgba(6,9,18,0.72)] ring-1 ring-inset ring-white/10" />
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Ambient radial glow */}
      <div
        className="absolute inset-2 rounded-full blur-2xl opacity-35 transition-opacity duration-300 group-hover:opacity-60"
        style={{ background: accentColor }}
      />

      <svg
        viewBox="0 0 120 120"
        width={size}
        height={size}
        className="relative z-10 overflow-visible drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]"
      >
        <defs>
          <linearGradient id={`crateBody-${type}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1B2234" />
            <stop offset="55%" stopColor="#0E1320" />
            <stop offset="100%" stopColor="#070A12" />
          </linearGradient>
          <linearGradient id={`crateTop-${type}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.4" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Isometric Stylized Crate Frame */}
        <polygon
          points="60,14 102,35 102,83 60,104 18,83 18,35"
          fill={`url(#crateBody-${type})`}
          stroke={accentColor}
          strokeOpacity="0.55"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />

        {/* Top Isometric Lid */}
        <polygon
          points="60,14 102,35 60,55 18,35"
          fill={`url(#crateTop-${type})`}
          stroke={accentColor}
          strokeOpacity="0.65"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />

        {/* Center vertical divider */}
        <line
          x1="60"
          y1="55"
          x2="60"
          y2="104"
          stroke={accentColor}
          strokeOpacity="0.35"
          strokeWidth="1.3"
        />

        {/* Latch / Lock Core */}
        <polygon
          points="60,47 68,55 60,63 52,55"
          fill="#070A12"
          stroke={accentColor}
          strokeWidth="1.8"
        />
        <circle cx="60" cy="55" r="2.6" fill={accentColor} />

        {/* Theme-specific inner iconography */}
        {type === 'forest' && (
          <g stroke={accentColor} strokeWidth="1.5" fill="none" strokeLinecap="round">
            <path d="M60 22 L70 34 L64 34 L73 44 L47 44 L56 34 L50 34 Z" fill={accentColor} fillOpacity="0.22" />
            <path d="M29 62 L49 71 M29 71 L45 78" strokeOpacity="0.55" />
            <path d="M91 62 L71 71 M91 71 L75 78" strokeOpacity="0.55" />
          </g>
        )}

        {type === 'venom' && (
          <g stroke={accentColor} strokeWidth="1.5" fill="none">
            <circle cx="60" cy="34" r="9" strokeOpacity="0.85" />
            <circle cx="60" cy="30" r="3" fill={accentColor} fillOpacity="0.4" />
            <circle cx="56.5" cy="36.5" r="3" fill={accentColor} fillOpacity="0.4" />
            <circle cx="63.5" cy="36.5" r="3" fill={accentColor} fillOpacity="0.4" />
            <path d="M26 52 L48 63 M26 60 L48 71" strokeOpacity="0.5" strokeDasharray="3 3" />
            <path d="M94 52 L72 63 M94 60 L72 71" strokeOpacity="0.5" strokeDasharray="3 3" />
          </g>
        )}

        {type === 'matrix' && (
          <g stroke={accentColor} strokeWidth="1.4" fill="none">
            <rect x="52" y="26" width="16" height="16" rx="2" transform="rotate(45 60 34)" fill={accentColor} fillOpacity="0.2" />
            <path d="M32 62 H46 V74 M88 62 H74 V74" strokeOpacity="0.7" />
            <circle cx="46" cy="74" r="2" fill={accentColor} />
            <circle cx="74" cy="74" r="2" fill={accentColor} />
          </g>
        )}

        {type === 'reactor' && (
          <g stroke={accentColor} strokeWidth="1.5" fill="none">
            <circle cx="60" cy="34" r="10" strokeDasharray="4 3" />
            <circle cx="60" cy="34" r="4.5" fill={accentColor} fillOpacity="0.45" />
            <ellipse cx="40" cy="73" rx="7" ry="10" transform="rotate(-18 40 73)" strokeOpacity="0.6" />
            <ellipse cx="80" cy="73" rx="7" ry="10" transform="rotate(18 80 73)" strokeOpacity="0.6" />
          </g>
        )}

        {type === 'jade' && (
          <g stroke={accentColor} strokeWidth="1.5" fill="none">
            <polygon points="60,23 72,34 60,45 48,34" fill={accentColor} fillOpacity="0.24" />
            <polygon points="60,27 67,34 60,41 53,34" stroke="#FBBF24" strokeOpacity="0.85" />
            <path d="M29 58 H49 M29 77 H49 M71 58 H91 M71 77 H91" stroke="#FBBF24" strokeOpacity="0.5" />
          </g>
        )}

        {type === 'prism' && (
          <g stroke={accentColor} strokeWidth="1.4" fill="none">
            <polygon points="60,20 74,34 60,48 46,34" fill="#F472B6" fillOpacity="0.24" stroke="#F472B6" />
            <line x1="60" y1="20" x2="60" y2="48" stroke="#FDE047" strokeOpacity="0.75" />
            <line x1="46" y1="34" x2="74" y2="34" stroke="#38BDF8" strokeOpacity="0.8" />
            <path d="M27 65 L48 76 L34 86 Z" fill={accentColor} fillOpacity="0.18" />
            <path d="M93 65 L72 76 L86 86 Z" fill="#F472B6" fillOpacity="0.18" stroke="#F472B6" strokeOpacity="0.6" />
          </g>
        )}

        {type === 'radiant' && (
          <g stroke={accentColor} strokeWidth="1.5" fill="none" strokeLinecap="round">
            <polygon points="60,21 71,34 60,47 49,34" fill={accentColor} fillOpacity="0.22" />
            <path d="M52 29 L60 39 L68 29" stroke="#F43F5E" strokeWidth="1.8" />
            <path d="M30 58 L46 66 L30 74" stroke="#22D3EE" strokeOpacity="0.8" />
            <path d="M90 58 L74 66 L90 74" stroke="#F43F5E" strokeOpacity="0.8" />
          </g>
        )}

        {type === 'champions' && (
          <g stroke="#FACC15" strokeWidth="1.5" fill="none" strokeLinejoin="round">
            <polygon points="60,19 64,29 74,33 64,37 60,47 56,37 46,33 56,29" fill="#FACC15" fillOpacity="0.3" />
            <path d="M30 61 L48 70 M30 71 L45 79" stroke="#F59E0B" strokeOpacity="0.8" />
            <path d="M90 61 L72 70 M90 71 L75 79" stroke="#F59E0B" strokeOpacity="0.8" />
          </g>
        )}
      </svg>
    </div>
  );
};
