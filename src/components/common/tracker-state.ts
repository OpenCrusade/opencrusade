/**
 * Tracker state shapes + normaliser, shared by TrackerPanel and its
 * consumers (faction modules, pack panel). Separate from the component
 * file so react-refresh sees a components-only module there.
 */

import { packTrackerItemSchema } from "@/lib/schemas/crusade";

export type TrackerKind = "counter" | "toggle" | "text" | "list" | "stage" | "checklist";

/** side column, or full width above or below the squad list. */
export type TrackerPlacement = "side" | "above" | "below";

export interface TrackerEntry {
  id: string;
  name: string;
  detail: string;
}

/** A track of named stages with one current. */
export interface TrackerStages {
  stages: string[];
  current: number;
}

/** A group of named options, each ticked or not. */
export interface TrackerChecklist {
  options: { id: string; name: string; detail: string; on: boolean }[];
}

export interface TrackerItem {
  id: string;
  name: string;
  kind: TrackerKind;
  value: number | boolean | string | TrackerEntry[] | TrackerStages | TrackerChecklist;
  /** "<set id>:<item id>" when this tracker came from a GM's set. */
  setRef?: string;
  /** Where it shows on the force page. Default: the side column. */
  placement?: TrackerPlacement;
  /** Number trackers only: running total of everything ever added. */
  lifetime?: number;
  /** When shown wide: how many tiles across its group aims for. */
  columns?: number;
  /** Number trackers in a GM's set: false leaves it out of Campaign totals. */
  totals?: boolean;
}

interface LegacyCounter {
  id: string;
  name: string;
  value: number;
}

const KIND_OK: Record<TrackerKind, (v: unknown) => boolean> = {
  counter: (v) => typeof v === "number",
  toggle: (v) => typeof v === "boolean",
  text: (v) => typeof v === "string",
  list: (v) => Array.isArray(v),
  stage: (v) => typeof v === "object" && v !== null && "stages" in v,
  checklist: (v) => typeof v === "object" && v !== null && "options" in v,
};

function isTrackerItem(v: unknown): v is TrackerItem {
  const parsed = packTrackerItemSchema.safeParse(v);
  return parsed.success && KIND_OK[parsed.data.kind](parsed.data.value);
}

export interface TrackerState {
  items: TrackerItem[];
  note: string;
}

/**
 * Normalise raw stored state (any vintage) into TrackerState. Legacy
 * `counters` arrays (pre-2026-07) surface as counter items; the first
 * write migrates them into `items` and clears the legacy field.
 */
export function readTrackerState(
  raw: Record<string, unknown> | undefined,
): TrackerState {
  const s = raw ?? {};
  // Stored state comes out of a shared sheet, so nothing about its
  // shape can be assumed: keep only items that are what they claim.
  const items = Array.isArray(s.items)
    ? (s.items as unknown[]).filter(isTrackerItem).slice(0, 50)
    : [];
  const legacy = Array.isArray(s.counters)
    ? (s.counters as LegacyCounter[])
    : [];
  return {
    items: [
      ...legacyPanelItems(s),
      ...(items.length > 0
        ? items
        : legacy.map((c) => ({
            id: c.id,
            name: c.name,
            kind: "counter" as const,
            value: c.value,
          }))),
    ],
    note: typeof s.note === "string" ? s.note : "",
  };
}

/**
 * State written by the retired faction-specific panel (a points
 * counter and a list of unlocks) surfaces as two ordinary trackers.
 * The first save writes them into `items` and clears the old keys.
 */
function legacyPanelItems(s: Record<string, unknown>): TrackerItem[] {
  const out: TrackerItem[] = [];
  if (typeof s.awakeningPoints === "number") {
    out.push({ id: "legacy-points", name: "Points", kind: "counter", value: s.awakeningPoints });
  }
  if (Array.isArray(s.systems) && s.systems.length > 0) {
    out.push({
      id: "legacy-unlocked",
      name: "Unlocked",
      kind: "list",
      value: (s.systems as { id?: string; name?: string; rules?: string }[]).map((e, i) => ({
        id: e.id ?? `legacy-${i}`,
        name: e.name ?? "",
        detail: e.rules ?? "",
      })),
    });
  }
  return out;
}

/** A tracker's starting value, by kind. Also used to copy a layout. */
export function blankValue(item: Pick<TrackerItem, "kind" | "value">): TrackerItem["value"] {
  switch (item.kind) {
    case "counter":
      return 0;
    case "toggle":
      return false;
    case "list":
      return [];
    case "stage": {
      const v = item.value as TrackerStages | undefined;
      return { stages: Array.isArray(v?.stages) ? [...v.stages] : [], current: 0 };
    }
    case "checklist": {
      const v = item.value as TrackerChecklist | undefined;
      return {
        options: (Array.isArray(v?.options) ? v.options : []).map((o) => ({ ...o, on: false })),
      };
    }
    default:
      return "";
  }
}

