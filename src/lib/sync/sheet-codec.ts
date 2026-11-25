/**
 * Pure conversion between spreadsheet rows and the `Crusade` aggregate.
 * No I/O here, `sheet-store.ts` does the reading and writing.
 *
 * ── Layout ─────────────────────────────────────────────────────────
 * One spreadsheet per crusade. DATA tabs (hidden, this module):
 *   - "Crusade data" (tab 2)  GM-locked: config, player list, GM assignments.
 *   - one data tab per player (even id ≥ 1000), locked to that player +
 *     the GM: their profile, roster, units, battles they created, their
 *     battle results.
 * VIEW tabs (visible, built by sheet-view.ts, never read by the app):
 *   - "Crusade" (tab 1) front page, and one roster page per player
 *     (data tab id + 1). Formulas over the data tabs; GM-locked.
 *
 * Every data row is `kind | id | readable columns… | updated | data…`.
 * The `data` cells hold the authoritative JSON (split across cells,
 * because a cell caps at 50,000 characters); the readable columns are
 * derived copies for humans and for the Overview formulas, and are
 * ignored on read.
 *
 * Rows are never deleted or moved: a removed record is overwritten
 * with a tombstone (`kind` = "-"). That keeps row positions stable so
 * a writer can update "row N" without racing another writer's delete.
 *
 * ── Who writes what ────────────────────────────────────────────────
 * Google enforces the tab locks, so the split below is what makes
 * concurrent play safe without compare-and-swap: each client only
 * ever writes its own tab (the GM, as owner, may write any).
 */

import type {
  AttachedRoster,
  BattleParticipantInline,
  Crusade,
  CrusadeCard,
  CrusadePlayer,
  CrusadeTrackerSet,
  GMAssignment,
  InlineBattle,
} from "@/types";
import type { Cell, Row } from "@/lib/google/sheets";

export const OVERVIEW_TAB_ID = 1;
export const GM_TAB_ID = 2;
export const GM_TAB_TITLE = "Crusade data";

/** Is this tab one the app stores data in (as opposed to a view page)? */
export function isDataTab(tabId: number): boolean {
  return tabId === GM_TAB_ID || (tabId >= 1000 && tabId % 2 === 0);
}

/** Readable columns C..K (name … summary). */
const READABLE = 9;
/** Number of fixed columns before the JSON data cells (A..L). */
export const DATA_COL = 12;
/** Stay well under the 50,000-character cell cap. */
const CHUNK = 40_000;
export const TOMBSTONE = "-";

export const HEADER_ROW: Row = [
  "kind",
  "id",
  "name",
  "detail",
  "points",
  "xp",
  "rank",
  "crusade pts",
  "battles",
  "kills",
  "summary",
  "updated",
  "data (managed by OpenCrusade, do not edit)",
];

/** Column letters the Overview formulas rely on. */
export const COL = {
  kind: "A",
  detail: "D",
  points: "E",
  xp: "F",
  crusadePts: "H",
} as const;

type Kind =
  | "crusade"
  | "player"
  | "assignment"
  | "profile"
  | "roster"
  | "unit"
  | "battle"
  | "result"
  | "status"
  | "map"
  | "rules"
  | "set";

const KINDS = new Set<string>([
  "crusade",
  "player",
  "assignment",
  "profile",
  "roster",
  "unit",
  "battle",
  "result",
  "status",
  "map",
  "rules",
  "set",
]);

/** One logical record destined for (or read from) a tab. */
export interface Rec {
  kind: Kind;
  id: string;
  /** Readable columns C..K: name, detail, points, xp, rank, cp, battles, kills, summary. */
  cols: Cell[];
  data: unknown;
}

export interface ParsedRec extends Rec {
  /** 0-based row index in the tab. */
  rowIndex: number;
  /** How many cells the row occupied when read (to blank stale ones). */
  width: number;
}

export interface ParsedTab {
  tabId: number;
  /** Live records by `kind:id`. Later rows win over earlier duplicates. */
  recs: Map<string, ParsedRec>;
}

export interface Snapshot {
  spreadsheetId: string;
  tabs: Map<number, ParsedTab>;
}

