import { TrackerPanel } from "@/components/common/TrackerPanel";
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
}: {
  packState: PackState;
  isGm: boolean;
  onUpdateState: (next: PackState) => void;
  isSaving: boolean;
}) {
  const state = readTrackerState(packState as Record<string, unknown>);

  const update = (next: TrackerState) =>
    onUpdateState({
      counters: [], // legacy field cleared once migrated to items
      items: next.items,
      note: next.note,
    } as PackState);

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
