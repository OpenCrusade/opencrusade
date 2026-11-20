import Dexie, { type Table } from "dexie";
import type {
  BattlePlayerRow,
  BattleRow,
  ChangelogRow,
  CrusadeRow,
  QueuedOp,
  RosterRow,
  SyncStateRow,
  ThumbnailRow,
  TombstoneRow,
} from "./types";

/**
 * OpenCrusade local mirror. All UI reads originate here; the sync
 * engine reconciles to Drive in the background.
 *
 * See data-model.md § "Dexie (IndexedDB) Schema" for the canonical
 * shapes and indexes.
 */
export class CrusadeDB extends Dexie {
  crusades!: Table<CrusadeRow, string>;
  rosters!: Table<RosterRow, string>;
  battles!: Table<BattleRow, string>;
  battlePlayer!: Table<BattlePlayerRow, string>;
  changelogs!: Table<ChangelogRow, string>;
  thumbnails!: Table<ThumbnailRow, string>;
  queuedOps!: Table<QueuedOp, number>;
  syncState!: Table<SyncStateRow, string>;
  tombstones!: Table<TombstoneRow, string>;

  constructor() {
    super("opencrusade");
    this.version(1).stores({
      crusades: "crusadeId, lastFetchedAt, dirty",
      rosters: "fileId, crusadeId, playerGoogleId, dirty, lastFetchedAt",
      battles: "fileId, crusadeId, status, dirty, lastFetchedAt",
      battlePlayer: "fileId, battleFileId, playerGoogleId, dirty",
      changelogs: "fileId, crusadeId, playerGoogleId",
      thumbnails: "photoDriveFileId, battleFileId, sizeBytes, createdAt",
      queuedOps: "++id, status, nextAttemptAt, fileId, op",
      syncState: "key",
      tombstones: "fileId, deletedAt",
    });

    // v2 (2026-05-27): rosters become player-owned, no longer crusade-scoped.
    // Drops the `crusadeId` + `playerGoogleId` indexes; adds `rosterId` and
    // `ownerGoogleId`. Existing rows (from v1 testing) are wiped, the
    // upgrade path is "clear and re-bootstrap from Drive."
    this.version(2)
      .stores({
        rosters: "fileId, rosterId, ownerGoogleId, dirty, lastFetchedAt",
      })
      .upgrade(async (tx) => {
        await tx.table("rosters").clear();
      });

    // v3 (2026-11-18): storage moved from Drive JSON files to one Google
    // Sheet per crusade. Cached crusades point at Drive folders that no
    // longer mean anything, drop them. Rosters are kept: they are
    // valid local data and re-attach to a new crusade sheet.
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        await tx.table("crusades").clear();
        await tx.table("thumbnails").clear();
        await tx.table("syncState").clear();
        await tx
          .table("rosters")
          .toCollection()
          .modify((row: { payload: { attachedTo: unknown[] }; dirty: boolean }) => {
            row.payload.attachedTo = [];
            row.dirty = false;
          });
      });
  }
}

/** Singleton, import this from anywhere. */
export const db = new CrusadeDB();
