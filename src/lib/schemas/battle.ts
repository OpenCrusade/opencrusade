import { z } from "zod";

export const battleStatusSchema = z.enum([
  "draft",
  "pending",
  "verified",
  "disputed",
  "voided",
  "tampered",
]);

export const battleParticipantSchema = z.object({
  googleId: z.string(),
  displayName: z.string().max(200),
  confirmed: z.boolean(),
  confirmedAt: z.string().datetime().optional(),
  disputeReason: z.string().max(10000).optional(),
  victoryPoints: z.number().int().min(0).default(0),
});

export const battleSchema = z.object({
  id: z.string(),
  crusadeId: z.string(),
  missionName: z.string().max(200),
  missionId: z.string().optional(),
  packId: z.string().optional(),
  date: z.string(),
  pointsLevel: z.number().int().min(0),
  battleSize: z.enum(["Incursion", "Strike Force", "Onslaught", "Custom"]),
  participants: z.array(battleParticipantSchema).min(2).max(20),
  status: battleStatusSchema,
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  notes: z.string().max(10000).default(""),
});

export const battleUnitSchema = z.object({
  unitId: z.string(),
  unitName: z.string().max(200),
  enemiesDestroyed: z.number().int().min(0),
  survived: z.boolean(),
  /** Computed at submission via xpRules; player can override via bonusXp. */
  xpEarned: z.number().int().min(0),
  bonusXp: z.number().int().min(0).default(0),
});

export const battlePlayerDataSchema = z.object({
  battleId: z.string(),
  playerId: z.string(),
  unitsFielded: z.array(battleUnitSchema).max(200),
  markedForGreatnessUnitIds: z.array(z.string()).default([]),
  notes: z.string().max(10000).default(""),
  photoFileIds: z.array(z.string()).max(50),
  submittedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  confirmed: z.boolean(),
  confirmedAt: z.string().datetime().optional(),
  disputeReason: z.string().max(10000).optional(),
  /**
   * SHA-256 hash of all OTHER participants' submitted data at signing
   * time. Compared on read to detect post-verification tampering.
   */
  confirmationSnapshot: z.string().optional(),
});

export type BattleStatus = z.infer<typeof battleStatusSchema>;
export type BattleParticipant = z.infer<typeof battleParticipantSchema>;
export type Battle = z.infer<typeof battleSchema>;
export type BattleUnit = z.infer<typeof battleUnitSchema>;
export type BattlePlayerData = z.infer<typeof battlePlayerDataSchema>;
