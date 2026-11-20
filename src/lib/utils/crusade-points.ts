import type { CrusadeCard, PlayerRoster } from "@/types";

/**
 * Crusade Points derivation (10th ed):
 *   +1 per battle trait / weapon modification
 *   +1/+2/+3 per crusade relic (by tier)
 *   -1 per battle scar
 * Floored at 0 per unit.
 *
 * Derived, never stored, the stored `crusadePoints` field is legacy
 * and only kept for schema compatibility.
 */
export function unitCrusadePoints(unit: CrusadeCard): number {
  let cp = 0;
  for (const h of unit.battleHonours) {
    if (h.type === "crusade-relic") {
      cp += h.relicCrusadePointsCost ?? 1;
    } else {
      cp += 1;
    }
  }
  cp -= unit.battleScars.length;
  return Math.max(0, cp);
}

export function rosterCrusadePoints(roster: PlayerRoster): number {
  return roster.units.reduce((sum, u) => sum + unitCrusadePoints(u), 0);
}

/** Effective honour cap for a unit (Legendary Veterans raises 3 → 6). */
export function honourCap(unit: CrusadeCard): number {
  if (unit.isCharacter) return 6;
  return unit.honourCapRaised ? 6 : 3;
}

const RANKS = ["Battle-ready", "Blooded", "Battle-hardened", "Heroic", "Legendary"];

/**
 * How many Battle Honours a unit has earned, and how many of those it
 * still has to pick. One is earned each time the unit gains a rank;
 * `bonusHonours` adds the ones from mission rewards, which only the
 * player knows about. An honour lost to an Out of Action test is gone,
 * not owed back.
 */
export function honourTally(unit: CrusadeCard) {
  const cap = honourCap(unit);
  const held = unit.battleHonours.length;
  const fromRank = Math.max(0, RANKS.indexOf(unit.rank));
  const fromRewards = unit.bonusHonours ?? 0;
  const lost = (unit.appliedOoA ?? []).filter((e) => e.outcome === "honour-lost").length;
  const earned = Math.min(cap, Math.max(0, fromRank + fromRewards - lost));
  return { cap, held, fromRank, fromRewards, lost, earned, available: Math.max(0, earned - held) };
}
