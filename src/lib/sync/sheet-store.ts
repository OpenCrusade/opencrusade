/**
 * Reads and writes a crusade spreadsheet. The only module that turns
 * domain operations into Sheets API calls; `sheet-codec.ts` holds the
 * (pure) row format.
 */

import { ACCESS_MODE } from "@/lib/google/scopes";
import {
  a1,
  appendRows,
  batchUpdate,
  createSpreadsheet,
  getSpreadsheetInfo,
  dataTabStyleRequests,
  lockTabRequest,
  readRanges,
  setLockEditorsRequest,
  SheetsError,
  updateRowRequest,
  type SpreadsheetInfo,
} from "@/lib/google/sheets";
import { putCrusade } from "@/lib/db/crusades";
import {
  crusadePlayerSchema,
  crusadeSchema,
  crusadeTrackerSetSchema,
  gmAssignmentSchema,
  inlineBattleSchema,
} from "@/lib/schemas/crusade";
import { attachedRosterSchema, crusadeCardSchema } from "@/lib/schemas/roster";
import { useAppStore } from "@/stores/app-store";
import type { Crusade, GoogleUser } from "@/types";
import {
  assemble,
  assembleFromRecs,
  DATA_COL,
  diff,
  disassemble,
  GM_TAB_ID,
  GM_TAB_TITLE,
  HEADER_ROW,
  isDataTab,
  OVERVIEW_TAB_ID,
  parseTab,
  type Snapshot,
  SHEET_FORMAT,
} from "./sheet-codec";
import {
  activePlayers,
  FRONT_TITLE,
  frontPageRequests,
  rosterPageRequests,
  viewTabId,
  type ViewContext,
} from "./sheet-view";

/** Thrown when the spreadsheet isn't an OpenCrusade crusade. */
export class NotACrusadeError extends Error {
  constructor() {
    super(
      "That spreadsheet isn't an OpenCrusade crusade. Check the link " +
        "with your GM. It should be the crusade's own Google Sheet.",
    );
    this.name = "NotACrusadeError";
  }
}

/**
 * Google wouldn't open the spreadsheet for this account. Either it
 * isn't shared with them, or (in "file" access mode) they haven't yet
 * chosen it in Google's file chooser.
 */
export class NoAccessError extends Error {
  constructor(cause: unknown) {
    super(
      ACCESS_MODE === "file"
        ? "This app can't open that sheet yet. Choose it from Google " +
            "Drive once and it will open from then on. If it isn't " +
            "listed there, ask the GM to share it with the Google " +
            "account you're signed in with (as Editor)."
        : "You don't have access to this crusade's Google Sheet. Ask the " +
            "GM to share it with the Google account you're signed in with " +
            "(as Editor).",
      { cause },
    );
    this.name = "NoAccessError";
  }
}

/** Rewrite low-level failures into something a player can act on. */
function friendly(err: unknown): unknown {
  if (!(err instanceof SheetsError)) return err;
  if (err.protectedCell) {
    return new Error(
      "Google Sheets refused that change: it touches a tab that is " +
        "locked to someone else. You can edit your own tab; the GM " +
        "controls the rest.",
      { cause: err },
    );
  }
  if (err.missingScope) {
    return new Error(
      "This app hasn't been given permission to use Google Sheets. " +
        "Sign out and back in, and tick the Google Sheets checkbox on " +
        "Google's permission screen.",
      { cause: err },
    );
  }
  if (err.notShared) return new NoAccessError(err);
  return err;
}

// ─── Tab title cache ───────────────────────────────────────────────
// Reads address tabs by title, so we need id → title. Titles only
// change when someone renames a tab by hand, so cache and refresh on
// demand instead of spending a request on every poll.

const tabTitles = new Map<string, Map<number, string>>();
const tabTitlesAt = new Map<string, number>();

/**
 * Players add their own tab when they join, so the tab list can grow
 * without this client being told. Re-list at most this often, or at
 * once when someone presses Refresh; a new player shows up for
 * everyone else within a few minutes.
 */
const TITLES_TTL_MS = 5 * 60_000;

function remember(info: SpreadsheetInfo): Map<number, string> {
  const m = new Map(info.tabs.map((t) => [t.sheetId, t.title]));
  tabTitles.set(info.spreadsheetId, m);
  tabTitlesAt.set(info.spreadsheetId, Date.now());
  return m;
}

async function titlesFor(
  spreadsheetId: string,
  fresh = false,
): Promise<Map<number, string>> {
  const cached = tabTitles.get(spreadsheetId);
  const age = Date.now() - (tabTitlesAt.get(spreadsheetId) ?? 0);
  if (cached && !fresh && age < TITLES_TTL_MS) return cached;
  return remember(await getSpreadsheetInfo(spreadsheetId));
}

