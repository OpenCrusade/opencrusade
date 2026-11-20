/**
 * LIVE end-to-end test of the Sheets storage layer. Plays a small
 * crusade through the real op functions as two real Google accounts
 * (GM + player) against a standing fixture spreadsheet.
 *
 *   LIVE_SHEETS=1 npx vitest run tests/integration/sheets-live.test.ts
 *
 * Needs in .env.local: VITE_GOOGLE_CLIENT_ID, GOOGLE_WEB_CLIENT_SECRET,
 * GOOGLE_GM_REFRESH_TOKEN, GOOGLE_PLAYER_REFRESH_TOKEN, and
 * SHEETS_FIXTURE_ID, a spreadsheet OWNED by the GM test account and
 * SHARED (Editor) with the player test account. The app cannot share
 * files (no Drive permission), so the fixture is shared once by hand
 * and wiped + rebuilt by this test on every run.
 *
 * Skipped unless LIVE_SHEETS=1, so `npm test` stays offline.
 */
import "fake-indexeddb/auto";
import fs from "fs";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { useAppStore } from "@/stores/app-store";
import { db } from "@/lib/db/dexie";
import {
  batchUpdate,
  getSpreadsheetInfo,
  readRanges,
} from "@/lib/google/sheets";
import {
  assignBlessingOrBurden,
  joinCrusade,
  openCrusadeFromLink,
  removePlayer,
  updateCrusadeConfig,
} from "@/lib/sync/crusade-ops";
import {
  addUnit,
  attachRosterToCrusade,
  createRoster,
  pushMirrors,
  removeUnit,
  restoreMyRosters,
} from "@/lib/sync/roster-ops";
import {
  applyBattleResults,
  confirmBattleResult,
  createBattle,
  declareBattleResult,
  setBattleStatus,
  updateBattleParticipant,
} from "@/lib/sync/battle-ops";
import {
  forgetTabTitles,
  readCrusade,
  rebuildViews,
  setUpCrusadeTabs,
  sheetUrl,
  writeNewCrusade,
} from "@/lib/sync/sheet-store";
import { GM_TAB_ID, OVERVIEW_TAB_ID } from "@/lib/sync/sheet-codec";
import { crusadeSchema } from "@/lib/schemas/crusade";
import type { Crusade, GoogleUser } from "@/types";

const LIVE = process.env.LIVE_SHEETS === "1";

const env: Record<string, string> = {};
const envPath = path.resolve(__dirname, "../../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.+)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}

interface Identity {
  user: GoogleUser;
  token: { access_token: string; expires_in: number; scope: string };
}

async function mint(refreshToken: string): Promise<Identity> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.VITE_GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_WEB_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const token = await res.json();
  if (!res.ok) throw new Error(`token: ${JSON.stringify(token)}`);
  const ui = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const u = await ui.json();
  return {
    token,
    user: { googleId: u.sub, email: u.email, displayName: u.email.split("@")[0] },
  };
}

/** Become this account on a "fresh device" (no cached crusades). */
async function actAs(who: Identity, opts: { freshDevice?: boolean } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useAppStore.getState().setSession(who.user, who.token as any);
  if (opts.freshDevice) await db.crusades.clear();
}

