/**
 * Roster ops.
 *
 * A roster's working copy ("canonical") lives in this browser's
 * IndexedDB. When it is attached to a crusade, a full copy ("mirror")
 * is written to the player's own tab in that crusade's spreadsheet,
 * and every later edit is pushed there in the background. The sheet
 * copy is the durable one: on a new device, or after clearing browser
 * data, the canonical is rebuilt from it (`restoreMyRosters`).
 *
 * A roster belongs to at most ONE crusade, and a player has one
 * roster per crusade (attachRosterToCrusade enforces both). A roster
 * that is not attached to any crusade exists only on this device.
 *
 * Two devices: whichever pushed last wins. A device adopts the sheet
 * copy when it is newer than what it last pushed or pulled and it has
 * no unpushed edits of its own (`adoptNewerMirrors`).
 */

import {
  mergeTrackerEdit,
  readTrackerState,
  writeTrackerState,
} from "@/components/common/tracker-state";
import { planImport, type ImportedUnit } from "@/lib/import/roster-import";
import { uuid } from "@/lib/utils/id";
import {
  isCrusadeGone,
  mutateCrusade,
  revalidateCrusade,
} from "./crusade-ops";
import {
  getRosterRowByRosterId,
  listRostersByOwner,
  listUnsavedRosterRows,
  putRoster,
  setRosterClash,
} from "@/lib/db/rosters";
import { playerRosterSchema } from "@/lib/schemas/roster";
import { getRankForXP, reachesTopRanks } from "@/lib/utils/xp";
import { honourCap } from "@/lib/utils/crusade-points";
import { validateRelicTier } from "@/lib/utils/validation";
import {
  CORE_REQUISITIONS,
  RP_CAP,
  type RequisitionDef,
} from "@/lib/utils/requisitions";
import { useAppStore } from "@/stores/app-store";
import { useSyncStatus } from "@/stores/sync-status";
import type {
  AttachedRoster,
  Crusade,
  CrusadeCard,
  GoogleUser,
  PlayerRoster,
  RosterAttachment,
} from "@/types";
import { db } from "@/lib/db/dexie";
import { listCrusades } from "@/lib/db/crusades";
import { removeBattleFromRoster } from "@/lib/utils/battle-undo";

// ── Read ──────────────────────────────────────────────────────────

/** List the user's rosters from Dexie. */
export async function listMyRosters(player: GoogleUser): Promise<PlayerRoster[]> {
  return listRostersByOwner(player.googleId);
}

/** Turn a crusade's copy of a roster back into a canonical roster. */
function canonicalFromMirror(
  mirror: AttachedRoster,
  attachedTo: RosterAttachment[],
): PlayerRoster {
  const {
    attachedAt: _a,
    lastSyncedAt: _l,
    canonicalFileId: _c,
    crusadeBanner: _b,
    rev: _r,
    revBy: _rb,
    ...roster
  } = mirror;
  void _a; void _l; void _c; void _b; void _r; void _rb;
  return playerRosterSchema.parse({ ...roster, attachedTo });
}

/** Every copy of my rosters across the crusades this device knows. */
async function myMirrors(
  googleId: string,
): Promise<Map<string, { crusadeId: string; mirror: AttachedRoster }[]>> {
  const out = new Map<string, { crusadeId: string; mirror: AttachedRoster }[]>();
  for (const row of await db.crusades.toArray()) {
    for (const mirror of row.payload.attachedRosters ?? []) {
      if (mirror.player.googleId !== googleId) continue;
      const list = out.get(mirror.id) ?? [];
      list.push({ crusadeId: row.crusadeId, mirror });
      out.set(mirror.id, list);
    }
  }
  return out;
}

function attachmentsOf(
  copies: { crusadeId: string; mirror: AttachedRoster }[],
): RosterAttachment[] {
  return copies.map(({ crusadeId, mirror }) => ({
    crusadeId,
    mirrorFileId: crusadeId,
    attachedAt: mirror.attachedAt,
    crusadeBanner: mirror.crusadeBanner ?? "",
  }));
}

const newest = (copies: { mirror: AttachedRoster }[]) =>
  copies.reduce((a, b) => {
    const ra = a.mirror.rev ?? 0;
    const rb = b.mirror.rev ?? 0;
    if (ra !== rb) return rb > ra ? b : a;
    return b.mirror.lastSyncedAt > a.mirror.lastSyncedAt ? b : a;
  });

/** A random id for this browser, so a device can recognise its own writes. */
function deviceId(): string {
  const KEY = "opencrusade-device";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "device";
  }
}

/** The sheet copy was written by someone else since this device last saw it. */
function changedElsewhere(mirror: AttachedRoster, knownRev: number): boolean {
  return (mirror.rev ?? 0) > knownRev && mirror.revBy !== deviceId();
}

class RosterClash extends Error {}

/** Recount what is waiting to be saved, for the footer and banners. */
export async function refreshSyncCounts(): Promise<void> {
  const me = useAppStore.getState().user;
  if (!me) return useSyncStatus.getState().setCounts(0, []);
  const rows = await listUnsavedRosterRows(me.googleId);
  useSyncStatus.getState().setCounts(
    rows.length,
    rows.filter((r) => r.clash).map((r) => r.rosterId),
  );
}

/**
 * Try again to save every force with edits that have not reached its
 * sheet. Run when the app starts, when the connection returns and
 * after reconnecting to Google.
 */
export async function pushUnsavedRosters(): Promise<void> {
  const me = useAppStore.getState().user;
  if (!me) return;
  const rows = await listUnsavedRosterRows(me.googleId);
  for (const row of rows) if (!row.clash) schedulePushMirrors(row.rosterId);
  await refreshSyncCounts();
}

/**
 * Settle a force that was changed both on this device and elsewhere.
 * "mine" overwrites the sheet with this device's version; "theirs"
 * drops this device's unsaved edits and takes the sheet's version.
 */