/** Ids of the tabs this client last saw in the spreadsheet. */
export function knownTabIds(spreadsheetId: string): Set<number> {
  return new Set(tabTitles.get(spreadsheetId)?.keys() ?? []);
}

// ─── Read ──────────────────────────────────────────────────────────

/** One GM tab plus a tab per player (50 at most), with headroom. */
const MAX_DATA_TABS = 80;
const MAX_ROWS_PER_TAB = 20000;

async function readOnce(
  spreadsheetId: string,
  titles: Map<number, string>,
): Promise<Snapshot> {
  // Bounded on purpose: any editor of the sheet can add tabs and rows,
  // and an unbounded read would let one of them stall everyone's app.
  let ids = [...titles.keys()].filter(isDataTab).sort((a, b) => a - b);
  if (ids.length > MAX_DATA_TABS) {
    // More tabs than any real crusade has: someone has been adding
    // them. Read the GM's tab and the tabs it has admitted before any
    // others, so extra tabs can't push real players out of the read.
    const first = new Set<number>([GM_TAB_ID]);
    if (titles.has(GM_TAB_ID)) {
      const [gmRows] = await readRanges(spreadsheetId, [
        a1(titles.get(GM_TAB_ID)!, `1:${MAX_ROWS_PER_TAB}`),
      ]);
      for (const rec of parseTab(GM_TAB_ID, gmRows).recs.values()) {
        const tabId = (rec.data as { tabId?: unknown } | null | undefined)?.tabId;
        if (typeof tabId === "number") first.add(tabId);
      }
    }
    ids = [...ids.filter((id) => first.has(id)), ...ids.filter((id) => !first.has(id))];
  }
  ids = ids.slice(0, MAX_DATA_TABS);
  const data = await readRanges(
    spreadsheetId,
    ids.map((id) => a1(titles.get(id)!, `1:${MAX_ROWS_PER_TAB}`)),
  );
  const tabs = new Map(ids.map((id, i) => [id, parseTab(id, data[i])]));
  return { spreadsheetId, tabs };
}

/** Read every data tab. One request in the steady state. */
export async function readSnapshot(spreadsheetId: string): Promise<Snapshot> {
  try {
    let titles = await titlesFor(spreadsheetId);
    let snap: Snapshot;
    try {
      snap = await readOnce(spreadsheetId, titles);
    } catch (err) {
      // 400 = a cached title no longer parses (tab renamed or deleted).
      if (!(err instanceof SheetsError) || err.status !== 400) throw err;
      titles = await titlesFor(spreadsheetId, true);
      snap = await readOnce(spreadsheetId, titles);
    }
    return snap;
  } catch (err) {
    throw friendly(err);
  }
}

/** Read + assemble + validate. Throws NotACrusadeError if it isn't one. */
export async function readCrusade(
  spreadsheetId: string,
): Promise<{ crusade: Crusade; snap: Snapshot }> {
  const snap = await readSnapshot(spreadsheetId);
  const raw = assemble(snap);
  if (!raw) throw new NotACrusadeError();
  if ((raw.formatVersion ?? 1) > SHEET_FORMAT) {
    throw new Error(
      "This campaign was saved by a newer version of OpenCrusade. " +
        "Reload the page to update, then open it again.",
    );
  }
  const parsed = crusadeSchema.safeParse(dropUnreadable(raw));
  if (!parsed.success) {
    console.warn("[readCrusade] the crusade's settings failed validation", parsed.error.issues.slice(0, 5));
    throw new Error(
      "This campaign's sheet holds settings this version of the app " +
        "can't read. Reload the page to get the latest version; if that " +
        "doesn't help, the GM's settings tab may have been edited by hand.",
    );
  }
  return { crusade: parsed.data, snap };
}

/**
 * Every player types their own rows, so one bad row must not stop the
 * whole campaign from loading. Records that fail their own check are
 * left out (they stay untouched in the sheet) and lists are held to
 * their limits; only the GM's settings can fail the read outright.
 */
