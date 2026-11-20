import { db } from "./dexie";
import type { CrusadeRow } from "./types";
import type { Crusade } from "@/types";

/**
 * Crusade table accessor. All UI reads go through here.
 *
 * Writes mark the row `dirty: true` and update SyncedRow bookkeeping.
 * The sync engine's queue drain flips `dirty` back to false once the
 * Drive PATCH completes.
 */

export async function getCrusade(crusadeId: string): Promise<Crusade | undefined> {
  const row = await db.crusades.get(crusadeId);
  return row?.payload;
}

export async function listCrusades(): Promise<Crusade[]> {
  const rows = await db.crusades.toArray();
  return rows.map((r) => r.payload);
}

/**
 * Write the local mirror for a crusade. Marks `dirty: true`, the
 * sync engine is responsible for the actual Drive write.
 *
 * @param fromRemote set true when this write is coming from a Drive
 * read (revalidation). Clears the dirty flag and does NOT bump
 * `lastWrittenAt`.
 */
export async function putCrusade(
  payload: Crusade,
  opts: {
    fromRemote?: boolean;
    etag?: string;
    modifiedTime?: string;
  } = {},
): Promise<void> {
  const now = Date.now();
  const existing = await db.crusades.get(payload.id);

  const row: CrusadeRow = {
    crusadeId: payload.id,
    fileId: payload.id, // for Crusade, fileId === Drive folder id
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
  };

  await db.crusades.put(row);
}

export async function removeCrusade(crusadeId: string): Promise<void> {
  await db.crusades.delete(crusadeId);
}
