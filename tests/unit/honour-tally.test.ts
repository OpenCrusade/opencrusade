import { describe, expect, it } from "vitest";
import { honourTally } from "@/lib/utils/crusade-points";
import type { CrusadeCard } from "@/types";

const unit = (over: Record<string, unknown>) =>
  ({
    rank: "Battle-ready",
    isCharacter: false,
    honourCapRaised: false,
    battleHonours: [],
    appliedOoA: [],
    ...over,
  }) as unknown as CrusadeCard;
const honours = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }));

describe("honourTally", () => {
  it("earns one honour per rank gained", () => {
    expect(honourTally(unit({ rank: "Battle-hardened" })).available).toBe(2);
    expect(honourTally(unit({ rank: "Battle-hardened", battleHonours: honours(2) })).available).toBe(0);
  });

  it("adds honours from mission rewards", () => {
    const t = honourTally(unit({ rank: "Blooded", bonusHonours: 1, battleHonours: honours(1) }));
    expect(t.earned).toBe(2);
    expect(t.available).toBe(1);
  });

  it("stops at the unit's honour cap", () => {
    const t = honourTally(unit({ rank: "Battle-hardened", bonusHonours: 4 }));
    expect(t.cap).toBe(3);
    expect(t.available).toBe(3);
    expect(honourTally(unit({ rank: "Legendary", isCharacter: true, bonusHonours: 4 })).earned).toBe(6);
  });

  it("does not owe back an honour lost to an Out of Action test", () => {
    const t = honourTally(
      unit({ rank: "Battle-hardened", battleHonours: honours(1), appliedOoA: [{ outcome: "honour-lost" }] }),
    );
    expect(t.available).toBe(0);
  });

  it("never goes negative when more honours are held than earned", () => {
    expect(honourTally(unit({ battleHonours: honours(2) })).available).toBe(0);
  });
});

import { getRankForXP, rankProgress, reachesTopRanks } from "@/lib/utils/xp";

describe("ranks past Battle-hardened", () => {
  it("stay closed to an ordinary unit", () => {
    const u = { experiencePoints: 40, isCharacter: false };
    expect(getRankForXP(40, reachesTopRanks(u))).toBe("Battle-hardened");
    expect(rankProgress(u).toNext).toBeNull();
  });

  it("open to a unit with Legendary Veterans", () => {
    const u = { experiencePoints: 40, isCharacter: false, honourCapRaised: true };
    expect(getRankForXP(40, reachesTopRanks(u))).toBe("Heroic");
    expect(rankProgress(u).nextName).toBe("Legendary");
    expect(honourTally(unit({ rank: "Heroic", honourCapRaised: true })).earned).toBe(3);
  });
});
