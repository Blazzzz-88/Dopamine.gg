import { DEFAULT_THEME, ThemeId, THEMES } from '../data/themes';
import {
  DailyChallengesState,
  DropHistoryItem,
  InventoryItem,
  PlayerStats,
} from '../types/casino';
import {
  createDailyChallengesState,
  ensureTodayChallenges,
} from './zombieChallenges';

const STORAGE_KEY = 'dopamine_gg_state_v3';
const LEGACY_KEYS = [
  'dopamine_gg_state_v2',
  'dopamine_gg_state_v1',
  'aura_vault_state_v3',
  'aura_vault_state_v2',
  'emeraude_vault_state_v1',
];

export const BASE_INVENTORY_CAPACITY = 25;
export const STORAGE_UPGRADE_STEP = 5;
export const STORAGE_UPGRADE_BASE_COST = 3000;
export const STORAGE_UPGRADE_COST_INCREMENT = 500;

export function getNextStorageUpgradeCost(currentCapacity: number): number {
  const safeCapacity = Math.max(BASE_INVENTORY_CAPACITY, currentCapacity);
  const upgradesBought = Math.floor(
    (safeCapacity - BASE_INVENTORY_CAPACITY) / STORAGE_UPGRADE_STEP
  );
  return STORAGE_UPGRADE_BASE_COST + upgradesBought * STORAGE_UPGRADE_COST_INCREMENT;
}

export interface PersistedState {
  balance: number;
  inventory: InventoryItem[];
  inventoryCapacity: number;
  equippedWeaponId: string | null;
  equippedKnifeId: string | null;
  history: DropHistoryItem[];
  stats: PlayerStats;
  dailyChallenges: DailyChallengesState;
  soundEnabled: boolean;
  themeId: ThemeId;
}

export function createDefaultStats(): PlayerStats {
  return {
    casesOpened: 0,
    totalSpent: 0,
    totalWonValue: 0,
    upgradesAttempted: 0,
    upgradesWon: 0,
    contractsCompleted: 0,
    bestDropValue: 0,
    bestDropName: null,
    rarityCounts: {
      commune: 0,
      rare: 0,
      mythique: 0,
      legendaire: 0,
      secret: 0,
    },
  };
}

export const DEFAULT_STATS: PlayerStats = createDefaultStats();

export function createInitialState(): PersistedState {
  return {
    balance: 3000,
    inventory: [],
    inventoryCapacity: BASE_INVENTORY_CAPACITY,
    equippedWeaponId: null,
    equippedKnifeId: null,
    history: [],
    stats: createDefaultStats(),
    dailyChallenges: createDailyChallengesState(),
    soundEnabled: true,
    themeId: DEFAULT_THEME,
  };
}

export const INITIAL_STATE: PersistedState = createInitialState();

export function loadPersistedState(): PersistedState {
  let resolvedState: PersistedState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // One-time clean reset of balance, inventory, purchases & history across legacy keys
      let preservedTheme: ThemeId = DEFAULT_THEME;
      let preservedSound = true;
      for (const oldKey of LEGACY_KEYS) {
        const oldRaw = localStorage.getItem(oldKey);
        if (oldRaw) {
          try {
            const oldParsed = JSON.parse(oldRaw) as Partial<PersistedState>;
            if (THEMES.some((t) => t.id === oldParsed.themeId)) {
              preservedTheme = oldParsed.themeId as ThemeId;
            }
            if (typeof oldParsed.soundEnabled === 'boolean') {
              preservedSound = oldParsed.soundEnabled;
            }
          } catch {
            // Ignore malformed legacy state
          }
          localStorage.removeItem(oldKey);
        }
      }
      const fresh: PersistedState = {
        ...createInitialState(),
        themeId: preservedTheme,
        soundEnabled: preservedSound,
      };
      savePersistedState(fresh);
      resolvedState = fresh;
    } else {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      const validTheme = THEMES.some((t) => t.id === parsed.themeId)
        ? (parsed.themeId as ThemeId)
        : DEFAULT_THEME;

      const inv = Array.isArray(parsed.inventory) ? parsed.inventory : [];
      const cap =
        typeof parsed.inventoryCapacity === 'number' &&
        parsed.inventoryCapacity >= BASE_INVENTORY_CAPACITY
          ? parsed.inventoryCapacity
          : BASE_INVENTORY_CAPACITY;
      const rawEqWeapon =
        typeof parsed.equippedWeaponId === 'string'
          ? inv.find((it) => it.instanceId === parsed.equippedWeaponId) ?? null
          : null;
      const explicitKnife =
        typeof parsed.equippedKnifeId === 'string'
          ? inv.find((it) => it.instanceId === parsed.equippedKnifeId && it.weaponClass === 'lame') ??
            null
          : null;

      // Migrate any knife previously saved under equippedWeaponId into dedicated knife slot
      const eqId = rawEqWeapon && rawEqWeapon.weaponClass !== 'lame' ? rawEqWeapon.instanceId : null;
      const eqKnifeId =
        explicitKnife?.instanceId ??
        (rawEqWeapon && rawEqWeapon.weaponClass === 'lame' ? rawEqWeapon.instanceId : null);

      resolvedState = {
        balance: typeof parsed.balance === 'number' ? parsed.balance : INITIAL_STATE.balance,
        inventory: inv,
        inventoryCapacity: cap,
        equippedWeaponId: eqId,
        equippedKnifeId: eqKnifeId,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        stats: parsed.stats
          ? {
              ...createDefaultStats(),
              ...parsed.stats,
              rarityCounts: {
                ...createDefaultStats().rarityCounts,
                ...(parsed.stats.rarityCounts ?? {}),
              },
            }
          : createDefaultStats(),
        dailyChallenges: ensureTodayChallenges(parsed.dailyChallenges),
        soundEnabled: typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : true,
        themeId: validTheme,
      };
    }
  } catch {
    resolvedState = createInitialState();
  }

  // Pack personnel désactivé pour que l'inventaire commence vide pour tout le monde
  return resolvedState;
}

export function savePersistedState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors silently
  }
}
