import { z } from "zod";
import { googleUserSchema } from "./user";
import { attachedRosterSchema, rankSchema } from "./roster";

// Re-export so existing consumers (`import { googleUserSchema } from
// "./crusade"`) keep working.
export { googleUserSchema };

/**
 * A team/alliance within the crusade. Membership is authoritative on
 * `CrusadePlayer.groupId` (one assignment per player); the legacy
 * `playerGoogleIds` array is kept for shape-compat but new writes
 * leave it empty.
 */
export const playerGroupSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  playerGoogleIds: z.array(z.string()).default([]),
});

export const crusadeSettingsSchema = z.object({
  allowPlayerBattleCreation: z.boolean().default(true),
  /**
   * Where the Campaign totals panel shows on the campaign page: in the
   * side column (the default), or full width at the top or bottom of
   * the main column.
   */
  totalsPlacement: z.enum(["side", "above", "below"]).optional(),
  /** Trackers side by side in Campaign totals when it is full width. */
  totalsColumns: z.number().int().min(1).max(4).optional(),
  /** Where the GM's Campaign tracker card shows. Default: the side. */
  trackerPlacement: z.enum(["side", "above", "below"]).optional(),
});

/**
 * GM-authored pack content (v2.8), the crusade's agenda / mission /
 * relic name lists, entered by the GM in crusade settings. Names only:
 * the app ships no GW rules text (IP), so what these mean at the table
 * comes from the group's own books. Battle forms offer them as
 * suggestions; free text always remains allowed.
 */
export const packContentSchema = z.object({
  agendas: z.array(z.string().max(200)).max(50).default([]),
  missions: z.array(z.string().max(200)).max(50).default([]),
  relics: z.array(z.string().max(200)).max(50).default([]),
});

/** Legacy (pre-2026-07-14) counter-only tracker. Kept for on-read
 *  compat; new writes use `items` and clear this. */
export const packCounterSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  value: z.number().int(),
});

/**
 * One crusade-level tracker item. `kind` decides the control and the
 * value type: counter → number, toggle → boolean, text → string,
 * list → named entries with an optional description.
 * Not every pack mechanic is a number, protocols, unlocks and named
 * states need checkboxes and text.
 */
export const packTrackerItemSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  kind: z.enum(["counter", "toggle", "text", "list", "stage", "checklist"]),
  setRef: z.string().optional(),
  placement: z.enum(["side", "above", "below"]).optional(),
  columns: z.number().int().min(1).max(4).optional(),
  lifetime: z.number().int().optional(),
  /** Number trackers in a GM's set: false leaves it out of Campaign totals. */
  totals: z.boolean().optional(),
  value: z.union([
    z.number().int(),
    z.boolean(),
    z.string().max(2000),
    // "list": named entries the player unlocks or collects.
    z
      .array(z.object({ id: z.string(), name: z.string().max(200), detail: z.string().max(2000) }))
      .max(100),
    // "stage": named stages with one current.
    z.object({
      stages: z.array(z.string().max(200)).max(30),
      current: z.number().int().min(0),
    }),
    // "checklist": a group of named options, each ticked or not.
    z.object({
      options: z
        .array(
          z.object({
            id: z.string(),
            name: z.string().max(200),
            detail: z.string().max(2000),
            on: z.boolean(),
          }),
        )
        .max(50),
    }),
  ]),
});

/**
 * Crusade-level pack-mechanic state, same tracker shape as the
 * per-roster faction panels, but GM-edited and crusade-wide.
 */
export const packStateSchema = z.object({
  counters: z.array(packCounterSchema).max(50).default([]),
  items: z.array(packTrackerItemSchema).max(50).default([]),
  note: z.string().max(10000).default(""),
});

/**
 * v2: `pending` / `declined` / `invited` were Forms-derived states; Forms
 * was dropped 2026-05-27. Only three states remain.
 */
export const crusadePlayerStatusSchema = z.enum([
  "GrantingAccess",
  "Active",
  "Removed",
]);

export const crusadePlayerSchema = z.object({
  user: googleUserSchema,
  factionId: z.string().optional(),
  factionName: z.string().max(200).default(""),
  joinedAt: z.string().datetime(),
  role: z.enum(["gm", "player"]),
  groupId: z.string().optional(),

  /**
   * Lifecycle. `GrantingAccess` covers the in-flight window between
   * permissions.create and the player first signing in (Drive can take
   * several seconds to propagate the share).
   */
  status: crusadePlayerStatusSchema.default("Active"),

  /** Sheet id of this player's tab in the crusade spreadsheet. */
  tabId: z.number().int().optional(),

  /**
   * The GM's app has admitted this player: the GM-locked tab records
   * which tab is theirs, so no other tab can speak for them.
   */
  registered: z.boolean().optional(),
});

