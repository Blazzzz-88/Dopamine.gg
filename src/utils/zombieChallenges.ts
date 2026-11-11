import {
  DailyChallengeItem,
  DailyChallengesState,
  ZombieChallengeCategory,
  ZombieChallengeDefinition,
} from '../types/casino';

export const DAILY_CHALLENGES_LIMIT = 3;
export const CHALLENGE_REWARD_CREDITS = 500;
export const DAILY_BONUS_CREDITS = 3000;

export const ZOMBIE_CHALLENGE_POOL: ZombieChallengeDefinition[] = [
  // Catégorie 1 : Combat / Éliminations (Cumul du jour)
  {
    id: 'kill_50_zombies',
    category: 'combat',
    title: 'Chasseur de horde',
    description: 'Tuer 50 zombies en mode Zombie',
    kind: 'kills',
    target: 50,
    unitLabel: 'zombies',
    scopeLabel: 'Cumul du jour',
    reward: CHALLENGE_REWARD_CREDITS,
  },
  {
    id: 'headshot_15_zombies',
    category: 'combat',
    title: 'Tir de précision',
    description: 'Éliminer 15 zombies par tir à la tête',
    kind: 'headshots',
    target: 15,
    unitLabel: 'tirs tête',
    scopeLabel: 'Cumul du jour',
    reward: CHALLENGE_REWARD_CREDITS,
  },
  {
    id: 'kill_12_rodeurs',
    category: 'combat',
    title: 'Chasseur de Rôdeurs',
    description: 'Éliminer 12 Rôdeurs rapides en mode Zombie',
    kind: 'rodeur_kills',
    target: 12,
    unitLabel: 'rôdeurs',
    scopeLabel: 'Cumul du jour',
    reward: CHALLENGE_REWARD_CREDITS,
  },
  {
    id: 'kill_4_colosses',
    category: 'combat',
    title: 'Briseur de Colosses',
    description: 'Éliminer 4 Colosses Rares en mode Zombie',
    kind: 'colosse_kills',
    target: 4,
    unitLabel: 'colosses',
    scopeLabel: 'Cumul du jour',
    reward: CHALLENGE_REWARD_CREDITS,
  },

  // Catégorie 2 : Survie & Vagues (En 1 partie)
  {
    id: 'survive_5_min',
    category: 'survie',
    title: 'Survivant ultime',
    description: 'Survivre 5 minutes en une seule partie',
    kind: 'survive_time',
    target: 300,
    unitLabel: 'sec',
    scopeLabel: 'En 1 partie',
    reward: CHALLENGE_REWARD_CREDITS,
  },
  {
    id: 'survive_3_min',
    category: 'survie',
    title: 'Tenir la ligne',
    description: 'Survivre 3 minutes en une seule partie',
    kind: 'survive_time',
    target: 180,
    unitLabel: 'sec',
    scopeLabel: 'En 1 partie',
    reward: CHALLENGE_REWARD_CREDITS,
  },
  {
    id: 'reach_wave_5',
    category: 'survie',
    title: 'Maître des vagues',
    description: 'Atteindre la vague 5 en une seule partie',
    kind: 'wave_reach',
    target: 5,
    unitLabel: 'vague',
    scopeLabel: 'En 1 partie',
    reward: CHALLENGE_REWARD_CREDITS,
  },
  {
    id: 'run_kills_25',
    category: 'survie',
    title: 'Série sanglante',
    description: 'Tuer 25 zombies en une seule partie',
    kind: 'run_kills',
    target: 25,
    unitLabel: 'zombies',
    scopeLabel: 'En 1 partie',
    reward: CHALLENGE_REWARD_CREDITS,
  },

  // Catégorie 3 : Maîtrise, Santé & Extraction
  {
    id: 'full_hp_30_sec',
    category: 'maitrise',
    title: 'Intouchable',
    description: 'Garder 100% de vie pendant 30 secondes d’affilée',
    kind: 'full_hp_time',
    target: 30,
    unitLabel: 'sec',
    scopeLabel: 'Série 100% PV',
    reward: CHALLENGE_REWARD_CREDITS,
  },
  {
    id: 'full_hp_45_sec',
    category: 'maitrise',
    title: 'Esquive parfaite',
    description: 'Garder 100% de vie pendant 45 secondes d’affilée',
    kind: 'full_hp_time',
    target: 45,
    unitLabel: 'sec',
    scopeLabel: 'Série 100% PV',
    reward: CHALLENGE_REWARD_CREDITS,
  },
  {
    id: 'full_hp_kills_10',
    category: 'maitrise',
    title: 'Sans une égratignure',
    description: 'Éliminer 10 zombies d’affilée en gardant 100% de vie',
    kind: 'full_hp_kills',
    target: 10,
    unitLabel: 'zombies',
    scopeLabel: 'À 100% PV',
    reward: CHALLENGE_REWARD_CREDITS,
  },
  {
    id: 'extract_400_credits',
    category: 'maitrise',
    title: 'Extraction rentable',
    description: 'Sécuriser 400 CR de butin en rentrant vivant au casino',
    kind: 'extract_credits',
    target: 400,
    unitLabel: 'CR',
    scopeLabel: 'Cumul du jour',
    reward: CHALLENGE_REWARD_CREDITS,
  },
];

