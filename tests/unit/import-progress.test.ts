import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { addUnits, createRoster, updateUnitBasics, updateUnitsFromList } from "@/lib/sync/roster-ops";
import { isWarlord, wargearOnly } from "@/lib/utils/warlord";
import type { ImportedUnit } from "@/lib/import/roster-import";

const player = { googleId: "p1", email: "player@example.com", displayName: "Player" };

const commander: ImportedUnit = {
  name: "Commander",
  datasheetName: "Commander",
  pointsCost: 90,
  modelCount: 1,
  isCharacter: true,
  equipment: [],
  sourceId: "u1",
  crusade: {
    experiencePoints: 7,
    crusadePoints: 2,
    battlesPlayed: 3,
    battlesSurvived: 2,
    enemiesDestroyed: 4,
    honours: [
      { name: "Steady Aim", type: "battle-trait" },
      { name: "Old Banner", type: "crusade-relic", relicTier: "antiquity", relicCrusadePoints: 2 },
    ],
    scars: ["Limping"],
  },
};

describe("importing a list with crusade progress", () => {
  it("puts the progress on new cards and the Order of Battle on an empty force", async () => {
    const roster = await createRoster({ name: "Blue Host", factionName: "Blue Force" }, player);
    const after = await addUnits(roster.id, [commander], { supplyLimit: 1250, requisitionPoints: 4 });
    expect(after.supplyLimit).toBe(1250);
    expect(after.requisitionPoints).toBe(4);
    const card = after.units[0];
    expect(card).toMatchObject({
      experiencePoints: 7,
      rank: "Blooded",
      battlesPlayed: 3,
      battlesSurvived: 2,
      enemiesDestroyed: 4,
      bonusHonours: 1,
    });
    expect(card.battleHonours.map((h) => [h.name, h.type, h.relicTier, h.relicCrusadePointsCost])).toEqual([
      ["Steady Aim", "battle-trait", undefined, undefined],
      ["Old Banner", "crusade-relic", "antiquity", 2],
    ]);
    expect(card.battleHonours.every((h) => h.rules === "")).toBe(true);
    expect(card.battleScars.map((s) => s.name)).toEqual(["Limping"]);
  });

  it("never overwrites progress already tracked here on a re-import", async () => {
    const roster = await createRoster({ name: "Blue Host", factionName: "Blue Force" }, player);
    await addUnits(roster.id, [commander]);
    const stale = { ...commander, pointsCost: 110, crusade: { ...commander.crusade!, experiencePoints: 1, honours: [], scars: [] } };
    const after = await updateUnitsFromList(roster.id, [stale]);
    expect(after.units).toHaveLength(1);
    expect(after.units[0].pointsCost).toBe(110);
    expect(after.units[0].experiencePoints).toBe(7);
    expect(after.units[0].battleHonours).toHaveLength(2);
  });

  it("fills in a unit that has no progress yet", async () => {
    const roster = await createRoster({ name: "Blue Host", factionName: "Blue Force" }, player);
    await addUnits(roster.id, [{ ...commander, crusade: undefined }]);
    const after = await updateUnitsFromList(roster.id, [commander]);
    expect(after.units[0].experiencePoints).toBe(7);
    expect(after.units[0].battleScars).toHaveLength(1);
  });

  it("leaves the supply limit alone when the force already has units", async () => {
    const roster = await createRoster({ name: "Blue Host", factionName: "Blue Force" }, player);
    await addUnits(roster.id, [{ ...commander, crusade: undefined }]);
    const after = await addUnits(roster.id, [commander], { supplyLimit: 2000, requisitionPoints: 9 });
    expect(after.supplyLimit).toBe(1000);
    expect(after.requisitionPoints).toBe(0);
  });

  it("keeps one Warlord per force", async () => {
    const roster = await createRoster({ name: "Blue Host", factionName: "Blue Force" }, player);
    const first = await addUnits(roster.id, [{ ...commander, isWarlord: true }]);
    const after = await addUnits(roster.id, [{ ...commander, sourceId: "u2", name: "Captain", isWarlord: true }]);
    expect(after.units.map((u) => [u.name, u.isWarlord])).toEqual([
      ["Commander", false],
      ["Captain", true],
    ]);
    const back = await updateUnitBasics(roster.id, first.units[0].id, {
      name: "Commander",
      datasheetName: "Commander",
      pointsCost: 90,
      modelCount: 1,
      isCharacter: true,
      isWarlord: true,
    });
    expect(back.units.map((u) => u.isWarlord)).toEqual([true, false]);
  });

  it("treats an older import's Warlord wargear entry as the Warlord", () => {
    expect(isWarlord({ equipment: ["Long Rifle", "Warlord"] })).toBe(true);
    expect(isWarlord({ equipment: ["Warlord"], isWarlord: false })).toBe(false);
    expect(wargearOnly(["Long Rifle", "Warlord"])).toEqual(["Long Rifle"]);
  });
});