export async function resolveRosterClash(
  rosterId: string,
  keep: "mine" | "theirs",
): Promise<void> {
  const row = await getRosterRowByRosterId(rosterId);
  if (!row) return;
  const me = useAppStore.getState().user;
  if (!me) return;
  const copies = (await myMirrors(me.googleId)).get(rosterId) ?? [];
  if (keep === "theirs" && copies.length > 0) {
    const { mirror } = newest(copies);
    await putRoster(row.fileId, canonicalFromMirror(mirror, row.payload.attachedTo ?? []), {
      fromRemote: true,
      modifiedTime: mirror.lastSyncedAt,
      rev: mirror.rev ?? 0,
    });
  } else {
    // Treat the sheet's current revision as seen, then save over it.
    const seen = Math.max(row.rev ?? 0, ...copies.map((c) => c.mirror.rev ?? 0));
    await db.rosters.update(row.fileId, { rev: seen, clash: false });
    schedulePushMirrors(rosterId);
  }
  await refreshSyncCounts();
}

/**
 * Rebuild any of my rosters that exist in a crusade sheet but not on
 * this device (new device, cleared browser data). Reads only what is
 * already in Dexie, open the crusade first.
 */
export async function restoreMyRosters(): Promise<PlayerRoster[]> {
  const me = useAppStore.getState().user;
  if (!me) return [];
  const restored: PlayerRoster[] = [];
  for (const [rosterId, copies] of await myMirrors(me.googleId)) {
    if (await getRosterRowByRosterId(rosterId)) continue;
    const { mirror } = newest(copies);
    const roster = canonicalFromMirror(mirror, attachmentsOf(copies));
    await putRoster(rosterId, roster, {
      fromRemote: true,
      modifiedTime: mirror.lastSyncedAt,
      rev: mirror.rev ?? 0,
    });
    restored.push(roster);
  }
  return restored;
}

/**
 * After reading a crusade: if its copy of one of my rosters is newer
 * than what this device last pushed or pulled, and this device has no
 * unpushed edits, take the sheet's copy. This is how a second device
 * picks up changes made on the first. Also restores rosters this
 * device has never seen.
 */
export async function adoptNewerMirrors(crusade: Crusade): Promise<void> {
  const me = useAppStore.getState().user;
  if (!me) return;
  for (const mirror of crusade.attachedRosters ?? []) {
    if (mirror.player.googleId !== me.googleId) continue;
    const row = await getRosterRowByRosterId(mirror.id);
    if (!row) {
      await restoreMyRosters();
      continue;
    }
    // Only the campaign this force was attached to (by its owner, on
    // purpose) may update it. Any other sheet that happens to carry a
    // copy, such as one opened from a link, is ignored.
    if (!(row.payload.attachedTo ?? []).some((a) => a.crusadeId === crusade.id)) continue;
    if (pushRuns.get(mirror.id)?.running) continue;
    if (row.clash) continue;
    const knownRev = row.rev ?? 0;
    const mirrorRev = mirror.rev ?? 0;
    if (row.dirty) {
      if (changedElsewhere(mirror, knownRev)) {
        // Edited here AND changed elsewhere (another device, or the
        // GM). Neither copy is thrown away: the player chooses.
        await setRosterClash(row.fileId, true);
        void refreshSyncCounts();
        continue;
      }
      // Edits made here never reached the sheet (tab closed mid-save,
      // or we were offline). This device is ahead, push, don't adopt.
      schedulePushMirrors(mirror.id);
      continue;
    }
    // Copies written before revisions existed fall back to the stamp.
    const newer =
      mirrorRev > knownRev ||
      (mirrorRev === 0 &&
        knownRev === 0 &&
        (!row.modifiedTime || mirror.lastSyncedAt > row.modifiedTime));
    if (!newer) continue;
    const attachedTo = row.payload.attachedTo ?? [];
    await putRoster(row.fileId, canonicalFromMirror(mirror, attachedTo), {
      fromRemote: true,
      modifiedTime: mirror.lastSyncedAt,
      rev: mirrorRev,
    });
  }
}

const undoing = new Set<string>();

/**
 * After reading a crusade: if a battle I applied has since been
 * voided, take its results back off my force and clear my "applied"
 * mark so they can be applied again if the battle is restored. Each
 * player's own app does this for their own force. Runs in the
 * background; safe to call repeatedly.
 */
export function undoVoidedBattles(crusade: Crusade): void {
  const me = useAppStore.getState().user;
  if (!me) return;
  for (const battle of crusade.battles ?? []) {
    if (battle.status !== "voided") continue;
    const mine = battle.participants.find((p) => p.googleId === me.googleId);
    if (!mine || undoing.has(battle.id)) continue;
    undoing.add(battle.id);
    void (async () => {
      try {
        const row = await getRosterRowByRosterId(mine.rosterId);
        // Only the campaign this force belongs to can take results
        // back off it.
        const here = (row?.payload.attachedTo ?? []).some(
          (a) => a.crusadeId === crusade.id,
        );
        const onRoster =
          here &&
          row?.payload.units.some((u) => u.appliedBattleIds.includes(battle.id));
        if (row && onRoster) {
          await persist(row.fileId, removeBattleFromRoster(row.payload, battle.id, mine));
          schedulePushMirrors(mine.rosterId);
        }
        if (row && mine.appliedResults) {
          await mutateCrusade(crusade.id, (live) => ({
            ...live,
            battles: (live.battles ?? []).map((b) =>
              b.id !== battle.id || b.status !== "voided"
                ? b
                : {
                    ...b,
                    participants: b.participants.map((p) =>
                      p.googleId === me.googleId ? { ...p, appliedResults: false } : p,
                    ),
                  },
            ),
          }));
        }
      } catch (err) {
        console.warn("[undoVoidedBattles] failed", err);
      } finally {
        undoing.delete(battle.id);
      }
    })();
  }
}

// ── Create ────────────────────────────────────────────────────────

export interface CreateRosterInput {
  /** Roster display name (often the faction or the force's name). */
  name: string;
  factionName: string;
  factionId?: string;
}

/**
 * Create a roster on this device. It reaches Google only when it is
 * attached to a crusade.
 */
export async function createRoster(
  input: CreateRosterInput,
  player: GoogleUser,
): Promise<PlayerRoster> {
  const rosterId = uuid();
  const payload: PlayerRoster = playerRosterSchema.parse({
    id: rosterId,
    player,
    factionName: input.factionName,
    ...(input.factionId ? { factionId: input.factionId } : {}),
    supplyUsed: 0,
    supplyLimit: 1000,
    requisitionPoints: 0,
    crusadePoints: 0,
    units: [],
    requisitionLog: [],
    appliedGmAssignments: [],
    attachedTo: [],
  });
  await putRoster(rosterId, payload, { fromRemote: true });
  return payload;
}

