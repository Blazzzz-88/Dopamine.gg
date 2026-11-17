import { describe, expect, it } from 'vitest';
import {
  ARENA_LIMIT,
  createZombieArena,
  isPointClearOfObstacles,
} from './zombieArenaBuilder';
import { getWeaponCombatProfile } from './zombieEngine';
import {
  computePvpDamage,
  computePvpSessionCredits,
  createPvpFallbackWeapon,
  generatePvpRoomCode,
  normalizePvpRoomCode,
  PVP_MATCH_WIN_REWARD,
  PVP_ROUND_WIN_REWARD,
  PVP_SPAWN_POINTS,
} from './pvpEngine';

describe('pvpEngine — logique 1v1 en arène Zombie', () => {
  it('place les deux points de spawn 1v1 dans des zones dégagées de l’arène Zombie', () => {
    const arena = createZombieArena(1);
    for (const spawn of PVP_SPAWN_POINTS) {
      expect(
        isPointClearOfObstacles(spawn.x, spawn.z, 0.75, arena.colliders, ARENA_LIMIT)
      ).toBe(true);
    }
    const dx = PVP_SPAWN_POINTS[0].x - PVP_SPAWN_POINTS[1].x;
    const dz = PVP_SPAWN_POINTS[0].z - PVP_SPAWN_POINTS[1].z;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(25);
    arena.dispose();
  });

  it('calcule des dégâts 1v1 équilibrés avec bonus headshot et chute de portée pompe', () => {
    const awp = getWeaponCombatProfile('sniper', 'AWP', 'secret');
    expect(computePvpDamage(awp, 'head', 20)).toBeGreaterThanOrEqual(100);
    expect(computePvpDamage(awp, 'body', 20)).toBeLessThan(100);

    const rifle = getWeaponCombatProfile('fusil', 'AK-47', 'rare');
    const bodyDmg = computePvpDamage(rifle, 'body', 12);
    const headDmg = computePvpDamage(rifle, 'head', 12);
    expect(headDmg).toBeGreaterThan(bodyDmg);

    const smg = getWeaponCombatProfile('pm', 'MAC-10', 'commune');
    expect(computePvpDamage(smg, 'body', 4)).toBeGreaterThan(
      computePvpDamage(smg, 'body', 28)
    );
  });

  it('génère et normalise des codes de salon privé lisibles', () => {
    const code = generatePvpRoomCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(normalizePvpRoomCode(' ab-12 ')).toBe('AB-12');
  });

  it('fournit une arme de secours et calcule les récompenses de session 1v1', () => {
    const fallback = createPvpFallbackWeapon();
    expect(fallback.weaponName).toBeTruthy();
    expect(computePvpSessionCredits(3, true)).toBe(
      3 * PVP_ROUND_WIN_REWARD + PVP_MATCH_WIN_REWARD
    );
    expect(computePvpSessionCredits(2, false)).toBe(2 * PVP_ROUND_WIN_REWARD);
  });
});
