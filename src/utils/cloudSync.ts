import { DropHistoryItem, InventoryItem, PlayerStats } from '../types/casino';
import { PersistedState } from './storage';

export interface CloudProfileRow {
  id: string;
  username?: string | null;
  credits: number | string;
  inventory: InventoryItem[];
  drop_history: DropHistoryItem[];
  stats: Partial<PlayerStats> | Record<string, unknown>;
  storage_limit: number | string;
  updated_at?: string;
}

export interface CloudBaseline {
  credits: number;
  storageLimit: number;
  inventoryJson: string;
  inventoryIds: string[];
  historyJson: string;
  statsJson: string;
}

export function parseSafeCloudNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function buildCloudBaseline(
  state: Pick<PersistedState, 'balance' | 'inventoryCapacity' | 'inventory' | 'history' | 'stats'>
): CloudBaseline {
  return {
    credits: state.balance,
    storageLimit: state.inventoryCapacity,
    inventoryJson: JSON.stringify(state.inventory),
    inventoryIds: state.inventory.map((it) => it.instanceId),
    historyJson: JSON.stringify(state.history),
    statsJson: JSON.stringify(state.stats),
  };
}

export function hasCloudSyncedDiff(
  state: PersistedState,
  baseline: CloudBaseline | null
): boolean {
  if (!baseline) return true;
  if (state.balance !== baseline.credits) return true;
  if (state.inventoryCapacity !== baseline.storageLimit) return true;
  if (JSON.stringify(state.inventory) !== baseline.inventoryJson) return true;
  if (JSON.stringify(state.history) !== baseline.historyJson) return true;
  if (JSON.stringify(state.stats) !== baseline.statsJson) return true;
  return false;
}

export interface MergeCloudResult {
  nextState: PersistedState;
  nextBaseline: CloudBaseline;
  creditsDeltaFromAdmin: number;
  adminChanged: boolean;
}

/**
 * Fusionne proprement les modifications effectuées côté Supabase (ex: ajout/retrait de crédits
 * ou de skins par l'admin) avec l'état local du joueur sans jamais écraser les changements admin.
 */
export function mergeServerEditsIntoLocalState(
  localState: PersistedState,
  baseline: CloudBaseline,
  serverRow: CloudProfileRow
): MergeCloudResult {
  const serverCredits = parseSafeCloudNumber(serverRow.credits, baseline.credits);
  const serverLimit = parseSafeCloudNumber(serverRow.storage_limit, baseline.storageLimit);
  const serverInv = Array.isArray(serverRow.inventory) ? serverRow.inventory : [];
  const serverInvJson = JSON.stringify(serverInv);

  const creditsDeltaFromAdmin = serverCredits - baseline.credits;
  const limitDeltaFromAdmin = serverLimit - baseline.storageLimit;
  const inventoryChangedByAdmin = serverInvJson !== baseline.inventoryJson;

  const adminChanged =
    creditsDeltaFromAdmin !== 0 || limitDeltaFromAdmin !== 0 || inventoryChangedByAdmin;

  const localInvJson = JSON.stringify(localState.inventory);
  const localInvChanged = localInvJson !== baseline.inventoryJson;

  let mergedInventory = localState.inventory;
  if (inventoryChangedByAdmin) {
    if (!localInvChanged) {
      mergedInventory = serverInv;
    } else {
      const baselineIds = new Set(baseline.inventoryIds);
      const serverIds = new Set(serverInv.map((it) => it.instanceId));
      const localIds = new Set(localState.inventory.map((it) => it.instanceId));

      // Items ajoutés directement par l'admin dans Supabase
      const adminAdded = serverInv.filter(
        (it) => !baselineIds.has(it.instanceId) && !localIds.has(it.instanceId)
      );
      // Items supprimés par l'admin dans Supabase
      const adminRemovedIds = new Set(
        baseline.inventoryIds.filter((id) => !serverIds.has(id))
      );

      mergedInventory = [
        ...adminAdded,
        ...localState.inventory.filter((it) => !adminRemovedIds.has(it.instanceId)),
      ];
    }
  }

  const mergedBalance =
    localState.balance === baseline.credits
      ? Math.max(0, serverCredits)
      : Math.max(0, localState.balance + creditsDeltaFromAdmin);

  const mergedCapacity =
    localState.inventoryCapacity === baseline.storageLimit
      ? Math.max(25, serverLimit)
      : Math.max(25, localState.inventoryCapacity + limitDeltaFromAdmin);

  // Nettoyer les armes équipées si l'admin les a supprimées de l'inventaire
  const mergedInvIds = new Set(mergedInventory.map((it) => it.instanceId));
  const equippedWeaponId =
    localState.equippedWeaponId && mergedInvIds.has(localState.equippedWeaponId)
      ? localState.equippedWeaponId
      : null;
  const equippedKnifeId =
    localState.equippedKnifeId && mergedInvIds.has(localState.equippedKnifeId)
      ? localState.equippedKnifeId
      : null;

  const nextState: PersistedState = {
    ...localState,
    balance: mergedBalance,
    inventory: mergedInventory,
    inventoryCapacity: mergedCapacity,
    equippedWeaponId,
    equippedKnifeId,
  };

  return {
    nextState,
    nextBaseline: buildCloudBaseline(nextState),
    creditsDeltaFromAdmin,
    adminChanged,
  };
}
