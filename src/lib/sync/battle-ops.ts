/**
 * Battle ops. A battle's header, including the result its creator
 * declared, lives in the creator's tab of the crusade sheet; each
 * participant's units and their confirmation of the result live in
 * their own tab. The codec stitches them into `Crusade.battles[]`.
 *
 * Lifecycle: draft (no result yet) → pending (result declared,
 * awaiting the other players) → verified (everyone confirmed). Only
 * then can each player apply XP to their own roster.
 *
 * Apply-results writes XP and tally updates to the canonical roster
 * (per-player), then a background mirror push propagates them into every
 * crusade the roster is attached to.
 */

import { uuid } from "@/lib/utils/id";
import { getCrusade } from "@/lib/db/crusades";
import { getRankForXP, reachesTopRanks } from "@/lib/utils/xp";
import { mutateCrusade } from "./crusade-ops";
import { locate, persist, schedulePushMirrors, undoVoidedBattles } from "./roster-ops";
import type {
  BattleParticipantInline,
  Crusade,
  CrusadeCard,
  InlineBattle,
  PlayerRoster,
} from "@/types";

// ── Create ────────────────────────────────────────────────────────

export interface CreateBattleInput {
  missionName: string;
  date: string; // ISO date
  pointsLevel: number;
  battleSize: "Incursion" | "Strike Force" | "Onslaught" | "Custom";
  /** Google IDs of participants. Each must be a player on the crusade
   *  with an attached roster. */
  participantGoogleIds: string[];
}

export async function createBattle(
  crusadeId: string,
  creatorGoogleId: string,
  input: CreateBattleInput,
): Promise<{ crusade: Crusade; battle: InlineBattle }> {
  const crusade = await getCrusade(crusadeId);
  if (!crusade) throw new Error(`Crusade ${crusadeId} not found locally`);

  // Battle creation can be GM-only (crusade settings). The UI hides
  // the button, but guard the op too.
  const creator = crusade.players.find(
    (p) => p.user.googleId === creatorGoogleId,
  );
  if (
    creator?.role !== "gm" &&
    crusade.settings.allowPlayerBattleCreation === false
  ) {
    throw new Error(
      "Only the GM can record battles in this crusade (crusade setting).",
    );
  }

  // Build participants by looking up attached rosters for each id.
  const participants: BattleParticipantInline[] =
    input.participantGoogleIds.map((googleId) => {
      const attached = (crusade.attachedRosters ?? []).find(
        (a) => a.player.googleId === googleId,
      );
      if (!attached) {
        throw new Error(
          `Player ${googleId} has no attached roster in this crusade.`,
        );
      }
      return {
        googleId,
        displayName:
          crusade.players.find((p) => p.user.googleId === googleId)?.user
            .displayName ?? attached.player.displayName,
        rosterId: attached.id,
        outcome: "unset" as const,
        victoryPoints: 0,
        unitsFielded: [],
        agendas: [],
        notes: "",
        confirmed: false,
        appliedResults: false,
      };
    });

  if (participants.length < 2) {
    throw new Error("A battle needs at least 2 participants.");
  }

  const now = new Date().toISOString();
  const battle: InlineBattle = {
    id: uuid(),
    missionName: input.missionName,
    date: input.date,
    pointsLevel: input.pointsLevel,
    battleSize: input.battleSize,
    participants,
    status: "draft",
    createdBy: creatorGoogleId,
    createdAt: now,
    updatedAt: now,
    notes: "",
  };

  const updated = await mutateCrusade(crusadeId, (live) => ({
    ...live,
    battles: [...(live.battles ?? []), battle],
  }));

  return { crusade: updated, battle };
}

// ── Update a participant's record ─────────────────────────────────

/**
 * What a participant records about their own side. The result (who
 * won, victory points) and its confirmation are NOT part of this,
 * see declareBattleResult / confirmBattleResult.
 */
export type ParticipantPatch = Partial<
  Pick<BattleParticipantInline, "unitsFielded" | "agendas" | "notes" | "logUrl" | "rewards" | "rewardsAt">
>;

export async function updateBattleParticipant(
  crusadeId: string,
  battleId: string,
  participantGoogleId: string,
  patch: ParticipantPatch,
): Promise<Crusade> {
  return mutateCrusade(crusadeId, (live) => ({
    ...live,
    battles: (live.battles ?? []).map((b) =>
      b.id !== battleId
        ? b
        : {
            ...b,
            participants: b.participants.map((p) =>
              p.googleId === participantGoogleId ? { ...p, ...patch } : p,
            ),
          },
    ),
  }));
}

