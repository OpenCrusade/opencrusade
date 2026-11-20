import { db } from "./dexie";

/**
 * Persister storage for TanStack Query's `experimental_createPersister`.
 *
 * The persister stores serialised query state (queryKey hash → payload)
 * in a dedicated Dexie table. We use the existing `syncState` table
 * with a `query:` key prefix to keep the schema small, the volume is
 * low (a few KB per query) and we want a single Dexie database.
 *
 * Conforms to TanStack Query's AsyncStorage interface:
 *   - getItem(key) → string | null
 *   - setItem(key, value) → void
 *   - removeItem(key) → void
 */

const PREFIX = "query:";

export const dexieAsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    const row = await db.syncState.get((PREFIX + key) as never);
    return (row?.value as string | undefined) ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    // Cast through `never` because the SyncStateKey enum is intentionally
    // closed; query-cache keys are an internal-only extension.
    await db.syncState.put({
      key: (PREFIX + key) as never,
      value,
    });
  },

  async removeItem(key: string): Promise<void> {
    await db.syncState.delete((PREFIX + key) as never);
  },
};
