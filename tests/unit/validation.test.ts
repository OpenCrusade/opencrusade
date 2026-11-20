import { describe, it, expect } from 'vitest'
import { validateSupplyLimit, validateHonourCap, validateRelicTier, validateRankEligibility } from '@/lib/utils/validation'
import type { CrusadeCard } from '@/types'

function makeUnit(overrides: Partial<CrusadeCard> = {}): CrusadeCard {
  return {
    id: 'test-unit',
    name: 'Test Squad',
    datasheetName: 'First Squad',
    pointsCost: 100,
    modelCount: 5,
    experiencePoints: 0,
    rank: 'Battle-ready',
    crusadePoints: 0,
    battlesPlayed: 0,
    battlesSurvived: 0,
    enemiesDestroyed: 0,
    battleHonours: [],
    battleScars: [],
    blessings: [],
    burdens: [],
    equipment: [],
    notes: '',
    isCharacter: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    appliedBattleIds: [],
    ...overrides,
  }
}

describe('validateSupplyLimit', () => {
  it('passes when under limit', () => {
    const units = [makeUnit({ pointsCost: 100 }), makeUnit({ pointsCost: 200 })]
    const result = validateSupplyLimit(units, 1000)
    expect(result.valid).toBe(true)
    expect(result.supplyUsed).toBe(300)
    expect(result.over).toBe(0)
  })

  it('fails when over limit', () => {
    const units = [makeUnit({ pointsCost: 600 }), makeUnit({ pointsCost: 600 })]
    const result = validateSupplyLimit(units, 1000)
    expect(result.valid).toBe(false)
    expect(result.over).toBe(200)
  })
})

describe('validateHonourCap', () => {
  it('allows 3 honours for non-CHARACTER', () => {
    const unit = makeUnit({
      battleHonours: [
        { id: '1', type: 'battle-trait', name: 'a', rules: '', source: 'core', awardedAt: '' },
        { id: '2', type: 'battle-trait', name: 'b', rules: '', source: 'core', awardedAt: '' },
        { id: '3', type: 'battle-trait', name: 'c', rules: '', source: 'core', awardedAt: '' },
      ],
    })
    expect(validateHonourCap(unit).valid).toBe(true)
  })

  it('rejects 4th honour for non-CHARACTER', () => {
    const unit = makeUnit({
      battleHonours: Array.from({ length: 4 }, (_, i) => ({
        id: String(i), type: 'battle-trait' as const, name: '', rules: '', source: 'core' as const, awardedAt: '',
      })),
    })
    expect(validateHonourCap(unit).valid).toBe(false)
  })

  it('allows 6 honours for CHARACTER', () => {
    const unit = makeUnit({
      isCharacter: true,
      battleHonours: Array.from({ length: 6 }, (_, i) => ({
        id: String(i), type: 'battle-trait' as const, name: '', rules: '', source: 'core' as const, awardedAt: '',
      })),
    })
    expect(validateHonourCap(unit).valid).toBe(true)
  })
})

describe('validateRelicTier', () => {
  it('allows artificer for Blooded+', () => {
    expect(validateRelicTier('artificer', 'Blooded').valid).toBe(true)
  })

  it('rejects antiquity for Blooded', () => {
    expect(validateRelicTier('antiquity', 'Blooded').valid).toBe(false)
  })

  it('allows legendary for Legendary rank', () => {
    expect(validateRelicTier('legendary', 'Legendary').valid).toBe(true)
  })
})

describe('validateRankEligibility', () => {
  it('allows Battle-hardened for non-CHARACTER', () => {
    expect(validateRankEligibility('Battle-hardened', false)).toBe(true)
  })

  it('rejects Heroic for non-CHARACTER', () => {
    expect(validateRankEligibility('Heroic', false)).toBe(false)
  })

  it('allows Legendary for CHARACTER', () => {
    expect(validateRankEligibility('Legendary', true)).toBe(true)
  })
})
