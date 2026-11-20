import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { forgetAllTabTitles } from "@/lib/sync/sheet-store";
import { useSyncStatus } from "@/stores/sync-status";
import { useOnline } from "@/hooks/useOnline";
import { useAppStore, isSignedIn } from "@/stores/app-store";
import { pushUnsavedRosters } from "@/lib/sync/roster-ops";

export function Footer() {
  const { pending, lastFailed, unsaved, clashes, blocked } = useSyncStatus();
  const online = useOnline();
  const signedIn = useAppStore(isSignedIn);
  const queryClient = useQueryClient();
  const stuck = Object.keys(blocked).length > 0;

  // Worst news first. "Saved" is only claimed when nothing is waiting.
  const state = !online
    ? { dot: "bg-bad", text: "Offline. Changes to your forces are kept on this device" }
    : pending > 0
      ? { dot: "bg-signal", text: "Saving to Google Sheets…" }
      : clashes.length > 0
        ? { dot: "bg-bad", text: "A force was changed in two places. Open it to choose a version" }
        : stuck
          ? { dot: "bg-bad", text: "Can't save to a campaign's sheet. Open your force for details" }
          : unsaved > 0 || lastFailed
            ? { dot: "bg-bad", text: "Some changes aren't saved to Google Sheets yet", retry: true }
            : { dot: "bg-good", text: "All changes saved" };

  return (
    <footer className="mt-6">
      <div className="page py-4 flex flex-wrap justify-between items-center gap-x-6 gap-y-2 text-[13px] text-mute">
        {signedIn ? (
          <span data-testid="sync-status" role="status" className="flex items-center gap-2">
            <span aria-hidden className={`inline-block w-2.5 h-2.5 rounded-full ${state.dot}`} />
            {state.text}
            {"retry" in state && (
              <button type="button" className="btn-link" onClick={() => void pushUnsavedRosters()}>
                Try now
              </button>
            )}
          </span>
        ) : (
          <span />
        )}
        {signedIn && online && (
          <button
            type="button"
            className="btn-link"
            title="Other people's changes show up within a minute. This reads the campaign's sheet now."
            onClick={() => {
              forgetAllTabTitles();
              void queryClient.invalidateQueries();
            }}
          >
            Refresh
          </button>
        )}
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          <span>OpenCrusade is unofficial and not affiliated with Games Workshop.</span>
          <Link to="/faq">FAQ</Link>
          <Link to="/about">About</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </span>
      </div>
    </footer>
  );
}
