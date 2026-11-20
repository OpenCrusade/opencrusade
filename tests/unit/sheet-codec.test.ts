import { describe, expect, it } from "vitest";
import {
  assemble,
  DATA_COL,
  diff,
  disassemble,
  GM_TAB_ID,
  HEADER_ROW,
  parseTab,
  TOMBSTONE,
  type Snapshot,
} from "@/lib/sync/sheet-codec";
import { crusadeSchema } from "@/lib/schemas/crusade";
import type { Row } from "@/lib/google/sheets";
import type { Crusade } from "@/types";

const NOW = "2026-11-18T12:00:00.000Z";
const gm = { googleId: "g-gm", email: "gm@example.com", displayName: "GM" };
const pl = { googleId: "g-pl", email: "pl@example.com", displayName: "Pat" };

/** An in-memory spreadsheet: apply diffs the way sheet-store does. */
class FakeSheet {
  rows = new Map<number, Row[]>();
  snap(): Snapshot {
    return {
      spreadsheetId: "sheet-1",
      tabs: new Map([...this.rows].map(([id, r]) => [id, parseTab(id, r)])),
    };
  }
  crusade(): Crusade {
    return crusadeSchema.parse(assemble(this.snap()));
  }
  private tick = 0;
  /** Returns the tab ids written. */
  write(next: Crusade, actorId: string, from?: Crusade): number[] {
    const snap = this.snap();
    const now = new Date(Date.parse(NOW) + ++this.tick * 1000).toISOString();
    const before = from ? disassemble(from, snap, now) : new Map();
    const after = disassemble(
      next,
      snap,
      now,
      from && {
        actorGoogleId: actorId,
        prev: new Map(from.battles.map((b) => [b.id, b.status])),
      },
    );
    const writes = diff(before, after, snap, now);
    for (const w of writes) {
      const tab = this.rows.get(w.tabId) ?? [HEADER_ROW];
      for (const u of w.updates) tab[u.rowIndex] = u.cells;
      tab.push(...w.appends);
      this.rows.set(w.tabId, tab);
    }
    return writes.map((w) => w.tabId).sort((a, b) => a - b);
  }
  mutate(actorId: string, fn: (c: Crusade) => Crusade): number[] {
    const live = this.crusade();
    return this.write(crusadeSchema.parse(fn(live)), actorId, live);
  }
}

function unit(id: string, name: string, xp = 0) {
  return {
    id, name, datasheetName: "Datasheet", pointsCost: 100, modelCount: 5,
    experiencePoints: xp, rank: "Battle-ready" as const, crusadePoints: 0,
    battlesPlayed: 0, battlesSurvived: 0, enemiesDestroyed: 0,
    battleHonours: [], battleScars: [], blessings: [], burdens: [],
    equipment: [], notes: "", isCharacter: false,
    createdAt: NOW, updatedAt: NOW, appliedBattleIds: [],
  };
}

function roster(owner: typeof gm, id: string, units: ReturnType<typeof unit>[]) {
  return {
    id, player: owner, factionName: "Faction", supplyUsed: 0,
    requisitionPoints: 0, crusadePoints: 0, units, requisitionLog: [],
    attachedAt: NOW, lastSyncedAt: NOW, canonicalFileId: id, crusadeBanner: "",
  };
}

function seed(): FakeSheet {
  const sheet = new FakeSheet();
  sheet.write(
    crusadeSchema.parse({
      id: "sheet-1", name: "Test", packId: "core", createdAt: NOW, createdBy: gm,
      supplyLimit: 1000, startingRP: 5, settings: {},
      players: [
        { user: gm, joinedAt: NOW, role: "gm", status: "Active", tabId: 10 },
      ],
    }),
    gm.googleId,
  );
  return sheet;
}

/** The player joins: they add themselves, with their own tab (20). */
const claim = (c: Crusade): Crusade => ({
  ...c,
  players: [
    ...c.players,
    {
      user: pl, factionName: "", joinedAt: "2026-11-18T12:01:00.000Z",
      role: "player" as const, status: "Active" as const, tabId: 20,
    },
  ],
});

