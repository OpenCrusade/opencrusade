import { z } from "zod";
import { googleUserSchema } from "./user";

export const rankSchema = z.enum([
  "Battle-ready",
  "Blooded",
  "Battle-hardened",
  "Heroic",
  "Legendary",
]);

export const battleHonourSchema = z.object({
  id: z.string(),
  type: z.enum(["battle-trait", "weapon-modification", "crusade-relic"]),
  name: z.string().max(200),
  rules: z.string().max(10000),
  sourceId: z.string().optional(),
  source: z.enum(["core", "faction", "pack", "custom"]),
  targetWeapon: z.string().max(200).optional(),
  relicTier: z.enum(["artificer", "antiquity", "legendary"]).optional(),
  relicCrusadePointsCost: z.number().int().min(0).max(3).optional(),
  awardedAt: z.string().datetime(),
  awardedFromBattleId: z.string().optional(),
});

export const battleScarSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  rules: z.string().max(10000),
  sourceId: z.string().optional(),
  receivedAt: z.string().datetime(),
  receivedFromBattleId: z.string().optional(),
});

export const blessingOrBurdenSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  description: z.string().max(10000),
  sourceId: z.string().optional(),
  source: z.enum(["pack", "custom"]),
  assignedBy: z.string(),
  assignedAt: z.string().datetime(),
});

export const requisitionEntrySchema = z.object({
  id: z.string(),
  requisitionId: z.string().optional(),
  name: z.string().max(200),
  rpCost: z.number().int(),
  targetUnitId: z.string().optional(),
  description: z.string().max(10000),
  appliedAt: z.string().datetime(),
});

/**
 * Deferred-promotion flag (spec.md FR-064 / US4).
 *
 * Set by the apply-results pipeline when XP application crosses a rank
 * threshold. The player picks the battle honour later from the unit
 * detail page. Cleared when the honour is awarded.
 */
export const pendingPromotionSchema = z.object({
  newRank: rankSchema,
  triggeredByBattleId: z.string(),
  triggeredAt: z.string().datetime(),
});

/**
 * Out-of-Action resolution history. Per spec.md US5 acc.#6 / FR-066.
 * The OoA test is rolled at apply-results time; the resolution is recorded
 * on the unit's roster (NOT on the battle file, battles stay read-only
 * after verification).
 */
export const appliedOoAEntrySchema = z.object({
  battleId: z.string(),
  rolled: z.number().int().min(1).max(6),
  outcome: z.enum(["none", "scar-gained", "honour-lost"]),
  resolvedAt: z.string().datetime(),
  /** Which honour/scar was affected (for audit). */
  affectedItemId: z.string().optional(),
});

export const crusadeCardSchema = z.object({
  id: z.string(),
  name: z.string().max(200),
  datasheetName: z.string().max(200),
  datasheetId: z.string().optional(),
  /** This unit's id in the army list it was imported from. */
  importId: z.string().max(200).optional(),
  pointsCost: z.number().int().min(0),
  modelCount: z.number().int().min(0),
  experiencePoints: z.number().int().min(0),
  rank: rankSchema,
  crusadePoints: z.number().int().min(0),
  battlesPlayed: z.number().int().min(0),
  battlesSurvived: z.number().int().min(0),
  enemiesDestroyed: z.number().int().min(0),
  battleHonours: z.array(battleHonourSchema).max(6),
  battleScars: z.array(battleScarSchema).max(20),
  blessings: z.array(blessingOrBurdenSchema).max(20),
  burdens: z.array(blessingOrBurdenSchema).max(20),
  equipment: z.array(z.string().max(500)).max(50),
  notes: z.string().max(10000).default(""),
  isCharacter: z.boolean(),
  /** Legendary Veterans requisition raises the honour cap of a
   *  non-CHARACTER unit from 3 to 6. */
  honourCapRaised: z.boolean().default(false),
  /** Battle Honours earned outside ranking up (mission rewards and the
   *  like), which the app can't work out by itself. */
  bonusHonours: z.number().int().min(0).max(6).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  appliedBattleIds: z.array(z.string()).max(500),

  // ── v2 additions ───────────────────────────────────────────────
  pendingPromotion: pendingPromotionSchema.optional(),
  /**
   * Faction-module-owned state. Each faction module declares its own
   * Zod schema under `components/factions/{factionId}/schema.ts`. We
   * validate the slice on read/write in the module's hook; here we
   * only assert it's an object so unknown factions round-trip safely.
   */
  factionState: z.record(z.string(), z.unknown()).optional(),
  appliedOoA: z.array(appliedOoAEntrySchema).max(500).default([]),
});

