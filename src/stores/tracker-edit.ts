import { create } from "zustand";

/**
 * Whether tracker panels are unlocked for setting up (rename, remove,
 * reorder, add). Locked is the everyday state: only values change.
 * Per device, not saved.
 */
export const useTrackerEdit = create<{ editing: boolean; toggle: () => void; open: () => void; close: () => void }>((set) => ({
  editing: false,
  open: () => set({ editing: true }),
  close: () => set({ editing: false }),
  toggle: () => set((s) => ({ editing: !s.editing })),
}));

/**
 * Which player's force the GM has unlocked for correcting, if any.
 * A GM looks at other forces read-only until they unlock one. Per
 * device, not saved.
 */
export const useGmFix = create<{ rosterId: string | null; set: (id: string | null) => void }>(
  (set) => ({
    rosterId: null,
    set: (rosterId) => set({ rosterId }),
  }),
);
