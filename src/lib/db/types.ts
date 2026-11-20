/**
 * Dexie row shapes. See data-model.md § "Dexie (IndexedDB) Schema".
 *
 * Every row that mirrors a Drive document carries the SyncedRow mixin
 * so the sync engine can do conditional reads (ETag) and detect
 * conflicts uniformly.
 */

import type {
  Battle,
  BattlePlayerData,
  BattleStatus,
  Crusade,
  PlayerChangelog,
  PlayerRoster,
} from "@/types";

export interface ConflictMarker {
  detectedAt: number;
  remoteEtag: string;
  remoteModifiedTime: string;
  localPayload: unknown;
  remotePayload: unknown;
}

export interface SyncedRow {
  fileId: string;
  etag?: string;
  modifiedTime?: string;
  lastFetchedAt: number; // epoch ms (last successful Drive read or 304)
  lastWrittenAt?: number; // epoch ms (last local write)
  lastWrittenByThisDevice: boolean;
  dirty: boolean;
  conflict?: ConflictMarker;
}

export interface CrusadeRow extends SyncedRow {
  crusadeId: string; // pk (Drive folder id)
  payload: Crusade;
}

export interface RosterRow extends SyncedRow {
  /** Stable UUID, distinct from fileId. Same id across crusade attachments. */
  rosterId: string;
  /** Owner's Google ID. */
  ownerGoogleId: string;
  payload: PlayerRoster;
  /** Revision of the sheet copy this device last wrote or took. */
  rev?: number;
  /**
   * This device has unsaved edits AND the sheet copy was changed
   * elsewhere. Saving is paused until the user picks a version.
   */
  clash?: boolean;
}

export interface BattleRow extends SyncedRow {
  crusadeId: string;
  status: BattleStatus;
  payload: Battle;
}

export interface BattlePlayerRow extends SyncedRow {
  battleFileId: string;
  playerGoogleId: string;
  payload: BattlePlayerData;
}

export interface ChangelogRow extends SyncedRow {
  crusadeId: string;
  playerGoogleId: string;
  payload: PlayerChangelog;
}

export interface ThumbnailRow {
  photoDriveFileId: string; // pk
  battleFileId?: string;
  blob: Blob;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: number;
}

export type QueuedOpKind =
  | "createFile"
  | "updateFile"
  | "uploadMedia"
  | "createPermission"
  | "revokePermission";

export type QueuedOpStatus = "pending" | "inflight" | "failed";

export interface QueuedOp {
  id?: number; // Dexie auto pk
  op: QueuedOpKind;
  fileId?: string; // updateFile / uploadMedia
  parentId?: string; // createFile / uploadMedia
  fileName?: string;
  mimeType?: string;
  payload?: unknown;
  permissionId?: string; // revokePermission
  email?: string; // createPermission
  enqueuedAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  status: QueuedOpStatus;
}

/**
 * Documented sync-engine keys. Extension keys (e.g. `query:foo`,
 * `rostersFolderId:{googleId}`) are allowed, the type widens to plain
 * string. Conventionally, extension keys are namespaced with a colon
 * prefix.
 */
export type SyncStateKey =
  | "changesPageToken"
  | "lastFullRevalidate"
  | "driveScopeGrantedAt"
  | (string & {});

export interface SyncStateRow {
  key: SyncStateKey;
  value: string | number;
}

export interface TombstoneRow {
  fileId: string;
  deletedAt: number;
}
