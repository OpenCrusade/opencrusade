import { describe, expect, it } from "vitest";
import { applySets, blankValue, dropWithdrawn, mergeTrackerEdit, readTrackerState } from "@/components/common/tracker-state";

describe("tracker state", () => {
  it("turns the retired faction panel's data into ordinary trackers", () => {
    const s = readTrackerState({
      awakeningPoints: 2,
      systems: [{ id: "a", name: "First", rules: "Does a thing" }],
      items: [{ id: "x", name: "Mine", kind: "toggle", value: true }],
      note: "n",
    });
    expect(s.items.map((i) => [i.name, i.kind])).toEqual([
      ["Points", "counter"],
      ["Unlocked", "list"],
      ["Mine", "toggle"],
    ]);
    expect(s.items[0].value).toBe(2);
    expect(s.items[1].value).toEqual([{ id: "a", name: "First", detail: "Does a thing" }]);
    expect(s.note).toBe("n");
  });

  it("adds nothing when there is no old data", () => {
    expect(readTrackerState({ items: [], note: "" }).items).toEqual([]);
    expect(readTrackerState(undefined).items).toEqual([]);
  });

  it("copies a layout without its values", () => {
    expect(blankValue({ kind: "counter", value: 7 })).toBe(0);
    expect(blankValue({ kind: "list", value: [{ id: "1", name: "a", detail: "" }] })).toEqual([]);
    expect(blankValue({ kind: "toggle", value: true })).toBe(false);
    expect(blankValue({ kind: "text", value: "x" })).toBe("");
    expect(blankValue({ kind: "stage", value: { stages: ["One", "Two"], current: 1 } })).toEqual({
      stages: ["One", "Two"],
      current: 0,
    });
  });

  it("drops a tracker the GM took out of a set, and nothing else", () => {
    const set = {
      id: "s1",
      note: "",
      items: [
        { id: "a", name: "Tally", kind: "counter" as const, value: 0 },
        { id: "b", name: "Phase", kind: "counter" as const, value: 0 },
      ],
    };
    const mine = { items: [{ id: "x", name: "Mine", kind: "counter" as const, value: 4 }], note: "n" };
    const have = applySets(mine, [], [set])!.state;
    have.items[1].value = 9;

    // Nothing has been taken out yet.
    expect(dropWithdrawn(have, [set])).toBeNull();

    // The GM removes "Phase": it goes, the rest keep their values.
    const smaller = { ...set, items: [set.items[0]] };
    const after = dropWithdrawn(have, [smaller])!;
    expect(after.items.map((i) => [i.name, i.value])).toEqual([["Mine", 4], ["Tally", 9]]);
    expect(after.note).toBe("n");
    // And it is not handed back.
    expect(applySets(after, ["s1"], [smaller])).toBeNull();

    // A set that is gone altogether leaves the player's trackers alone.
    expect(dropWithdrawn(have, [])).toBeNull();
  });

  it("adds a GM set once, and later only what the GM added to it", () => {
    const set = {
      id: "s1",
      note: "How it works.",
      items: [
        { id: "a", name: "Tally", kind: "counter" as const, value: 0 },
        { id: "b", name: "Relics", kind: "list" as const, value: [{ id: "e", name: "One", detail: "" }] },
      ],
    };
    const mine = { items: [{ id: "x", name: "Mine", kind: "counter" as const, value: 4 }], note: "" };

    const first = applySets(mine, [], [set])!;
    expect(first.state.items.map((i) => i.name)).toEqual(["Mine", "Tally", "Relics"]);
    expect(first.state.items[0].value).toBe(4);
    expect(first.state.items[2].value).toEqual([{ id: "e", name: "One", detail: "" }]);
    expect(first.state.note).toBe("How it works.");
    expect(first.appliedSetIds).toEqual(["s1"]);

    // Nothing to do the second time.
    expect(applySets(first.state, first.appliedSetIds, [set])).toBeNull();

    // The player's progress survives when the GM extends the set.
    first.state.items[1].value = 7;
    const grown = { ...set, items: [...set.items, { id: "c", name: "New", kind: "toggle" as const, value: false }] };
    const second = applySets(first.state, first.appliedSetIds, [grown])!;
    expect(second.state.items.map((i) => i.name)).toEqual(["Mine", "Tally", "Relics", "New"]);
    expect(second.state.items[1].value).toBe(7);
    expect(second.state.note).toBe("How it works.");
  });

  it("a GM correction lands on top of what the player has since changed", () => {
    const n = (id: string, value: number, lifetime?: number) => ({
      id, name: id, kind: "counter" as const, value, ...(lifetime !== undefined ? { lifetime } : {}),
    });
    // The GM's page still shows the trackers at zero...
    const before = { items: [n("stone", 0, 0), n("other", 0)], note: "" };
    // ...and the GM bumps the lifetime of one of them.
    const after = { items: [n("stone", 0, 1), n("other", 0)], note: "" };
    // Meanwhile the player raised "other", added a tracker and wrote a note.
    const live = { items: [n("stone", 0, 0), n("other", 5), n("new", 2)], note: "mine" };

    const merged = mergeTrackerEdit(before, after, live);
    expect(merged.items).toEqual([n("stone", 0, 1), n("other", 5), n("new", 2)]);
    expect(merged.note).toBe("mine");
  });

  it("a GM edit can remove, add and reorder", () => {
    const n = (id: string) => ({ id, name: id, kind: "counter" as const, value: 0 });
    const before = { items: [n("a"), n("b"), n("c")], note: "" };
    expect(
      mergeTrackerEdit(before, { items: [n("a"), n("c"), n("d")], note: "x" }, before),
    ).toEqual({ items: [n("a"), n("c"), n("d")], note: "x" });
    expect(
      mergeTrackerEdit(before, { items: [n("c"), n("a"), n("b")], note: "" }, before).items.map((i) => i.id),
    ).toEqual(["c", "a", "b"]);
  });
});
