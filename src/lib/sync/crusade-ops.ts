/**
 * Domain operations on crusades. Each crusade is one Google
 * spreadsheet (see sheet-codec.ts for the layout); these wrap the
 * sheet store + Dexie so React hooks don't have to compose them.
 *
 * The crusade id IS the spreadsheet id.
 */

import { uuid } from "@/lib/utils/id";
import { getSpreadsheetInfo, parseSpreadsheetId, SheetsError } from "@/lib/google/sheets";
import { getCrusade, putCrusade, removeCrusade } from "@/lib/db/crusades";
import { crusadeSchema } from "@/lib/schemas/crusade";
import { useAppStore } from "@/stores/app-store";
import { useSyncStatus } from "@/stores/sync-status";
import { userMessage } from "@/lib/utils/user-message";
import { SHEET_FORMAT } from "./sheet-codec";
import type {
  Crusade,
  CrusadePlayer,
  CrusadeSettings,
  GoogleUser,
  PackContent,
  PackState,
  PlayerGroup,
} from "@/types";
import {
  addPlayerTab,
  adoptCrusadeSheet,
  createCrusadeSheet,
  knownTabIds,
  lockTabToGmOnly,
  mutateCrusade,
  readCrusade,
  rebuildViews,
  writeNewCrusade,
} from "./sheet-store";
import { adoptNewerMirrors, undoVoidedBattles } from "./roster-ops";
import { viewTabId } from "./sheet-view";

export { mutateCrusade };

function signedInEmail(): string {
  const email = useAppStore.getState().user?.email;
  if (!email) throw new Error("Not signed in");
  return email;
}

// ─── Create ────────────────────────────────────────────────────────

export interface CreateCrusadeInput {
  name: string;
  /** How the GM is shown to players. Defaults to their account's name. */
  gmName?: string;
  packId: string;
  supplyLimit: number;
  startingRP: number;
  settings?: Partial<CrusadeSettings>;
  /**
   * Optional link (or id) of an existing spreadsheet the GM owns to
   * hold the crusade, instead of creating a new one.
   */
  existingSheet?: string;
}

/**
 * Create a crusade: a new spreadsheet in the creator's Google account
 * (or an existing blank one they point at) with the Overview, Crusade
 * and GM tabs, then the first rows.
 *
 * If writing the first rows fails after the spreadsheet was created,
 * an empty "OpenCrusade - {name}" sheet is left behind in the GM's Google
 * Drive; the error is surfaced and they can delete it by hand (this
 * app has no permission to delete files).
 */
export async function createCrusade(
  input: CreateCrusadeInput,
  account: GoogleUser,
): Promise<Crusade> {
  const creator: GoogleUser = {
    ...account,
    displayName: input.gmName?.trim() || account.displayName,
  };
  const now = new Date().toISOString();
  const draft = (id: string, tabId: number): Crusade => ({
    id,
    formatVersion: SHEET_FORMAT,
    name: input.name,
    packId: input.packId,
    createdAt: now,
    createdBy: creator,
    supplyLimit: input.supplyLimit,
    startingRP: input.startingRP,
    players: [
      {
        user: creator,
        factionName: "",
        joinedAt: now,
        role: "gm",
        status: "Active",
        tabId,
        registered: true,
      },
    ],
    settings: {
      allowPlayerBattleCreation:
        input.settings?.allowPlayerBattleCreation ?? true,
    },
    attachedRosters: [],
    gmAssignments: [],
    battles: [],
    packContent: { agendas: [], missions: [], relics: [] },
    packState: { counters: [], items: [], note: "" },
    trackerSets: [],
    phases: [],
  });

  // Validate before creating anything in Google.
  crusadeSchema.parse(draft("pending", 0));

  let target: { spreadsheetId: string; gmPlayerTabId: number };
  if (input.existingSheet?.trim()) {
    const id = parseSpreadsheetId(input.existingSheet);
    if (!id) {
      throw new Error(
        "The existing sheet doesn't look like a Google Sheets link.",
      );
    }
    target = await adoptCrusadeSheet(id, creator);
  } else {
    target = await createCrusadeSheet(input.name, creator);
  }
  const { spreadsheetId, gmPlayerTabId } = target;
  const payload = crusadeSchema.parse(draft(spreadsheetId, gmPlayerTabId));
  const written = await writeInitial(payload);
  await rebuildViews(written);
  return written;
}

