import { create } from "zustand";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "bad";
  /** Optional button, e.g. "Reload" for a new version. */
  action?: { label: string; run: () => void };
  /** Stays until dismissed. */
  sticky?: boolean;
}

interface Toasts {
  list: Toast[];
  show: (text: string, tone?: Toast["tone"], extra?: Pick<Toast, "action" | "sticky">) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

/** Short messages shown at the foot of the screen. */
export const useToasts = create<Toasts>((set, get) => ({
  list: [],
  show: (text, tone = "info", extra = {}) => {
    // The same failure reported twice in a row is one message.
    if (get().list.some((t) => t.text === text)) return;
    const id = nextId++;
    set((s) => ({ list: [...s.list.slice(-3), { id, text, tone, ...extra }] }));
    if (!extra.sticky) setTimeout(() => get().dismiss(id), 9000);
  },
  dismiss: (id) => set((s) => ({ list: s.list.filter((t) => t.id !== id) })),
}));
