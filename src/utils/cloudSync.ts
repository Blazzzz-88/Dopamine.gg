import { CRATES } from '../data/catalog';
import { DropHistoryItem, InventoryItem, PlayerStats, SkinDefinition } from '../types/casino';
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
  inventorySignature: string;
  inventoryIds: string[];
  historyCount: number;
  statsJson: string;
}

// Cache rapide pour retrouver la définition d'un skin par skinId ou combinaison nom/crate
const SKIN_LOOKUP_MAP = new Map<string, SkinDefinition>();
for (const crate of CRATES) {
  for (const s of crate.skins) {
    SKIN_LOOKUP_MAP.set(s.id, s);
    SKIN_LOOKUP_MAP.set(`${crate.id}::${s.name}`, s);
    SKIN_LOOKUP_MAP.set(`${s.weaponName}::${s.name}`, s);
  }
}

/**
 * Allège l'inventaire avant envoi à Supabase en retirant les champs lourds (comme 'image' en base64)
 * qui sont déjà présents localement dans l'application compilée.
 */
export function sanitizeItemForCloud(item: InventoryItem): InventoryItem {
  if (!item.image) return item;
  const { image: _omitted, ...leanItem } = item;
  return leanItem as InventoryItem;
}

/**
 * Ré-attache les images locales du catalogue dès la lecture depuis Supabase.
 */
export function hydrateItemFromCatalog(item: InventoryItem): InventoryItem {
  if (item.image) return item;
  const match =
    SKIN_LOOKUP_MAP.get(item.skinId) ||
    SKIN_LOOKUP_MAP.get(`${item.crateId}::${item.name}`) ||
    SKIN_LOOKUP_MAP.get(`${item.weaponName}::${item.name}`);
  if (match?.image) {
    return { ...item, image: match.image };
  }
  return item;
}

export function sanitizeInventoryForCloud(inventory: InventoryItem[]): InventoryItem[] {
  return inventory.map(sanitizeItemForCloud);
}

export function hydrateInventoryFromCatalog(inventory: InventoryItem[]): InventoryItem[] {
  return inventory.map(hydrateItemFromCatalog);
}

export function parseSafeCloudNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Signature d'inventaire ultra légère (instanceId + nom + float + wear + locked)
 * Ne consomme quasi aucun octet et détecte toute modification sans comparer des images.
 */
export function buildInventorySignature(inventory: InventoryItem[]): string {
  return inventory
    .map((it) => `${it.instanceId}:${it.name}:${it.floatVal ?? 0}:${it.locked ? 1 : 0}`)
    .join('|');
}

export function buildCloudBaseline(
  state: Pick<PersistedState, 'balance' | 'inventoryCapacity' | 'inventory' | 'history' | 'stats'>
): CloudBaseline {
  return {
    credits: state.balance,
    storageLimit: state.inventoryCapacity,
    inventorySignature: buildInventorySignature(state.inventory),
    inventoryIds: state.inventory.map((it) => it.instanceId),
    historyCount: state.history.length,
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
  if (buildInventorySignature(state.inventory) !== baseline.inventorySignature) return true;
  if (state.history.length !== baseline.historyCount) return true;
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
 * ou de skins par l'admin) avec l'état local du joueur sans écraser les changements admin.
 */
export function mergeServerEditsIntoLocalState(
  localState: PersistedState,
  baseline: CloudBaseline,
  serverRow: CloudProfileRow
): MergeCloudResult {
  const serverCredits = parseSafeCloudNumber(serverRow.credits, baseline.credits);
  const serverLimit = parseSafeCloudNumber(serverRow.storage_limit, baseline.storageLimit);
  const rawServerInv = Array.isArray(serverRow.inventory) ? serverRow.inventory : [];
  const serverInv = hydrateInventoryFromCatalog(rawServerInv);
  const serverSignature = buildInventorySignature(serverInv);

  const creditsDeltaFromAdmin = serverCredits - baseline.credits;
  const limitDeltaFromAdmin = serverLimit - baseline.storageLimit;
  const inventoryChangedByAdmin = serverSignature !== baseline.inventorySignature;

  const adminChanged =
    creditsDeltaFromAdmin !== 0 || limitDeltaFromAdmin !== 0 || inventoryChangedByAdmin;

  const localSignature = buildInventorySignature(localState.inventory);
  const localInvChanged = localSignature !== baseline.inventorySignature;

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
