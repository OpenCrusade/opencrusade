import { create } from "zustand";

/**
 * Whether the GM has the campaign page unlocked for managing, per
 * crusade. Locked, the GM sees the page as a player does. Per device,
 * not saved.
 */
export const useGmManage = create<{
  open: Record<string, boolean>;
  set: (crusadeId: string, on: boolean) => void;
}>((set) => ({
  open: {},
  set: (crusadeId, on) => set((s) => ({ open: { ...s.open, [crusadeId]: on } })),
}));