/** A GM's tracker set, as far as applying it goes. */
export interface AppliableSet {
  id: string;
  name?: string;
  items: TrackerItem[];
  note: string;
}

/**
 * Add a set's trackers to a player's own, skipping any already added
 * (so a set the GM later extends only adds the new ones). Returns null
 * when there is nothing to add. The set's note is added once.
 */
export function applySets(
  state: TrackerState,
  appliedSetIds: string[],
  sets: AppliableSet[],
): { state: TrackerState; appliedSetIds: string[] } | null {
  const have = new Set(state.items.map((i) => i.setRef).filter(Boolean));
  const added: TrackerItem[] = [];
  let note = state.note;
  const applied = new Set(appliedSetIds);
  for (const set of sets) {
    for (const item of set.items) {
      const setRef = `${set.id}:${item.id}`;
      if (have.has(setRef)) continue;
      added.push({
        ...(JSON.parse(JSON.stringify(item)) as TrackerItem),
        id: crypto.randomUUID(),
        setRef,
      });
    }
    if (!applied.has(set.id)) {
      applied.add(set.id);
      if (set.note) note = [note, set.note].filter(Boolean).join("\n\n").slice(0, 10000);
    }
  }
  if (added.length === 0 && applied.size === appliedSetIds.length) return null;
  return {
    state: { items: [...state.items, ...added].slice(0, 50), note },
    appliedSetIds: [...applied],
  };
}

/**
 * Drop what the GM has removed from the sets every player gets: single
 * trackers taken out of a set that still exists, and every tracker of
 * a set the GM removed whole (`withdrawn` holds those sets' ids).
 * Anything else is left alone, including trackers from a set that is
 * simply unknown here. Returns null when there is nothing to drop.
 */
export function dropWithdrawn(
  state: TrackerState,
  sets: AppliableSet[],
  withdrawn: string[] = [],
): TrackerState | null {
  const live = new Map(
    sets.map((s) => [s.id, new Set(s.items.map((i) => `${s.id}:${i.id}`))]),
  );
  const gone = new Set(withdrawn);
  const items = state.items.filter((i) => {
    if (!i.setRef) return true;
    const setId = i.setRef.split(":")[0];
    if (gone.has(setId)) return false;
    const refs = live.get(setId);
    return !refs || refs.has(i.setRef);
  });
  return items.length === state.items.length ? null : { ...state, items };
}

/** Merge a panel's trackers back into a roster's stored state. */
export function writeTrackerState(
  raw: Record<string, unknown> | undefined,
  next: TrackerState,
): Record<string, unknown> {
  return {
    ...raw,
    items: next.items,
    note: next.note,
    // Older shapes, cleared once written as items.
    counters: [],
    awakeningPoints: undefined,
    systems: undefined,
  };
}

/**
 * Fold one person's edit into trackers someone else may have changed
 * meanwhile. `before` is what the editor was looking at, `after` what
 * they made of it, `live` what is stored now. Only what the editor
 * actually touched is taken from `after`; everything else stays as it
 * is in `live`.
 */
export function mergeTrackerEdit(
  before: TrackerState,
  after: TrackerState,
  live: TrackerState,
): TrackerState {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const was = new Map(before.items.map((i) => [i.id, i]));
  const now = new Map(after.items.map((i) => [i.id, i]));
  const liveIds = new Set(live.items.map((i) => i.id));

  const items: TrackerItem[] = [];
  for (const item of live.items) {
    const mine = now.get(item.id);
    // The editor removed it.
    if (!mine && was.has(item.id)) continue;
    // The editor changed it: theirs wins. Otherwise keep what is stored.
    items.push(mine && !same(mine, was.get(item.id)) ? mine : item);
  }
  // Trackers the editor added.
  for (const item of after.items) {
    if (!liveIds.has(item.id) && !was.has(item.id)) items.push(item);
  }
  // A reorder with nothing else going on: take the editor's order.
  if (
    same(before.items.map((i) => i.id).sort(), live.items.map((i) => i.id).sort()) &&
    !same(before.items.map((i) => i.id), after.items.map((i) => i.id))
  ) {
    const order = new Map(after.items.map((i, n) => [i.id, n]));
    items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  return { items, note: after.note !== before.note ? after.note : live.note };
}