const key = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`;

// ─── Row ⇄ record ──────────────────────────────────────────────────

/** Cells for a record, WITHOUT the `updated` timestamp filled in. */
export function recToCells(rec: Rec, updatedAt: string): Row {
  const json = JSON.stringify(rec.data);
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += CHUNK) chunks.push(json.slice(i, i + CHUNK));
  const cols = [...rec.cols];
  while (cols.length < READABLE) cols.push("");
  return [rec.kind, rec.id, ...cols.slice(0, READABLE), updatedAt, ...chunks];
}

/** Stable fingerprint of a record's content (ignores `updated`). */
function fingerprint(rec: Rec): string {
  return JSON.stringify([rec.cols, rec.data]);
}

export function parseTab(tabId: number, rows: Row[]): ParsedTab {
  const recs = new Map<string, ParsedRec>();
  rows.forEach((row, rowIndex) => {
    if (rowIndex === 0) return; // header
    const kind = String(row[0] ?? "");
    if (!KINDS.has(kind)) return; // tombstone, blank, or a human's note
    const id = String(row[1] ?? "");
    if (!id) return;
    let data: unknown;
    try {
      data = JSON.parse(row.slice(DATA_COL).map(String).join(""));
    } catch {
      console.warn(`[sheet-codec] unreadable ${kind}:${id} on tab ${tabId} row ${rowIndex + 1}`);
      return;
    }
    recs.set(`${kind}:${id}`, {
      kind: kind as Kind,
      id,
      cols: row.slice(2, 2 + READABLE),
      data,
      rowIndex,
      width: row.length,
    });
  });
  return { tabId, recs };
}

/**
 * Sheet layout version. Raise it whenever a change means an older app
 * would misread or lose data; older apps then ask to be reloaded
 * instead of writing.
 */
export const SHEET_FORMAT = 1;

// ─── Stored shapes ─────────────────────────────────────────────────

/**
 * What the GM decides about a player, in the GM-locked Crusade tab,
 * keyed by email. Only written when there is something to record, a
 * player with no team who hasn't been removed has no row here.
 */
interface StoredPlayer {
  email: string;
  groupId?: string;
  removed: boolean;
  /**
   * Set when the GM's app has ADMITTED this player: it pins their
   * Google account to one tab. From then on only that tab speaks for
   * them, whatever any other tab claims. Rows written before
   * admission existed have neither field.
   */
  googleId?: string;
  tabId?: number;
}

/**
 * A player's membership, in their OWN tab. Having a tab with a profile
 * row is what makes someone a player: they join by themselves once the
 * GM has shared the spreadsheet with them.
 */
interface StoredProfile {
  googleId: string;
  email: string;
  displayName: string;
  joinedAt: string;
}

/**
 * Battle header, in the creator's tab. It carries the RESULT the
 * creator declared, each participant's outcome and victory points,
 * so only the creator (or the GM) can change who won.
 */
interface StoredBattle
  extends Omit<InlineBattle, "participants" | "status"> {
  participants: Pick<
    BattleParticipantInline,
    "googleId" | "displayName" | "rosterId" | "outcome" | "victoryPoints"
  >[];
}

/**
 * One participant's own record, in their own tab: what they fielded,
 * and their confirmation of the declared result. A confirmation
 * stores the exact result it agreed to (`confirmedSig`), so if the
 * creator later changes the result, the confirmation no longer
 * matches and the player has to confirm again, without anyone having
 * to write into the player's tab to reset it.
 */
interface StoredResult {
  unitsFielded: BattleParticipantInline["unitsFielded"];
  agendas: BattleParticipantInline["agendas"];
  notes: string;
  appliedResults: boolean;
  forceSnapshot?: BattleParticipantInline["forceSnapshot"];
  logUrl?: string;
  rewards?: string;
  rewardsAt?: string;
  confirmedSig?: string;
  confirmedOutcome?: BattleParticipantInline["outcome"];
  confirmedVp?: number;
  confirmedAt?: string;
  updatedAt?: string;
}

interface StoredStatus {
  status: InlineBattle["status"];
  at: string;
}

type StoredUnit = CrusadeCard & { rosterId: string };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function isStoredPlayer(v: unknown): v is StoredPlayer {
  return isObject(v) && typeof v.email === "string";
}

function isStoredProfile(v: unknown): v is StoredProfile {
  return (
    isObject(v) &&
    typeof v.googleId === "string" &&
    v.googleId.length > 0 &&
    typeof v.email === "string" &&
    typeof v.displayName === "string"
  );
}

const PRISTINE_RESULT: StoredResult = {
  unitsFielded: [],
  agendas: [],
  notes: "",
  appliedResults: false,
};

function pickConfirmation(r: StoredResult) {
  return {
    ...(r.confirmedSig !== undefined ? { confirmedSig: r.confirmedSig } : {}),
    ...(r.confirmedOutcome !== undefined ? { confirmedOutcome: r.confirmedOutcome } : {}),
    ...(r.confirmedVp !== undefined ? { confirmedVp: r.confirmedVp } : {}),
    ...(r.confirmedAt !== undefined ? { confirmedAt: r.confirmedAt } : {}),
  };
}

type Declared = Pick<BattleParticipantInline, "googleId" | "outcome" | "victoryPoints">;

/** Identifies a declared result exactly (who, outcome, points). */
function resultSignature(participants: Declared[]): string {
  return participants
    .map((p) => `${p.googleId}:${p.outcome}:${p.victoryPoints}`)
    .join("|");
}

/** Has the creator said how the battle ended for everyone? */
export function isDeclared(participants: { outcome: string }[]): boolean {
  return participants.length > 0 && participants.every((p) => p.outcome !== "unset");
}

/**
 * Lifecycle implied by the result (no manual override):
 * draft until the creator declares it, pending until every other
 * participant has confirmed it, then verified.
 */
export function derivedStatus(
  participants: { outcome: string; confirmed: boolean }[],
): InlineBattle["status"] {
  if (!isDeclared(participants)) return "draft";
  return participants.every((p) => p.confirmed) ? "verified" : "pending";
}

/**
 * A manual "voided" or "verified" sticks; a manual "draft"/"pending"
 * just clears any earlier override and lets the lifecycle resume.
 */
function effectiveStatus(
  override: StoredStatus | undefined,
  derived: InlineBattle["status"],
): InlineBattle["status"] {
  return override?.status === "voided" || override?.status === "verified"
    ? override.status
    : derived;
}

// ─── Assemble: snapshot → Crusade ──────────────────────────────────

function recsOf<T>(tab: ParsedTab | undefined, kind: Kind): { id: string; data: T; rowIndex: number }[] {
  if (!tab) return [];
  return [...tab.recs.values()]
    .filter((r) => r.kind === kind)
    .sort((a, b) => a.rowIndex - b.rowIndex)
    .map((r) => ({ id: r.id, data: r.data as T, rowIndex: r.rowIndex }));
}

/** The override that currently governs a battle, if any. */
function governingOverride(
  snap: Snapshot,
  battleId: string,
  trustedTabs: Set<number>,
): StoredStatus | undefined {
  let best: StoredStatus | undefined;
  for (const tabId of trustedTabs) {
    const rec = snap.tabs.get(tabId)?.recs.get(`status:${battleId}`);
    const s = rec?.data as StoredStatus | undefined;
    if (s && (!best || s.at > best.at)) best = s;
  }
  return best;
}

/**
 * Build the Crusade aggregate. Returns null when the spreadsheet has
 * no crusade config row (i.e. it isn't an OpenCrusade sheet).
 */
export function assemble(snap: Snapshot): Crusade | null {
  const gmTab = snap.tabs.get(GM_TAB_ID);
  const config = gmTab?.recs.get("crusade:config")?.data as
    | Omit<Crusade, "id" | "players" | "attachedRosters" | "gmAssignments" | "battles" | "map" | "houseRules" | "trackerSets">
    | undefined;
  if (!config) return null;

  // ── Who is a player ──────────────────────────────────────────────
  // Everything in a player's tab is typed by that player, including
  // who they say they are. The GM-locked tab is the only thing every
  // client can trust, so it holds the register: Google account → tab.
  // A tab is believed about its owner only if the register agrees, or
  // (until the GM's app has seen it) if nothing in the register
  // contradicts it.
  const gmPlayerRows = recsOf<unknown>(gmTab, "player")
    .map((r) => r.data)
    .filter(isStoredPlayer);
  const admitted = gmPlayerRows.filter(
    (g): g is StoredPlayer & { googleId: string; tabId: number } =>
      typeof g.googleId === "string" && typeof g.tabId === "number",
  );
  const admittedByGoogleId = new Map(admitted.map((g) => [g.googleId, g]));
  const admittedTabs = new Set(admitted.map((g) => g.tabId));
  const admittedEmails = new Set(admitted.map((g) => g.email.toLowerCase()));
  const legacyByEmail = new Map(
    gmPlayerRows.filter((g) => !g.googleId).map((g) => [g.email.toLowerCase(), g]),
  );

  const stored: {
    tabId: number;
    profile: StoredProfile;
    removed: boolean;
    groupId?: string;
    registered: boolean;
  }[] = [];
  const seenPlayers = new Set<string>();
  const candidates = [...snap.tabs.values()]
    .filter((t) => t.tabId !== GM_TAB_ID)
    .map((t) => ({ tabId: t.tabId, profile: t.recs.get("profile:me")?.data }))
    .filter((c): c is { tabId: number; profile: StoredProfile } => isStoredProfile(c.profile))
    .sort((a, b) => a.tabId - b.tabId);
  // A tab says who it belongs to, and before the GM's app has admitted
  // it nothing backs that up. If two waiting tabs name the same Google
  // account with different email addresses, one of them is false and
  // there is no telling which, so neither is shown (or admitted) until
  // the GM removes one. (The same account and email twice is just
  // someone who joined twice; the earlier tab wins.)
  const waitingClaims = new Map<string, Set<string>>();
  for (const c of candidates) {
    if (admittedByGoogleId.has(c.profile.googleId)) continue;
    if (admittedTabs.has(c.tabId)) continue;
    if (admittedEmails.has(c.profile.email.toLowerCase())) continue;
    const emails = waitingClaims.get(c.profile.googleId) ?? new Set<string>();
    emails.add(c.profile.email.toLowerCase());
    waitingClaims.set(c.profile.googleId, emails);
  }
  for (const c of candidates) {
    if (seenPlayers.has(c.profile.googleId)) continue;
    const reg = admittedByGoogleId.get(c.profile.googleId);
    if (reg) {
      // Admitted: only their registered tab counts, and the email is
      // the one the GM's app recorded, not what the tab now says.
      if (reg.tabId !== c.tabId) continue;
      seenPlayers.add(c.profile.googleId);
      stored.push({
        tabId: c.tabId,
        profile: { ...c.profile, email: reg.email },
        removed: reg.removed,
        groupId: reg.groupId,
        registered: true,
      });
      continue;
    }
    // Not admitted yet. Refuse a claim on someone else's tab or email.
    if (admittedTabs.has(c.tabId)) continue;
    if (admittedEmails.has(c.profile.email.toLowerCase())) continue;
    if ((waitingClaims.get(c.profile.googleId)?.size ?? 0) > 1) continue;
    seenPlayers.add(c.profile.googleId);
    const legacy = legacyByEmail.get(c.profile.email.toLowerCase());
    stored.push({
      ...c,
      removed: legacy?.removed ?? false,
      groupId: legacy?.groupId,
      registered: false,
    });
  }

  const tabOfGoogleId = new Map<string, number>();
  const gmTabs = new Set<number>([GM_TAB_ID]);
  const creatorId = config.createdBy?.googleId;
  // A sheet from before admission existed has no register at all; its
  // GM is recognised by the config row until their app writes one.
  const noRegister = admitted.length === 0;

  const players: CrusadePlayer[] = stored.map((sp) => {
    // Being the GM needs more than a tab saying so.
    const isGm =
      sp.profile.googleId === creatorId && (sp.registered || noRegister);
    tabOfGoogleId.set(sp.profile.googleId, sp.tabId);
    if (isGm) gmTabs.add(sp.tabId);
    return {
      user: {
        googleId: sp.profile.googleId,
        email: sp.profile.email,
        displayName: sp.profile.displayName,
      },
      factionName: "",
      joinedAt: sp.profile.joinedAt ?? config.createdAt,
      role: isGm ? "gm" : "player",
      ...(sp.groupId ? { groupId: sp.groupId } : {}),
      status: sp.removed ? "Removed" : "Active",
      tabId: sp.tabId,
      ...(sp.registered ? { registered: true } : {}),
    };
  });

  const attachedRosters: AttachedRoster[] = [];
  for (const sp of stored) {
    if (sp.removed) continue;
    const tab = snap.tabs.get(sp.tabId);
    const units = recsOf<StoredUnit>(tab, "unit");
    for (const r of recsOf<Omit<AttachedRoster, "units">>(tab, "roster")) {
      // A force only counts in its owner's own tab.
      if (r.data?.player?.googleId !== sp.profile.googleId) continue;
      attachedRosters.push({
        ...r.data,
        units: units
          .filter((u) => u.data?.rosterId === r.id)
          .map(({ data: { rosterId: _rid, ...card } }) => {
            void _rid;
            return card;
          }),
      });
    }
  }

  const battles: InlineBattle[] = [];
  const seen = new Set<string>();
  for (const sp of stored) {
    const tab = snap.tabs.get(sp.tabId);
    for (const b of recsOf<StoredBattle>(tab, "battle")) {
      if (seen.has(b.id)) continue;
      const header = b.data;
      // A battle only counts in its creator's own tab, so nobody can
      // record one in another player's name.
      if (header?.createdBy !== sp.profile.googleId) continue;
      if (!Array.isArray(header.participants)) continue;
      seen.add(b.id);
      let updatedAt = header.updatedAt;
      const sig = resultSignature(header.participants);
      const declared = isDeclared(header.participants);
      const participants: BattleParticipantInline[] = header.participants.map((p) => {
        const pTab = tabOfGoogleId.get(p.googleId);
        const res = ((pTab !== undefined
          ? snap.tabs.get(pTab)?.recs.get(`result:${b.id}`)?.data
          : undefined) ?? PRISTINE_RESULT) as StoredResult;
        if (res.updatedAt && res.updatedAt > updatedAt) updatedAt = res.updatedAt;
        // The creator declared the result, so they stand behind it;
        // everyone else must have confirmed THIS exact result.
        const confirmed =
          declared &&
          (p.googleId === header.createdBy || res.confirmedSig === sig);
        return {
          googleId: p.googleId,
          displayName: p.displayName,
          rosterId: p.rosterId,
          outcome: p.outcome ?? "unset",
          victoryPoints: p.victoryPoints ?? 0,
          unitsFielded: Array.isArray(res.unitsFielded) ? res.unitsFielded : [],
          agendas: Array.isArray(res.agendas) ? res.agendas : [],
          notes: typeof res.notes === "string" ? res.notes : "",
          confirmed,
          ...(confirmed && res.confirmedAt ? { confirmedAt: res.confirmedAt } : {}),
          appliedResults: res.appliedResults === true,
          ...(res.forceSnapshot ? { forceSnapshot: res.forceSnapshot } : {}),
          ...(res.logUrl ? { logUrl: res.logUrl } : {}),
          ...(res.rewardsAt ? { rewards: res.rewards ?? "", rewardsAt: res.rewardsAt } : {}),
        };
      });
      const trusted = new Set(gmTabs);
      const creatorTab = tabOfGoogleId.get(header.createdBy);
      if (creatorTab !== undefined) trusted.add(creatorTab);
      battles.push({
        ...header,
        updatedAt,
        participants,
        status: effectiveStatus(
          governingOverride(snap, b.id, trusted),
          derivedStatus(participants),
        ),
      });
    }
  }
  battles.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const mapRec = gmTab?.recs.get("map:main")?.data as Crusade["map"];
  const rulesRec = gmTab?.recs.get("rules:main")?.data as Crusade["houseRules"];

  return {
    ...config,
    ...(mapRec ? { map: mapRec } : {}),
    ...(rulesRec && typeof rulesRec.text === "string" ? { houseRules: rulesRec } : {}),
    trackerSets: recsOf<CrusadeTrackerSet>(gmTab, "set").map((r) => r.data),
    id: snap.spreadsheetId,
    players,
    attachedRosters,
    gmAssignments: recsOf<GMAssignment>(gmTab, "assignment").map((r) => r.data),
    battles,
  };
}

/** Build the readable columns C..K in order. */
function row(c: {
  name?: Cell;
  detail?: Cell;
  points?: Cell;
  xp?: Cell;
  rank?: Cell;
  crusadePts?: Cell;
  battles?: Cell;
  kills?: Cell;
  summary?: Cell;
}): Cell[] {
  return [
    c.name ?? "",
    c.detail ?? "",
    c.points ?? "",
    c.xp ?? "",
    c.rank ?? "",
    c.crusadePts ?? "",
    c.battles ?? "",
    c.kills ?? "",
    c.summary ?? "",
  ];
}

/** One-line, human-readable state of a unit for the sheet. */
function unitSummary(u: CrusadeCard): string {
  const parts: string[] = [];
  const list = (label: string, xs: { name: string }[]) => {
    if (xs.length) parts.push(`${label}: ${xs.map((x) => x.name).join(", ")}`);
  };
  list("Honours", u.battleHonours);
  list("Scars", u.battleScars);
  list("Blessings", u.blessings);
  list("Burdens", u.burdens);
  if (u.equipment.length) parts.push(`Wargear: ${u.equipment.join(", ")}`);
  if (u.notes.trim()) parts.push(`Notes: ${u.notes.trim()}`);
  return parts.join(" · ").slice(0, 2000);
}

/** One-line, human-readable record of one player's side of a battle. */
function resultSummary(date: string, p: BattleParticipantInline): string {
  const parts = [date];
  if (p.unitsFielded.length) {
    parts.push(
      "Fielded: " +
        p.unitsFielded
          .map(
            (u) =>
              u.unitName +
              (u.survived ? "" : " (destroyed)") +
              (u.markedForGreatness ? " ★" : ""),
          )
          .join(", "),
    );
  }
  const done = p.agendas.filter((a) => a.completed).map((a) => a.name);
  if (done.length) parts.push(`Agendas: ${done.join(", ")}`);
  if (p.notes.trim()) parts.push(`Notes: ${p.notes.trim()}`);
  return parts.join(" · ").slice(0, 2000);
}

// ─── Disassemble: Crusade → records per tab ────────────────────────

/**
 * Describes a mutation in progress, so a battle status the user set
 * by hand can be told apart from one the lifecycle produced.
 */
export interface StatusChange {
  /** Who is making the change (their tab receives the override row). */
  actorGoogleId: string;
  /** Each battle's status before the mutation. */
  prev: Map<string, InlineBattle["status"]>;
}

/**
 * Records each tab should hold for `crusade`. `snap` supplies the
 * existing battle-status overrides (which are not part of the Crusade
 * shape). Pass `change` when disassembling the result of a mutation:
 * a battle whose status the mutation changed to something the
 * lifecycle alone would not produce gets a new override row in the
 * actor's own tab.
 */
export function disassemble(
  crusade: Crusade,
  snap: Snapshot,
  now: string,
  change?: StatusChange,
): Map<number, Map<string, Rec>> {
  const out = new Map<number, Map<string, Rec>>();
  const put = (tabId: number | undefined, rec: Rec) => {
    if (tabId === undefined) return;
    let tab = out.get(tabId);
    if (!tab) out.set(tabId, (tab = new Map()));
    tab.set(key(rec), rec);
  };

  const {
    id: _id,
    players,
    attachedRosters,
    gmAssignments,
    battles,
    map,
    houseRules,
    trackerSets,
    ...config
  } = crusade;
  void _id;

  for (const set of trackerSets ?? []) {
    put(GM_TAB_ID, {
      kind: "set",
      id: set.id,
      cols: row({
        name: set.name,
        detail: set.scope === "everyone" ? "for every player" : "players choose",
        summary: set.items.map((i) => i.name).join(", ").slice(0, 500),
      }),
      data: set,
    });
  }

  if (map) {
    put(GM_TAB_ID, {
      kind: "map",
      id: "main",
      cols: row({
        name: map.caption || "Campaign map",
        detail: `${map.width}×${map.height}`,
        summary: "Picture stored as text; shown by the web app.",
      }),
      data: map,
    });
  }

  if (houseRules) {
    put(GM_TAB_ID, {
      kind: "rules",
      id: "main",
      cols: row({
        name: "House rules",
        summary: houseRules.text.slice(0, 500),
      }),
      data: houseRules,
    });
  }

  put(GM_TAB_ID, {
    kind: "crusade",
    id: "config",
    cols: row({
      name: config.name,
      detail: config.packId,
      points: config.supplyLimit,
      summary: `Supply limit ${config.supplyLimit} · starting RP ${config.startingRP}`,
    }),
    data: config,
  });

  const tabOfGoogleId = new Map<string, number>();
  const gmTabs = new Set<number>([GM_TAB_ID]);
  for (const p of players) {
    if (p.tabId === undefined) continue;
    tabOfGoogleId.set(p.user.googleId, p.tabId);
    if (p.role === "gm") gmTabs.add(p.tabId);

    // GM-owned facts about the player, only when there are any, so a
    // player joining never needs a write to the GM's tab.
    if (p.groupId || p.status === "Removed" || p.registered) {
      const sp: StoredPlayer = {
        email: p.user.email,
        ...(p.groupId ? { groupId: p.groupId } : {}),
        removed: p.status === "Removed",
        ...(p.registered ? { googleId: p.user.googleId, tabId: p.tabId } : {}),
      };
      put(GM_TAB_ID, {
        kind: "player",
        id: p.user.email.toLowerCase(),
        cols: row({
          name: p.user.displayName,
          detail: p.status === "Removed" ? "removed" : "player",
          summary: p.user.email,
        }),
        data: sp,
      });
    }

    const profile: StoredProfile = {
      googleId: p.user.googleId,
      email: p.user.email,
      displayName: p.user.displayName,
      joinedAt: p.joinedAt,
    };
    put(p.tabId, {
      kind: "profile",
      id: "me",
      cols: row({ name: p.user.displayName, detail: p.user.email }),
      data: profile,
    });
  }

  const nameOf = new Map(players.map((p) => [p.user.googleId, p.user.displayName]));
  for (const a of gmAssignments ?? []) {
    put(GM_TAB_ID, {
      kind: "assignment",
      id: a.id,
      cols: row({
        name: a.name,
        detail: a.type,
        summary: `For ${nameOf.get(a.playerId) ?? "a player"}: ${a.description}`.slice(0, 500),
      }),
      data: a,
    });
  }

  for (const roster of attachedRosters ?? []) {
    const tabId = tabOfGoogleId.get(roster.player.googleId);
    const { units, ...header } = roster;
    put(tabId, {
      kind: "roster",
      id: roster.id,
      // Numeric columns here feed the roster page's summary boxes:
      // points = supply used, xp = requisition points, crusade pts,
      // kills = supply limit. (Formulas that total units filter on
      // kind = "unit", so these never leak into unit sums.)
      cols: row({
        name: roster.crusadeBanner || roster.factionName,
        detail: roster.factionName,
        points: roster.supplyUsed,
        xp: roster.requisitionPoints,
        crusadePts: roster.crusadePoints,
        kills: roster.supplyLimit,
        summary:
          `Supply ${roster.supplyUsed}/${roster.supplyLimit} · ` +
          `RP ${roster.requisitionPoints} · ${units.length} units`,
      }),
      data: header,
    });
    for (const u of units) {
      const su: StoredUnit = { ...u, rosterId: roster.id };
      put(tabId, {
        kind: "unit",
        id: u.id,
        cols: row({
          name: u.name,
          detail: u.datasheetName,
          points: u.pointsCost,
          xp: u.experiencePoints,
          rank: u.rank,
          crusadePts: u.crusadePoints,
          battles: u.battlesPlayed,
          kills: u.enemiesDestroyed,
          summary: unitSummary(u),
        }),
        data: su,
      });
    }
  }

  // Carry existing status overrides through untouched.
  for (const tab of snap.tabs.values()) {
    for (const rec of tab.recs.values()) {
      if (rec.kind === "status") {
        put(tab.tabId, { kind: rec.kind, id: rec.id, cols: rec.cols, data: rec.data });
      }
    }
  }

  const actorTab = change ? tabOfGoogleId.get(change.actorGoogleId) : undefined;

  for (const b of battles ?? []) {
    const { participants, status, ...rest } = b;
    const creatorTab = tabOfGoogleId.get(b.createdBy);
    const prevHeader = snap.tabs.get(creatorTab ?? -1)?.recs.get(`battle:${b.id}`)
      ?.data as StoredBattle | undefined;
    const headerBody = {
      ...rest,
      participants: participants.map((p) => ({
        googleId: p.googleId,
        displayName: p.displayName,
        rosterId: p.rosterId,
        outcome: p.outcome,
        victoryPoints: p.victoryPoints,
      })),
    };
    // `updatedAt` on the header only moves when the header does;
    // result rows carry their own timestamp.
    const sameHeader =
      prevHeader !== undefined &&
      JSON.stringify({ ...prevHeader, updatedAt: "" }) ===
        JSON.stringify({ ...headerBody, updatedAt: "" });
    const header: StoredBattle = {
      ...headerBody,
      updatedAt: sameHeader ? prevHeader.updatedAt : prevHeader ? now : b.createdAt,
    };
    put(creatorTab, {
      kind: "battle",
      id: b.id,
      cols: row({
        name: b.missionName,
        detail: b.date,
        points: b.pointsLevel,
        summary:
          `${b.battleSize} · ` +
          participants
            .map(
              (p) =>
                p.displayName +
                (p.outcome === "unset" ? "" : ` (${p.outcome}, ${p.victoryPoints} VP)`),
            )
            .join(" vs "),
      }),
      data: header,
    });

    const sig = resultSignature(participants);
    const declared = isDeclared(participants);
    const resultChanged =
      prevHeader !== undefined && resultSignature(prevHeader.participants) !== sig;
    const effective: { outcome: string; confirmed: boolean }[] = [];

    for (const p of participants) {
      const isCreator = p.googleId === b.createdBy;
      const pTab = tabOfGoogleId.get(p.googleId);
      const prev = (pTab !== undefined
        ? snap.tabs.get(pTab)?.recs.get(`result:${b.id}`)?.data
        : undefined) as StoredResult | undefined;

      // Which confirmation does this participant's row hold now?
      //  - the creator stands behind whatever they declared;
      //  - anyone else's confirmation only counts for the result it was
      //    given for. If the result changed in THIS mutation, their old
      //    confirmation is left exactly as it was (it lives in their
      //    tab, and it no longer matches, so it reads as unconfirmed).
      let conf: ReturnType<typeof pickConfirmation> = {};
      const wantsConfirmed =
        declared && (isCreator || (p.confirmed && !resultChanged));
      if (wantsConfirmed) {
        conf =
          prev?.confirmedSig === sig
            ? pickConfirmation(prev)
            : {
                confirmedSig: sig,
                confirmedOutcome: p.outcome,
                confirmedVp: p.victoryPoints,
                confirmedAt: p.confirmedAt ?? now,
              };
      } else if (!isCreator && prev?.confirmedSig && prev.confirmedSig !== sig) {
        conf = pickConfirmation(prev); // stale, untouched
      }
      effective.push({ outcome: p.outcome, confirmed: conf.confirmedSig === sig });

      const body: StoredResult = {
        unitsFielded: p.unitsFielded,
        agendas: p.agendas,
        notes: p.notes,
        appliedResults: p.appliedResults,
        ...(p.forceSnapshot ? { forceSnapshot: p.forceSnapshot } : {}),
        ...(p.logUrl ? { logUrl: p.logUrl } : {}),
        ...(p.rewardsAt ? { rewards: p.rewards ?? "", rewardsAt: p.rewardsAt } : {}),
        ...conf,
      };
      const pristine =
        body.unitsFielded.length === 0 &&
        body.agendas.length === 0 &&
        body.notes === "" &&
        !body.appliedResults &&
        !body.logUrl &&
        !body.rewardsAt &&
        !body.confirmedSig;
      if (pristine) continue;

      const { updatedAt: prevAt, ...prevBody } = prev ?? PRISTINE_RESULT;
      const changed = JSON.stringify(prevBody) !== JSON.stringify(body);
      put(pTab, {
        kind: "result",
        id: b.id,
        cols: row({
          name: b.missionName,
          // What THIS player has agreed to, never the live header, so a
          // change by the creator can't require a write to this tab.
          // Capitalised for display; the sheet's COUNTIFS on it are
          // case-insensitive.
          detail: conf.confirmedOutcome
            ? conf.confirmedOutcome.charAt(0).toUpperCase() +
              conf.confirmedOutcome.slice(1)
            : "Unconfirmed",
          points: conf.confirmedVp ?? "",
          kills: p.unitsFielded.reduce((n, u) => n + u.enemiesDestroyed, 0),
          summary: resultSummary(b.date, p),
        }),
        data: { ...body, updatedAt: changed ? now : (prevAt ?? now) },
      });
    }

    // The mutation changed the status, and to something the lifecycle
    // alone would not produce ⇒ it was set by hand ⇒ record an
    // override in the actor's tab.
    const prev = change?.prev.get(b.id);
    const trusted = new Set(gmTabs);
    if (creatorTab !== undefined) trusted.add(creatorTab);
    const current = effectiveStatus(
      governingOverride(snap, b.id, trusted),
      derivedStatus(effective),
    );
    if (
      prev !== undefined &&
      status !== prev &&
      status !== current &&
      actorTab !== undefined
    ) {
      const s: StoredStatus = { status, at: now };
      put(actorTab, {
        kind: "status",
        id: b.id,
        cols: row({ name: b.missionName, detail: status }),
        data: s,
      });
    }
  }

  return out;
}

/**
 * The Crusade that the given records describe. Used after a mutation
 * to get the state as the sheet will hold it, with derived fields
 * (battle status, who has confirmed) recomputed, without re-reading.
 */
export function assembleFromRecs(
  spreadsheetId: string,
  recs: Map<number, Map<string, Rec>>,
): Crusade | null {
  const tabs = new Map<number, ParsedTab>();
  for (const [tabId, tab] of recs) {
    let rowIndex = 1;
    tabs.set(tabId, {
      tabId,
      recs: new Map(
        [...tab].map(([k, rec]) => [k, { ...rec, rowIndex: rowIndex++, width: 0 }]),
      ),
    });
  }
  return assemble({ spreadsheetId, tabs });
}

// ─── Diff ──────────────────────────────────────────────────────────

export interface TabWrite {
  tabId: number;
  /** Existing rows to overwrite in place. */
  updates: { rowIndex: number; width: number; cells: Row }[];
  /** New rows to append. */
  appends: Row[];
}

/**
 * What must be written to turn `before` into `after`. Records are
 * matched to their current row via `snap`; a record with no row yet is
 * appended; a record that disappeared is tombstoned in place.
 */
export function diff(
  before: Map<number, Map<string, Rec>>,
  after: Map<number, Map<string, Rec>>,
  snap: Snapshot,
  now: string,
): TabWrite[] {
  const writes: TabWrite[] = [];
  const tabIds = new Set([...before.keys(), ...after.keys()]);
  for (const tabId of tabIds) {
    const b = before.get(tabId) ?? new Map<string, Rec>();
    const a = after.get(tabId) ?? new Map<string, Rec>();
    const existing = snap.tabs.get(tabId)?.recs;
    const w: TabWrite = { tabId, updates: [], appends: [] };

    for (const [k, rec] of a) {
      const prev = b.get(k);
      if (prev && fingerprint(prev) === fingerprint(rec)) continue;
      const cells = recToCells(rec, now);
      const row = existing?.get(k);
      if (row) w.updates.push({ rowIndex: row.rowIndex, width: row.width, cells });
      else w.appends.push(cells);
    }
    for (const [k, rec] of b) {
      if (a.has(k)) continue;
      const row = existing?.get(k);
      if (row) {
        w.updates.push({
          rowIndex: row.rowIndex,
          width: row.width,
          cells: [TOMBSTONE, rec.id, "(deleted)", "", "", "", "", "", "", "", "", now],
        });
      }
    }
    if (w.updates.length || w.appends.length) writes.push(w);
  }
  return writes;
}
