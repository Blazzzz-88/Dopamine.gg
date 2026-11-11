export type ThemeId = 'saphir' | 'ambre' | 'amethyste' | 'rubis';

export interface ThemePalette {
  id: ThemeId;
  name: string;
  subtitle: string;
  swatchPrimary: string;
  swatchSecondary: string;
  baseBg: string;
}

export const THEMES: ThemePalette[] = [
  {
    id: 'saphir',
    name: 'Saphir & Glace',
    subtitle: 'Bleu nuit profond & cyan givré',
    swatchPrimary: '#38BDF8',
    swatchSecondary: '#818CF8',
    baseBg: '#050811',
  },
  {
    id: 'ambre',
    name: 'Obsidienne & Or',
    subtitle: 'Charbon mat & or champagne',
    swatchPrimary: '#FBBF24',
    swatchSecondary: '#FDBA74',
    baseBg: '#090806',
  },
  {
    id: 'amethyste',
    name: 'Nuit & Améthyste',
    subtitle: 'Indigo sombre & violet astral',
    swatchPrimary: '#A78BFA',
    swatchSecondary: '#F472B6',
    baseBg: '#080612',
  },
  {
    id: 'rubis',
    name: 'Carbone & Corail',
    subtitle: 'Noir ardoise & corail rubis',
    swatchPrimary: '#FB7185',
    swatchSecondary: '#FDA4AF',
    baseBg: '#0C0709',
  },
];

export const DEFAULT_THEME: ThemeId = 'saphir';
