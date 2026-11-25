import { describe, expect, it } from "vitest";
import { openPlannedFor, playedAs, plannedLabel } from "@/lib/utils/planned";
import type { Crusade, InlineBattle } from "@/types";

const player = (googleId: string, role: "gm" | "player" = "player") =>
  ({ user: { googleId, displayName: googleId.toUpperCase() }, role }) as Crusade["players"][number];

const battle = (id: string, createdBy: string, plannedId?: string, status: InlineBattle["status"] = "draft") =>
  ({ id, createdBy, plannedId, status }) as InlineBattle;

function crusade(battles: InlineBattle[]): Crusade {
  return {
    players: [player("gm", "gm"), player("a"), player("b"), player("c")],
    phases: [
      {
        id: "ph1",
        name: "One",
        text: "",
        start: "",
        end: "",
        planned: [
          { id: "p1", sides: [["a"], ["b"]], mission: "", where: "", when: "", note: "" },
          { id: "p2", sides: [["a", "c"], ["b"]], mission: "", where: "", when: "", note: "" },
        ],
      },
    ],
    battles,
  } as unknown as Crusade;
}

describe("planned battles", () => {
  it("counts a battle recorded by one of its players", () => {
    expect(playedAs(crusade([battle("x", "a", "p1")])).get("p1")?.id).toBe("x");
  });

  it("counts a battle recorded by the GM", () => {
    expect(playedAs(crusade([battle("x", "gm", "p1")])).has("p1")).toBe(true);
  });

  it("ignores a battle recorded by someone not on it", () => {
    expect(playedAs(crusade([battle("x", "c", "p1")])).has("p1")).toBe(false);
  });

  it("ignores voided battles and unknown planned ids", () => {
    const c = crusade([battle("x", "a", "p1", "voided"), battle("y", "a", "nope")]);
    expect(playedAs(c).size).toBe(0);
  });

  it("lists open planned battles for a player, or all for the GM", () => {
    const c = crusade([battle("x", "a", "p1")]);
    expect(openPlannedFor(c, "a", false).map((o) => o.planned.id)).toEqual(["p2"]);
    expect(openPlannedFor(c, "c", false).map((o) => o.planned.id)).toEqual(["p2"]);
    expect(openPlannedFor(c, "gm", true).map((o) => o.planned.id)).toEqual(["p2"]);
    expect(openPlannedFor(crusade([]), "b", false)).toHaveLength(2);
  });

  it("labels sides", () => {
    const p = crusade([]).phases[0].planned![1];
    expect(plannedLabel(p, (id) => id.toUpperCase())).toBe("A and C v B");
  });
});