/**
 * Refresh whatever backs this roster. Mine: re-read the crusades it is
 * attached to (which adopts a newer sheet copy). Someone else's: it
 * only exists as a crusade's copy, so re-read those crusades.
 */
export async function revalidateRoster(rosterId: string): Promise<void> {
  try {
    const row = await getRosterRowByRosterId(rosterId);
    const crusadeIds = new Set(
      (row?.payload.attachedTo ?? []).map((a) => a.crusadeId),
    );
    if (!row) {
      for (const c of await db.crusades.toArray()) {
        if ((c.payload.attachedRosters ?? []).some((a) => a.id === rosterId)) {
          crusadeIds.add(c.crusadeId);
        }
      }
    }
    await Promise.all([...crusadeIds].map((id) => revalidateCrusade(id)));
    if (!row) await restoreMyRosters();
  } catch (err) {
    console.warn("[revalidateRoster] failed", err);
  }
}

// ── Mutations (faction, units) ────────────────────────────────────

export interface AddUnitInput {
  name: string;
  datasheetName: string;
  pointsCost: number;
  modelCount: number;
  isCharacter: boolean;
  notes?: string;
  equipment?: string[];
  /** The unit's id in the list it was imported from. */
  sourceId?: string;
}

export async function setFaction(
  rosterId: string,
  factionName: string,
  factionId?: string,
  colour?: string,
): Promise<PlayerRoster> {
  const { fileId, current } = await locate(rosterId);
  const updated: PlayerRoster = {
    ...current,
    factionName,
    ...(factionId ? { factionId } : {}),
    ...(colour ? { colour } : {}),
  };
  await persist(fileId, updated);
  schedulePushMirrors(rosterId);
  return updated;
}

function newCard(input: AddUnitInput, now: string): CrusadeCard {
  return {
    id: uuid(),
    name: input.name,
    ...(input.sourceId ? { importId: input.sourceId } : {}),
    datasheetName: input.datasheetName,
    pointsCost: input.pointsCost,
    modelCount: input.modelCount,
    experiencePoints: 0,
    rank: getRankForXP(0, input.isCharacter),
    crusadePoints: 0,
    battlesPlayed: 0,
    battlesSurvived: 0,
    enemiesDestroyed: 0,
    battleHonours: [],
    battleScars: [],
    blessings: [],
    burdens: [],
    equipment: input.equipment ?? [],
    notes: input.notes ?? "",
    isCharacter: input.isCharacter,
    honourCapRaised: false,
    createdAt: now,
    updatedAt: now,
    appliedBattleIds: [],
    appliedOoA: [],
  };
}

export async function addUnit(
  rosterId: string,
  input: AddUnitInput,
): Promise<PlayerRoster> {
  return addUnits(rosterId, [input]);
}

/** Add several units in one save (roster import). */
export async function addUnits(
  rosterId: string,
  inputs: AddUnitInput[],
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const now = new Date().toISOString();
    const units = [...current.units, ...inputs.map((i) => newCard(i, now))];
    if (units.length > 200) {
      throw new Error("A roster holds at most 200 units.");
    }
    const updated: PlayerRoster = {
      ...current,
      units,
      supplyUsed: units.reduce((s, u) => s + u.pointsCost, 0),
    };
    return updated;
  });
}

/**
 * Re-import an army list onto a force: units the list shares with the
 * force get its points, models, datasheet and wargear, and keep all
 * their crusade progress; the rest of the list is added as new units.
 * Units the list doesn't mention are left alone.
 */
export async function updateUnitsFromList(
  rosterId: string,
  incoming: ImportedUnit[],
): Promise<PlayerRoster> {
  const { fileId, current } = await locate(rosterId);
  const now = new Date().toISOString();
  const plan = planImport(current.units, incoming);
  const byId = new Map(plan.updates.map((u) => [u.existing.id, u.incoming]));
  const units = [
    ...current.units.map((u) => {
      const list = byId.get(u.id);
      if (!list) return u;
      return {
        ...u,
        // A name the player gave in the list wins; otherwise keep ours.
        name: list.named ? list.name : u.name,
        datasheetName: list.datasheetName,
        pointsCost: list.pointsCost,
        modelCount: list.modelCount,
        equipment: list.equipment,
        ...(list.sourceId ? { importId: list.sourceId } : {}),
        updatedAt: now,
      };
    }),
    ...plan.additions.map((i) => newCard(i, now)),
  ];
  if (units.length > 200) throw new Error("A roster holds at most 200 units.");
  const updated: PlayerRoster = {
    ...current,
    units,
    supplyUsed: units.reduce((s, u) => s + u.pointsCost, 0),
  };
  await persist(fileId, updated);
  schedulePushMirrors(rosterId);
  return updated;
}

export async function removeUnit(
  rosterId: string,
  unitId: string,
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const units = current.units.filter((u) => u.id !== unitId);
    const updated: PlayerRoster = {
      ...current,
      units,
      supplyUsed: units.reduce((s, u) => s + u.pointsCost, 0),
    };
    return updated;
  });
}

// ── Unit-level mutations (for the crusade card detail page) ───────

function mapUnit(
  current: PlayerRoster,
  unitId: string,
  fn: (u: CrusadeCard) => CrusadeCard,
): PlayerRoster {
  const now = new Date().toISOString();
  return {
    ...current,
    units: current.units.map((u) =>
      u.id === unitId ? { ...fn(u), updatedAt: now } : u,
    ),
  };
}

/** Adjust a unit's XP by a delta. Recomputes rank from the new total. */
export async function adjustUnitXp(
  rosterId: string,
  unitId: string,
  delta: number,
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const updated = mapUnit(current, unitId, (u) => {
      const xp = Math.max(0, u.experiencePoints + delta);
      return {
        ...u,
        experiencePoints: xp,
        rank: getRankForXP(xp, reachesTopRanks(u)),
      };
    });
    return updated;
  });
}

export interface AwardHonourInput {
  type: "battle-trait" | "weapon-modification" | "crusade-relic";
  name: string;
  rules: string;
  source?: "core" | "faction" | "pack" | "custom";
  targetWeapon?: string;
  relicTier?: "artificer" | "antiquity" | "legendary";
  relicCrusadePointsCost?: number;
}