describe.skipIf(!LIVE)("Sheets storage, live, two accounts", () => {
  const ID = env.SHEETS_FIXTURE_ID;
  let gm: Identity;
  let player: Identity;
  let gmTabId: number;

  const live = async (): Promise<Crusade> => (await readCrusade(ID)).crusade;

  beforeAll(async () => {
    expect(ID, "SHEETS_FIXTURE_ID missing from .env.local").toBeTruthy();
    gm = await mint(env.GOOGLE_GM_REFRESH_TOKEN);
    player = await mint(env.GOOGLE_PLAYER_REFRESH_TOKEN);
    await db.delete();
    await db.open();

    // Wipe the fixture down to a blank Overview + Crusade + GM tab.
    await actAs(gm);
    const info = await getSpreadsheetInfo(ID);
    gmTabId = 500_000 + 2 * Math.floor(Math.random() * 200_000);
    const scratch = 900_000_000 + Math.floor(Math.random() * 1_000_000);
    // One request per tab: deleting view pages and the data tabs their
    // formulas point at in a single batch makes Sheets answer 500.
    await batchUpdate(ID, [
      { addSheet: { properties: { sheetId: scratch, title: `scratch-${scratch}` } } },
    ]);
    for (const t of info.tabs) {
      await batchUpdate(ID, [{ deleteSheet: { sheetId: t.sheetId } }]);
    }
    await batchUpdate(ID, [
      { addSheet: { properties: { sheetId: OVERVIEW_TAB_ID, title: "Crusade" } } },
      { addSheet: { properties: { sheetId: GM_TAB_ID, title: "Crusade data", hidden: true } } },
      { addSheet: { properties: { sheetId: gmTabId, title: `data · ${gm.user.displayName}`, hidden: true } } },
      { deleteSheet: { sheetId: scratch } },
    ]);
    forgetTabTitles(ID);
    await setUpCrusadeTabs(ID, gm.user, gmTabId);
  }, 60_000);

  it("plays a crusade end to end", async () => {
    // ── GM creates the crusade ──────────────────────────────────
    const now = new Date().toISOString();
    const fresh = crusadeSchema.parse({
      id: ID,
      name: "Fixture Crusade",
      packId: "core",
      createdAt: now,
      createdBy: gm.user,
      supplyLimit: 1000,
      startingRP: 5,
      players: [
        { user: gm.user, factionName: "", joinedAt: now, role: "gm", status: "Active", tabId: gmTabId },
      ],
      settings: { allowPlayerBattleCreation: true },
    });
    await writeNewCrusade(fresh);
    let c = await live();
    expect(c.name).toBe("Fixture Crusade");
    expect(c.players).toHaveLength(1);
    expect(c.players[0].status).toBe("Active");
    await db.crusades.put({
      crusadeId: ID, fileId: ID, payload: c, lastFetchedAt: Date.now(),
      lastWrittenByThisDevice: true, dirty: false,
    });

    // ── The player joins by themselves ──────────────────────────
    // (The GM's only step is sharing the sheet, which the fixture
    // already is.) Opening the link is read-only; Join adds their tab.
    await actAs(player, { freshDevice: true });
    c = await openCrusadeFromLink(sheetUrl(ID));
    expect(c.players).toHaveLength(1);
    const tabsBefore = (await getSpreadsheetInfo(ID)).tabs.length;
    c = await joinCrusade(ID, player.user, "Test Player");
    const me = c.players.find((p) => p.user.googleId === player.user.googleId)!;
    expect(me.status).toBe("Active");
    expect(me.role).toBe("player");
    expect(me.user.displayName).toBe("Test Player");
    const infoAfter = await getSpreadsheetInfo(ID);
    expect(infoAfter.tabs.length).toBe(tabsBefore + 1);
    // their tab is locked, and they can edit it
    const myTab = infoAfter.tabs.find((t) => t.sheetId === me.tabId)!;
    expect(myTab.protectedRanges[0].requestingUserCanEdit).toBe(true);
    expect(myTab.protectedRanges[0].editors?.users?.sort()).toEqual(
      [gm.user.email, player.user.email].sort(),
    );
    // joining twice does nothing
    c = await joinCrusade(ID, player.user, "Someone Else");
    expect(c.players).toHaveLength(2);
    expect((await getSpreadsheetInfo(ID)).tabs.length).toBe(tabsBefore + 1);
    expect((await live()).players.map((p) => p.user.displayName)).toContain("Test Player");

    // ── Player cannot change GM-owned settings ──────────────────
    await expect(
      updateCrusadeConfig(ID, { settings: { allowPlayerBattleCreation: false } }),
    ).rejects.toThrow(/locked to someone else/);
    expect((await live()).settings.allowPlayerBattleCreation).toBe(true);

    // ── Player builds and attaches a roster ─────────────────────
    const pr = await createRoster({ name: "Red Force", factionName: "Red Force" }, player.user);
    await addUnit(pr.id, { name: "Commander Zahn", datasheetName: "Commander", pointsCost: 100, modelCount: 1, isCharacter: true });
    await addUnit(pr.id, { name: "First Squad", datasheetName: "Line Infantry", pointsCost: 75, modelCount: 10, isCharacter: false });
    const withUnits = await addUnit(pr.id, { name: "Doomed", datasheetName: "Scout Team", pointsCost: 30, modelCount: 3, isCharacter: false });
    await attachRosterToCrusade(ID, pr.id);
    c = await live();
    let mine = c.attachedRosters.find((r) => r.id === pr.id)!;
    expect(mine.units.map((u) => u.name)).toEqual(["Commander Zahn", "First Squad", "Doomed"]);

    // remove a unit → tombstoned in the sheet, gone from the roster
    const doomed = withUnits.units.find((u) => u.name === "Doomed")!;
    await removeUnit(pr.id, doomed.id);
    await pushMirrors(pr.id);
    c = await live();
    mine = c.attachedRosters.find((r) => r.id === pr.id)!;
    expect(mine.units.map((u) => u.name)).toEqual(["Commander Zahn", "First Squad"]);

    // ── GM attaches their own roster ────────────────────────────
    await actAs(gm, { freshDevice: true });
    await openCrusadeFromLink(ID);
    const gr = await createRoster({ name: "Blue Force", factionName: "Blue Force" }, gm.user);
    const gru = await addUnit(gr.id, { name: "Squad Tiber", datasheetName: "Heavy Team", pointsCost: 70, modelCount: 5, isCharacter: false });
    await attachRosterToCrusade(ID, gr.id);
    c = await live();
    expect(c.attachedRosters).toHaveLength(2);

    // ── Player records a battle ─────────────────────────────────
    await actAs(player, { freshDevice: true });
    await openCrusadeFromLink(ID);
    const { battle } = await createBattle(ID, player.user.googleId, {
      missionName: "Hold the Bridge",
      date: "2026-11-18",
      pointsLevel: 1000,
      battleSize: "Incursion",
      participantGoogleIds: [player.user.googleId, gm.user.googleId],
    });
    c = await live();
    expect(c.battles).toHaveLength(1);
    expect(c.battles[0].status).toBe("draft");
    expect(c.battles[0].participants.map((p) => p.googleId)).toEqual([player.user.googleId, gm.user.googleId]);

    const leader = mine.units.find((u) => u.name === "Commander Zahn")!;
    await updateBattleParticipant(ID, battle.id, player.user.googleId, {
      unitsFielded: [
        { unitId: leader.id, unitName: leader.name, enemiesDestroyed: 3, survived: true, markedForGreatness: true, bonusXp: 0 },
      ],
    });
    // …but not the GM's side of it
    await expect(
      updateBattleParticipant(ID, battle.id, gm.user.googleId, { notes: "hax" }),
    ).rejects.toThrow(/locked to someone else/);

    // No result yet → nothing can be applied.
    await expect(
      applyBattleResults(ID, battle.id, player.user.googleId),
    ).rejects.toThrow(/confirmed by every player/);

    // The creator (player) declares who won and the points.
    const declared = [
      { googleId: player.user.googleId, outcome: "victory" as const, victoryPoints: 70 },
      { googleId: gm.user.googleId, outcome: "defeat" as const, victoryPoints: 40 },
    ];
    c = await declareBattleResult(ID, battle.id, declared);
    expect(c.battles[0].status).toBe("pending");
    await expect(
      applyBattleResults(ID, battle.id, player.user.googleId),
    ).rejects.toThrow(/confirmed by every player/);

    // ── GM: can't be confirmed for by someone else; confirms themself ─
    await expect(
      confirmBattleResult(ID, battle.id, gm.user.googleId),
    ).rejects.toThrow(/locked to someone else/);
    await actAs(gm, { freshDevice: true });
    await openCrusadeFromLink(ID);
    c = await confirmBattleResult(ID, battle.id, gm.user.googleId);
    expect(c.battles[0].status).toBe("verified");
    c = await live();
    expect(c.battles[0].status).toBe("verified");
    expect(c.battles[0].participants.map((p) => [p.outcome, p.victoryPoints, p.confirmed])).toEqual([
      ["victory", 70, true],
      ["defeat", 40, true],
    ]);

    // The creator changes the points → the GM's confirmation lapses.
    await actAs(player, { freshDevice: true });
    await openCrusadeFromLink(ID);
    declared[0].victoryPoints = 75;
    c = await declareBattleResult(ID, battle.id, declared);
    expect(c.battles[0].status).toBe("pending");
    expect((await live()).battles[0].participants[1].confirmed).toBe(false);
    await actAs(gm, { freshDevice: true });
    await openCrusadeFromLink(ID);
    // a non-creator can't change the result (the GM, as owner, could,
    // so check with the roles the other way round is covered above)
    c = await confirmBattleResult(ID, battle.id, gm.user.googleId);
    expect(c.battles[0].status).toBe("verified");

    // ── Each player applies XP to their own roster ──────────────
    await updateBattleParticipant(ID, battle.id, gm.user.googleId, {
      unitsFielded: [
        { unitId: gru.units[0].id, unitName: "Squad Tiber", enemiesDestroyed: 0, survived: false, markedForGreatness: false, bonusXp: 0 },
      ],
    });
    await applyBattleResults(ID, battle.id, gm.user.googleId);
    expect(await applyBattleResults(ID, battle.id, gm.user.googleId)).toEqual([]); // idempotent
    await pushMirrors(gr.id);

    await actAs(player, { freshDevice: true });
    await openCrusadeFromLink(ID);
    const applied = await applyBattleResults(ID, battle.id, player.user.googleId);
    expect(applied[0].xpAwarded).toBe(1 + 1 + 3);
    await pushMirrors(pr.id);
    c = await live();
    expect(c.battles[0].status).toBe("verified");
    mine = c.attachedRosters.find((r) => r.id === pr.id)!;
    expect(mine.units.find((u) => u.id === leader.id)!.experiencePoints).toBe(5);
    expect(mine.requisitionPoints).toBe(1);

    // A roster belongs to one crusade.
    const stray = await createRoster({ name: "Second", factionName: "Second" }, player.user);
    await expect(attachRosterToCrusade(ID, stray.id)).rejects.toThrow(/already have a roster/);

    await actAs(gm, { freshDevice: true });
    await openCrusadeFromLink(ID);

    // ── Status overrides: GM voids, creator restores ────────────
    await setBattleStatus(ID, battle.id, "voided");
    expect((await live()).battles[0].status).toBe("voided");
    await actAs(player, { freshDevice: true });
    await openCrusadeFromLink(ID);
    expect((await live()).battles[0].status).toBe("voided");
    await setBattleStatus(ID, battle.id, "draft");
    expect((await live()).battles[0].status).toBe("verified"); // lifecycle resumes

    // ── A new device rebuilds the player's roster from the sheet ─
    await db.rosters.clear();
    const restored = await restoreMyRosters();
    expect(restored.map((r) => r.id)).toEqual([pr.id]);
    expect(restored[0].units).toHaveLength(2);
    expect(restored[0].attachedTo.map((a) => a.crusadeId)).toEqual([ID]);

    // ── GM: assignment, overview, removal ───────────────────────
    await actAs(gm, { freshDevice: true });
    await openCrusadeFromLink(ID);
    c = await assignBlessingOrBurden(ID, gm.user.googleId, {
      playerId: player.user.googleId, rosterId: pr.id, unitId: leader.id,
      type: "blessing", name: "Favoured", description: "Re-roll one hit.",
    });
    expect(c.gmAssignments).toHaveLength(1);

    // ── The view pages a person sees in Google Sheets ───────────
    await rebuildViews(c);
    const [front] = await readRanges(ID, ["Crusade!B1:L40"]);
    console.log("FRONT\n" + front.map((r) => r.join(" | ")).join("\n"));
    expect(front[1][0]).toBe("Fixture Crusade");
    const standing = (commander: string) => front.find((r) => r[1] === commander)!;
    // force name (linked), commander, team, units, supply, xp, cp, battles, W, D, L
    expect(standing("Test Player")).toEqual(["Red Force", "Test Player", "", 2, 175, 5, expect.any(Number), 1, 1, 0, 0]);
    expect(String(front[3][0])).toMatch(/Open this crusade in OpenCrusade/);
    expect(standing(`${gm.user.displayName}  (GM)`).slice(7)).toEqual([1, 0, 0, 1]);
    const logHeader = front.findIndex((r) => r[0] === "BATTLE");
    expect(front[logHeader + 1].slice(0, 2)).toEqual(["Hold the Bridge", "2026-11-18"]);

    const [page] = await readRanges(ID, ["'Test Player'!B1:J40"]);
    console.log("ROSTER PAGE\n" + page.map((r) => r.join(" | ")).join("\n"));
    expect(page[1][0]).toBe("Red Force");
    expect(page[6].filter((v) => v !== "")).toEqual([1, 1, "175 / 1000", 1, 2, 5]);
    const oob = page.findIndex((r) => r[0] === "UNIT");
    expect(page[oob + 1].slice(0, 5)).toEqual(["Commander Zahn", "Commander", 100, 5, "Battle-ready"]);
    expect(page[oob + 2][0]).toBe("First Squad");

    c = await removePlayer(ID, player.user.googleId);
    const after = await getSpreadsheetInfo(ID);
    expect(after.tabs.map((t) => t.title)).not.toContain("Test Player"); // roster page gone
    expect(c.players.find((p) => p.user.email === player.user.email)!.status).toBe("Removed");
    expect(c.attachedRosters.map((r) => r.id)).toEqual([gr.id]);

    // removed player's tab is now locked against them, and they can't rejoin
    await actAs(player, { freshDevice: true });
    await openCrusadeFromLink(ID);
    await expect(joinCrusade(ID, player.user, "Back again")).rejects.toThrow(/removed you/);
    await expect(attachRosterToCrusade(ID, pr.id)).rejects.toThrow(/locked to someone else/);
  }, 600_000);
});