/**
 * Attached roster, defined in `./roster.ts` to break the circular
 * dependency (crusade ↔ roster). Re-exported here for back-compat.
 */
export { attachedRosterSchema };

// ── Battle records (inline in crusade.json) ───────────────────────

/**
 * One unit's contribution to a battle (the per-participant record).
 * Snapshots the unit's name at fielding time so the battle record
 * still reads correctly if the unit is later removed from the roster.
 */
export const battleUnitFieldedSchema = z.object({
  unitId: z.string(),
  unitName: z.string().max(200),
  enemiesDestroyed: z.number().int().min(0).default(0),
  survived: z.boolean().default(true),
  markedForGreatness: z.boolean().default(false),
  /** Manual bonus XP, agenda rewards, mission rules, GM fiat. */
  bonusXp: z.number().int().min(0).default(0),
  // ── Recorded when results are applied (for campaign stats) ──────
  // The unit as it was in this battle. Rosters only hold the current
  // state, so without these a later edit rewrites history.
  xpAwarded: z.number().int().min(0).optional(),
  rankBefore: rankSchema.optional(),
  rankAfter: rankSchema.optional(),
  pointsCost: z.number().int().min(0).optional(),
  datasheetName: z.string().max(200).optional(),
  isCharacter: z.boolean().optional(),
});

/**
 * The participant's force at the moment they applied a battle's
 * results. Lets stats chart a force's growth battle by battle.
 */
export const forceSnapshotSchema = z.object({
  factionName: z.string().max(200),
  supplyUsed: z.number().int().min(0),
  supplyLimit: z.number().int().min(0),
  crusadePoints: z.number().int().min(0),
  requisitionPoints: z.number().int(),
  unitCount: z.number().int().min(0),
  at: z.string().datetime(),
});

/** Free-text agenda tracked per participant per battle. */
export const battleAgendaSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  completed: z.boolean().default(false),
});

/**
 * One participant's full record for a battle. Inline in
 * `Battle.participants[]`, no separate per-player file.
 */
export const battleParticipantInlineSchema = z.object({
  googleId: z.string(),
  displayName: z.string().max(200),
  rosterId: z.string(),
  outcome: z
    .enum(["victory", "defeat", "draw", "unset"])
    .default("unset"),
  victoryPoints: z.number().int().min(0).default(0),
  unitsFielded: z.array(battleUnitFieldedSchema).max(50).default([]),
  agendas: z.array(battleAgendaSchema).max(10).default([]),
  notes: z.string().max(10000).default(""),
  confirmed: z.boolean().default(false),
  confirmedAt: z.string().datetime().optional(),
  /** Idempotency flag, has this participant applied XP/tallies to
   *  their canonical roster yet? */
  appliedResults: z.boolean().default(false),
  forceSnapshot: forceSnapshotSchema.optional(),
  /** Link to this player's write-up or log of the battle elsewhere. */
  // Shown as a link, so only ever a web address. Anything else read
  // from the sheet is dropped rather than failing the whole battle.
  logUrl: z
    .string()
    .max(500)
    .regex(/^https?:\/\//i)
    .optional()
    .catch(undefined),
  /** What was at stake in this battle, as this player last wrote it.
   *  Every player keeps their own copy; the newest one is shown. */
  rewards: z.string().max(2000).optional(),
  rewardsAt: z.string().datetime().optional(),
});

/**
 * Battle record. Inline in `Crusade.battles[]`. Single source of
 * truth for all participants' data; no separate per-participant
 * files (we already proved per-file Drive sharing has unworkable
 * Picker UX).
 */
export const inlineBattleSchema = z.object({
  id: z.string(), // UUID
  missionName: z.string().max(200),
  date: z.string(), // ISO date
  pointsLevel: z.number().int().min(0),
  battleSize: z
    .enum(["Incursion", "Strike Force", "Onslaught", "Custom"])
    .default("Strike Force"),
  participants: z
    .array(battleParticipantInlineSchema)
    .min(2)
    .max(20),
  status: z
    .enum(["draft", "pending", "verified", "voided"])
    .default("draft"),
  createdBy: z.string(), // googleId
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  notes: z.string().max(10000).default(""),
});

/**
 * GM-proposed blessing/burden. The GM has reader-only on player rosters
 * (US4b), so direct writes are impossible. Instead, the GM appends to
 * `Crusade.gmAssignments[]`; the player's app reads on next roster
 * open and merges into their canonical roster, tracking applied
 * assignments via `Roster.appliedGmAssignments[]`.
 */
export const gmAssignmentSchema = z.object({
  id: z.string(),                            // UUID
  playerId: z.string(),                      // recipient's Google ID
  rosterId: z.string(),                      // which roster
  unitId: z.string(),                        // which crusade card
  type: z.enum(["blessing", "burden"]),
  name: z.string().max(200),
  description: z.string().max(10000),
  source: z.enum(["pack", "custom"]),
  sourceId: z.string().optional(),
  assignedBy: z.string(),                    // GM's Google ID
  assignedAt: z.string().datetime(),
});

/**
 * The campaign map: one picture the GM uploads and can replace.
 * Stored in the GM's data tab as text (a data: URL), because the
 * Sheets API cannot place a real image in a cell.
 */
export const crusadeMapSchema = z.object({
  dataUrl: z.string().regex(/^data:image\/(webp|jpeg|png);base64,/).max(700_000),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  caption: z.string().max(200).default(""),
  updatedAt: z.string().datetime(),
});

/**
 * A tracker set the GM has added to the crusade for its players.
 * "everyone": each player's app adds these trackers to that player's
 * own trackers automatically. "choice": players pick it if they want.
 */
export const crusadeTrackerSetSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  scope: z.enum(["everyone", "choice"]),
  items: z.array(packTrackerItemSchema).max(50),
  note: z.string().max(10000).default(""),
  updatedAt: z.string().datetime(),
});