export async function awardHonour(
  rosterId: string,
  unitId: string,
  input: AwardHonourInput,
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const honour = {
      id: uuid(),
      type: input.type,
      name: input.name,
      rules: input.rules,
      source: input.source ?? "custom",
      ...(input.targetWeapon ? { targetWeapon: input.targetWeapon } : {}),
      ...(input.relicTier ? { relicTier: input.relicTier } : {}),
      ...(input.relicCrusadePointsCost !== undefined
        ? { relicCrusadePointsCost: input.relicCrusadePointsCost }
        : {}),
      awardedAt: new Date().toISOString(),
    };
    const updated = mapUnit(current, unitId, (u) => {
      const cap = honourCap(u);
      if (u.battleHonours.length >= cap) {
        throw new Error(
          `Unit at honour cap (${cap}/${cap}). Remove one before awarding another.`,
        );
      }
      // Relic tiers gate on rank (Antiquity needs Heroic+, Legendary
      // needs Legendary rank).
      if (input.type === "crusade-relic" && input.relicTier) {
        const check = validateRelicTier(input.relicTier, u.rank);
        if (!check.valid) throw new Error(check.reason);
      }
      const cpCost = input.relicCrusadePointsCost ?? 0;
      // Awarding an honour resolves any pending promotion, the honour
      // pick IS the promotion reward.
      const { pendingPromotion: _resolved, ...rest } = u;
      void _resolved;
      return {
        ...rest,
        battleHonours: [...u.battleHonours, honour],
        crusadePoints: u.crusadePoints + cpCost,
      };
    });
    return updated;
  });
}

export async function removeHonour(
  rosterId: string,
  unitId: string,
  honourId: string,
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const updated = mapUnit(current, unitId, (u) => {
      const removed = u.battleHonours.find((h) => h.id === honourId);
      return {
        ...u,
        battleHonours: u.battleHonours.filter((h) => h.id !== honourId),
        crusadePoints: Math.max(
          0,
          u.crusadePoints - (removed?.relicCrusadePointsCost ?? 0),
        ),
      };
    });
    return updated;
  });
}

export interface ApplyScarInput {
  name: string;
  rules: string;
}

export async function applyScar(
  rosterId: string,
  unitId: string,
  input: ApplyScarInput,
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const scar = {
      id: uuid(),
      name: input.name,
      rules: input.rules,
      receivedAt: new Date().toISOString(),
    };
    const updated = mapUnit(current, unitId, (u) => ({
      ...u,
      battleScars: [...u.battleScars, scar],
    }));
    return updated;
  });
}

export async function removeScar(
  rosterId: string,
  unitId: string,
  scarId: string,
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const updated = mapUnit(current, unitId, (u) => ({
      ...u,
      battleScars: u.battleScars.filter((s) => s.id !== scarId),
    }));
    return updated;
  });
}

export interface UnitBasics {
  name: string;
  datasheetName: string;
  pointsCost: number;
  modelCount: number;
  isCharacter: boolean;
}

/** Change what a unit is: its name, datasheet, size and points. */
export async function updateUnitBasics(
  rosterId: string,
  unitId: string,
  basics: UnitBasics,
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const name = basics.name.trim();
    if (!name) throw new Error("A unit needs a name.");
    const mapped = mapUnit(current, unitId, (u) => ({
      ...u,
      name,
      datasheetName: basics.datasheetName.trim(),
      pointsCost: Math.max(0, Math.round(basics.pointsCost)),
      modelCount: Math.max(0, Math.round(basics.modelCount)),
      isCharacter: basics.isCharacter,
      // Characters and other units rank up on different limits.
      rank: getRankForXP(
        u.experiencePoints,
        reachesTopRanks({ ...u, isCharacter: basics.isCharacter }),
      ),
    }));
    return {
      ...mapped,
      supplyUsed: mapped.units.reduce((s, u) => s + u.pointsCost, 0),
    };
  });
}

/** Battle Honours earned from mission rewards (not from ranking up). */
export async function setBonusHonours(
  rosterId: string,
  unitId: string,
  count: number,
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) =>
    mapUnit(current, unitId, (u) => ({
      ...u,
      bonusHonours: Math.max(0, Math.min(6, Math.round(count))),
    })),
  );
}

export async function updateUnitNotes(
  rosterId: string,
  unitId: string,
  notes: string,
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const updated = mapUnit(current, unitId, (u) => ({ ...u, notes }));
    return updated;
  });
}

/**
 * Resolve an Out of Action test for a unit (spec US5/FR-066).
 *
 * The player rolls a d6 (physical or via the UI). On a 1 they choose:
 * lose a battle honour OR gain a battle scar. Other rolls: no effect.
 * The resolution is recorded in the unit's `appliedOoA[]` so the
 * battle page can show it as settled. Idempotent per battle.
 */
export interface ResolveOoAInput {
  battleId: string;
  rolled: number; // 1-6
  outcome: "none" | "scar-gained" | "honour-lost";
  /** For scar-gained: the scar to apply. */
  scar?: { name: string; rules: string };
  /** For honour-lost: the honour id to remove. */
  honourId?: string;
}

export async function resolveOoA(
  rosterId: string,
  unitId: string,
  input: ResolveOoAInput,
): Promise<PlayerRoster> {
  const { fileId, current } = await locate(rosterId);

  const unit = current.units.find((u) => u.id === unitId);
  if (!unit) throw new Error("Unit not found.");
  if (unit.appliedOoA.some((e) => e.battleId === input.battleId)) {
    return current; // already resolved for this battle, idempotent
  }
  if (input.rolled < 1 || input.rolled > 6) {
    throw new Error("Roll must be 1-6.");
  }
  if (input.outcome === "scar-gained" && !input.scar?.name) {
    throw new Error("Scar details required.");
  }
  if (input.outcome === "honour-lost" && !input.honourId) {
    throw new Error("Pick which honour to lose.");
  }

  const entry = {
    battleId: input.battleId,
    rolled: input.rolled,
    outcome: input.outcome,
    resolvedAt: new Date().toISOString(),
    ...(input.honourId ? { affectedItemId: input.honourId } : {}),
  };

  const updated = mapUnit(current, unitId, (u) => {
    let next = { ...u, appliedOoA: [...u.appliedOoA, entry] };
    if (input.outcome === "scar-gained" && input.scar) {
      next = {
        ...next,
        battleScars: [
          ...next.battleScars,
          {
            id: uuid(),
            name: input.scar.name,
            rules: input.scar.rules,
            receivedAt: new Date().toISOString(),
            receivedFromBattleId: input.battleId,
          },
        ],
      };
    }
    if (input.outcome === "honour-lost" && input.honourId) {
      const removed = next.battleHonours.find(
        (h) => h.id === input.honourId,
      );
      next = {
        ...next,
        battleHonours: next.battleHonours.filter(
          (h) => h.id !== input.honourId,
        ),
        crusadePoints: Math.max(
          0,
          next.crusadePoints - (removed?.relicCrusadePointsCost ?? 0),
        ),
      };
    }
    return next;
  });

  await persist(fileId, updated);
  schedulePushMirrors(rosterId);
  return updated;
}

