import { db } from "@/lib/db/dexie";
import { queryClient } from "@/app/query-client";

/**
 * Remove everything this app has saved on this device: the working
 * copies of campaigns and forces, and anything cached for display.
 * Campaign sheets in Google are not touched. Edits that have not yet
 * reached a sheet, and forces never added to a campaign, are lost.
 */
export async function wipeLocalData(): Promise<void> {
  queryClient.clear();
  await Promise.all(db.tables.map((t) => t.clear()));
}

/**
 * Ask the browser not to clear this app's storage when the device
 * runs low on space. A force that hasn't joined a campaign exists
 * only here, so this matters. Browsers may say no; that is fine.
 */
export function keepStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    // not supported
  }
}