/** One chapter of the campaign's story, with the dates it runs. */
export const crusadePhaseSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  text: z.string().max(5000).default(""),
  /** ISO dates (YYYY-MM-DD); either may be blank. */
  start: z.string().max(10).default(""),
  end: z.string().max(10).default(""),
});

export const crusadeSchema = z.object({
  id: z.string(), // Google spreadsheet id
  /**
   * Version of the sheet layout this campaign was last written with.
   * An app that only knows an older layout refuses to open it (and so
   * can't write to it and drop what it doesn't understand).
   */
  formatVersion: z.number().int().min(1).optional(),
  name: z.string().max(200),
  packId: z.string(),
  createdAt: z.string().datetime(),
  createdBy: googleUserSchema,
  supplyLimit: z.number().int().min(0),
  startingRP: z.number().int().min(0),
  players: z.array(crusadePlayerSchema).max(50),
  groups: z.array(playerGroupSchema).max(20).optional(),
  settings: crusadeSettingsSchema,
  // ── v2.4 legacy (2026-05-27), kept on-read for back-compat only.
  //    New writes do NOT populate these; rosters/ subfolder is the
  //    source of truth for attached rosters going forward.
  attachedRosters: z.array(attachedRosterSchema).max(50).default([]),
  gmAssignments: z.array(gmAssignmentSchema).max(500).default([]),

  /** v2.7 (2026-05-28), battles inline in crusade.json. */
  battles: z.array(inlineBattleSchema).max(500).default([]),

  /** v2.8 (2026-07-13), GM-authored pack content + campaign tracker.
   *  Defaults keep pre-v2.8 files parsing cleanly. */
  packContent: packContentSchema.default({
    agendas: [],
    missions: [],
    relics: [],
  }),
  packState: packStateSchema.default({ counters: [], items: [], note: "" }),
  map: crusadeMapSchema.optional(),
  trackerSets: z.array(crusadeTrackerSetSchema).max(40).default([]),
  /**
   * Ids of "everyone" sets the GM has removed. Each player's app drops
   * that set's trackers from their force when it next opens it.
   */
  withdrawnSets: z.array(z.string().max(100)).max(200).optional(),
  phases: z.array(crusadePhaseSchema).max(40).default([]),
});

export type { GoogleUser } from "./user";
export type PlayerGroup = z.infer<typeof playerGroupSchema>;
export type BattleUnitFielded = z.infer<typeof battleUnitFieldedSchema>;
export type BattleAgenda = z.infer<typeof battleAgendaSchema>;
export type BattleParticipantInline = z.infer<
  typeof battleParticipantInlineSchema
>;
export type InlineBattle = z.infer<typeof inlineBattleSchema>;
export type CrusadeSettings = z.infer<typeof crusadeSettingsSchema>;
export type PackContent = z.infer<typeof packContentSchema>;
export type PackCounter = z.infer<typeof packCounterSchema>;
export type PackTrackerItem = z.infer<typeof packTrackerItemSchema>;
export type PackState = z.infer<typeof packStateSchema>;
export type CrusadeMap = z.infer<typeof crusadeMapSchema>;
export type CrusadeTrackerSet = z.infer<typeof crusadeTrackerSetSchema>;
export type CrusadePhase = z.infer<typeof crusadePhaseSchema>;
export type CrusadePlayerStatus = z.infer<typeof crusadePlayerStatusSchema>;
export type CrusadePlayer = z.infer<typeof crusadePlayerSchema>;
export type { AttachedRoster } from "./roster";
export type GMAssignment = z.infer<typeof gmAssignmentSchema>;
export type Crusade = z.infer<typeof crusadeSchema>;
