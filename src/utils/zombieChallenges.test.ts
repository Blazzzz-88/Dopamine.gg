import { describe, expect, it } from 'vitest';
import {
  applyZombieChallengeProgress,
  CHALLENGE_REWARD_CREDITS,
  createDailyChallengesState,
  DAILY_BONUS_CREDITS,
  DAILY_CHALLENGES_LIMIT,
  ensureTodayChallenges,
  getChallengeDefinition,
  getLocalDateKey,
  ZOMBIE_CHALLENGE_POOL,
} from './zombieChallenges';

describe('Défis quotidiens du mode Zombie', () => {
  it('génère exactement 3 défis uniques par jour avec 500 CR/défi et 3 000 CR de bonus 3/3', () => {
    expect(DAILY_CHALLENGES_LIMIT).toBe(3);
    expect(CHALLENGE_REWARD_CREDITS).toBe(500);
    expect(DAILY_BONUS_CREDITS).toBe(3000);

    const day1 = new Date(2026, 10, 11, 14, 0, 0).getTime();
    const state = createDailyChallengesState(day1);

    expect(state.date).toBe(getLocalDateKey(day1));
    expect(state.challenges).toHaveLength(3);
    expect(new Set(state.challenges.map((c) => c.id)).size).toBe(3);
    expect(state.bonusClaimed).toBe(false);

    // Day 1 (2026-11-11) inclut les défis emblématiques (50 zombies, 5 min, 100% PV 30s)
    expect(state.challenges.map((c) => c.id)).toEqual([
      'kill_50_zombies',
      'survive_5_min',
      'full_hp_30_sec',
    ]);
  });

  it('attribue 500 CR par défi complété et +3 000 CR lorsque les 3 défis quotidiens sont complétés', () => {
    const day1 = new Date(2026, 10, 11, 15, 0, 0).getTime();
    let state = createDailyChallengesState(day1);

    // Défi 1 : garder 100% de vie pendant 30 sec -> +500 CR
    const step1 = applyZombieChallengeProgress(state, { fullHpStreakSec: 30 }, day1 + 30_000);
    expect(step1.creditsEarned).toBe(500);
    expect(step1.newlyCompleted.map((d) => d.id)).toEqual(['full_hp_30_sec']);
    expect(step1.bonusUnlockedNow).toBe(false);
    expect(step1.nextState.bonusClaimed).toBe(false);
    state = step1.nextState;

    // Réenvoyer un événement fullHpStreakSec=45 ne doit jamais redonner de crédit
    const replay1 = applyZombieChallengeProgress(state, { fullHpStreakSec: 45 }, day1 + 45_000);
    expect(replay1.creditsEarned).toBe(0);
    expect(replay1.newlyCompleted).toHaveLength(0);
    state = replay1.nextState;

    // Défi 2 : tuer 50 zombies en cumulé -> +500 CR
    const partialKills = applyZombieChallengeProgress(state, { killsDelta: 20 }, day1 + 60_000);
    expect(partialKills.creditsEarned).toBe(0);
    expect(partialKills.nextState.challenges[0].progress).toBe(20);
    state = partialKills.nextState;

    const step2 = applyZombieChallengeProgress(state, { killsDelta: 30 }, day1 + 90_000);
    expect(step2.creditsEarned).toBe(500);
    expect(step2.newlyCompleted.map((d) => d.id)).toEqual(['kill_50_zombies']);
    expect(step2.bonusUnlockedNow).toBe(false);
    state = step2.nextState;

    // Défi 3 : survivre 5 minutes (300s) -> +500 CR + 3 000 CR bonus = 3 500 CR
    const step3 = applyZombieChallengeProgress(state, { runElapsedSec: 300 }, day1 + 300_000);
    expect(step3.creditsEarned).toBe(3500);
    expect(step3.newlyCompleted.map((d) => d.id)).toEqual(['survive_5_min']);
    expect(step3.bonusUnlockedNow).toBe(true);
    expect(step3.nextState.bonusClaimed).toBe(true);
    expect(step3.nextState.challenges.every((c) => c.completed && c.rewardClaimed)).toBe(true);
    state = step3.nextState;

    // Impossible de gagner d'autres crédits de défis le même jour (limite stricte de 3/jour)
    const afterAll = applyZombieChallengeProgress(
      state,
      { killsDelta: 100, runElapsedSec: 900, fullHpStreakSec: 120 },
      day1 + 500_000
    );
    expect(afterAll.creditsEarned).toBe(0);
    expect(afterAll.newlyCompleted).toHaveLength(0);
    expect(afterAll.bonusUnlockedNow).toBe(false);
    expect(afterAll.nextState.challenges).toHaveLength(3);
  });

  it('renouvelle exactement 3 nouveaux défis le jour suivant', () => {
    const day1 = new Date(2026, 10, 11, 23, 50, 0).getTime();
    const day2 = new Date(2026, 10, 12, 0, 5, 0).getTime();

    const completedDay1 = applyZombieChallengeProgress(
      createDailyChallengesState(day1),
      { killsDelta: 50, runElapsedSec: 300, fullHpStreakSec: 30 },
      day1
    ).nextState;

    expect(completedDay1.challenges.every((c) => c.completed)).toBe(true);
    expect(completedDay1.bonusClaimed).toBe(true);

    const rolledDay2 = ensureTodayChallenges(completedDay1, day2);
    expect(rolledDay2.date).toBe(getLocalDateKey(day2));
    expect(rolledDay2.challenges).toHaveLength(3);
    expect(rolledDay2.challenges.every((c) => !c.completed && c.progress === 0)).toBe(true);
    expect(rolledDay2.bonusClaimed).toBe(false);
    expect(rolledDay2.challenges.map((c) => c.id)).not.toEqual(
      completedDay1.challenges.map((c) => c.id)
    );
  });

  it('couvre tous les types de défis (headshots, rôdeurs, colosses, vagues, extraction)', () => {
    const day4 = new Date(2026, 10, 14, 12, 0, 0).getTime();
    const state = createDailyChallengesState(day4);
    expect(state.challenges).toHaveLength(3);
    for (const c of state.challenges) {
      expect(getChallengeDefinition(c.id)).toBeDefined();
    }

    const res = applyZombieChallengeProgress(
      state,
      {
        colosseDelta: 4,
        runKills: 25,
        extractedCreditsDelta: 400,
      },
      day4 + 10_000
    );
    expect(res.creditsEarned).toBe(500 * 3 + 3000);
    expect(res.bonusUnlockedNow).toBe(true);

    // Tous les défis du pool ont exactement 500 CR de récompense
    for (const def of ZOMBIE_CHALLENGE_POOL) {
      expect(def.reward).toBe(500);
      expect(def.target).toBeGreaterThan(0);
    }
  });
});