const DEFINITION_MAP = new Map<string, ZombieChallengeDefinition>(
  ZOMBIE_CHALLENGE_POOL.map((d) => [d.id, d])
);

const CATEGORY_POOLS: Record<ZombieChallengeCategory, ZombieChallengeDefinition[]> = {
  combat: ZOMBIE_CHALLENGE_POOL.filter((d) => d.category === 'combat'),
  survie: ZOMBIE_CHALLENGE_POOL.filter((d) => d.category === 'survie'),
  maitrise: ZOMBIE_CHALLENGE_POOL.filter((d) => d.category === 'maitrise'),
};

export function getChallengeDefinition(id: string): ZombieChallengeDefinition | undefined {
  return DEFINITION_MAP.get(id);
}

/** Returns local calendar date formatted as YYYY-MM-DD. */
export function getLocalDateKey(now = Date.now()): string {
  const d = new Date(now);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Returns milliseconds remaining until next local midnight (00:00:00). */
export function getMsUntilNextDay(now = Date.now()): number {
  const d = new Date(now);
  const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, nextMidnight.getTime() - now);
}

export function formatCountdownMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatMinutesSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Selects exactly 3 distinct Zombie challenges for the given local date (1 per category).
 * Deterministic per calendar day so refreshing cannot bypass the 3-per-day cap.
 */
export function selectDailyChallengeDefinitions(dateKey: string): ZombieChallengeDefinition[] {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utcDay = Math.floor(Date.UTC(y || 2026, (m || 1) - 1, d || 1) / 86_400_000);
  const refDay = Math.floor(Date.UTC(2026, 10, 11) / 86_400_000); // 2026-11-11 -> offset 0
  const offset = ((utcDay - refDay) % 64 + 64) % 64;

  const combat = CATEGORY_POOLS.combat;
  const survie = CATEGORY_POOLS.survie;
  const maitrise = CATEGORY_POOLS.maitrise;

  const combatIdx = offset % combat.length;
  const survieIdx = (offset + Math.floor(offset / combat.length)) % survie.length;
  const maitriseIdx = (offset + Math.floor(offset / (combat.length * survie.length)) * 3) % maitrise.length;

  return [combat[combatIdx], survie[survieIdx], maitrise[maitriseIdx]];
}

export function createDailyChallengesState(now = Date.now()): DailyChallengesState {
  const date = getLocalDateKey(now);
  const defs = selectDailyChallengeDefinitions(date).slice(0, DAILY_CHALLENGES_LIMIT);
  return {
    date,
    challenges: defs.map((def) => ({
      id: def.id,
      progress: 0,
      completed: false,
      completedAt: null,
      rewardClaimed: false,
    })),
    bonusClaimed: false,
    bonusClaimedAt: null,
  };
}

/**
 * Validates and rolls over daily challenges automatically when the local calendar date changes.
 * Strictly enforces a maximum of 3 challenges per day.
 */
export function ensureTodayChallenges(
  raw: Partial<DailyChallengesState> | null | undefined,
  now = Date.now()
): DailyChallengesState {
  const today = getLocalDateKey(now);
  if (
    raw &&
    raw.date === today &&
    Array.isArray(raw.challenges) &&
    raw.challenges.length === DAILY_CHALLENGES_LIMIT
  ) {
    const seen = new Set<string>();
    const valid = raw.challenges.every((c) => {
      if (!c || typeof c.id !== 'string' || seen.has(c.id)) return false;
      seen.add(c.id);
      return Boolean(getChallengeDefinition(c.id));
    });

    if (valid) {
      const normalized: DailyChallengeItem[] = raw.challenges.map((c) => {
        const def = getChallengeDefinition(c.id)!;
        const rawProgress = Math.max(0, Math.min(def.target, Math.floor(Number(c.progress) || 0)));
        const completed = Boolean(c.completed) || rawProgress >= def.target;
        return {
          id: def.id,
          progress: completed ? def.target : rawProgress,
          completed,
          completedAt: completed ? (typeof c.completedAt === 'number' ? c.completedAt : now) : null,
          rewardClaimed: completed ? Boolean(c.rewardClaimed) : false,
        };
      });

      const allDone = normalized.every((c) => c.completed);
      return {
        date: today,
        challenges: normalized,
        bonusClaimed: allDone && Boolean(raw.bonusClaimed),
        bonusClaimedAt:
          allDone && raw.bonusClaimed && typeof raw.bonusClaimedAt === 'number'
            ? raw.bonusClaimedAt
            : null,
      };
    }
  }

  return createDailyChallengesState(now);
}

