import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSyncStatus } from "@/stores/sync-status";
import {
  forgetUnreachableCrusade,
  pushUnsavedRosters,
  resolveRosterClash,
} from "@/lib/sync/roster-ops";

/**
 * Says so, on the force itself, when its changes are not reaching the
 * campaign sheet, and lets the player decide what happens next. The
 * app never drops a campaign or a version on its own.
 */
export function RosterSyncNotice({ rosterId }: { rosterId: string }) {
  const clash = useSyncStatus((s) => s.clashes.includes(rosterId));
  const blocked = useSyncStatus((s) => s.blocked[rosterId]);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["roster", rosterId] });
      await queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
    } finally {
      setBusy(false);
    }
  };

  if (clash) {
    return (
      <div role="alert" className="card p-4 grid gap-3 border border-bad" data-testid="roster-clash">
        <p className="m-0 leading-[1.5]">
          <strong className="font-semibold">This force was changed in two places.</strong>{" "}
          You have changes on this device that weren't saved, and the copy in
          the campaign's sheet has since been changed too (on another device
          of yours, or by your GM). Choose which to keep; the other is
          discarded.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn" disabled={busy} onClick={() => void run(() => resolveRosterClash(rosterId, "theirs"))}>
            Use the campaign sheet's version
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void run(() => resolveRosterClash(rosterId, "mine"))}>
            Keep this device's version
          </button>
        </div>
      </div>
    );
  }

  if (blocked && blocked.length > 0) {
    return (
      <div role="alert" className="card p-4 grid gap-3 border border-bad" data-testid="roster-blocked">
        <p className="m-0 leading-[1.5]">
          <strong className="font-semibold">Changes to this force aren't reaching its campaign.</strong>{" "}
          The campaign's Google Sheet can't be opened: it may have been
          deleted, or it is no longer shared with you as an editor. Your
          changes are safe on this device. Ask your GM to check the sheet's
          sharing, then try again.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => pushUnsavedRosters())}>
            Try again
          </button>
          {confirmStop ? (
            <>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    for (const id of blocked) await forgetUnreachableCrusade(rosterId, id);
                  })
                }
              >
                Yes, keep it on this device only
              </button>
              <button type="button" className="btn" onClick={() => setConfirmStop(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setConfirmStop(true)}>
              Stop saving to that campaign…
            </button>
          )}
        </div>
      </div>
    );
  }
  return null;
}
