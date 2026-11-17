// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clampSensitivity,
  computeEffectiveSensitivityMultiplier,
  DEFAULT_PVP_CONTROLS_CONFIG,
  loadPvpControlsConfig,
  savePvpControlsConfig,
} from './pvpSettings';

describe('pvpSettings — sensibilité, mode trackpad et crosshair', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('borne la sensibilité entre 0.25x et 2.0x et applique le lissage trackpad', () => {
    expect(clampSensitivity(0.05)).toBe(0.25);
    expect(clampSensitivity(5.0)).toBe(2.0);
    expect(clampSensitivity(1.0)).toBe(1.0);

    expect(computeEffectiveSensitivityMultiplier(1.0, false)).toBe(1.0);
    expect(computeEffectiveSensitivityMultiplier(1.0, true)).toBeCloseTo(0.65, 5);
  });

  it('sauvegarde et recharge la configuration crosshair, sensibilité et mode trackpad', () => {
    const custom = {
      ...DEFAULT_PVP_CONTROLS_CONFIG,
      sensitivity: 0.75,
      trackpadMode: true,
      crosshair: {
        style: 'dot' as const,
        color: '#4ade80',
        size: 10,
        thickness: 3,
        gap: 2,
        outline: true,
      },
    };
    savePvpControlsConfig(custom);
    const loaded = loadPvpControlsConfig();
    expect(loaded).toEqual(custom);
  });
});