/**
 * Per-crusade attachment record stored on the canonical roster.
 * Tracks which crusade copies (mirrors) need pushing on edit.
 *
 * `crusadeBanner` is the per-crusade label the owner chose for this
 * attachment (e.g. a force name while the canonical
 * factionName is just the faction). Mirrors this banner field
 * on the mirror file.
 */
export const rosterAttachmentSchema = z.object({
  crusadeId: z.string(),         // Drive folder id of the crusade
  mirrorFileId: z.string(),      // Drive file id of the mirror at {crusade}/rosters/{googleId}.json
  attachedAt: z.string().datetime(),
  crusadeBanner: z.string().max(200).default(""),
});

/**
 * Player-owned roster. v2.5 (2026-05-28): canonical + mirror model.
 *
 *   - This is the CANONICAL roster, in the player's own Drive Library.
 *   - When attached to a crusade, a MIRROR copy is created in the
 *     crusade folder at `rosters/{playerGoogleId}.json`. The mirror
 *     is the player-owned read-target for GM and other players.
 *   - Every canonical edit pushes to all mirrors listed in `attachedTo`.
 *   - GM deleting the crusade destroys mirrors only; canonical
 *     survives in the player's Library.
 */
export const playerRosterSchema = z.object({
  id: z.string(),                       // UUID
  player: googleUserSchema,
  factionName: z.string().max(200),
  factionId: z.string().optional(),
  /** The force's colour (banner and marks). Chosen by the owner. */
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  supplyUsed: z.number().int().min(0),
  /**
   * Per-player supply limit (crusade rules: starts at 1000, grows via
   * the Increase Supply Limit requisition). Distinct from the
   * crusade-level default the GM configures.
   */
  supplyLimit: z.number().int().min(0).default(1000),
  requisitionPoints: z.number().int(),
  crusadePoints: z.number().int().min(0),
  units: z.array(crusadeCardSchema).max(200),
  requisitionLog: z.array(requisitionEntrySchema).max(500),
  appliedGmAssignments: z.array(z.string()).max(2000).default([]),
  /** Crusades this roster is currently attached to. */
  attachedTo: z.array(rosterAttachmentSchema).max(50).default([]),
  /**
   * Roster-level faction mechanic state, owned by the faction module
   * rendering it . Free-shape record,
   * each module validates its own slice.
   */
  factionState: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Inline mirror of an attached roster, stored in `crusade.json` under
 * `Crusade.attachedRosters[]`. v2.6 (2026-05-28), replaces the
 * separate-mirror-file model that had unworkable Picker UX.
 *
 * Identity, state, and metadata of one player's roster as visible to
 * the crusade. The owner's app pushes updates here whenever they
 * edit their canonical roster.
 */
export const attachedRosterSchema = playerRosterSchema.extend({
  attachedAt: z.string().datetime(),
  lastSyncedAt: z.string().datetime(),
  canonicalFileId: z.string(),
  crusadeBanner: z.string().max(200).default(""),
  /**
   * Counts every write of this copy. A device compares it with the
   * revision it last saw to tell "someone else changed this" from
   * "this is what I wrote", without trusting anyone's clock.
   */
  rev: z.number().int().min(0).optional(),
  /** Which device (or "gm") made that write. */
  revBy: z.string().max(80).optional(),
});

/**
 * Legacy alias, kept so existing code that referenced
 * `rosterMirrorSchema` doesn't break. Same shape as
 * `attachedRosterSchema` going forward.
 */
export const rosterMirrorSchema = attachedRosterSchema;

export type Rank = z.infer<typeof rankSchema>;
export type BattleHonour = z.infer<typeof battleHonourSchema>;
export type BattleScar = z.infer<typeof battleScarSchema>;
export type BlessingOrBurden = z.infer<typeof blessingOrBurdenSchema>;
export type RequisitionEntry = z.infer<typeof requisitionEntrySchema>;
export type PendingPromotion = z.infer<typeof pendingPromotionSchema>;
export type AppliedOoAEntry = z.infer<typeof appliedOoAEntrySchema>;
export type CrusadeCard = z.infer<typeof crusadeCardSchema>;
export type RosterAttachment = z.infer<typeof rosterAttachmentSchema>;
export type PlayerRoster = z.infer<typeof playerRosterSchema>;
export type AttachedRoster = z.infer<typeof attachedRosterSchema>;
/** @deprecated alias for AttachedRoster; will be removed. */
export type RosterMirror = AttachedRoster;
