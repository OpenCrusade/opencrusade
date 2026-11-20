import { useAuth } from "./useAuth";
import { useCrusade } from "./useCrusade";
import { useGmFix, useTrackerEdit } from "@/stores/tracker-edit";
import type { PlayerRoster } from "@/types";

/**
 * Who may change this force right now. Its player always can. The GM
 * of its crusade sees it read-only until they unlock it; the unlock
 * lasts while they stay on that force's pages.
 */
export function useGmCorrection(roster: PlayerRoster | undefined) {
  const { user } = useAuth();
  const { data: crusade } = useCrusade(roster?.attachedTo?.[0]?.crusadeId);
  const fixingId = useGmFix((f) => f.rosterId);
  const setFixing = useGmFix((f) => f.set);
  const openTrackerEdit = useTrackerEdit((e) => e.open);
  const closeTrackerEdit = useTrackerEdit((e) => e.close);

  const isOwner = !!roster && user?.googleId === roster.player.googleId;
  const isGm =
    !!crusade && crusade.players.find((p) => p.role === "gm")?.user.googleId === user?.googleId;
  const isGmVisitor = !!roster && isGm && !isOwner;
  const correcting = isGmVisitor && fixingId === roster?.id;

  return {
    isOwner,
    isGmVisitor,
    correcting,
    /** The player, or the GM once they have unlocked this force. */
    canEdit: isOwner || correcting,
    unlock: () => {
      if (!roster) return;
      setFixing(roster.id);
      openTrackerEdit();
    },
    lock: () => {
      setFixing(null);
      closeTrackerEdit();
    },
  };
}