/** First write into a brand-new sheet (there is no config row yet). */
async function writeInitial(payload: Crusade): Promise<Crusade> {
  await writeNewCrusade(payload);
  await putCrusade(payload, { fromRemote: true });
  return payload;
}

// ─── Open / refresh ────────────────────────────────────────────────

/**
 * Open a crusade from the link (or bare id) the GM sent. Works for
 * any sheet the signed-in account has been shared on, no file picker.
 */
/** The spreadsheet id in a crusade link, a Google Sheets link or a bare id. */
export function crusadeIdFromLink(input: string): string | null {
  // Accept this app's own crusade link too (…/crusades/<id>).
  const fromApp = input.trim().match(/\/crusades\/([a-zA-Z0-9_-]{20,})/);
  return fromApp ? fromApp[1] : parseSpreadsheetId(input);
}

export async function openCrusadeFromLink(input: string): Promise<Crusade> {
  const id = crusadeIdFromLink(input);
  if (!id) {
    throw new Error(
      "That doesn't look like a crusade link. Paste the link your GM " +
        "sent you: either this app's crusade link or the Google Sheets link.",
    );
  }
  const { crusade } = await readCrusade(id);
  await putCrusade(crusade, { fromRemote: true });
  await adoptNewerMirrors(crusade);
  return crusade;
}

/**
 * Background refresh: re-read the sheet and update Dexie. Never
 * throws, the UI is already showing the local copy. If the sheet is
 * no longer shared with this account, the local copy is kept (it may
 * just be a temporary un-share) and the failure is logged.
 */
export function revalidateCrusade(crusadeId: string): Promise<void> {
  // Several parts of a page ask for the same crusade at once, and every
  // save asks again. Google allows about 60 reads a minute per person,
  // so share one read between callers and don't repeat one that has
  // only just finished.
  const state = revalidations.get(crusadeId);
  if (state?.running) return state.running;
  if (state && Date.now() - state.finishedAt < REVALIDATE_GAP_MS) return Promise.resolve();

  const running = (async () => {
    try {
      const { crusade } = await readCrusade(crusadeId);
      await putCrusade(crusade, { fromRemote: true });
      await adoptNewerMirrors(crusade);
      undoVoidedBattles(crusade);
      void admitNewPlayers(crusade);
      void syncViewPages(crusade);
      useSyncStatus.getState().setReadProblem(crusadeId, null);
    } catch (err) {
      console.warn("[revalidateCrusade] failed", err);
      // A passing fault (offline, busy, session expired) has its own
      // notice and will clear by itself. Anything else means the page
      // is showing an old copy, and the reader should be told.
      const passing =
        err instanceof SheetsError &&
        (err.status === 0 || err.status === 401 || err.status === 429 || err.status >= 500);
      if (!passing) useSyncStatus.getState().setReadProblem(crusadeId, userMessage(err));
    } finally {
      revalidations.set(crusadeId, { finishedAt: Date.now() });
    }
  })();
  revalidations.set(crusadeId, { running, finishedAt: 0 });
  return running;
}

const REVALIDATE_GAP_MS = 8000;
const revalidations = new Map<string, { running?: Promise<void>; finishedAt: number }>();

/**
 * Players join by themselves, but the pages people see in Google
 * Sheets are locked to the GM. So whenever the GM's app sees that the
 * set of roster pages doesn't match the active players (someone
 * joined, or was removed), it redraws them.
 */
const viewSyncRunning = new Set<string>();

