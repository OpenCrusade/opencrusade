import { getRankForXP, reachesTopRanks } from "@/lib/utils/xp";
import type { BattleParticipantInline, PlayerRoster } from "@/types";

const RP_PER_BATTLE = 1;

/**
 * Take a battle's applied results back off a force, for when the
 * battle is voided: XP, rank, battle and kill tallies, the promotion
 * it triggered (if no honour was picked for it yet) and the
 * Requisition point. Honours already picked, Out of Action results
 * and Requisition points already spent are left alone.
 * Returns the same roster if this battle was never applied to it.
 */
export function removeBattleFromRoster(
  roster: PlayerRoster,
  battleId: string,
  participant: Pick<BattleParticipantInline, "unitsFielded">,
): PlayerRoster {
  if (!roster.units.some((u) => u.appliedBattleIds.includes(battleId))) return roster;
  const now = new Date().toISOString();
  const units = roster.units.map((u) => {
    if (!u.appliedBattleIds.includes(battleId)) return u;
    const fielded = participant.unitsFielded.find((f) => f.unitId === u.id);
    const xp = Math.max(0, u.experiencePoints - (fielded?.xpAwarded ?? 0));
    const { pendingPromotion, ...rest } = u;
    const keepPromotion =
      pendingPromotion && pendingPromotion.triggeredByBattleId !== battleId;
    return {
      ...rest,
      ...(keepPromotion ? { pendingPromotion } : {}),
      experiencePoints: xp,
      rank: getRankForXP(xp, reachesTopRanks(u)),
      battlesPlayed: Math.max(0, u.battlesPlayed - 1),
      battlesSurvived: Math.max(0, u.battlesSurvived - (fielded?.survived ? 1 : 0)),
      enemiesDestroyed: Math.max(0, u.enemiesDestroyed - (fielded?.enemiesDestroyed ?? 0)),
      appliedBattleIds: u.appliedBattleIds.filter((id) => id !== battleId),
      updatedAt: now,
    };
  });
  return {
    ...roster,
    units,
    requisitionPoints: Math.max(0, roster.requisitionPoints - RP_PER_BATTLE),
  };
}
