import { create } from "zustand";

/**
 * Background saves to Google Sheets: how many are in flight, whether
 * the last one failed, and what is still waiting. Drives the footer's
 * saved/saving indicator. `unsaved`, `clashes` and `blocked` are
 * recounted from the device's own store, so they survive a reload.
 */
interface SyncStatus {
  pending: number;
  lastFailed: boolean;
  /** Forces with edits that have not reached their campaign's sheet. */
  unsaved: number;
  /** Forces changed both here and elsewhere, waiting for a choice. */
  clashes: string[];
  /** Force id to the campaigns it can no longer save to. */
  blocked: Record<string, string[]>;
  /** Campaign id to why its sheet could not be read just now. */
  readProblems: Record<string, string>;
  setReadProblem: (crusadeId: string, problem: string | null) => void;
  begin: () => void;
  end: (ok: boolean) => void;
  setCounts: (unsaved: number, clashes: string[]) => void;
  setBlocked: (rosterId: string, crusadeIds: string[]) => void;
}

export const useSyncStatus = create<SyncStatus>((set) => ({
  pending: 0,
  lastFailed: false,
  unsaved: 0,
  clashes: [],
  blocked: {},
  readProblems: {},
  setReadProblem: (crusadeId, problem) =>
    set((s) => {
      if ((s.readProblems[crusadeId] ?? null) === problem) return s;
      const readProblems = { ...s.readProblems };
      if (problem) readProblems[crusadeId] = problem;
      else delete readProblems[crusadeId];
      return { readProblems };
    }),
  begin: () => set((s) => ({ pending: s.pending + 1 })),
  end: (ok) =>
    set((s) => ({ pending: Math.max(0, s.pending - 1), lastFailed: !ok })),
  setCounts: (unsaved, clashes) => set({ unsaved, clashes }),
  setBlocked: (rosterId, crusadeIds) =>
    set((s) => {
      const blocked = { ...s.blocked };
      if (crusadeIds.length > 0) blocked[rosterId] = crusadeIds;
      else delete blocked[rosterId];
      return { blocked };
    }),
}));
