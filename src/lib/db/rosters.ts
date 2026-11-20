import { db } from "./dexie";
import type { RosterRow } from "./types";
import type { PlayerRoster } from "@/types";

/**
 * Roster table accessor. v2.4 (2026-05-27): rosters are player-owned
 * and not crusade-scoped. Lookup keys:
 *   - `fileId`, primary key (equals the roster id)
 *   - `rosterId`, stable UUID, distinct from fileId
 *   - `ownerGoogleId`, for listing "my rosters"
 */

export async function getRosterByFileId(
  fileId: string,
): Promise<PlayerRoster | undefined> {
  const row = await db.rosters.get(fileId);
  return row?.payload;
}

export async function getRosterByRosterId(
  rosterId: string,
): Promise<PlayerRoster | undefined> {
  const row = await db.rosters.where("rosterId").equals(rosterId).first();
  return row?.payload;
}

export async function getRosterRowByRosterId(rosterId: string) {
  return db.rosters.where("rosterId").equals(rosterId).first();
}

export async function listRostersByOwner(
  ownerGoogleId: string,
): Promise<PlayerRoster[]> {
  const rows = await db.rosters
    .where("ownerGoogleId")
    .equals(ownerGoogleId)
    .toArray();
  return rows.map((r) => r.payload);
}

export async function putRoster(
  fileId: string,
  payload: PlayerRoster,
  opts: { fromRemote?: boolean; etag?: string; modifiedTime?: string; rev?: number } = {},
): Promise<void> {
  const now = Date.now();
  const existing = await db.rosters.get(fileId);

  const row: RosterRow = {
    fileId,
    rosterId: payload.id,
    ownerGoogleId: payload.player.googleId,
    payload,
    etag: opts.etag ?? existing?.etag,
    modifiedTime: opts.modifiedTime ?? existing?.modifiedTime,
    lastFetchedAt: opts.fromRemote ? now : (existing?.lastFetchedAt ?? now),
    lastWrittenAt: opts.fromRemote ? existing?.lastWrittenAt : now,
    lastWrittenByThisDevice: opts.fromRemote
      ? (existing?.lastWrittenByThisDevice ?? false)
      : true,
    dirty: opts.fromRemote ? false : true,
    conflict: existing?.conflict,
    rev: opts.rev ?? existing?.rev,
    // Taking the sheet's copy settles a clash; a local edit keeps it.
    clash: opts.fromRemote ? false : existing?.clash,
  };

  await db.rosters.put(row);
}

export async function removeRoster(fileId: string): Promise<void> {
  await db.rosters.delete(fileId);
}

/** Rosters on this device with edits that have not reached a sheet. */
export async function listUnsavedRosterRows(ownerGoogleId: string): Promise<RosterRow[]> {
  const rows = await db.rosters.where("ownerGoogleId").equals(ownerGoogleId).toArray();
  return rows.filter((r) => r.dirty && (r.payload.attachedTo ?? []).length > 0);
}

export async function setRosterClash(fileId: string, clash: boolean): Promise<void> {
  await db.rosters.update(fileId, { clash });
}
