import { LockButton, TrackerPanel } from "@/components/common/TrackerPanel";
import { useTrackerEdit } from "@/stores/tracker-edit";
import {
  readTrackerState,
  type TrackerState,
} from "@/components/common/tracker-state";
import type { PackState } from "@/types";

/**
 * Crusade-level campaign tracker, the shared tracker (numbers,
 * checkboxes, text values) plus campaign notes, GM-edited, visible to
 * every player. Covers pack mechanics without shipping GW rules text:
 * the GM names the trackers themselves.
 */
export function PackPanel({
  packState,
  isGm,
  onUpdateState,
  isSaving,
  wide,
}: {
  packState: PackState;
  isGm: boolean;
  onUpdateState: (next: PackState) => void;
  isSaving: boolean;
  /** Shown full width: trackers as tiles across the page. */
  wide?: boolean;
}) {
  const state = readTrackerState(packState as Record<string, unknown>);
  const editing = useTrackerEdit((e) => e.editing);

  const update = (next: TrackerState) =>
    onUpdateState({
      counters: [], // legacy field cleared once migrated to items
      items: next.items,
      note: next.note,
    } as PackState);

  // Full width and locked: the trackers as tiles, like trackers shown
  // above or below the squad on a force. Unlocked (or empty), the full
  // panel, so the GM can add, import and write notes.
  if (wide && !editing && state.items.length > 0) {
    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
        {isGm && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-mute">Locked: only the values change.</span>
            <LockButton />
          </div>
        )}
        <TrackerPanel
          state={state}
          canEdit={isGm}
          onUpdate={update}
          isSaving={isSaving}
          setName="Campaign tracker"
          wide
        />
        {state.note && (
          <p className="whitespace-pre-wrap text-ink-2 m-0 leading-[1.5]">{state.note}</p>
        )}
      </div>
    );
  }

  return (
    <TrackerPanel
      state={state}
      canEdit={isGm}
      onUpdate={update}
      isSaving={isSaving}
      emptyText="Nothing tracked yet. The GM can add campaign trackers here."
      addPlaceholder="Track something (e.g. Territory held, Supplies found)"
      noteLabel="Campaign notes"
      setName="Campaign tracker"
      notePlaceholder="Summarise your pack's campaign rules or current state, in your own words."
    />
  );
}