async function syncViewPages(crusade: Crusade): Promise<void> {
  const me = useAppStore.getState().user;
  if (!me || me.googleId !== crusade.createdBy.googleId) return;
  if (viewSyncRunning.has(crusade.id)) return;

  const tabs = knownTabIds(crusade.id);
  const wanted = new Set(
    crusade.players
      .filter((p) => p.status !== "Removed" && p.tabId !== undefined && tabs.has(p.tabId))
      .map((p) => viewTabId(p.tabId!)),
  );
  const present = [...tabs].filter((id) => id >= 1000 && id % 2 === 1);
  const inStep =
    present.length === wanted.size && present.every((id) => wanted.has(id));
  if (inStep) return;

  viewSyncRunning.add(crusade.id);
  try {
    await rebuildViews(crusade);
  } finally {
    viewSyncRunning.delete(crusade.id);
  }
}

// ─── Admitting players ─────────────────────────────────────────────

const admissionRefusedAt = new Map<string, number>();

/**
 * GM's app only. A player joins by adding their own tab, and until
 * the GM-locked tab records "this Google account owns that tab",
 * another editor of the sheet could add a tab claiming to be them.
 * So whenever the GM's app sees a player it hasn't admitted, it
 * checks Google's own lock on their tab (which a player can't fake
 * for someone else's address without locking themselves out) and
 * writes the record.
 */
async function admitNewPlayers(crusade: Crusade): Promise<void> {
  const me = useAppStore.getState().user;
  if (!me || me.googleId !== crusade.createdBy.googleId) return;
  const waiting = crusade.players.filter(
    (p) => !p.registered && p.tabId !== undefined,
  );
  if (waiting.length === 0) return;
  const key = (tabId: number) => `${crusade.id}:${tabId}`;
  const due = waiting.filter(
    (p) => Date.now() - (admissionRefusedAt.get(key(p.tabId!)) ?? 0) > 5 * 60_000,
  );
  if (due.length === 0) return;

  try {
    const info = await getSpreadsheetInfo(crusade.id);
    const gmEmail = crusade.createdBy.email.toLowerCase();
    const admit = new Set<string>();
    for (const p of due) {
      const email = p.user.email.toLowerCase();
      const locks =
        info.tabs.find((t) => t.sheetId === p.tabId)?.protectedRanges ?? [];
      const editors = locks.flatMap((l) =>
        (l.editors?.users ?? []).map((u) => u.toLowerCase()),
      );
      const isGmTab = p.user.googleId === crusade.createdBy.googleId;
      const ok =
        locks.length > 0 &&
        editors.every((e) => e === gmEmail || e === email) &&
        (isGmTab ? email === gmEmail : editors.includes(email));
      if (ok) admit.add(p.user.googleId);
      else {
        admissionRefusedAt.set(key(p.tabId!), Date.now());
        console.warn(
          "[admitNewPlayers] a player's tab is not locked to them alone; not admitting it.",
        );
      }
    }
    if (admit.size === 0) return;
    await mutateCrusade(crusade.id, (live) => {
      if (!live.players.some((p) => admit.has(p.user.googleId) && !p.registered)) {
        return live;
      }
      return {
        ...live,
        players: live.players.map((p) =>
          admit.has(p.user.googleId) && !p.registered
            ? { ...p, registered: true }
            : p,
        ),
      };
    });
  } catch (err) {
    console.warn("[admitNewPlayers] failed", err);
  }
}

/** Forget a crusade on this device only. The sheet is untouched. */
export async function forgetCrusade(crusadeId: string): Promise<void> {
  await removeCrusade(crusadeId);
}

// ─── Players ───────────────────────────────────────────────────────

/**
 * Join a crusade. The GM's only step is sharing the spreadsheet (as
 * Editor) and sending the link; the player does the rest here:
 *   1. create their own data tab, locked to them + the GM
 *   2. write their profile row into it, that row is what makes them a
 *      player, so nothing has to be written to the GM's tab
 *
 * Their roster page and their line on the sheet's front page are
 * drawn by the GM's app the next time it is open (those pages are
 * locked to the GM).
 *
 * Idempotent: already a member → returns the crusade unchanged.
 */
