import { describe, it, expect } from "vitest";
import {
  computeConfirmationHash,
  verifyBattleIntegrity,
} from "@/lib/utils/battle-integrity";
import type { BattlePlayerData } from "@/types";

/**
 * v2.6 integrity payload is narrowed to the roster-affecting fields:
 * playerId, unitsFielded, markedForGreatnessUnitIds.
 *
 * NOTE: the inline-battle model (battles in crusade.json) doesn't use
 * these utilities yet; they're retained for the future tamper-
 * detection pass on verified battles.
 */
function makePlayerData(
  overrides: Partial<BattlePlayerData> = {},
): BattlePlayerData {
  return {
    battleId: "b1",
    playerId: "p1",
    unitsFielded: [
      {
        unitId: "u1",
        unitName: "Squad A",
        enemiesDestroyed: 2,
        survived: true,
        xpEarned: 1,
        bonusXp: 0,
      },
    ],
    markedForGreatnessUnitIds: [],
    confirmed: false,
    notes: "",
    photoFileIds: [],
    submittedAt: "2026-03-30T12:00:00Z",
    updatedAt: "2026-03-30T12:00:00Z",
    ...overrides,
  };
}

describe("computeConfirmationHash", () => {
  it("produces a consistent hash for the same data", async () => {
    const data = [makePlayerData({ playerId: "p2" })];
    const hash1 = await computeConfirmationHash(data);
    const hash2 = await computeConfirmationHash(data);
    expect(hash1).toBe(hash2);
  });

  it("produces a different hash when units fielded change", async () => {
    const base = makePlayerData({ playerId: "p2" });
    const modified = makePlayerData({
      playerId: "p2",
      unitsFielded: [{ ...base.unitsFielded[0], enemiesDestroyed: 5 }],
    });
    const hash1 = await computeConfirmationHash([base]);
    const hash2 = await computeConfirmationHash([modified]);
    expect(hash1).not.toBe(hash2);
  });

  it("produces consistent results regardless of input order", async () => {
    const p2 = makePlayerData({ playerId: "p2" });
    const p3 = makePlayerData({ playerId: "p3" });
    const hash1 = await computeConfirmationHash([p2, p3]);
    const hash2 = await computeConfirmationHash([p3, p2]);
    expect(hash1).toBe(hash2);
  });
});

describe("verifyBattleIntegrity", () => {
  it("returns unverified when not all confirmed", async () => {
    const data = [
      makePlayerData({ playerId: "p1" }),
      makePlayerData({ playerId: "p2" }),
    ];
    expect(await verifyBattleIntegrity(data)).toBe("unverified");
  });

  it("returns valid when all confirmed with matching snapshots", async () => {
    const p1Data = makePlayerData({ playerId: "p1" });
    const p2Data = makePlayerData({ playerId: "p2" });

    const p1Snapshot = await computeConfirmationHash([p2Data]);
    const p2Snapshot = await computeConfirmationHash([p1Data]);

    p1Data.confirmed = true;
    p1Data.confirmationSnapshot = p1Snapshot;
    p2Data.confirmed = true;
    p2Data.confirmationSnapshot = p2Snapshot;

    expect(await verifyBattleIntegrity([p1Data, p2Data])).toBe("valid");
  });

  it("returns tampered when fielded data modified after confirmation", async () => {
    const p1Data = makePlayerData({ playerId: "p1" });
    const p2Data = makePlayerData({ playerId: "p2" });

    const p1Snapshot = await computeConfirmationHash([p2Data]);
    const p2Snapshot = await computeConfirmationHash([p1Data]);

    p1Data.confirmed = true;
    p1Data.confirmationSnapshot = p1Snapshot;
    p2Data.confirmed = true;
    p2Data.confirmationSnapshot = p2Snapshot;

    // Tamper: p2 changes a unit's kill count after confirmation.
    // (v2.6 payload hashes unitsFielded, not the removed
    // totalEnemiesDestroyed field.)
    p2Data.unitsFielded = [
      { ...p2Data.unitsFielded[0], enemiesDestroyed: 20 },
    ];

    expect(await verifyBattleIntegrity([p1Data, p2Data])).toBe("tampered");
  });
});
