import type { CrusadeCard, Rank } from '@/types'

const HONOUR_CAP_NON_CHARACTER = 3
const HONOUR_CAP_CHARACTER = 6

const RELIC_TIER_REQUIREMENTS: Record<string, { cost: number; minRank: Rank }> = {
  artificer: { cost: 1, minRank: 'Blooded' },
  antiquity: { cost: 2, minRank: 'Heroic' },
  legendary: { cost: 3, minRank: 'Legendary' },
}

const RANK_ORDER: Rank[] = [
  'Battle-ready',
  'Blooded',
  'Battle-hardened',
  'Heroic',
  'Legendary',
]

function rankIndex(rank: Rank): number {
  return RANK_ORDER.indexOf(rank)
}

export function validateSupplyLimit(
  units: CrusadeCard[],
  supplyLimit: number,
): { valid: boolean; supplyUsed: number; over: number } {
  const supplyUsed = units.reduce((sum, u) => sum + u.pointsCost, 0)
  return {
    valid: supplyUsed <= supplyLimit,
    supplyUsed,
    over: Math.max(0, supplyUsed - supplyLimit),
  }
}

export function validateHonourCap(unit: CrusadeCard): { valid: boolean; max: number; current: number } {
  const max = unit.isCharacter ? HONOUR_CAP_CHARACTER : HONOUR_CAP_NON_CHARACTER
  return {
    valid: unit.battleHonours.length <= max,
    max,
    current: unit.battleHonours.length,
  }
}

export function validateRelicTier(
  tier: string,
  unitRank: Rank,
): { valid: boolean; reason?: string } {
  const req = RELIC_TIER_REQUIREMENTS[tier]
  if (!req) return { valid: false, reason: `Unknown relic tier: ${tier}` }

  if (rankIndex(unitRank) < rankIndex(req.minRank)) {
    return {
      valid: false,
      reason: `${tier} relics require ${req.minRank} rank or higher (unit is ${unitRank})`,
    }
  }
  return { valid: true }
}

export function validateRankEligibility(rank: Rank, isCharacter: boolean): boolean {
  if ((rank === 'Heroic' || rank === 'Legendary') && !isCharacter) {
    return false
  }
  return true
}

export { HONOUR_CAP_NON_CHARACTER, HONOUR_CAP_CHARACTER, RELIC_TIER_REQUIREMENTS }