export async function joinCrusade(
  crusadeId: string,
  user: GoogleUser,
  displayName: string,
): Promise<Crusade> {
  const { crusade } = await readCrusade(crusadeId);
  const existing = crusade.players.find((p) => p.user.googleId === user.googleId);
  if (existing && existing.user.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error(
      "Another tab in this crusade's sheet is using your Google account's ID " +
        "with a different email address. Ask the GM to check the sheet's tabs.",
    );
  }
  if (existing?.status === "Removed") {
    throw new Error(
      "The GM has removed you from this crusade. Ask them if you think that's a mistake.",
    );
  }
  if (existing) {
    await putCrusade(crusade, { fromRemote: true });
    return crusade;
  }

  const name = displayName.trim() || user.email.split("@")[0];
  const tabId = await addPlayerTab(crusadeId, crusade.createdBy.email, user.email, name);
  const me: CrusadePlayer = {
    user: { ...user, displayName: name },
    factionName: "",
    joinedAt: new Date().toISOString(),
    role: "player",
    status: "Active",
    tabId,
  };
  return mutateCrusade(crusadeId, (live) =>
    live.players.some((p) => p.user.googleId === user.googleId)
      ? live
      : { ...live, players: [...live.players, me] },
  );
}

/**
 * Remove a player (GM only). Marks them Removed, drops their roster
 * from the crusade and locks their tab to the GM. Their tab (and its
 * battle history) stays in the sheet. The GM should also remove them
 * from the spreadsheet's sharing in Google Sheets, while they still
 * have edit access they could add a fresh tab by hand.
 */
export async function removePlayer(
  crusadeId: string,
  playerGoogleId: string,
): Promise<Crusade> {
  const crusade = await getCrusade(crusadeId);
  if (!crusade) throw new Error(`Crusade ${crusadeId} not found locally`);
  const player = crusade.players.find(
    (p) => p.user.googleId === playerGoogleId,
  );
  if (!player) throw new Error("Player not found in this crusade.");
  if (player.role === "gm") throw new Error("The GM can't be removed.");

  const updated = await mutateCrusade(crusadeId, (live) => ({
    ...live,
    players: live.players.map((p) =>
      p.user.googleId === playerGoogleId
        ? { ...p, status: "Removed" as const }
        : p,
    ),
    attachedRosters: (live.attachedRosters ?? []).filter(
      (a) => a.player.googleId !== playerGoogleId,
    ),
  }));

  if (player.tabId !== undefined) {
    try {
      await lockTabToGmOnly(crusadeId, player.tabId, signedInEmail());
    } catch (err) {
      console.warn("[removePlayer] couldn't re-lock the player's tab:", err);
    }
  }
  await rebuildViews(updated);
  return updated;
}

// ─── GM assignments ────────────────────────────────────────────────

export interface AssignBlessingInput {
  playerId: string;
  rosterId: string;
  unitId: string;
  type: "blessing" | "burden";
  name: string;
  description: string;
}

/**
 * GM proposes a blessing or burden. It is recorded on the GM's
 * Crusade tab; the player's app merges it into their roster the next
 * time they open it (so the GM never writes into a player's tab).
 */
export async function assignBlessingOrBurden(
  crusadeId: string,
  gmGoogleId: string,
  input: AssignBlessingInput,
): Promise<Crusade> {
  const assignment = {
    id: uuid(),
    playerId: input.playerId,
    rosterId: input.rosterId,
    unitId: input.unitId,
    type: input.type,
    name: input.name,
    description: input.description,
    source: "custom" as const,
    assignedBy: gmGoogleId,
    assignedAt: new Date().toISOString(),
  };
  return mutateCrusade(crusadeId, (live) => ({
    ...live,
    gmAssignments: [...(live.gmAssignments ?? []), assignment],
  }));
}

// ─── GM settings ───────────────────────────────────────────────────

export interface CrusadeConfigPatch {
  settings?: Partial<CrusadeSettings>;
  packContent?: PackContent;
  groups?: PlayerGroup[];
}

/**
 * Update GM-owned crusade config. Deleting a group also clears the
 * `groupId` of any player still pointing at it.
 */
