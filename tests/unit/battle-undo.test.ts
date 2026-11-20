import { describe, expect, it } from "vitest";
import { removeBattleFromRoster } from "@/lib/utils/battle-undo";
import type { PlayerRoster } from "@/types";

const unit = (over: Record<string, unknown>) =>
  ({
    id: "u1",
    name: "Squad",
    isCharacter: false,
    experiencePoints: 7,
    rank: "Blooded",
    battlesPlayed: 3,
    battlesSurvived: 2,
    enemiesDestroyed: 9,
    appliedBattleIds: ["a", "b"],
    ...over,
  }) as unknown as PlayerRoster["units"][number];

const roster = (units: PlayerRoster["units"]) =>
  ({ units, requisitionPoints: 4 }) as unknown as PlayerRoster;

const fielded = [
  { unitId: "u1", unitName: "Squad", enemiesDestroyed: 3, survived: true, xpAwarded: 2 },
] as never;

describe("removeBattleFromRoster", () => {
  it("takes back XP, tallies, rank and the Requisition point", () => {
    const out = removeBattleFromRoster(roster([unit({})]), "b", { unitsFielded: fielded });
    const u = out.units[0];
    expect(u.experiencePoints).toBe(5);
    expect(u.rank).toBe("Battle-ready");
    expect(u.battlesPlayed).toBe(2);
    expect(u.battlesSurvived).toBe(1);
    expect(u.enemiesDestroyed).toBe(6);
    expect(u.appliedBattleIds).toEqual(["a"]);
    expect(out.requisitionPoints).toBe(3);
  });

  it("drops a promotion this battle triggered, keeps one from another battle", () => {
    const mine = unit({
      pendingPromotion: { newRank: "Blooded", triggeredByBattleId: "b", triggeredAt: "" },
    });
    const other = unit({
      id: "u2",
      pendingPromotion: { newRank: "Blooded", triggeredByBattleId: "a", triggeredAt: "" },
    });
    const out = removeBattleFromRoster(roster([mine, other]), "b", { unitsFielded: fielded });
    expect(out.units[0].pendingPromotion).toBeUndefined();
    expect(out.units[1].pendingPromotion?.triggeredByBattleId).toBe("a");
  });

  it("does nothing, twice over, when the battle isn't on the roster", () => {
    const r = roster([unit({})]);
    const once = removeBattleFromRoster(r, "b", { unitsFielded: fielded });
    expect(removeBattleFromRoster(once, "b", { unitsFielded: fielded })).toBe(once);
  });
});
