export type RarityId = 'commune' | 'rare' | 'mythique' | 'legendaire' | 'secret';

export type WeaponClass = 'fusil' | 'pm' | 'sniper' | 'pistolet' | 'pompe' | 'lame';

export type WearTier =
  | 'Neuf d’usine'
  | 'Très peu usé'
  | 'Testé sur le terrain'
  | 'Marqué par les combats';

export type CategoryId = 'tactique' | 'cyber' | 'reliques';

export type NavTab = 'boutique' | 'inventaire' | 'upgrader' | 'contrat' | 'statistiques';

export type EmblemType =
  | 'forest'
  | 'venom'
  | 'matrix'
  | 'reactor'
  | 'jade'
  | 'prism'
  | 'radiant'
  | 'champions';

export interface RarityMeta {
  id: RarityId;
  label: string;
  difficultyLabel: string;
  probability: number; // Percentage 0..100, sum = 100
  color: string;
  glowColor: string;
  borderColor: string;
  bgTint: string;
  badgeBg: string;
  order: number;
}

export interface SkinDefinition {
  id: string;
  name: string;
  weaponName: string;
  weaponClass: WeaponClass;
  rarity: RarityId;
  baseValue: number;
  swatches: [string, string, string];
  tagline: string;
  image?: string;
}

export interface CrateDefinition {
  id: string;
  categoryId: CategoryId;
  name: string;
  subtitle: string;
  themeTag: string;
  description: string;
  price: number;
  accentColor: string;
  secondaryColor: string;
  emblemType: EmblemType;
  image?: string;
  skins: SkinDefinition[];
}

export interface CategoryDefinition {
  id: CategoryId;
  name: string;
  badge: string;
  description: string;
  accent: string;
}

export interface InventoryItem {
  instanceId: string;
  skinId: string;
  crateId: string;
  crateName: string;
  name: string;
  weaponName: string;
  weaponClass: WeaponClass;
  rarity: RarityId;
  wear: WearTier;
  floatVal: number;
  value: number;
  swatches: [string, string, string];
  tagline: string;
  image?: string;
  obtainedAt: number;
  locked: boolean;
  source: 'ouverture' | 'upgrade' | 'contrat';
}

export interface DropHistoryItem {
  id: string;
  playerName: string;
  isPlayer: boolean;
  crateName: string;
  skinName: string;
  weaponName: string;
  weaponClass: WeaponClass;
  rarity: RarityId;
  value: number;
  timestamp: number;
  seedHash: string;
}

export interface PlayerStats {
  casesOpened: number;
  totalSpent: number;
  totalWonValue: number;
  upgradesAttempted: number;
  upgradesWon: number;
  contractsCompleted?: number;
  bestDropValue: number;
  bestDropName: string | null;
  rarityCounts: Record<RarityId, number>;
}

export type ZombieChallengeKind =
  | 'kills'
  | 'headshots'
  | 'rodeur_kills'
  | 'colosse_kills'
  | 'survive_time'
  | 'wave_reach'
  | 'run_kills'
  | 'full_hp_time'
  | 'full_hp_kills'
  | 'extract_credits';

export type ZombieChallengeCategory = 'combat' | 'survie' | 'maitrise';

export interface ZombieChallengeDefinition {
  id: string;
  category: ZombieChallengeCategory;
  title: string;
  description: string;
  kind: ZombieChallengeKind;
  target: number;
  unitLabel: string;
  scopeLabel: string;
  reward: number;
}

export interface DailyChallengeItem {
  id: string;
  progress: number;
  completed: boolean;
  completedAt: number | null;
  rewardClaimed: boolean;
}

export interface DailyChallengesState {
  date: string;
  challenges: DailyChallengeItem[];
  bonusClaimed: boolean;
  bonusClaimedAt: number | null;
}