/**
 * Manual RP adjust (bookkeeping escape hatch). Clamped to [0, RP_CAP].
 */
export async function adjustRequisitionPoints(
  rosterId: string,
  delta: number,
): Promise<PlayerRoster> {
  const { fileId, current } = await locate(rosterId);
  const updated: PlayerRoster = {
    ...current,
    requisitionPoints: Math.min(
      RP_CAP,
      Math.max(0, current.requisitionPoints + delta),
    ),
  };
  await persist(fileId, updated);
  schedulePushMirrors(rosterId);
  return updated;
}

// ── Requisitions ──────────────────────────────────────────────────

export interface SpendRequisitionInput {
  requisitionId: string;
  /** For pick-unit / pick-scar effects. */
  unitId?: string;
  /** For remove-scar. */
  scarId?: string;
  /** Player note (required for log-only requisitions). */
  note?: string;
}

/**
 * Spend RP on a requisition. Validates affordability, applies the
 * deterministic effect (supply increase, cap raise, scar removal),
 * deducts RP, appends the requisition log, and pushes mirrors.
 *
 * `grant-honour-pick` doesn't award the honour here, it validates
 * the target is a CHARACTER with a free slot and logs the spend; the
 * UI then routes the player into the award-honour dialog.
 */
export async function spendRequisition(
  rosterId: string,
  input: SpendRequisitionInput,
): Promise<{ roster: PlayerRoster; def: RequisitionDef }> {
  const def = CORE_REQUISITIONS.find((r) => r.id === input.requisitionId);
  if (!def) throw new Error(`Unknown requisition ${input.requisitionId}`);

  const { fileId, current } = await locate(rosterId);
  if (current.requisitionPoints < def.cost) {
    throw new Error(
      `Not enough RP (${current.requisitionPoints}/${def.cost}).`,
    );
  }

  const unit = input.unitId
    ? current.units.find((u) => u.id === input.unitId)
    : undefined;

  let next: PlayerRoster = current;

  switch (def.effect.kind) {
    case "auto": {
      // increase-supply
      next = {
        ...next,
        supplyLimit: next.supplyLimit + def.effect.amount,
      };
      break;
    }
    case "pick-unit": {
      if (!unit) throw new Error("Pick a unit first.");
      if (def.effect.apply === "raise-honour-cap") {
        if (unit.isCharacter) {
          throw new Error(
            "Legendary Veterans targets non-CHARACTER units (characters already cap at 6).",
          );
        }
        if (unit.honourCapRaised) {
          throw new Error("This unit's honour cap is already raised.");
        }
        next = mapUnit(next, unit.id, (u) => ({
          ...u,
          honourCapRaised: true,
          // The unit can now rise to Heroic and Legendary; it may
          // already have the XP for it.
          rank: getRankForXP(u.experiencePoints, true),
        }));
      } else {
        // grant-honour-pick (Renowned Heroes)
        if (!unit.isCharacter) {
          throw new Error("Renowned Heroes targets a CHARACTER.");
        }
        if (unit.battleHonours.length >= honourCap(unit)) {
          throw new Error("That character is already at their honour cap.");
        }
        // Effect completes in the UI via the award-honour dialog.
      }
      break;
    }
    case "pick-scar": {
      if (!unit) throw new Error("Pick a unit first.");
      if (!input.scarId) throw new Error("Pick which scar to remove.");
      if (!unit.battleScars.some((s) => s.id === input.scarId)) {
        throw new Error("That scar isn't on this unit.");
      }
      next = mapUnit(next, unit.id, (u) => ({
        ...u,
        battleScars: u.battleScars.filter((s) => s.id !== input.scarId),
      }));
      break;
    }
    case "log-only": {
      if (!input.note?.trim()) {
        throw new Error("Describe what this requisition did.");
      }
      break;
    }
  }

  next = {
    ...next,
    requisitionPoints: next.requisitionPoints - def.cost,
    requisitionLog: [
      ...next.requisitionLog,
      {
        id: uuid(),
        requisitionId: def.id,
        name: def.name,
        rpCost: def.cost,
        ...(input.unitId ? { targetUnitId: input.unitId } : {}),
        description: input.note?.trim() || def.summary,
        appliedAt: new Date().toISOString(),
      },
    ],
  };

  await persist(fileId, next);
  schedulePushMirrors(rosterId);
  return { roster: next, def };
}

/**
 * Take back a spent requisition: refund its RP, drop it from the log
 * and reverse what the app did for it. A supply increase and Legendary
 * Veterans are reversed; a removed scar or a picked honour is not put
 * back or taken away, since the app no longer knows what it was.
 */
export async function undoRequisition(
  rosterId: string,
  entryId: string,
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const entry = current.requisitionLog.find((r) => r.id === entryId);
    if (!entry) return current;
    const def = CORE_REQUISITIONS.find((r) => r.id === entry.requisitionId);
    let next: PlayerRoster = current;
    if (def?.effect.kind === "auto") {
      next = { ...next, supplyLimit: Math.max(0, next.supplyLimit - def.effect.amount) };
    }
    if (def?.effect.kind === "pick-unit" && def.effect.apply === "raise-honour-cap") {
      const unit = entry.targetUnitId
        ? next.units.find((u) => u.id === entry.targetUnitId)
        : undefined;
      if (unit) {
        if (unit.battleHonours.length > 3) {
          throw new Error(
            `${unit.name} holds ${unit.battleHonours.length} Battle Honours. Remove honours until it has 3 or fewer, then undo this.`,
          );
        }
        next = mapUnit(next, unit.id, (u) => ({
          ...u,
          honourCapRaised: false,
          rank: getRankForXP(u.experiencePoints, u.isCharacter),
        }));
      }
    }
    return {
      ...next,
      requisitionPoints: Math.min(RP_CAP, next.requisitionPoints + entry.rpCost),
      requisitionLog: next.requisitionLog.filter((r) => r.id !== entryId),
    };
  });
}