export async function updateCrusadeConfig(
  crusadeId: string,
  patch: CrusadeConfigPatch,
): Promise<Crusade> {
  return refreshFront(mutateCrusade(crusadeId, (live) => {
    const groups = patch.groups ?? live.groups;
    const validGroupIds = new Set((groups ?? []).map((g) => g.id));
    return {
      ...live,
      settings: { ...live.settings, ...(patch.settings ?? {}) },
      packContent: patch.packContent ?? live.packContent,
      groups,
      players: live.players.map((p) =>
        p.groupId && !validGroupIds.has(p.groupId)
          ? { ...p, groupId: undefined }
          : p,
      ),
    };
  }));
}

/** GM replaces the campaign's phases. */
export async function setPhases(
  crusadeId: string,
  phases: Crusade["phases"],
): Promise<Crusade> {
  return mutateCrusade(crusadeId, (live) => ({ ...live, phases }));
}

/** GM replaces the crusade's tracker sets for players. */
export async function setTrackerSets(
  crusadeId: string,
  trackerSets: Crusade["trackerSets"],
): Promise<Crusade> {
  return mutateCrusade(crusadeId, (live) => {
    // An every-player set that has gone is remembered, so each
    // player's app knows to drop its trackers (see dropWithdrawn).
    const kept = new Set(trackerSets.map((s) => s.id));
    const gone = live.trackerSets
      .filter((s) => s.scope === "everyone" && !kept.has(s.id))
      .map((s) => s.id);
    const withdrawnSets = [...new Set([...(live.withdrawnSets ?? []), ...gone])].slice(-200);
    return {
      ...live,
      trackerSets,
      ...(withdrawnSets.length > 0 ? { withdrawnSets } : {}),
    };
  });
}

/** GM sets, replaces or (with null) removes the campaign map. */
/** GM replaces (or, with empty text, removes) the house rules. */
export async function setHouseRules(crusadeId: string, text: string): Promise<Crusade> {
  return mutateCrusade(crusadeId, (live) => {
    const { houseRules: _old, ...rest } = live;
    void _old;
    const trimmed = text.trim();
    return trimmed
      ? { ...rest, houseRules: { text: trimmed, updatedAt: new Date().toISOString() } }
      : rest;
  });
}

export async function setCrusadeMap(
  crusadeId: string,
  map: Crusade["map"] | null,
): Promise<Crusade> {
  return mutateCrusade(crusadeId, (live) => {
    const { map: _old, ...rest } = live;
    void _old;
    return map ? { ...rest, map } : rest;
  });
}

/**
 * The front page shows GM-owned values (teams, campaign tracker) as
 * plain text, so redraw it after they change. In the background: the
 * page is cosmetic and must not slow the GM's edit down.
 */
async function refreshFront(change: Promise<Crusade>): Promise<Crusade> {
  const updated = await change;
  // Coalesce bursts (e.g. clicking a tracker counter several times).
  clearTimeout(frontTimers.get(updated.id));
  frontTimers.set(
    updated.id,
    setTimeout(() => {
      frontTimers.delete(updated.id);
      void getCrusade(updated.id).then(
        (latest) => latest && rebuildViews(latest, { frontOnly: true }),
      );
    }, 2000),
  );
  return updated;
}

const frontTimers = new Map<string, ReturnType<typeof setTimeout>>();

export async function setPlayerGroup(
  crusadeId: string,
  playerGoogleId: string,
  groupId: string | undefined,
): Promise<Crusade> {
  return refreshFront(mutateCrusade(crusadeId, (live) => ({
    ...live,
    players: live.players.map((p) =>
      p.user.googleId === playerGoogleId ? { ...p, groupId } : p,
    ),
  })));
}

export async function updatePackState(
  crusadeId: string,
  state: PackState,
): Promise<Crusade> {
  return refreshFront(
    mutateCrusade(crusadeId, (live) => ({ ...live, packState: state })),
  );
}

/** True when an error means the crusade's sheet is gone or unshared. */
export function isCrusadeGone(err: unknown): boolean {
  const cause = err instanceof Error ? err.cause : undefined;
  return (
    (err instanceof SheetsError && err.notShared) ||
    (cause instanceof SheetsError && cause.notShared)
  );
}
