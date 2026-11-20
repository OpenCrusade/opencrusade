import type { Rank } from '@/types'

const RANK_THRESHOLDS: { min: number; max: number | null; rank: Rank; characterOnly: boolean }[] = [
  { min: 0, max: 5, rank: 'Battle-ready', characterOnly: false },
  { min: 6, max: 15, rank: 'Blooded', characterOnly: false },
  { min: 16, max: 30, rank: 'Battle-hardened', characterOnly: false },
  { min: 31, max: 50, rank: 'Heroic', characterOnly: true },
  { min: 51, max: null, rank: 'Legendary', characterOnly: true },
]

export function getRankForXP(xp: number, isCharacter: boolean): Rank {
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    const threshold = RANK_THRESHOLDS[i]
    if (xp >= threshold.min) {
      if (threshold.characterOnly && !isCharacter) {
        return 'Battle-hardened'
      }
      return threshold.rank
    }
  }
  return 'Battle-ready'
}

export function getNextRankThreshold(rank: Rank): number | null {
  const idx = RANK_THRESHOLDS.findIndex(t => t.rank === rank)
  if (idx === -1 || idx >= RANK_THRESHOLDS.length - 1) return null
  return RANK_THRESHOLDS[idx + 1].min
}

export function calculateBattleXP(
  enemiesDestroyedByUnit: number,
  isMarkedForGreatness: boolean,
): number {
  const battleXP = 1
  const killXP = Math.floor(enemiesDestroyedByUnit / 3)
  const greatnessXP = isMarkedForGreatness ? 3 : 0
  return battleXP + killXP + greatnessXP
}

export function shouldPromoteRank(currentXP: number, newXP: number, isCharacter: boolean): boolean {
  const currentRank = getRankForXP(currentXP, isCharacter)
  const newRank = getRankForXP(newXP, isCharacter)
  return currentRank !== newRank
}

export { RANK_THRESHOLDS }

const RANK_FLOOR = [0, 6, 16, 31, 51];
const RANK_NAME = ["Battle-ready", "Blooded", "Battle-hardened", "Heroic", "Legendary"];

/** Where a unit sits in its rank and across the whole career track. */
/**
 * Whether a unit can rise past Battle-hardened to Heroic and
 * Legendary: Characters can, and so can a unit the Legendary Veterans
 * requisition was spent on.
 */
export function reachesTopRanks(unit: { isCharacter: boolean; honourCapRaised?: boolean }): boolean {
  return unit.isCharacter || !!unit.honourCapRaised;
}

export function rankProgress(unit: {
  experiencePoints: number;
  isCharacter: boolean;
  honourCapRaised?: boolean;
}) {
  const xp = unit.experiencePoints;
  const top = reachesTopRanks(unit) ? 4 : 2;
  let i = 0;
  while (i < top && xp >= RANK_FLOOR[i + 1]) i++;
  const ceiling = RANK_FLOOR[i + 1] ?? RANK_FLOOR[4] + 20;
  const frac = i === top ? 1 : Math.min(1, (xp - RANK_FLOOR[i]) / (ceiling - RANK_FLOOR[i]));
  return {
    index: i,
    inRank: frac,
    career: (i + (i === 4 ? Math.min(1, (xp - 51) / 20) : frac)) / 5,
    next: i < top ? `${RANK_FLOOR[i + 1] - xp} XP to ${RANK_NAME[i + 1]}` : "Top rank reached",
    toNext: i < top ? RANK_FLOOR[i + 1] - xp : null,
    nextName: i < top ? RANK_NAME[i + 1] : null,
  };
}