// ── Result: declared by the creator, confirmed by everyone else ───

export interface DeclaredOutcome {
  googleId: string;
  outcome: "victory" | "defeat" | "draw" | "unset";
  victoryPoints: number;
}

/**
 * Record how the battle ended, each participant's outcome and
 * victory points. Only the battle's creator (or the GM) can: the
 * result lives in the creator's tab. Changing a result that others
 * had already confirmed puts the battle back to pending until they
 * confirm the new one.
 */
export async function declareBattleResult(
  crusadeId: string,
  battleId: string,
  outcomes: DeclaredOutcome[],
): Promise<Crusade> {
  const byId = new Map(outcomes.map((o) => [o.googleId, o]));
  return mutateCrusade(crusadeId, (live) => ({
    ...live,
    battles: (live.battles ?? []).map((b) =>
      b.id !== battleId
        ? b
        : {
            ...b,
            participants: b.participants.map((p) => {
              const o = byId.get(p.googleId);
              return o
                ? { ...p, outcome: o.outcome, victoryPoints: o.victoryPoints }
                : p;
            }),
          },
    ),
  }));
}

/**
 * A participant agrees with the declared result (who won and the
 * points). They are not vouching for anyone's unit details.
 */
export async function confirmBattleResult(
  crusadeId: string,
  battleId: string,
  participantGoogleId: string,
): Promise<Crusade> {
  return mutateCrusade(crusadeId, (live) => {
    const battle = (live.battles ?? []).find((b) => b.id === battleId);
    if (!battle) throw new Error("Battle not found.");
    if (battle.participants.some((p) => p.outcome === "unset")) {
      throw new Error("The result hasn't been entered yet.");
    }
    const me = battle.participants.find((p) => p.googleId === participantGoogleId);
    if (!me) throw new Error("You are not a participant in this battle.");
    if (me.confirmed) return live;
    return {
      ...live,
      battles: live.battles.map((b) =>
        b.id !== battleId
          ? b
          : {
              ...b,
              participants: b.participants.map((p) =>
                p.googleId === participantGoogleId
                  ? { ...p, confirmed: true, confirmedAt: new Date().toISOString() }
                  : p,
              ),
            },
      ),
    };
  });
}

export async function setBattleStatus(
  crusadeId: string,
  battleId: string,
  status: "draft" | "pending" | "verified" | "voided",
): Promise<Crusade> {
  const saved = await mutateCrusade(crusadeId, (live) => ({
    ...live,
    battles: (live.battles ?? []).map((b) =>
      b.id !== battleId
        ? b
        : { ...b, status },
    ),
  }));
  // Voiding takes my own applied results back straight away; the other
  // players' apps do the same for their forces when they next load.
  if (status === "voided") undoVoidedBattles(saved);
  return saved;
}

// ── Apply results to a canonical roster ───────────────────────────

const XP_PER_BATTLE = 1;
const XP_PER_THIRD_ENEMY = 1;
const XP_MARKED_FOR_GREATNESS = 3;
const RP_PER_BATTLE = 1;
const RP_CAP = 10;

interface AppliedSummary {
  unitId: string;
  unitName: string;
  xpAwarded: number;
  promotedTo?: string;
}

/**
 * Apply a battle's results to the player's canonical roster.
 * Idempotent, if the participant's `appliedResults` flag is already
 * set, no-ops.
 *
 * For each unit fielded:
 *   - +1 XP for participating (always)
 *   - +floor(enemiesDestroyed / 3) XP
 *   - +3 XP if marked for greatness
 *   - battlesPlayed += 1
 *   - if survived: battlesSurvived += 1
 *   - enemiesDestroyed += this battle's enemiesDestroyed
 *   - rank recomputed from new XP (capped by isCharacter)
 *
 * After updating the canonical, pushes to all attached mirrors.
 */
