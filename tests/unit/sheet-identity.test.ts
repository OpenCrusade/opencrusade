import { describe, expect, it } from "vitest";
import {
  assemble,
  diff,
  disassemble,
  GM_TAB_ID,
  HEADER_ROW,
  parseTab,
  recToCells,
  type Rec,
  type Snapshot,
} from "@/lib/sync/sheet-codec";
import { crusadeSchema } from "@/lib/schemas/crusade";
import type { Row } from "@/lib/google/sheets";
import type { Crusade } from "@/types";

/**
 * Everything in a player's tab is typed by that player. These tests
 * check that a tab cannot speak for anyone but the person the GM's
 * app admitted to it.
 */

const NOW = "2026-11-18T12:00:00.000Z";
const gm = { googleId: "g-gm", email: "gm@example.com", displayName: "GM" };
const ann = { googleId: "g-ann", email: "ann@example.com", displayName: "Ann" };
const mal = { googleId: "g-mal", email: "mal@example.com", displayName: "Mal" };

const rows = new Map<number, Row[]>();
const snap = (): Snapshot => ({
  spreadsheetId: "sheet-1",
  tabs: new Map([...rows].map(([id, r]) => [id, parseTab(id, r)])),
});
const read = (): Crusade => crusadeSchema.parse(assemble(snap()));

function write(next: Crusade, from?: Crusade) {
  const s = snap();
  const writes = diff(from ? disassemble(from, s, NOW) : new Map(), disassemble(next, s, NOW), s, NOW);
  for (const w of writes) {
    const tab = rows.get(w.tabId) ?? [HEADER_ROW];
    for (const u of w.updates) tab[u.rowIndex] = u.cells;
    tab.push(...w.appends);
    rows.set(w.tabId, tab);
  }
}

/** Type a row straight into a tab, as someone editing the sheet by hand could. */
function forge(tabId: number, rec: Rec) {
  const tab = rows.get(tabId) ?? [HEADER_ROW];
  tab.push(recToCells(rec, NOW));
  rows.set(tabId, tab);
}

const profile = (who: typeof gm, joinedAt = NOW): Rec => ({
  kind: "profile", id: "me", cols: [], data: { ...who, joinedAt },
});

function roster(owner: typeof gm, id: string) {
  return {
    id, player: owner, factionName: "Faction", supplyUsed: 0, requisitionPoints: 0,
    crusadePoints: 0, units: [], requisitionLog: [], attachedAt: NOW,
    lastSyncedAt: NOW, canonicalFileId: id, crusadeBanner: "",
  };
}

/** A campaign whose GM (tab 10) and Ann (tab 20) are both admitted. */
function seed() {
  rows.clear();
  write(
    crusadeSchema.parse({
      id: "sheet-1", name: "Test", packId: "core", createdAt: NOW, createdBy: gm,
      supplyLimit: 1000, startingRP: 5, settings: {},
      players: [
        { user: gm, joinedAt: NOW, role: "gm", status: "Active", tabId: 10, registered: true },
        { user: ann, joinedAt: NOW, role: "player", status: "Active", tabId: 20, registered: true },
      ],
      attachedRosters: [roster(ann, "r-ann")],
    }),
  );
}

describe("who a tab may speak for", () => {
  it("records admitted players in the GM-locked tab", () => {
    seed();
    const c = read();
    expect(c.players.map((p) => [p.user.googleId, p.tabId, p.registered])).toEqual([
      ["g-gm", 10, true],
      ["g-ann", 20, true],
    ]);
    const reg = rows.get(GM_TAB_ID)!.filter((r) => r[0] === "player");
    expect(reg).toHaveLength(2);
  });

  it("ignores another tab claiming to be an admitted player, however early it says it joined", () => {
    seed();
    forge(4, profile(ann, "1970-01-01T00:00:00.000Z"));
    forge(4, { kind: "roster", id: "r-ann", cols: [], data: { ...roster(ann, "r-ann"), factionName: "Forged" } });
    const c = read();
    expect(c.players.find((p) => p.user.googleId === "g-ann")?.tabId).toBe(20);
    expect(c.attachedRosters.map((r) => r.factionName)).toEqual(["Faction"]);
  });

  it("ignores another tab claiming to be the GM", () => {
    seed();
    forge(4, profile(gm, "1970-01-01T00:00:00.000Z"));
    forge(4, { kind: "status", id: "b1", cols: [], data: { status: "voided", at: NOW } });
    const c = read();
    expect(c.players.filter((p) => p.role === "gm").map((p) => p.tabId)).toEqual([10]);
  });

  it("refuses a newcomer's claim on an admitted player's email", () => {
    seed();
    forge(30, profile({ ...mal, email: ann.email }));
    expect(read().players.map((p) => p.user.googleId)).toEqual(["g-gm", "g-ann"]);
  });

  it("trusts neither of two waiting tabs that claim the same Google account", () => {
    seed();
    forge(30, profile(mal));
    forge(28, profile({ ...mal, email: "other@example.com" }));
    expect(read().players.map((p) => p.user.googleId)).toEqual(["g-gm", "g-ann"]);
  });

  it("shows a genuine newcomer straight away, not yet admitted", () => {
    seed();
    forge(30, profile(mal));
    const m = read().players.find((p) => p.user.googleId === "g-mal");
    expect(m?.tabId).toBe(30);
    expect(m?.registered).toBeUndefined();
    expect(m?.role).toBe("player");
  });

  it("drops a force that claims a different owner than its tab", () => {
    seed();
    forge(30, profile(mal));
    forge(30, { kind: "roster", id: "r-ann", cols: [], data: { ...roster(ann, "r-ann"), factionName: "Forged" } });
    const c = read();
    expect(c.attachedRosters.map((r) => [r.id, r.factionName])).toEqual([["r-ann", "Faction"]]);
  });

  it("drops a battle recorded in someone else's name", () => {
    seed();
    forge(30, profile(mal));
    forge(30, {
      kind: "battle", id: "b-forged", cols: [],
      data: {
        id: "b-forged", missionName: "Forged", date: NOW, createdBy: ann.googleId,
        createdAt: NOW, updatedAt: NOW,
        participants: [
          { googleId: ann.googleId, displayName: "Ann", rosterId: "r-ann", outcome: "defeat", victoryPoints: 0 },
          { googleId: mal.googleId, displayName: "Mal", rosterId: "r-mal", outcome: "victory", victoryPoints: 99 },
        ],
      },
    });
    expect(read().battles).toEqual([]);
  });

  it("survives rows that are not the shape they claim", () => {
    seed();
    forge(40, { kind: "profile", id: "me", cols: [], data: { googleId: "x" } });
    forge(42, { kind: "profile", id: "me", cols: [], data: null });
    forge(GM_TAB_ID, { kind: "player", id: "junk", cols: [], data: 7 });
    forge(20, { kind: "unit", id: "u-junk", cols: [], data: null });
    expect(() => assemble(snap())).not.toThrow();
    expect(read().players).toHaveLength(2);
  });
});
