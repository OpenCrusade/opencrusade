import { describe, it, expect } from 'vitest'
import { getRankForXP, getNextRankThreshold, calculateBattleXP, shouldPromoteRank } from '@/lib/utils/xp'

describe('getRankForXP', () => {
  it('returns Battle-ready for 0-5 XP', () => {
    expect(getRankForXP(0, false)).toBe('Battle-ready')
    expect(getRankForXP(5, false)).toBe('Battle-ready')
  })

  it('returns Blooded for 6-15 XP', () => {
    expect(getRankForXP(6, false)).toBe('Blooded')
    expect(getRankForXP(15, false)).toBe('Blooded')
  })

  it('returns Battle-hardened for 16-30 XP', () => {
    expect(getRankForXP(16, false)).toBe('Battle-hardened')
    expect(getRankForXP(30, false)).toBe('Battle-hardened')
  })

  it('caps non-CHARACTER at Battle-hardened', () => {
    expect(getRankForXP(31, false)).toBe('Battle-hardened')
    expect(getRankForXP(100, false)).toBe('Battle-hardened')
  })

  it('returns Heroic for CHARACTER with 31-50 XP', () => {
    expect(getRankForXP(31, true)).toBe('Heroic')
    expect(getRankForXP(50, true)).toBe('Heroic')
  })

  it('returns Legendary for CHARACTER with 51+ XP', () => {
    expect(getRankForXP(51, true)).toBe('Legendary')
    expect(getRankForXP(200, true)).toBe('Legendary')
  })
})

describe('getNextRankThreshold', () => {
  it('returns 6 for Battle-ready', () => {
    expect(getNextRankThreshold('Battle-ready')).toBe(6)
  })

  it('returns 16 for Blooded', () => {
    expect(getNextRankThreshold('Blooded')).toBe(16)
  })

  it('returns null for Legendary', () => {
    expect(getNextRankThreshold('Legendary')).toBeNull()
  })
})

describe('calculateBattleXP', () => {
  it('awards 1 XP for participation alone', () => {
    expect(calculateBattleXP(0, false)).toBe(1)
  })

  it('awards bonus XP for kills (1 per 3 destroyed)', () => {
    expect(calculateBattleXP(3, false)).toBe(2)
    expect(calculateBattleXP(6, false)).toBe(3)
    expect(calculateBattleXP(7, false)).toBe(3)
  })

  it('awards 3 bonus XP for marked for greatness', () => {
    expect(calculateBattleXP(0, true)).toBe(4)
    expect(calculateBattleXP(3, true)).toBe(5)
  })
})

describe('shouldPromoteRank', () => {
  it('detects promotion from Battle-ready to Blooded', () => {
    expect(shouldPromoteRank(5, 6, false)).toBe(true)
  })

  it('returns false when rank stays the same', () => {
    expect(shouldPromoteRank(3, 5, false)).toBe(false)
  })

  it('does not promote non-CHARACTER past Battle-hardened', () => {
    expect(shouldPromoteRank(30, 31, false)).toBe(false)
  })

  it('promotes CHARACTER past Battle-hardened', () => {
    expect(shouldPromoteRank(30, 31, true)).toBe(true)
  })
})