// ── GM assignments (blessings / burdens) ──────────────────────────

/**
 * Merge pending GM assignments into the canonical roster: append each
 * blessing/burden to the target unit and record the assignment id in
 * `appliedGmAssignments` so it's applied exactly once.
 */
export async function applyGmAssignments(
  rosterId: string,
  assignments: Array<{
    id: string;
    unitId: string;
    type: "blessing" | "burden";
    name: string;
    description: string;
    assignedBy: string;
    assignedAt: string;
  }>,
): Promise<PlayerRoster> {
  const { fileId, current } = await locate(rosterId);

  let next: PlayerRoster = current;
  const appliedIds: string[] = [];

  for (const a of assignments) {
    if (next.appliedGmAssignments.includes(a.id)) continue;
    const target = next.units.find((u) => u.id === a.unitId);
    if (!target) {
      // Unit deleted since assignment, record as applied so it stops
      // showing as pending, but nothing to attach it to.
      appliedIds.push(a.id);
      continue;
    }
    const entry = {
      id: a.id,
      name: a.name,
      description: a.description,
      source: "custom" as const,
      assignedBy: a.assignedBy,
      assignedAt: a.assignedAt,
    };
    next = mapUnit(next, a.unitId, (u) =>
      a.type === "blessing"
        ? { ...u, blessings: [...u.blessings, entry] }
        : { ...u, burdens: [...u.burdens, entry] },
    );
    appliedIds.push(a.id);
  }

  if (appliedIds.length === 0) return current;

  next = {
    ...next,
    appliedGmAssignments: [...next.appliedGmAssignments, ...appliedIds],
  };

  await persist(fileId, next);
  schedulePushMirrors(rosterId);
  return next;
}

// ── Equipment ─────────────────────────────────────────────────────

export async function updateEquipment(
  rosterId: string,
  unitId: string,
  equipment: string[],
): Promise<PlayerRoster> {
  return editRoster(rosterId, (current) => {
    const updated = mapUnit(current, unitId, (u) => ({ ...u, equipment }));
    return updated;
  });
}

// ── Faction mechanic state ────────────────────────────────────────

/**
 * GM corrects a player's trackers. The GM can't reach the player's
 * device, so this writes the crusade sheet's copy of the roster (in
 * the player's tab, which the GM may edit). The player's app takes the
 * newer copy the next time it reads the crusade, unless it has unsaved
 * edits of its own, in which case the player's version wins.
 */
export async function gmSetRosterFactionState(
  crusadeId: string,
  rosterId: string,
  /** What the GM was looking at, and what they changed it to. */
  edit: { before: Record<string, unknown> | undefined; after: Record<string, unknown> },
): Promise<Crusade> {
  const syncedAt = new Date().toISOString();
  return mutateCrusade(crusadeId, (live) => ({
    ...live,
    attachedRosters: (live.attachedRosters ?? []).map((a) => {
      if (a.id !== rosterId) return a;
      // The player may have changed things since the GM's page loaded:
      // apply only what the GM touched on top of what is stored now.
      const merged = mergeTrackerEdit(
        readTrackerState(edit.before),
        readTrackerState(edit.after),
        readTrackerState(a.factionState),
      );
      return {
        ...a,
        factionState: writeTrackerState(a.factionState, merged),
        lastSyncedAt: syncedAt,
        rev: (a.rev ?? 0) + 1,
        revBy: "gm",
      };
    }),
  }));
}

/**
 * GM corrects a player's Requisition points, on the crusade sheet's
 * copy of the roster (see gmSetRosterFactionState).
 */
export async function gmAdjustRequisitionPoints(
  crusadeId: string,
  rosterId: string,
  delta: number,
): Promise<Crusade> {
  const syncedAt = new Date().toISOString();
  return mutateCrusade(crusadeId, (live) => ({
    ...live,
    attachedRosters: (live.attachedRosters ?? []).map((a) =>
      a.id === rosterId
        ? {
            ...a,
            requisitionPoints: Math.max(0, Math.min(RP_CAP, a.requisitionPoints + delta)),
            lastSyncedAt: syncedAt,
            rev: (a.rev ?? 0) + 1,
            revBy: "gm",
          }
        : a,
    ),
  }));
}

/** Replace the roster-level faction mechanic state (module-owned). */
export async function setRosterFactionState(
  rosterId: string,
  factionState: Record<string, unknown>,
): Promise<PlayerRoster> {
  const { fileId, current } = await locate(rosterId);
  const updated: PlayerRoster = { ...current, factionState };
  await persist(fileId, updated);
  schedulePushMirrors(rosterId);
  return updated;
}

// ── Detach from crusade ───────────────────────────────────────────

/**
 * Detach a roster from a crusade: remove its rows from the crusade
 * sheet (owner or GM) and, if this device holds the canonical, drop
 * the crusade from `attachedTo`.
 */
export async function detachRosterFromCrusade(
  crusadeId: string,
  rosterId: string,
): Promise<void> {
  await mutateCrusade(crusadeId, (live) => ({
    ...live,
    attachedRosters: (live.attachedRosters ?? []).filter(
      (a) => a.id !== rosterId,
    ),
  }));

  // Canonical bookkeeping, absent when the GM detaches someone
  // else's roster, which is fine.
  const row = await getRosterRowByRosterId(rosterId);
  if (!row) return;
  await persist(row.fileId, {
    ...row.payload,
    attachedTo: (row.payload.attachedTo ?? []).filter(
      (a) => a.crusadeId !== crusadeId,
    ),
  });
}

// ── Attach / push ─────────────────────────────────────────────────

function buildAttachedRoster(
  canonical: PlayerRoster,
  meta: { attachedAt: string; crusadeBanner: string; syncedAt: string; rev: number },
): AttachedRoster {
  return {
    ...canonical,
    attachedAt: meta.attachedAt,
    lastSyncedAt: meta.syncedAt,
    canonicalFileId: canonical.id,
    crusadeBanner: meta.crusadeBanner,
    rev: meta.rev,
    revBy: deviceId(),
  };
}

