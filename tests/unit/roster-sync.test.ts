import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Crusade, PlayerRoster } from "@/types";

/**
 * A force must never be silently overwritten or silently detached.
 * The sheet is stood in for by `live`, a crusade held in memory.
 */

let live: Crusade;
let failWith: unknown = null;

vi.mock("@/lib/sync/crusade-ops", () => ({
  isCrusadeGone: (err: unknown) => (err as { gone?: boolean })?.gone === true,
  revalidateCrusade: vi.fn(),
  mutateCrusade: vi.fn(async (_id: string, fn: (c: Crusade) => Crusade) => {
    if (failWith) throw failWith;
    live = fn(live);
    return live;
  }),
}));

import { db } from "@/lib/db/dexie";
import { getRosterRowByRosterId, putRoster } from "@/lib/db/rosters";
import {
  adoptNewerMirrors,
  forgetUnreachableCrusade,
  pushMirrors,
  resolveRosterClash,
} from "@/lib/sync/roster-ops";
import { putCrusade } from "@/lib/db/crusades";
import { useAppStore } from "@/stores/app-store";
import { useSyncStatus } from "@/stores/sync-status";

const NOW = "2026-11-18T12:00:00.000Z";
const me = { googleId: "g-me", email: "me@example.com", displayName: "Me" };

function roster(factionName: string, attached = true): PlayerRoster {
  return {
    id: "r1", player: me, factionName, supplyLimit: 1000, supplyUsed: 0,
    requisitionPoints: 5, crusadePoints: 0, units: [], requisitionLog: [],
    appliedGmAssignments: [], createdAt: NOW, updatedAt: NOW,
    attachedTo: attached
      ? [{ crusadeId: "c1", mirrorFileId: "c1", attachedAt: NOW, crusadeBanner: "" }]
      : [],
  } as unknown as PlayerRoster;
}

function crusadeWith(factionName: string, rev: number, revBy: string, id = "c1"): Crusade {
  const { attachedTo: _a, ...copy } = roster(factionName);
  void _a;
  return {
    id, name: "Test", players: [], battles: [], gmAssignments: [],
    attachedRosters: [
      { ...copy, attachedAt: NOW, lastSyncedAt: NOW, canonicalFileId: "r1", crusadeBanner: "", rev, revBy },
    ],
  } as unknown as Crusade;
}

const local = async () => (await getRosterRowByRosterId("r1"))!;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  useAppStore.setState({ user: me });
  useSyncStatus.setState({ blocked: {}, clashes: [], unsaved: 0 });
  failWith = null;
});

describe("taking a newer copy from the sheet", () => {
  it("takes it when this device has no unsaved edits", async () => {
    await putRoster("r1", roster("Old"), { fromRemote: true, rev: 1 });
    await adoptNewerMirrors(crusadeWith("New", 2, "another-device"));
    expect((await local()).payload.factionName).toBe("New");
    expect((await local()).rev).toBe(2);
  });

  it("keeps both and asks, when this device has unsaved edits too", async () => {
    await putRoster("r1", roster("Old"), { fromRemote: true, rev: 1 });
    await putRoster("r1", roster("Mine")); // an unsaved edit
    await adoptNewerMirrors(crusadeWith("Theirs", 2, "gm"));
    const row = await local();
    expect(row.payload.factionName).toBe("Mine");
    expect(row.dirty).toBe(true);
    expect(row.clash).toBe(true);
  });

  it("ignores a copy in a sheet the force was never attached to", async () => {
    await putRoster("r1", roster("Mine"), { fromRemote: true, rev: 1 });
    await adoptNewerMirrors(crusadeWith("Forged", 99, "someone", "some-other-sheet"));
    expect((await local()).payload.factionName).toBe("Mine");
  });
});

describe("saving to the sheet", () => {
  it("does not overwrite a copy that was changed elsewhere", async () => {
    await putRoster("r1", roster("Old"), { fromRemote: true, rev: 1 });
    await putRoster("r1", roster("Mine"));
    live = crusadeWith("Theirs", 2, "gm");
    expect(await pushMirrors("r1")).toBe(false);
    expect(live.attachedRosters[0].factionName).toBe("Theirs");
    expect((await local()).clash).toBe(true);
  });

  it("saves, and counts the revision up, when nothing else changed", async () => {
    await putRoster("r1", roster("Old"), { fromRemote: true, rev: 1 });
    await putRoster("r1", roster("Mine"));
    live = crusadeWith("Old", 1, "another-device");
    expect(await pushMirrors("r1")).toBe(true);
    expect(live.attachedRosters[0].factionName).toBe("Mine");
    expect(live.attachedRosters[0].rev).toBe(2);
    const row = await local();
    expect(row.dirty).toBe(false);
    expect(row.rev).toBe(2);
  });

  it("keeps the force attached and unsaved when the sheet can't be reached", async () => {
    await putRoster("r1", roster("Mine"));
    failWith = { gone: true };
    expect(await pushMirrors("r1")).toBe(false);
    const row = await local();
    expect(row.payload.attachedTo).toHaveLength(1);
    expect(row.dirty).toBe(true);
    expect(useSyncStatus.getState().blocked).toEqual({ r1: ["c1"] });
  });

  it("only stops saving to a campaign when the player says so", async () => {
    await putRoster("r1", roster("Mine"));
    failWith = { gone: true };
    await pushMirrors("r1");
    await forgetUnreachableCrusade("r1", "c1");
    expect((await local()).payload.attachedTo).toEqual([]);
    expect(useSyncStatus.getState().blocked).toEqual({});
  });
});

describe("settling a force changed in two places", () => {
  beforeEach(async () => {
    await putRoster("r1", roster("Old"), { fromRemote: true, rev: 1 });
    await putRoster("r1", roster("Mine"));
    live = crusadeWith("Theirs", 2, "gm");
    await putCrusade(live, { fromRemote: true });
    await pushMirrors("r1"); // flags the clash
  });

  it("can take the sheet's version", async () => {
    await resolveRosterClash("r1", "theirs");
    const row = await local();
    expect(row.payload.factionName).toBe("Theirs");
    expect(row.clash).toBeFalsy();
    expect(row.dirty).toBe(false);
  });

  it("can keep this device's version, which then saves", async () => {
    await resolveRosterClash("r1", "mine");
    await vi.waitFor(() => expect(live.attachedRosters[0].factionName).toBe("Mine"));
    expect(live.attachedRosters[0].rev).toBe(3);
  });
});