export async function applyBattleResults(
  crusadeId: string,
  battleId: string,
  participantGoogleId: string,
): Promise<AppliedSummary[]> {
  // 1) Read the battle record.
  const crusade = await getCrusade(crusadeId);
  if (!crusade) throw new Error(`Crusade ${crusadeId} not found locally`);
  const battle = (crusade.battles ?? []).find((b) => b.id === battleId);
  if (!battle) throw new Error("Battle not found.");
  if (battle.status === "voided") {
    throw new Error(
      "This battle is voided. Restore it before applying results.",
    );
  }
  const participant = battle.participants.find(
    (p) => p.googleId === participantGoogleId,
  );
  if (!participant) {
    throw new Error("You are not a participant in this battle.");
  }
  if (participant.appliedResults) {
    return []; // idempotent
  }
  // A player's XP and tallies come from their own units, not from who
  // won, so they don't wait for the others to confirm the result.

  // 2) Load the canonical roster (rebuilt from the crusade sheet if
  //    this device doesn't have it yet).
  const { fileId: rosterFileId, current: roster } = await locate(
    participant.rosterId,
  );

  // 3) Compute new unit states.
  const summary: AppliedSummary[] = [];
  // What each fielded unit was in this battle, kept on the battle
  // record for campaign stats.
  const unitRecord = new Map<
    string,
    Pick<
      BattleParticipantInline["unitsFielded"][number],
      "xpAwarded" | "rankBefore" | "rankAfter" | "pointsCost" | "datasheetName" | "isCharacter"
    >
  >();
  const updatedUnits: CrusadeCard[] = roster.units.map((u) => {
    const fielded = participant.unitsFielded.find((f) => f.unitId === u.id);
    if (!fielded) return u;
    if (u.appliedBattleIds.includes(battleId)) return u; // belt-and-braces

    const xpAwarded =
      XP_PER_BATTLE +
      Math.floor(fielded.enemiesDestroyed / 3) * XP_PER_THIRD_ENEMY +
      (fielded.markedForGreatness ? XP_MARKED_FOR_GREATNESS : 0) +
      (fielded.bonusXp ?? 0);

    const newXp = u.experiencePoints + xpAwarded;
    const newRank = getRankForXP(newXp, reachesTopRanks(u));
    const promoted = newRank !== u.rank;

    unitRecord.set(u.id, {
      xpAwarded,
      rankBefore: u.rank,
      rankAfter: newRank,
      pointsCost: u.pointsCost,
      datasheetName: u.datasheetName,
      isCharacter: u.isCharacter,
    });

    summary.push({
      unitId: u.id,
      unitName: u.name,
      xpAwarded,
      ...(promoted ? { promotedTo: newRank } : {}),
    });

    return {
      ...u,
      experiencePoints: newXp,
      rank: newRank,
      battlesPlayed: u.battlesPlayed + 1,
      battlesSurvived: u.battlesSurvived + (fielded.survived ? 1 : 0),
      enemiesDestroyed: u.enemiesDestroyed + fielded.enemiesDestroyed,
      appliedBattleIds: [...u.appliedBattleIds, battleId],
      updatedAt: new Date().toISOString(),
      // Promotion flag: if a CHARACTER hit a new tier that grants an
      // honour pick, surface a pendingPromotion the player can resolve
      // from the unit detail page.
      ...(promoted
        ? {
            pendingPromotion: {
              newRank,
              triggeredByBattleId: battleId,
              triggeredAt: new Date().toISOString(),
            },
          }
        : {}),
    };
  });

  // 4) Persist canonical, units + the battle's RP grant (rules: +1 RP
  //    per battle played, capped at 10).
  const updatedRoster: PlayerRoster = {
    ...roster,
    units: updatedUnits,
    // If an earlier attempt saved the roster but failed before marking
    // the battle applied, the units already carry this battle: don't
    // grant the Requisition point twice.
    requisitionPoints: roster.units.some((u) => u.appliedBattleIds.includes(battleId))
      ? roster.requisitionPoints
      : Math.min(RP_CAP, roster.requisitionPoints + RP_PER_BATTLE),
  };
  await persist(rosterFileId, updatedRoster);

  // 5) Mark the battle participant as applied (idempotency flag).
  await mutateCrusade(crusadeId, (live) => ({
    ...live,
    battles: (live.battles ?? []).map((b) =>
      b.id !== battleId
        ? b
        : {
            ...b,
            participants: b.participants.map((p) =>
              p.googleId === participantGoogleId
                ? {
                    ...p,
                    appliedResults: true,
                    unitsFielded: p.unitsFielded.map((f) => ({
                      ...f,
                      ...unitRecord.get(f.unitId),
                    })),
                    forceSnapshot: {
                      factionName: updatedRoster.factionName,
                      supplyUsed: updatedRoster.supplyUsed,
                      supplyLimit: updatedRoster.supplyLimit,
                      crusadePoints: updatedRoster.crusadePoints,
                      requisitionPoints: updatedRoster.requisitionPoints,
                      unitCount: updatedRoster.units.length,
                      at: new Date().toISOString(),
                    },
                  }
                : p,
            ),
          },
    ),
  }));

  // 6) Push to mirrors so other crusades see the new state.
  schedulePushMirrors(participant.rosterId);

  return summary;
}