/**
 * Attach a roster to a crusade: write a full copy into the player's
 * own tab in the crusade sheet. Idempotent, updates the existing copy
 * if there is one.
 */
export async function attachRosterToCrusade(
  crusadeId: string,
  rosterId: string,
): Promise<{ canonical: PlayerRoster; crusade: Crusade }> {
  const { fileId, current: roster } = await locate(rosterId);
  const syncedAt = new Date().toISOString();

  // A roster tracks exactly one crusade.
  const elsewhere = (roster.attachedTo ?? []).find(
    (a) => a.crusadeId !== crusadeId,
  );
  if (elsewhere) {
    throw new Error(
      "This roster already belongs to another crusade. A roster tracks " +
        "one crusade. Create a new roster for this one.",
    );
  }


  let joining: PlayerRoster = roster;
  const updated = await mutateCrusade(crusadeId, (live) => {
    if (!live.players.some((p) => p.user.googleId === roster.player.googleId)) {
      throw new Error(
        "Join this crusade first (open the crusade page and choose Join).",
      );
    }
    const existing = (live.attachedRosters ?? []).find(
      (a) => a.id === roster.id,
    );
    // …and a player fields one roster per crusade.
    if (
      (live.attachedRosters ?? []).some(
        (a) => a.id !== roster.id && a.player.googleId === roster.player.googleId,
      )
    ) {
      throw new Error(
        "You already have a roster in this crusade. Detach it first if " +
          "you want to replace it.",
      );
    }
    // A roster that hasn't been played yet starts with the crusade's
    // own Requisition points and supply limit.
    if (!existing && isUnplayed(roster)) {
      joining = {
        ...roster,
        requisitionPoints: Math.min(RP_CAP, live.startingRP),
        supplyLimit: live.supplyLimit,
      };
    }
    return {
      ...live,
      attachedRosters: [
        ...(live.attachedRosters ?? []).filter((a) => a.id !== roster.id),
        buildAttachedRoster(joining, {
          attachedAt: existing?.attachedAt ?? syncedAt,
          crusadeBanner: existing?.crusadeBanner ?? roster.factionName ?? "",
          syncedAt,
          rev: (existing?.rev ?? 0) + 1,
        }),
      ],
    };
  });

  const entry = (updated.attachedRosters ?? []).find((a) => a.id === roster.id);
  const attachedTo: RosterAttachment[] = [
    ...(roster.attachedTo ?? []).filter((a) => a.crusadeId !== crusadeId),
    {
      crusadeId,
      mirrorFileId: crusadeId,
      attachedAt: entry?.attachedAt ?? syncedAt,
      crusadeBanner: entry?.crusadeBanner ?? roster.factionName ?? "",
    },
  ];
  const canonical: PlayerRoster = { ...joining, attachedTo };
  await persist(fileId, canonical, { pushedAt: syncedAt, rev: entry?.rev });
  return { canonical, crusade: updated };
}

/** No battles fought and nothing spent: safe to give starting values. */
function isUnplayed(roster: PlayerRoster): boolean {
  return (
    roster.requisitionLog.length === 0 &&
    roster.units.every((u) => u.battlesPlayed === 0 && u.appliedBattleIds.length === 0)
  );
}

/**
 * Background push, serialized per roster.
 *
 * Mirrors only affect what OTHER players see on their next poll, so
 * the interactive op returns as soon as the canonical is saved and
 * the push runs here.
 *
 * Serialization matters: pushMirrors snapshots the roster from Dexie
 * at execution time, so two overlapping pushes could finish out of
 * order and regress the sheet to an older snapshot. One push runs at
 * a time per roster; edits arriving mid-push coalesce into exactly
 * one follow-up run (which reads the newest state).
 */
const pushRuns = new Map<string, { running: boolean; queued: boolean }>();

export function schedulePushMirrors(rosterId: string): void {
  const s = pushRuns.get(rosterId) ?? { running: false, queued: false };
  if (s.running) {
    s.queued = true;
    pushRuns.set(rosterId, s);
    return;
  }
  s.running = true;
  pushRuns.set(rosterId, s);
  useSyncStatus.getState().begin();
  void (async () => {
    let ok = false;
    try {
      ok = await pushMirrors(rosterId);
    } catch (err) {
      console.warn(`[schedulePushMirrors] push for ${rosterId} failed:`, err);
    } finally {
      useSyncStatus.getState().end(ok);
      void refreshSyncCounts();
      const cur = pushRuns.get(rosterId);
      if (cur) {
        cur.running = false;
        if (cur.queued) {
          cur.queued = false;
          schedulePushMirrors(rosterId);
        }
      }
    }
  })();
}

/**
 * Push the canonical roster into the crusade sheet it is attached to.
 *
 * A sheet that can't be reached (deleted, sharing removed, signed in
 * as someone else) does NOT detach the roster: the edits stay marked
 * unsaved on this device, the footer and force page say so, and the
 * player decides what to do. A copy that was changed elsewhere since
 * this device last saw it is not overwritten either; that is flagged
 * as a clash for the player to settle.
 *
 * When every push succeeds the roster is marked clean, which is what
 * lets this device later adopt a newer copy made on another device.
 * Returns false if any push failed.
 */
