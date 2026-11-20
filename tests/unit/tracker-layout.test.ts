import { describe, expect, it } from "vitest";
import { exportTrackerLayout, parseTrackerLayout } from "@/lib/import/tracker-layout";

const SET = {
  format: "crusade-ledger-tracker",
  version: 1,
  name: "Example",
  trackers: [
    { name: "Points", type: "number" },
    { name: "Stage", type: "stages", stages: ["One", "Two", "Three"] },
    { name: "Upgrades", type: "list", entries: [{ name: "First", detail: "Does a thing" }, { name: "Second" }] },
    { name: "Leader chosen", type: "checkbox" },
    { name: "Target", type: "text" },
    { name: "Options", type: "checklist", options: [{ name: "A", detail: "Cost 5" }, { name: "B" }] },
  ],
  notes: "How it works.",
};

describe("tracker sets", () => {
  it("reads every tracker type", () => {
    const l = parseTrackerLayout(JSON.stringify(SET));
    expect(l.name).toBe("Example");
    expect(l.note).toBe("How it works.");
    expect(l.items.map((i) => [i.name, i.kind])).toEqual([
      ["Points", "counter"],
      ["Stage", "stage"],
      ["Upgrades", "list"],
      ["Leader chosen", "toggle"],
      ["Target", "text"],
      ["Options", "checklist"],
    ]);
    expect(l.items[5].value).toMatchObject({
      options: [
        { name: "A", detail: "Cost 5", on: false },
        { name: "B", detail: "", on: false },
      ],
    });
    expect(l.items[0].value).toBe(0);
    expect(l.items[1].value).toEqual({ stages: ["One", "Two", "Three"], current: 0 });
    expect(l.items[2].value).toMatchObject([
      { name: "First", detail: "Does a thing" },
      { name: "Second", detail: "" },
    ]);
    expect(l.items[3].value).toBe(false);
  });

  it("exports structure and entries but not progress, and reads it back", () => {
    const l = parseTrackerLayout(JSON.stringify(SET));
    l.items[0].value = 9;
    l.items[1].value = { stages: ["One", "Two", "Three"], current: 2 };
    l.items[3].value = true;
    l.items[4].value = "secret";
    (l.items[5].value as { options: { on: boolean }[] }).options[0].on = true;
    const out = exportTrackerLayout({ items: l.items, note: l.note }, "Example");
    expect(out).not.toContain("secret");
    const again = parseTrackerLayout(out);
    expect(again.items[0].value).toBe(0);
    expect(again.items[1].value).toEqual({ stages: ["One", "Two", "Three"], current: 0 });
    expect(again.items[2].value).toHaveLength(2);
    expect(again.items[3].value).toBe(false);
    expect(again.items[5].value).toMatchObject({ options: [{ name: "A", on: false }, { name: "B" }] });
    expect(again.note).toBe("How it works.");
  });

  it("rejects other JSON with a clear reason", () => {
    expect(() => parseTrackerLayout("nope")).toThrow(/isn't valid JSON/);
    expect(() => parseTrackerLayout("{}")).toThrow(/isn't a tracker set/);
    expect(() =>
      parseTrackerLayout(JSON.stringify({ ...SET, trackers: [{ name: "X", type: "grid" }] })),
    ).toThrow(/problem at trackers.0.type/);
  });

  it("carries placement, per set and per tracker", () => {
    const l = parseTrackerLayout(
      JSON.stringify({
        format: "crusade-ledger-tracker",
        version: 1,
        placement: "above",
        trackers: [
          { name: "A", type: "number" },
          { name: "B", type: "number", placement: "side" },
          { name: "C", type: "number", placement: "below" },
        ],
      }),
    );
    expect(l.items.map((i) => i.placement)).toEqual(["above", undefined, "below"]);
    const again = parseTrackerLayout(exportTrackerLayout({ items: l.items, note: "" }, "x"));
    expect(again.items.map((i) => i.placement)).toEqual(["above", undefined, "below"]);
  });

  it("a number can keep a lifetime total", () => {
    const l = parseTrackerLayout(
      JSON.stringify({
        format: "crusade-ledger-tracker",
        version: 1,
        trackers: [
          { name: "Resource", type: "number", lifetime: true },
          { name: "Plain", type: "number" },
        ],
      }),
    );
    expect(l.items[0].lifetime).toBe(0);
    expect(l.items[1].lifetime).toBeUndefined();
    l.items[0].value = 3;
    l.items[0].lifetime = 8;
    const again = parseTrackerLayout(exportTrackerLayout({ items: l.items, note: "" }, "x"));
    expect(again.items[0]).toMatchObject({ value: 0, lifetime: 0 });
    expect(again.items[1].lifetime).toBeUndefined();
  });
});