describe("sheet codec", () => {
  it("round-trips a crusade; the creator is the GM", () => {
    const c = seed().crusade();
    expect(c.players.map((p) => [p.user.displayName, p.role, p.status])).toEqual([
      ["GM", "gm", "Active"],
    ]);
    // a brand-new crusade needs no player rows in the GM's tab
    expect(seed().rows.get(GM_TAB_ID)!.filter((r) => r[0] === "player")).toEqual([]);
  });

  it("joining writes only the player's own tab; GM facts live in the GM's tab", () => {
    const sheet = seed();
    expect(sheet.mutate(pl.googleId, claim)).toEqual([20]);
    let c = sheet.crusade();
    expect(c.players.map((p) => [p.user.displayName, p.role, p.tabId])).toEqual([
      ["GM", "gm", 10],
      ["Pat", "player", 20],
    ]);

    // the GM puts them on a team, then removes them: GM tab only
    const patch = (fn: (p: Crusade["players"][0]) => Crusade["players"][0]) => (x: Crusade) => ({
      ...x,
      players: x.players.map((p) => (p.user.googleId === pl.googleId ? fn(p) : p)),
    });
    expect(sheet.mutate(gm.googleId, patch((p) => ({ ...p, groupId: "g1" })))).toEqual([GM_TAB_ID]);
    expect(sheet.crusade().players[1].groupId).toBe("g1");
    expect(sheet.mutate(gm.googleId, patch((p) => ({ ...p, status: "Removed" })))).toEqual([GM_TAB_ID]);
    c = sheet.crusade();
    expect(c.players[1].status).toBe("Removed");
  });

  it("someone with two tabs is one player (the earlier tab wins)", () => {
    const sheet = seed();
    sheet.mutate(pl.googleId, claim);
    sheet.rows.set(30, [
      HEADER_ROW,
      ["profile", "me", "Pat again", pl.email, "", "", "", "", "", "", "", NOW,
        JSON.stringify({ ...pl, displayName: "Pat again", joinedAt: "2026-11-18T12:05:00.000Z" })],
    ]);
    const c = sheet.crusade();
    expect(c.players.filter((p) => p.user.googleId === pl.googleId).map((p) => p.tabId)).toEqual([20]);
  });

  it("a player's claim, roster and results touch only their own tab", () => {
    const sheet = seed();
    expect(sheet.mutate(pl.googleId, claim)).toEqual([20]);

    expect(
      sheet.mutate(pl.googleId, (c) => ({
        ...c,
        attachedRosters: [roster(pl, "r-pl", [unit("u1", "Alpha"), unit("u2", "Beta")])],
      })),
    ).toEqual([20]);
    expect(sheet.crusade().attachedRosters[0].units.map((u) => u.name)).toEqual(["Alpha", "Beta"]);

    // an unchanged write is a no-op
    expect(sheet.mutate(pl.googleId, (c) => ({ ...c }))).toEqual([]);
  });

  it("editing one unit rewrites one row in place; removing one tombstones it", () => {
    const sheet = seed();
    sheet.mutate(pl.googleId, claim);
    sheet.mutate(pl.googleId, (c) => ({
      ...c,
      attachedRosters: [roster(pl, "r-pl", [unit("u1", "Alpha"), unit("u2", "Beta")])],
    }));
    const before = sheet.rows.get(20)!.map((r) => [...r]);

    sheet.mutate(pl.googleId, (c) => ({
      ...c,
      attachedRosters: c.attachedRosters.map((r) => ({
        ...r,
        units: r.units.map((u) => (u.id === "u2" ? { ...u, experiencePoints: 6 } : u)),
      })),
    }));
    const after = sheet.rows.get(20)!;
    expect(after).toHaveLength(before.length);
    const changed = after.filter((r, i) => JSON.stringify(r) !== JSON.stringify(before[i]));
    expect(changed.map((r) => r[1])).toEqual(["u2"]);
    expect(changed[0][5]).toBe(6); // readable XP column

    sheet.mutate(pl.googleId, (c) => ({
      ...c,
      attachedRosters: c.attachedRosters.map((r) => ({
        ...r,
        units: r.units.filter((u) => u.id !== "u1"),
      })),
    }));
    expect(sheet.rows.get(20)!.filter((r) => r[0] === TOMBSTONE)).toHaveLength(1);
    expect(sheet.rows.get(20)!).toHaveLength(before.length); // nothing moved
    expect(sheet.crusade().attachedRosters[0].units.map((u) => u.name)).toEqual(["Beta"]);
  });

  it("splits a battle across tabs and derives its status", () => {
    const sheet = seed();
    sheet.mutate(pl.googleId, claim);
    sheet.mutate(gm.googleId, (c) => ({ ...c, attachedRosters: [roster(gm, "r-gm", [unit("g1", "Gamma")])] }));
    sheet.mutate(pl.googleId, (c) => ({
      ...c,
      attachedRosters: [...c.attachedRosters, roster(pl, "r-pl", [unit("u1", "Alpha")])],
    }));

    const participant = (who: typeof gm, rosterId: string) => ({
      googleId: who.googleId, displayName: who.displayName, rosterId,
    });
    // created by the player: only the player's tab is written
    expect(
      sheet.mutate(pl.googleId, (c) => ({
        ...c,
        battles: [
          {
            id: "b1", missionName: "Mission", date: "2026-11-18", pointsLevel: 1000,
            participants: [participant(pl, "r-pl"), participant(gm, "r-gm")],
            createdBy: pl.googleId, createdAt: NOW, updatedAt: NOW,
          } as never,
        ],
      })),
    ).toEqual([20]);
    expect(sheet.crusade().battles[0].status).toBe("draft");

    const onBattle = (fn: (p: Crusade["battles"][0]["participants"][0]) => typeof p) =>
      (c: Crusade): Crusade => ({
        ...c,
        battles: c.battles.map((b) => ({ ...b, participants: b.participants.map(fn) })),
      });
    const declare = (plVp: number) =>
      onBattle((p) =>
        p.googleId === pl.googleId
          ? { ...p, outcome: "victory", victoryPoints: plVp }
          : { ...p, outcome: "defeat", victoryPoints: 40 },
      );
    const confirm = (id: string) =>
      onBattle((p) => (p.googleId === id ? { ...p, confirmed: true } : p));

    // The creator declares who won: header + their own row, one tab.
    expect(sheet.mutate(pl.googleId, declare(70))).toEqual([20]);
    let b = sheet.crusade().battles[0];
    expect(b.status).toBe("pending");
    expect(b.participants.map((p) => [p.outcome, p.victoryPoints, p.confirmed])).toEqual([
      ["victory", 70, true], // creator stands behind what they entered
      ["defeat", 40, false],
    ]);
    // The other player confirms: only THEIR tab is written.
    expect(sheet.mutate(gm.googleId, confirm(gm.googleId))).toEqual([10]);
    expect(sheet.crusade().battles[0].status).toBe("verified");
    // the lifecycle moving on its own writes no override rows
    expect([...sheet.rows.values()].flat().filter((r) => r[0] === "status")).toEqual([]);

    // The creator changes the result: still only their own tab, and the
    // other player's confirmation no longer counts.
    const gmRowBefore = JSON.stringify(sheet.rows.get(10));
    expect(sheet.mutate(pl.googleId, declare(75))).toEqual([20]);
    expect(JSON.stringify(sheet.rows.get(10))).toBe(gmRowBefore);
    b = sheet.crusade().battles[0];
    expect(b.status).toBe("pending");
    expect(b.participants[1].confirmed).toBe(false);
    // a player's own unit edits never disturb the stale confirmation
    expect(
      sheet.mutate(gm.googleId, onBattle((p) => (p.googleId === gm.googleId ? { ...p, notes: "gg" } : p))),
    ).toEqual([10]);
    expect(sheet.crusade().battles[0].status).toBe("pending");
    expect(sheet.mutate(gm.googleId, confirm(gm.googleId))).toEqual([10]);
    expect(sheet.crusade().battles[0].status).toBe("verified");
    // the readable columns of the confirmer's row show what they agreed to
    const gmResult = sheet.rows.get(10)!.find((r) => r[0] === "result")!;
    expect(gmResult.slice(3, 5)).toEqual(["Defeat", 40]);

    // manual void by the GM is an override row in the GM's own tab
    const setStatus = (status: "voided" | "draft") => (c: Crusade): Crusade => ({
      ...c,
      battles: c.battles.map((b) => ({ ...b, status })),
    });
    expect(sheet.mutate(gm.googleId, setStatus("voided"))).toEqual([10]);
    expect(sheet.crusade().battles[0].status).toBe("voided");
    // creator restores: override in THEIR tab; lifecycle resumes
    expect(sheet.mutate(pl.googleId, setStatus("draft"))).toEqual([20]);
    expect(sheet.crusade().battles[0].status).toBe("verified");
  });

  it("GM-owned changes write only the Crusade tab", () => {
    const sheet = seed();
    expect(
      sheet.mutate(gm.googleId, (c) => ({ ...c, settings: { allowPlayerBattleCreation: false } })),
    ).toEqual([GM_TAB_ID]);
    expect(sheet.crusade().settings.allowPlayerBattleCreation).toBe(false);
  });

  it("splits oversized JSON across cells and reads it back", () => {
    const sheet = seed();
    const note = "x".repeat(9_000);
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: `i${i}`, name: `Item ${i}`, kind: "text" as const, value: "y".repeat(1_990) + i,
    }));
    sheet.mutate(gm.googleId, (c) => ({ ...c, packState: { counters: [], items, note } }));
    const row = sheet.rows.get(GM_TAB_ID)!.find((r) => r[0] === "crusade")!;
    const cells = row.slice(DATA_COL).map(String);
    expect(cells.length).toBeGreaterThan(1);
    expect(cells.every((c) => c.length <= 40_000)).toBe(true);
    expect(sheet.crusade().packState.items).toHaveLength(40);
    expect(sheet.crusade().packState.note).toBe(note);
  });

  it("ignores rows a human added and returns null for a non-crusade sheet", () => {
    const sheet = seed();
    sheet.rows.get(10)!.push(["note to self", "", "remember dice"]);
    sheet.rows.get(GM_TAB_ID)!.push(["unit", "broken", "", "", "", "", "", "", "", "", "", "", "{not json"]);
    expect(sheet.crusade().players).toHaveLength(1);
    expect(assemble({ spreadsheetId: "x", tabs: new Map() })).toBeNull();
  });
});
