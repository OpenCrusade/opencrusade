import { z } from 'zod'

export const changeActionSchema = z.enum([
  'unit_added',
  'unit_removed',
  'unit_updated',
  'xp_gained',
  'rank_promoted',
  'honour_gained',
  'honour_lost',
  'scar_gained',
  'scar_removed',
  'blessing_assigned',
  'burden_assigned',
  'requisition_used',
  'battle_created',
  'battle_confirmed',
  'battle_disputed',
  'battle_results_applied',
  'roster_updated',
])

export const changelogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  actor: z.string(),
  action: changeActionSchema,
  entityType: z.enum(['unit', 'roster', 'requisition', 'battle', 'blessing', 'burden']),
  entityId: z.string().optional(),
  entityName: z.string().max(200).optional(),
  details: z.string().max(10000),
  reason: z.string().max(10000).optional(),
})

export const playerChangelogSchema = z.object({
  playerId: z.string(),
  entries: z.array(changelogEntrySchema).max(5000),
})

export type ChangeAction = z.infer<typeof changeActionSchema>
export type ChangelogEntry = z.infer<typeof changelogEntrySchema>
export type PlayerChangelog = z.infer<typeof playerChangelogSchema>
