import { useEffect, useRef, useState } from "react";
import { TrackerPanel } from "@/components/common/TrackerPanel";
import {
  applySets,
  blankValue,
  readTrackerState,
  type AppliableSet,
  type TrackerState,
} from "@/components/common/tracker-state";
import { useAuth } from "@/hooks/useAuth";
import { useCrusade } from "@/hooks/useCrusade";
import { useTrackerEdit } from "@/stores/tracker-edit";
import { useCrusadeMirrors } from "@/hooks/useRoster";
import { forceName } from "@/lib/utils/stats";
import type { FactionMechanicProps } from "../types";

/**
 * The faction tracker: numbers, lists, stages, checkboxes and text the
 * player names themselves, plus notes. The app ships no faction
 * content; a player can copy the layout another player in the same
 * crusade has built.
 */
export function GenericFactionPanel({
  roster,
  isOwner,
  onUpdateState,
  isSaving,
}: FactionMechanicProps) {
  const state = readTrackerState(roster.factionState);
  const { data: mirrors } = useCrusadeMirrors(roster.attachedTo?.[0]?.crusadeId);
  const [copyFrom, setCopyFrom] = useState("");

  const { data: crusade } = useCrusade(roster.attachedTo?.[0]?.crusadeId);
  const allSets = crusade?.trackerSets ?? [];
  const appliedSetIds = Array.isArray(roster.factionState?.appliedSets)
    ? (roster.factionState.appliedSets as string[])
    : [];
  const [pick, setPick] = useState("");
  // Set-up controls show while unlocked, or when nothing is set up yet.
  const unlocked = useTrackerEdit((e) => e.editing);
  const setUp = isOwner && (unlocked || state.items.length === 0);

  const applyAndSave = (sets: AppliableSet[]) => {
    const result = applySets(state, appliedSetIds, sets);
    if (!result) return;
    onUpdateState({
      ...roster.factionState,
      items: result.state.items,
      note: result.state.note,
      appliedSets: result.appliedSetIds,
      counters: [],
      awakeningPoints: undefined,
      systems: undefined,
    });
  };

  // The GM's campaign sets go to every player: add whatever this
  // player doesn't have yet. Only the owner's app can write their tab.
  const campaignSets = allSets.filter((s) => s.scope === "everyone") as AppliableSet[];
  // `isOwner` here also covers a GM correcting this force; only the
  // player's own app sets their trackers up.
  const { user } = useAuth();
  const mine = user?.googleId === roster.player.googleId;
  const pending = mine ? applySets(state, appliedSetIds, campaignSets) : null;
  const pendingKey = pending ? JSON.stringify(pending.appliedSetIds) + pending.state.items.length : "";
  const lastApplied = useRef("");
  useEffect(() => {
    if (!pendingKey || isSaving || lastApplied.current === pendingKey) return;
    lastApplied.current = pendingKey;
    applyAndSave(campaignSets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, isSaving]);

  // Offer a faction set whenever some of its trackers aren't here:
  // never added, or added and later removed.
  const haveRefs = new Set(state.items.map((i) => i.setRef));
  const choices = allSets.filter(
    (s) => s.scope === "choice" && s.items.some((i) => !haveRefs.has(`${s.id}:${i.id}`)),
  ) as AppliableSet[];

  const update = (next: TrackerState) =>
    onUpdateState({
      ...roster.factionState,
      items: next.items,
      note: next.note,
      // Older shapes, cleared once written as items.
      counters: [],
      awakeningPoints: undefined,
      systems: undefined,
    });

  // Other forces in this crusade that have a layout worth copying.
  const sources = (mirrors ?? [])
    .filter((m) => m.id !== roster.id)
    .map((m) => ({ roster: m, items: readTrackerState(m.factionState).items }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {isOwner && state.items.length === 0 && (
        <p className="m-0 text-mute text-[13px] leading-[1.5]">
          Set up whatever your faction's Crusade rules or your campaign pack
          ask you to keep track of, using the names from your own books.
        </p>
      )}
      {setUp && state.items.length === 0 && sources.length > 0 && (
        <div className="inset-panel p-3.5 grid grid-cols-[minmax(0,1fr)] gap-2">
          <span className="label-mono">Copy another player's layout</span>
          <div className="flex gap-2">
            <select
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
              aria-label="Force to copy the layout from"
              className="field bg-surface flex-1 min-w-0"
            >
              <option value="">Choose a force</option>
              {sources.map((s) => (
                <option key={s.roster.id} value={s.roster.id}>
                  {forceName(s.roster)} ({s.items.length} tracker{s.items.length === 1 ? "" : "s"})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={!copyFrom || isSaving}
              onClick={() => {
                const src = sources.find((s) => s.roster.id === copyFrom);
                if (!src) return;
                update({
                  ...state,
                  items: src.items.map((i) => ({
                    id: crypto.randomUUID(),
                    name: i.name,
                    kind: i.kind,
                    value: blankValue(i),
                  })),
                });
              }}
            >
              Copy
            </button>
          </div>
          <span className="text-xs text-mute">
            Copies the tracker names and types, starting from zero. Their
            values and notes are not copied.
          </span>
        </div>
      )}
      {setUp && choices.length > 0 && (
        <div className="inset-panel p-3.5 grid grid-cols-[minmax(0,1fr)] gap-2" data-testid="gm-sets">
          <span className="label-mono">Sets from your GM</span>
          <div className="flex gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label="Tracker set from your GM"
              className="field bg-surface flex-1 min-w-0"
            >
              <option value="">Choose a set</option>
              {choices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              disabled={!pick || isSaving}
              onClick={() => {
                const set = choices.find((s) => s.id === pick);
                if (set) applyAndSave([set]);
                setPick("");
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}
      <TrackerPanel
        state={state}
        canEdit={isOwner}
        onUpdate={update}
        isSaving={isSaving}
        emptyText="Nothing tracked yet."
        addPlaceholder="Name it as your book does"
        noteLabel="Notes"
        setName={`${roster.factionName || "Faction"} tracker`}
        show={(i) => (i.placement ?? "side") === "side"}
        allowPlacement
        lockElsewhere
        keep={(i) => campaignSets.some((s) => i.setRef?.startsWith(`${s.id}:`))}
        notePlaceholder="Summarise your faction's Crusade rules in your own words."
      />
    </div>
  );
}