export async function pushMirrors(rosterId: string): Promise<boolean> {
  const row = await getRosterRowByRosterId(rosterId);
  if (!row) return true;
  if (row.clash) return false;
  const roster = row.payload;
  const attachments = roster.attachedTo ?? [];
  if (attachments.length === 0) return true;

  const syncedAt = new Date().toISOString();
  const knownRev = row.rev ?? 0;
  const gone: string[] = [];
  let failed = false;
  let clash = false;
  let writtenRev = knownRev;

  await Promise.all(
    attachments.map(async (a) => {
      try {
        await mutateCrusade(a.crusadeId, (live) => {
          const prev = (live.attachedRosters ?? []).find(
            (x) => x.id === roster.id,
          );
          if (prev && changedElsewhere(prev, knownRev)) throw new RosterClash();
          const rev = Math.max(prev?.rev ?? 0, knownRev) + 1;
          writtenRev = Math.max(writtenRev, rev);
          return {
            ...live,
            attachedRosters: [
              ...(live.attachedRosters ?? []).filter((x) => x.id !== roster.id),
              buildAttachedRoster(roster, {
                attachedAt: prev?.attachedAt ?? syncedAt,
                crusadeBanner:
                  a.crusadeBanner ?? prev?.crusadeBanner ?? roster.factionName,
                syncedAt,
                rev,
              }),
            ],
          };
        });
      } catch (err) {
        failed = true;
        if (err instanceof RosterClash) {
          clash = true;
        } else if (isCrusadeGone(err)) {
          gone.push(a.crusadeId);
        } else {
          console.warn("[pushMirrors] save to a crusade sheet failed:", err);
        }
      }
    }),
  );

  useSyncStatus.getState().setBlocked(rosterId, gone);

  // Only touch the canonical if nothing edited it while we pushed.
  const after = await getRosterRowByRosterId(rosterId);
  if (!after) return !failed;
  if (clash) await setRosterClash(after.fileId, true);
  if (after.lastWrittenAt !== row.lastWrittenAt) {
    // Edited again mid-push: remember what the sheet now holds so the
    // follow-up push doesn't mistake our own write for someone else's.
    if (!failed) await db.rosters.update(after.fileId, { rev: writtenRev });
    return !failed;
  }
  if (!failed) {
    await putRoster(after.fileId, after.payload, {
      fromRemote: true,
      modifiedTime: syncedAt,
      rev: writtenRev,
    });
  }
  return !failed;
}

/**
 * Stop saving a force to a campaign whose sheet can no longer be
 * reached. Only ever run when the player asks for it.
 */
export async function forgetUnreachableCrusade(
  rosterId: string,
  crusadeId: string,
): Promise<void> {
  const row = await getRosterRowByRosterId(rosterId);
  if (!row) return;
  const attachedTo = (row.payload.attachedTo ?? []).filter(
    (a) => a.crusadeId !== crusadeId,
  );
  await putRoster(row.fileId, { ...row.payload, attachedTo }, { fromRemote: true });
  const left = (useSyncStatus.getState().blocked[rosterId] ?? []).filter(
    (id) => id !== crusadeId,
  );
  useSyncStatus.getState().setBlocked(rosterId, left);
  await refreshSyncCounts();
}

/** Rename the per-crusade banner on an attachment. */
export async function renameAttachmentBanner(
  rosterId: string,
  crusadeId: string,
  newBanner: string,
): Promise<void> {
  await mutateCrusade(crusadeId, (live) => ({
    ...live,
    attachedRosters: (live.attachedRosters ?? []).map((entry) =>
      entry.id === rosterId ? { ...entry, crusadeBanner: newBanner } : entry,
    ),
  }));

  const row = await getRosterRowByRosterId(rosterId);
  if (!row) return; // not ours (GM renamed someone else's banner)
  await persist(row.fileId, {
    ...row.payload,
    attachedTo: (row.payload.attachedTo ?? []).map((a) =>
      a.crusadeId === crusadeId ? { ...a, crusadeBanner: newBanner } : a,
    ),
  });
}

/** Read attached rosters from a Crusade payload. */
export function listAttachedRosters(crusade: Crusade): AttachedRoster[] {
  return crusade.attachedRosters ?? [];
}

// ── Internals ─────────────────────────────────────────────────────

/**
 * Change a roster. The owner's change is saved on their device and
 * pushed to the sheet. A GM correcting another player's force can't
 * reach that player's device, so their change is applied to the
 * crusade sheet's copy as it stands right now; the player's app takes
 * that newer copy the next time it reads the crusade, unless it has
 * unsaved edits of its own, in which case the player's version wins.
 */
async function editRoster(
  rosterId: string,
  change: (current: PlayerRoster) => PlayerRoster,
): Promise<PlayerRoster> {
  const me = useAppStore.getState().user;
  const crusade = (await listCrusades()).find((c) =>
    (c.attachedRosters ?? []).some(
      (a) => a.id === rosterId && a.player.googleId !== me?.googleId,
    ),
  );
  if (!crusade) {
    const { fileId, current } = await locate(rosterId);
    const updated = change(current);
    await persist(fileId, updated);
    schedulePushMirrors(rosterId);
    return updated;
  }
  const gm = crusade.players.find((p) => p.role === "gm")?.user.googleId;
  if (!me || gm !== me.googleId) {
    throw new Error("Only this force's player or the GM can change it.");
  }
  const syncedAt = new Date().toISOString();
  const saved = await mutateCrusade(crusade.id, (live) => ({
    ...live,
    attachedRosters: (live.attachedRosters ?? []).map((a) =>
      a.id === rosterId
        ? { ...a, ...change(a), lastSyncedAt: syncedAt, rev: (a.rev ?? 0) + 1, revBy: "gm" }
        : a,
    ),
  }));
  const updated = (saved.attachedRosters ?? []).find((a) => a.id === rosterId);
  if (!updated) throw new Error("That force is no longer in the crusade.");
  return updated;
}

interface RosterLocation {
  /** Dexie primary key of the roster row (equals the roster id). */
  fileId: string;
  current: PlayerRoster;
}

/**
 * Load the canonical roster, rebuilding it from a crusade sheet copy
 * if this device doesn't have it yet.
 */
export async function locate(rosterId: string): Promise<RosterLocation> {
  let row = await getRosterRowByRosterId(rosterId);
  if (!row) {
    await restoreMyRosters();
    row = await getRosterRowByRosterId(rosterId);
  }
  if (!row) {
    throw new Error(
      "That roster isn't on this device. Open the crusade it belongs to " +
        "so it can be restored from the crusade's sheet, then retry.",
    );
  }
  return { fileId: row.fileId, current: row.payload };
}

/**
 * Save the canonical roster locally. Marks it as having unpushed
 * edits unless `pushedAt` says the sheet already holds this state.
 */
export async function persist(
  fileId: string,
  next: PlayerRoster,
  opts: { pushedAt?: string; rev?: number } = {},
): Promise<void> {
  playerRosterSchema.parse(next);
  await putRoster(
    fileId,
    next,
    opts.pushedAt
      ? { fromRemote: true, modifiedTime: opts.pushedAt, rev: opts.rev }
      : {},
  );
}