function dropUnreadable(raw: Crusade): unknown {
  const keep = <T>(items: unknown, schema: { safeParse: (v: unknown) => { success: boolean } }, max: number, what: string): T[] => {
    if (!Array.isArray(items)) return [];
    const good = items.filter((i) => schema.safeParse(i).success) as T[];
    if (good.length !== items.length) {
      console.warn(`[readCrusade] ignored ${items.length - good.length} unreadable ${what}`);
    }
    return good.slice(0, max);
  };
  const rosters = (raw.attachedRosters ?? []).map((r) => ({
    ...r,
    units: keep(r.units, crusadeCardSchema, 200, "unit(s)"),
  }));
  return {
    ...raw,
    players: keep(raw.players, crusadePlayerSchema, 50, "player(s)"),
    attachedRosters: keep(rosters, attachedRosterSchema, 50, "force(s)"),
    battles: keep(raw.battles, inlineBattleSchema, 500, "battle(s)"),
    gmAssignments: keep(raw.gmAssignments, gmAssignmentSchema, 500, "assignment(s)"),
    trackerSets: keep(raw.trackerSets, crusadeTrackerSetSchema, 40, "tracker set(s)"),
  };
}

// ─── Write ─────────────────────────────────────────────────────────

function actor(): GoogleUser | null {
  return useAppStore.getState().user;
}

/** One mutation at a time per spreadsheet from this client. */
const queues = new Map<string, Promise<unknown>>();

