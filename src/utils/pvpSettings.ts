export type CrosshairStyle = 'cross' | 'dot' | 'cross-dot' | 'circle';

export interface CrosshairConfig {
  style: CrosshairStyle;
  color: string;
  size: number;
  thickness: number;
  gap: number;
  outline: boolean;
}

export interface PvpControlsConfig {
  /** Multiplier around Zombie base sensitivity (1.0 = exact Zombie mode sensitivity). */
  sensitivity: number;
  /** Optimizes aiming & firing for laptop trackpads (F/E to shoot, V to scope, smoothed aiming). */
  trackpadMode: boolean;
  crosshair: CrosshairConfig;
}

export const CROSSHAIR_COLOR_PRESETS: { id: string; label: string; hex: string }[] = [
  { id: 'cyan', label: 'Cyan', hex: '#22d3ee' },
  { id: 'green', label: 'Vert Néon', hex: '#4ade80' },
  { id: 'white', label: 'Blanc', hex: '#ffffff' },
  { id: 'gold', label: 'Jaune Or', hex: '#facc15' },
  { id: 'rose', label: 'Rouge', hex: '#fb7185' },
  { id: 'violet', label: 'Violet', hex: '#c084fc' },
];

export const DEFAULT_CROSSHAIR_CONFIG: CrosshairConfig = {
  style: 'cross-dot',
  color: '#22d3ee',
  size: 8,
  thickness: 2,
  gap: 4,
  outline: true,
};

export const DEFAULT_PVP_CONTROLS_CONFIG: PvpControlsConfig = {
  sensitivity: 1.0,
  trackpadMode: false,
  crosshair: DEFAULT_CROSSHAIR_CONFIG,
};

const STORAGE_KEY = 'dopamine_pvp_controls_v1';

export function clampSensitivity(value: number): number {
  if (!Number.isFinite(value)) return 1.0;
  return Math.round(Math.max(0.25, Math.min(2.0, value)) * 100) / 100;
}

export function loadPvpControlsConfig(): PvpControlsConfig {
  if (typeof localStorage === 'undefined') return DEFAULT_PVP_CONTROLS_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PVP_CONTROLS_CONFIG;
    const parsed = JSON.parse(raw) as Partial<PvpControlsConfig>;
    const ch: Partial<CrosshairConfig> = parsed.crosshair ?? {};
    const validStyles: CrosshairStyle[] = ['cross', 'dot', 'cross-dot', 'circle'];
    return {
      sensitivity: clampSensitivity(parsed.sensitivity ?? 1.0),
      trackpadMode: Boolean(parsed.trackpadMode),
      crosshair: {
        style: validStyles.includes(ch.style as CrosshairStyle)
          ? (ch.style as CrosshairStyle)
          : DEFAULT_CROSSHAIR_CONFIG.style,
        color: typeof ch.color === 'string' && ch.color.startsWith('#')
          ? ch.color
          : DEFAULT_CROSSHAIR_CONFIG.color,
        size: Math.max(3, Math.min(18, Number(ch.size) || DEFAULT_CROSSHAIR_CONFIG.size)),
        thickness: Math.max(1, Math.min(5, Number(ch.thickness) || DEFAULT_CROSSHAIR_CONFIG.thickness)),
        gap: Math.max(0, Math.min(12, Number(ch.gap ?? DEFAULT_CROSSHAIR_CONFIG.gap))),
        outline: ch.outline !== undefined ? Boolean(ch.outline) : true,
      },
    };
  } catch {
    return DEFAULT_PVP_CONTROLS_CONFIG;
  }
}

export function savePvpControlsConfig(config: PvpControlsConfig): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Computes effective mouse sensitivity multiplier, applying gentle trackpad damping
 * when Laptop Trackpad Mode is enabled.
 */
export function computeEffectiveSensitivityMultiplier(
  sensitivity: number,
  trackpadMode: boolean
): number {
  const clamped = clampSensitivity(sensitivity);
  return trackpadMode ? clamped * 0.65 : clamped;
}