export interface ZombieChallengeEvent {
  killsDelta?: number;
  headshotsDelta?: number;
  rodeurDelta?: number;
  colosseDelta?: number;
  extractedCreditsDelta?: number;
  runKills?: number;
  wave?: number;
  runElapsedSec?: number;
  fullHpStreakSec?: number;
  fullHpKillsStreak?: number;
}

export interface ChallengeProgressResult {
  nextState: DailyChallengesState;
  changed: boolean;
  creditsEarned: number;
  newlyCompleted: ZombieChallengeDefinition[];
  bonusUnlockedNow: boolean;
}

/**
 * Applies a Zombie gameplay event against today's 3 challenges.
 * Awards +500 CR once per completed challenge and +3000 CR once when all 3 are completed.
 */
export function applyZombieChallengeProgress(
  currentState: Partial<DailyChallengesState> | null | undefined,
  event: ZombieChallengeEvent,
  now = Date.now()
): ChallengeProgressResult {
  const base = ensureTodayChallenges(currentState, now);
  let changed = base.date !== currentState?.date;
  let creditsEarned = 0;
  const newlyCompleted: ZombieChallengeDefinition[] = [];

  const nextChallenges: DailyChallengeItem[] = base.challenges.map((item) => {
    if (item.completed) {
      return item;
    }

    const def = getChallengeDefinition(item.id);
    if (!def) return item;

    let rawNext = item.progress;
    switch (def.kind) {
      case 'kills':
        rawNext = item.progress + Math.max(0, Math.floor(event.killsDelta ?? 0));
        break;
      case 'headshots':
        rawNext = item.progress + Math.max(0, Math.floor(event.headshotsDelta ?? 0));
        break;
      case 'rodeur_kills':
        rawNext = item.progress + Math.max(0, Math.floor(event.rodeurDelta ?? 0));
        break;
      case 'colosse_kills':
        rawNext = item.progress + Math.max(0, Math.floor(event.colosseDelta ?? 0));
        break;
      case 'extract_credits':
        rawNext = item.progress + Math.max(0, Math.floor(event.extractedCreditsDelta ?? 0));
        break;
      case 'run_kills':
        rawNext = Math.max(item.progress, Math.floor(event.runKills ?? 0));
        break;
      case 'wave_reach':
        rawNext = Math.max(item.progress, Math.floor(event.wave ?? 0));
        break;
      case 'survive_time':
        rawNext = Math.max(item.progress, Math.floor(event.runElapsedSec ?? 0));
        break;
      case 'full_hp_time':
        rawNext = Math.max(item.progress, Math.floor(event.fullHpStreakSec ?? 0));
        break;
      case 'full_hp_kills':
        rawNext = Math.max(item.progress, Math.floor(event.fullHpKillsStreak ?? 0));
        break;
    }

    const clamped = Math.max(0, Math.min(def.target, rawNext));
    if (clamped !== item.progress) {
      changed = true;
    }

    if (clamped >= def.target) {
      changed = true;
      if (!item.rewardClaimed) {
        creditsEarned += def.reward;
      }
      newlyCompleted.push(def);
      return {
        id: item.id,
        progress: def.target,
        completed: true,
        completedAt: now,
        rewardClaimed: true,
      };
    }

    return {
      ...item,
      progress: clamped,
    };
  });

  const allCompleted = nextChallenges.every((c) => c.completed);
  let bonusClaimed = base.bonusClaimed;
  let bonusClaimedAt = base.bonusClaimedAt;
  let bonusUnlockedNow = false;

  if (allCompleted && !base.bonusClaimed) {
    bonusClaimed = true;
    bonusClaimedAt = now;
    creditsEarned += DAILY_BONUS_CREDITS;
    bonusUnlockedNow = true;
    changed = true;
  }

  const nextState: DailyChallengesState = {
    date: base.date,
    challenges: nextChallenges,
    bonusClaimed,
    bonusClaimedAt,
  };

  return {
    nextState,
    changed,
    creditsEarned,
    newlyCompleted,
    bonusUnlockedNow,
  };
}

export function formatChallengeProgressValue(
  def: ZombieChallengeDefinition,
  value: number
): string {
  const safeVal = Math.max(0, Math.min(def.target, Math.floor(value)));
  if (def.kind === 'survive_time') {
    return `${formatMinutesSeconds(safeVal)} / ${formatMinutesSeconds(def.target)}`;
  }
  if (def.kind === 'full_hp_time') {
    return `${safeVal}s / ${def.target}s`;
  }
  if (def.kind === 'wave_reach') {
    return `Vague ${safeVal} / ${def.target}`;
  }
  return `${safeVal} / ${def.target} ${def.unitLabel}`;
}

export function hasIncompleteTimeChallenge(state: DailyChallengesState): boolean {
  return state.challenges.some((item) => {
    if (item.completed) return false;
    const def = getChallengeDefinition(item.id);
    return def?.kind === 'survive_time' || def?.kind === 'full_hp_time';
  });
}