function serialized<T>(spreadsheetId: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(spreadsheetId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(
    spreadsheetId,
    next.catch(() => undefined),
  );
  return next;
}

/**
 * Read the live crusade, apply `mutate`, write back only the rows that
 * changed, and persist the result locally.
 *
 * There is no compare-and-swap in Sheets. Safety comes from the
 * layout: `mutate` is applied to state read moments ago, and the rows
 * it changes live in tabs only this user (or the GM) can write. A
 * change that would touch someone else's tab is refused by Google and
 * nothing is written.
 *
 * `mutate` must be a pure function of the live state. Returning its
 * input unchanged (same reference) skips the write.
 */
export function mutateCrusade(
  crusadeId: string,
  mutate: (live: Crusade) => Crusade,
): Promise<Crusade> {
  return serialized(crusadeId, async () => {
    const { crusade: live, snap } = await readCrusade(crusadeId);
    const mutated = mutate(live);
    if (mutated === live) {
      await putCrusade(live, { fromRemote: true });
      return live;
    }
    const next = crusadeSchema.parse(mutated);

    const now = new Date().toISOString();
    const me = actor();
    const after = disassemble(
      next,
      snap,
      now,
      me
        ? {
            actorGoogleId: me.googleId,
            prev: new Map(live.battles.map((b) => [b.id, b.status])),
          }
        : undefined,
    );
    const writes = diff(disassemble(live, snap, now), after, snap, now);
    // What the sheet will hold once written: derived fields (battle
    // status, confirmations) recomputed rather than trusted from `next`.
    const result = crusadeSchema.parse(assembleFromRecs(crusadeId, after) ?? next);

    try {
      // In-place updates first, as ONE atomic request: if any of them
      // hits a locked tab, nothing at all is written.
      const updates = writes.flatMap((w) =>
        w.updates.map((u) =>
          updateRowRequest(w.tabId, u.rowIndex, u.cells, u.width),
        ),
      );
      if (updates.length) await batchUpdate(crusadeId, updates);

      const titles = await titlesFor(crusadeId);
      for (const w of writes) {
        if (!w.appends.length) continue;
        const title = titles.get(w.tabId);
        if (!title) throw new Error(`Tab ${w.tabId} is missing from the sheet.`);
        await appendRows(crusadeId, a1(title, "A:A"), w.appends);
      }
    } catch (err) {
      throw friendly(err);
    }

    await putCrusade(result, { fromRemote: true });
    return result;
  });
}

/**
 * First write into a freshly created sheet. There is no config row to
 * read yet, so this skips the read and appends everything.
 */
export async function writeNewCrusade(crusade: Crusade): Promise<void> {
  const now = new Date().toISOString();
  const empty: Snapshot = { spreadsheetId: crusade.id, tabs: new Map() };
  const writes = diff(new Map(), disassemble(crusade, empty, now), empty, now);
  try {
    const titles = await titlesFor(crusade.id);
    for (const w of writes) {
      const title = titles.get(w.tabId);
      if (!title) throw new Error(`Tab ${w.tabId} is missing from the sheet.`);
      await appendRows(crusade.id, a1(title, "A:A"), w.appends);
    }
  } catch (err) {
    throw friendly(err);
  }
}

// ─── Structure: create, tabs, locks, overview ──────────────────────

function newTabId(): number {
  // Sheet ids are non-negative int32. Data tabs get an EVEN id ≥ 1000;
  // the odd id after it is reserved for that player's roster page.
  return 1000 + 2 * Math.floor(Math.random() * 1_000_000_000);
}

const dataTitle = (name: string) => `data · ${name}`;

function uniqueTitle(wanted: string, taken: Iterable<string>): string {
  const clean = wanted.replace(/[[\]*?:/\\]/g, " ").trim().slice(0, 80) || "Player";
  const lower = new Set([...taken].map((t) => t.toLowerCase()));
  if (!lower.has(clean.toLowerCase())) return clean;
  for (let n = 2; ; n++) {
    const candidate = `${clean} (${n})`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Create the spreadsheet for a new crusade: Overview, Crusade and the
 * GM's own player tab, each locked to the GM. Returns the ids the
 * caller needs to write the first rows.
 */
export async function createCrusadeSheet(
  name: string,
  gm: GoogleUser,
): Promise<{ spreadsheetId: string; gmPlayerTabId: number }> {
  try {
    const gmPlayerTabId = newTabId();
    const info = await createSpreadsheet(`OpenCrusade - ${name}`, [
      // Placeholder; the real front page replaces it (rebuildViews).
      { sheetId: OVERVIEW_TAB_ID, title: FRONT_TITLE },
      { sheetId: GM_TAB_ID, title: GM_TAB_TITLE, hidden: true },
      {
        sheetId: gmPlayerTabId,
        title: uniqueTitle(dataTitle(gm.displayName), [FRONT_TITLE, GM_TAB_TITLE]),
        hidden: true,
      },
    ]);
    remember(info);
    await setUpCrusadeTabs(info.spreadsheetId, gm, gmPlayerTabId);
    return { spreadsheetId: info.spreadsheetId, gmPlayerTabId };
  } catch (err) {
    throw friendly(err);
  }
}

/**
 * Turn an existing spreadsheet the GM owns into a crusade: add the
 * Overview, Crusade and GM tabs alongside whatever is already there.
 * Lets a GM share a blank sheet with their group first and then start
 * the crusade in it. Refuses a sheet that already holds a crusade.
 */
export async function adoptCrusadeSheet(
  spreadsheetId: string,
  gm: GoogleUser,
): Promise<{ spreadsheetId: string; gmPlayerTabId: number }> {
  try {
    const info = await getSpreadsheetInfo(spreadsheetId);
    const ids = new Set(info.tabs.map((t) => t.sheetId));
    if (ids.has(GM_TAB_ID)) {
      throw new Error(
        "That spreadsheet already holds a crusade. Use Open a crusade " +
          "instead, or pick a blank spreadsheet.",
      );
    }
    const taken = info.tabs.map((t) => t.title);
    const gmPlayerTabId = newTabId();
    const crusade = uniqueTitle(GM_TAB_TITLE, taken);
    await batchUpdate(spreadsheetId, [
      { addSheet: { properties: { sheetId: GM_TAB_ID, title: crusade, hidden: true } } },
      {
        addSheet: {
          properties: {
            sheetId: gmPlayerTabId,
            title: uniqueTitle(dataTitle(gm.displayName), [...taken, crusade]),
            hidden: true,
          },
        },
      },
    ]);
    tabTitles.delete(spreadsheetId);
    await setUpCrusadeTabs(spreadsheetId, gm, gmPlayerTabId);
    return { spreadsheetId, gmPlayerTabId };
  } catch (err) {
    throw friendly(err);
  }
}

/**
 * Lock and format the two starting data tabs of a crusade sheet. The
 * tabs must already exist with ids GM_TAB_ID and `gmPlayerTabId`.
 */
export async function setUpCrusadeTabs(
  spreadsheetId: string,
  gm: GoogleUser,
  gmPlayerTabId: number,
): Promise<void> {
  await batchUpdate(spreadsheetId, [
    lockTabRequest(GM_TAB_ID, [gm.email], "Crusade settings, GM only"),
    lockTabRequest(gmPlayerTabId, [gm.email], `${gm.email}: their tab`),
    updateRowRequest(GM_TAB_ID, 0, HEADER_ROW),
    updateRowRequest(gmPlayerTabId, 0, HEADER_ROW),
    ...dataTabStyleRequests(GM_TAB_ID, DATA_COL),
    ...dataTabStyleRequests(gmPlayerTabId, DATA_COL),
  ]);
}

/** Re-list every sheet's tabs on the next read (the Refresh button). */
export function forgetAllTabTitles(): void {
  tabTitlesAt.clear();
}

/** Drop the cached tab titles for a spreadsheet (tests, manual resets). */
export function forgetTabTitles(spreadsheetId: string): void {
  tabTitles.delete(spreadsheetId);
}

/**
 * Add a data tab for a player, locked to them and the GM. Returns its
 * id. Run by the PLAYER when they join (any editor of the spreadsheet
 * can add and lock a tab); the GM, as owner, can always edit it too.
 */
export async function addPlayerTab(
  spreadsheetId: string,
  gmEmail: string,
  playerEmail: string,
  displayName: string,
): Promise<number> {
  try {
    const titles = await titlesFor(spreadsheetId, true);
    const tabId = newTabId();
    const title = uniqueTitle(dataTitle(displayName), titles.values());
    await batchUpdate(spreadsheetId, [
      { addSheet: { properties: { sheetId: tabId, title, hidden: true } } },
      lockTabRequest(tabId, [gmEmail, playerEmail], `${playerEmail}: their tab`),
      updateRowRequest(tabId, 0, HEADER_ROW),
      ...dataTabStyleRequests(tabId, DATA_COL),
    ]);
    titles.set(tabId, title);
    tabTitlesAt.set(spreadsheetId, 0); // re-list on the next read
    return tabId;
  } catch (err) {
    if (err instanceof SheetsError && err.status === 400 && /editor|user|email/i.test(err.detail)) {
      throw new Error(
        `Google wouldn't lock a tab to ${playerEmail}. Check it's the ` +
          "address of a Google account.",
        { cause: err },
      );
    }
    throw friendly(err);
  }
}

/** Restrict a player's tab to the GM only (used when removing them). */
export async function lockTabToGmOnly(
  spreadsheetId: string,
  tabId: number,
  gmEmail: string,
): Promise<void> {
  const info = await getSpreadsheetInfo(spreadsheetId);
  remember(info);
  const tab = info.tabs.find((t) => t.sheetId === tabId);
  const requests = (tab?.protectedRanges ?? []).map((p) =>
    setLockEditorsRequest(p.protectedRangeId, [gmEmail]),
  );
  if (requests.length) await batchUpdate(spreadsheetId, requests);
}

/**
 * Rebuild the pages people see in Google Sheets: the "Crusade" front
 * page and one roster page per active player (see sheet-view.ts).
 * GM only, the pages are locked to them. `frontOnly` skips the roster
 * pages, which only change when players are added or removed.
 *
 * The pages are formulas over the data tabs, so they stay live between
 * rebuilds. Purely presentational: never fails the caller.
 */
export async function rebuildViews(
  crusade: Crusade,
  opts: { frontOnly?: boolean } = {},
): Promise<void> {
  try {
    const me = actor();
    if (!me) return;
    const info = await getSpreadsheetInfo(crusade.id);
    const titles = remember(info);
    const ctx: ViewContext = {
      crusade,
      titles,
      appUrl: appCrusadeUrl(crusade.id),
      gmEmail: me.email,
      existing: new Set(info.tabs.map((t) => t.sheetId)),
    };
    const players = activePlayers(ctx);
    const requests: Record<string, unknown>[] = [];

    if (!opts.frontOnly) {
      // Roster pages first: the spreadsheet must always keep one
      // visible tab, and the front page is deleted + recreated last.
      const viewIds = new Set(players.map((p) => viewTabId(p.tabId)));
      const taken = info.tabs
        .filter((t) => !viewIds.has(t.sheetId) && t.sheetId !== OVERVIEW_TAB_ID)
        .map((t) => t.title);
      taken.push(FRONT_TITLE);
      players.forEach((p, i) => {
        const title = uniqueTitle(p.user.displayName, taken);
        taken.push(title);
        requests.push(...rosterPageRequests(ctx, p, title, i + 1));
      });
      // Roster pages of players who have been removed.
      for (const t of info.tabs) {
        const isView = t.sheetId >= 1000 && t.sheetId % 2 === 1;
        if (isView && !viewIds.has(t.sheetId)) {
          requests.push({ deleteSheet: { sheetId: t.sheetId } });
        }
      }
    }
    requests.push(...frontPageRequests(ctx));
    await batchUpdate(crusade.id, requests);
    tabTitlesAt.set(crusade.id, 0);
  } catch (err) {
    console.warn("[rebuildViews] failed:", friendly(err));
  }
}

/**
 * Link that opens a crusade in this app. Anyone the sheet is shared
 * with can use it; it's the link a GM sends their players.
 */
export function appCrusadeUrl(crusadeId: string): string | undefined {
  if (typeof window === "undefined" || !window.location?.origin) return undefined;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  return `${window.location.origin}${base}/crusades/${crusadeId}`;
}

/** Link to open the spreadsheet in Google Sheets. */
export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
