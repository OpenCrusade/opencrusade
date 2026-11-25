/**
 * Single import surface for shared types. Schemas remain the source of
 * truth; this file re-exports inferred types so application code never
 * needs to know which file a type comes from.
 */

export type {
  AttachedRoster,
  BattleAgenda,
  BattleParticipantInline,
  BattleUnitFielded,
  Crusade,
  CrusadePlayer,
  CrusadePlayerStatus,
  CrusadeSettings,
  GMAssignment,
  GoogleUser,
  InlineBattle,
  PackContent,
  PackCounter,
  PackTrackerItem,
  PackState,
  CrusadeTrackerSet,
  CrusadePhase,
  PlannedBattle,
  PlayerGroup,
} from "@/lib/schemas/crusade";

export type {
  AppliedOoAEntry,
  BattleHonour,
  BattleScar,
  BlessingOrBurden,
  CrusadeCard,
  PendingPromotion,
  PlayerRoster,
  Rank,
  RequisitionEntry,
  RosterAttachment,
  RosterMirror,
} from "@/lib/schemas/roster";

export type {
  Battle,
  BattleParticipant,
  BattlePlayerData,
  BattleStatus,
  BattleUnit,
} from "@/lib/schemas/battle";

export type {
  ChangeAction,
  ChangelogEntry,
  PlayerChangelog,
} from "@/lib/schemas/changelog";

