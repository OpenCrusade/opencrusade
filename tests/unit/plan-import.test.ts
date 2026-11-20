import { describe, expect, it } from "vitest";
import { planImport, type ExistingUnit, type ImportedUnit } from "@/lib/import/roster-import";

const have = (id: string, name: string, datasheetName: string, importId?: string): ExistingUnit => ({
  id, name, datasheetName, pointsCost: 100, modelCount: 5, ...(importId ? { importId } : {}),
});
const inc = (name: string, datasheetName: string, sourceId?: string): ImportedUnit => ({
  name, datasheetName, pointsCost: 110, modelCount: 5, isCharacter: false, equipment: [],
  ...(sourceId ? { sourceId } : {}),
});

describe("re-importing a list", () => {
  it("matches by the list's unit id first, even after a rename", () => {
    const plan = planImport(
      [have("a", "Old Guard", "Infantry", "sel-1"), have("b", "Infantry", "Infantry", "sel-2")],
      [inc("Infantry", "Infantry", "sel-2"), inc("Renamed", "Infantry", "sel-1")],
    );
    expect(plan.updates.map((u) => [u.existing.id, u.incoming.name, u.how])).toEqual([
      ["b", "Infantry", "id"],
      ["a", "Renamed", "id"],
    ]);
    expect(plan.additions).toEqual([]);
    expect(plan.untouched).toEqual([]);
  });

  it("matches this app's own exported list by unit id", () => {
    const plan = planImport([have("unit-1", "Old One", "Monster")], [inc("Monster", "Monster", "unit-1")]);
    expect(plan.updates[0].how).toBe("id");
  });

  it("falls back to name and datasheet", () => {
    const plan = planImport(
      [have("a", "First Squad", "Infantry"), have("b", "Second Squad", "Infantry")],
      [inc("second squad", "Infantry"), inc("First Squad", "Infantry")],
    );
    expect(plan.updates.map((u) => [u.existing.id, u.how])).toEqual([["b", "name"], ["a", "name"]]);
  });

  it("matches a lone unit of a datasheet, but never guesses between duplicates", () => {
    const plan = planImport(
      [have("a", "The Old Man", "Commander"), have("b", "Alpha", "Infantry"), have("c", "Beta", "Infantry")],
      [inc("Commander", "Commander"), inc("Infantry", "Infantry"), inc("Infantry", "Infantry")],
    );
    expect(plan.updates.map((u) => [u.existing.id, u.how])).toEqual([["a", "datasheet"]]);
    expect(plan.additions).toHaveLength(2);
    expect(plan.untouched.map((u) => u.id)).toEqual(["b", "c"]);
  });

  it("leaves units the list doesn't mention alone and adds what is new", () => {
    const plan = planImport([have("a", "Keep", "Tank")], [inc("Fresh", "Bikes")]);
    expect(plan.updates).toEqual([]);
    expect(plan.additions.map((u) => u.name)).toEqual(["Fresh"]);
    expect(plan.untouched.map((u) => u.id)).toEqual(["a"]);
  });
});
