import { useRef, useState } from "react";
import { useTrackerEdit } from "@/stores/tracker-edit";
import { downloadFile } from "@/lib/export/roster-export";
import {
  exportTrackerLayout,
  fetchTrackerLayout,
  readTrackerLayoutFile,
  type TrackerLayout,
} from "@/lib/import/tracker-layout";
import {
  blankValue,
  type TrackerChecklist,
  type TrackerEntry,
  type TrackerItem,
  type TrackerKind,
  type TrackerPlacement,
  type TrackerStages,
  type TrackerState,
} from "./tracker-state";

/**
 * Shared campaign/faction tracker: a list of named items the owner
 * defines, each one of three kinds,
 *   counter  a number with −/+ (points, tallies)
 *   toggle   a checkbox (unlocked / achieved / active)
 *   text     a free-text value (current protocol, chosen stratagem)
 *, plus a free-text notes block. All names and text are the player's
 * own words; the app ships no rules content.
 *
 * State shapes + the legacy-counter migration live in
 * ./tracker-state.ts.
 */

const KIND_LABEL: Record<TrackerKind, string> = {
  counter: "Number",
  list: "List",
  stage: "Stages",
  checklist: "Checklist",
  toggle: "Checkbox",
  text: "Text",
};

const STEP =
  "btn w-9 min-h-9 px-0 rounded-lg text-base font-bold";

export function TrackerPanel({
  state,
  canEdit,
  onUpdate,
  isSaving,
  emptyText = "Nothing tracked yet.",
  addPlaceholder = "Name, e.g. Territory held",
  noteLabel = "Notes",
  notePlaceholder = "Summarise the mechanic in your own words.",
  setName,
  show,
  wide,
  allowPlacement,
  allowColumns,
  lockElsewhere,
  keep,
}: {
  /** Offer the number of tiles across when these trackers show wide. */
  allowColumns?: boolean;
  /** Trackers the player can't remove (a GM set every player has). */
  keep?: (item: TrackerItem) => boolean;
  /** The lock button lives somewhere else on this page. */
  lockElsewhere?: boolean;
  /** Only these trackers are drawn (the rest are kept untouched). */
  show?: (item: TrackerItem) => boolean;
  /** Draw only the trackers, as tiles across a wide space. */
  wide?: boolean;
  /** Offer "shown at the side / above / below the squad" per tracker. */
  allowPlacement?: boolean;
  /** Name given to a downloaded tracker set. */
  setName?: string;
  state: TrackerState;
  canEdit: boolean;
  onUpdate: (next: TrackerState) => void;
  isSaving: boolean;
  emptyText?: string;
  addPlaceholder?: string;
  noteLabel?: string;
  notePlaceholder?: string;
}) {
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<TrackerKind>("counter");
  const edit = useTrackerEdit();
  // Nothing set up yet: show the set-up controls without asking.
  const editing = canEdit && (edit.editing || state.items.length === 0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [note, setNote] = useState(state.note);
  const [setUrl, setSetUrl] = useState("");
  const [setMessage, setSetMessage] = useState<string | null>(null);
  const setFile = useRef<HTMLInputElement>(null);

  // Adopt remote note changes while not editing (derive-from-props).
  const [prevRemoteNote, setPrevRemoteNote] = useState(state.note);
  if (state.note !== prevRemoteNote) {
    setPrevRemoteNote(state.note);
    setNote(state.note);
  }

  const addItem = () => {
    const name = newName.trim();
    if (!name) return;
    const value: TrackerItem["value"] =
      blankValue({ kind: newKind, value: "" });
    onUpdate({
      ...state,
      items: [...state.items, { id: crypto.randomUUID(), name, kind: newKind, value }],
    });
    setNewName("");
    // Stay in set-up mode after the first tracker, until locked.
    edit.open();
  };

  const setItem = (id: string, value: TrackerItem["value"]) =>
    onUpdate({
      ...state,
      items: state.items.map((i) => (i.id === id ? { ...i, value } : i)),
    });

  const patchItem = (id: string, patch: Partial<TrackerItem>) =>
    onUpdate({
      ...state,
      items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    });

  /** Put `id` where `targetId` is, in the full list. */
  const moveItem = (id: string, targetId: string) => {
    if (id === targetId) return;
    const items = [...state.items];
    const from = items.findIndex((i) => i.id === id);
    const to = items.findIndex((i) => i.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    onUpdate({ ...state, items });
  };

  const renameItem = (item: TrackerItem) => {
    const name = window.prompt("Rename this tracker", item.name)?.trim();
    if (name && name !== item.name) {
      onUpdate({
        ...state,
        items: state.items.map((i) => (i.id === item.id ? { ...i, name: name.slice(0, 200) } : i)),
      });
    }
  };

  const removeItem = (item: TrackerItem) => {
    if (window.confirm(`Stop tracking "${item.name}"? Its value is deleted.`)) {
      onUpdate({ ...state, items: state.items.filter((i) => i.id !== item.id) });
    }
  };

  const importSet = async (load: () => Promise<TrackerLayout>) => {
    setSetMessage(null);
    try {
      const set = await load();
      if (set.items.length === 0 && !set.note) {
        setSetMessage("That tracker set is empty.");
        return;
      }
      if (
        !window.confirm(
          `Add ${set.items.length} tracker${set.items.length === 1 ? "" : "s"}${set.name ? ` from "${set.name}"` : ""}?${state.items.length ? " The ones already here are kept." : ""}`,
        )
      )
        return;
      const joined = [state.note, set.note].filter(Boolean).join("\n\n").slice(0, 10000);
      onUpdate({ items: [...state.items, ...set.items].slice(0, 50), note: joined });
      setNote(joined);
      setSetUrl("");
      setSetMessage(`Added ${set.items.length} tracker${set.items.length === 1 ? "" : "s"}.`);
      edit.open();
    } catch (err) {
      setSetMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const saveNote = () => {
    if (note !== state.note) onUpdate({ ...state, note });
  };

  if (!canEdit && state.items.length === 0 && !state.note) {
    return <p className="text-mute text-[13px] m-0">{emptyText}</p>;
  }

  const shown = state.items.filter((i) => (show ? show(i) : true));
  const placementControl = (item: TrackerItem) =>
    editing &&
    allowPlacement && (
      <select
        value={item.placement ?? "side"}
        onChange={(e) =>
          onUpdate({
            ...state,
            items: state.items.map((i) =>
              i.id === item.id ? { ...i, placement: e.target.value as TrackerPlacement } : i,
            ),
          })
        }
        aria-label={`Where ${item.name} shows`}
        className="bg-transparent border-0 text-xs text-mute underline cursor-pointer min-w-0 max-w-full"
      >
        <option value="side">Shown at the side</option>
        <option value="above">Shown above the squad</option>
        <option value="below">Shown below the squad</option>
      </select>
    );

  const cols = shown.find((i) => i.columns)?.columns ?? 2;

  // Reordering: drag a tracker onto another, or use the arrows.
  const dragProps = (item: TrackerItem) =>
    editing
      ? {
          draggable: true,
          onDragStart: (e: React.DragEvent) => {
            setDragId(item.id);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", item.id);
          },
          onDragOver: (e: React.DragEvent) => {
            if (dragId && dragId !== item.id) e.preventDefault();
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            if (dragId) moveItem(dragId, item.id);
            setDragId(null);
          },
          onDragEnd: () => setDragId(null),
        }
      : {};
  const dragClass = (item: TrackerItem) =>
    editing ? `cursor-grab ${dragId === item.id ? "opacity-50" : ""}` : "";
  const editBar = (item: TrackerItem) => {
    const at = shown.findIndex((i) => i.id === item.id);
    const prev = shown[at - 1];
    const next = shown[at + 1];
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 pt-2 border-t border-rule text-xs text-mute">
        <span aria-hidden="true" title="Drag to reorder" className="select-none tracking-[-2px]">
          ⋮⋮
        </span>
        <button
          type="button"
          className="btn min-h-7 w-7 px-0 rounded-md text-xs"
          disabled={!prev || isSaving}
          onClick={() => prev && moveItem(item.id, prev.id)}
          aria-label={`Move ${item.name} earlier`}
        >
          ↑
        </button>
        <button
          type="button"
          className="btn min-h-7 w-7 px-0 rounded-md text-xs"
          disabled={!next || isSaving}
          onClick={() => next && moveItem(item.id, next.id)}
          aria-label={`Move ${item.name} later`}
        >
          ↓
        </button>
        <button type="button" className="btn-link min-h-0 text-xs" onClick={() => renameItem(item)}>
          Rename
        </button>
        {item.kind === "counter" && (
          <button
            type="button"
            className="btn-link min-h-0 text-xs"
            aria-pressed={typeof item.lifetime === "number"}
            title="Also keep a total of everything ever added"
            onClick={() =>
              patchItem(item.id, {
                lifetime:
                  typeof item.lifetime === "number"
                    ? undefined
                    : typeof item.value === "number"
                      ? Math.max(0, item.value)
                      : 0,
              })
            }
          >
            {typeof item.lifetime === "number" ? "Running total: on" : "Running total: off"}
          </button>
        )}
        {placementControl(item)}
        {keep?.(item) && <span>From your GM, so it can't be removed.</span>}
      </div>
    );
  };

  // Wide: just the trackers, as tiles across the page.
  if (wide) {
    return (
      <ul
        className="grid grid-cols-[minmax(0,1fr)] gap-3 list-none m-0 p-0"
        style={{
          // At most `cols` across, fewer when there isn't room.
          gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, max(220px, calc((100% - ${(cols - 1) * 12}px) / ${cols}))), 1fr))`,
          // Short tiles fill the space beside a tall one.
          gridAutoFlow: "row dense",
        }}
      >
        {shown.map((item) => (
          <li
            key={item.id}
            className={`inset-panel p-4 ${tall(item) ? "row-span-2" : ""} ${dragClass(item)}`}
            {...dragProps(item)}
          >
            <TrackerItemControl
              item={item}
              canEdit={canEdit} editing={editing}
              isSaving={isSaving}
              onChange={(v) => setItem(item.id, v)}
              onPatch={(patch) => patchItem(item.id, patch)}
              onRemove={keep?.(item) ? undefined : () => removeItem(item)}
            />
            {editing && editBar(item)}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      {canEdit && state.items.length > 0 && !lockElsewhere && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-mute">
            {edit.editing
              ? "Rename, remove, move and add trackers."
              : "Locked: only the values change."}
          </span>
          <LockButton />
        </div>
      )}
      {shown.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] list-none m-0 p-0">
          {shown.map((item, i) => (
            <li
              key={item.id}
              className={`py-3 ${i === 0 ? "pt-0" : "border-t border-rule"} ${dragClass(item)}`}
              {...dragProps(item)}
            >
              <TrackerItemControl
                item={item}
                canEdit={canEdit} editing={editing}
                isSaving={isSaving}
                onChange={(v) => setItem(item.id, v)}
                onPatch={(patch) => patchItem(item.id, patch)}
                onRemove={keep?.(item) ? undefined : () => removeItem(item)}
              />
              {editing && editBar(item)}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 inset-panel p-3.5">
          <span className="label-mono">Track something new</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder={addPlaceholder}
            aria-label="Track something: name"
            className="field bg-surface"
          />
          <div className="flex gap-2">
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as TrackerKind)}
              aria-label="Tracker type"
              className="field bg-surface flex-1 min-w-0"
            >
              {(Object.keys(KIND_LABEL) as TrackerKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addItem}
              disabled={isSaving || !newName.trim()}
              className="btn btn-primary"
            >
              + Track
            </button>
          </div>
          <span className="text-xs text-mute leading-[1.4]">
            Number for points and tallies, List for things you unlock or
            collect, Stages for a track you move along, Checklist for a
            group of options you tick, Checkbox for a single on or off, Text
            for a current choice.
          </span>
          {allowColumns && state.items.length > 0 && (
            <label className="flex items-center justify-between gap-3 text-xs text-mute">
              <span>Tiles across when shown full width</span>
              <select
                value={state.items.find((i) => i.columns)?.columns ?? 2}
                onChange={(e) =>
                  onUpdate({
                    ...state,
                    items: state.items.map((i) => ({ ...i, columns: Number(e.target.value) })),
                  })
                }
                aria-label="Tiles across when shown full width"
                className="field bg-surface w-auto"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      {editing && (
        <details className="inset-panel p-3.5" data-testid="tracker-sets">
          <summary className="label-mono cursor-pointer">Import or share a tracker set</summary>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 mt-3">
            <span className="text-xs text-mute leading-[1.5]">
              Importing adds a set's trackers to the ones already here.
            </span>
            <input
              ref={setFile}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              data-testid="tracker-set-file"
              aria-label="Tracker set file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importSet(() => readTrackerLayoutFile(file));
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-sm" onClick={() => setFile.current?.click()}>
                Import from a file
              </button>
              {state.items.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    const name = window
                      .prompt("Name this tracker set", setName || "Tracker set")
                      ?.trim();
                    if (!name) return;
                    downloadFile(
                      `${name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "tracker-set"}.json`,
                      "application/json",
                      exportTrackerLayout(state, name.slice(0, 200)),
                    );
                  }}
                >
                  Download this set
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="url"
                value={setUrl}
                onChange={(e) => setSetUrl(e.target.value)}
                placeholder="GitHub link to a tracker set"
                aria-label="Link to a tracker set"
                className="field bg-surface flex-1 min-w-0"
              />
              <button
                type="button"
                className="btn"
                disabled={!setUrl.trim() || isSaving}
                onClick={() => void importSet(() => fetchTrackerLayout(setUrl))}
              >
                Import
              </button>
            </div>
            {setMessage && (
              <span role="status" className="text-[13px] font-semibold">
                {setMessage}
              </span>
            )}
            <span className="text-xs text-mute leading-[1.5]">
              Downloads leave out your numbers and progress.{" "}
              <a href={`${import.meta.env.BASE_URL}example-tracker-set.json`} download className="underline">
                Download an example
              </a>{" "}
              to see the format.
            </span>
          </div>
        </details>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        <span className="label-mono">{noteLabel}</span>
        {canEdit ? (
          <>
            <textarea
              rows={6}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder={notePlaceholder}
              className="field resize-y leading-[1.5]"
            />
            {isSaving && <span className="text-xs text-mute">Saving…</span>}
          </>
        ) : state.note ? (
          <p className="whitespace-pre-wrap text-ink-2 m-0 leading-[1.5]">{state.note}</p>
        ) : (
          <p className="text-mute text-[13px] m-0">No notes.</p>
        )}
      </div>
    </div>
  );
}

/**
 * A tracker that is a list of things (a checklist or a list) takes two
 * rows when shown as tiles, so two short trackers such as numbers can
 * stack beside it instead of leaving a gap.
 */
function tall(item: TrackerItem): boolean {
  return item.kind === "checklist" || item.kind === "list";
}

/** Switches every tracker panel between locked and set-up mode. */
export function LockButton() {
  const edit = useTrackerEdit();
  return (
    <button
      type="button"
      className="btn btn-sm"
      aria-pressed={edit.editing}
      onClick={edit.toggle}
    >
      {edit.editing ? "Lock trackers" : "Edit trackers"}
    </button>
  );
}

function RemoveButton({ name, onRemove }: { name: string; onRemove?: () => void }) {
  if (!onRemove) return null;
  return (
    <button
      type="button"
      onClick={onRemove}
      className="w-9 h-9 grid place-items-center bg-transparent border-0 rounded-lg cursor-pointer text-mute hover:bg-fill hover:text-bad flex-none"
      title="Remove tracker"
      aria-label={`Remove ${name}`}
    >
      ✕
    </button>
  );
}

function TrackerItemControl({
  item,
  canEdit,
  editing,
  isSaving,
  onChange,
  onPatch,
  onRemove,
}: {
  item: TrackerItem;
  canEdit: boolean;
  editing: boolean;
  isSaving: boolean;
  onChange: (value: TrackerItem["value"]) => void;
  onPatch: (patch: Partial<TrackerItem>) => void;
  onRemove?: () => void;
}) {
  if (item.kind === "counter") {
    const n = typeof item.value === "number" ? item.value : 0;
    const life = typeof item.lifetime === "number" ? item.lifetime : null;
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="label-mono truncate">{item.name}</div>
          <div className="font-display font-bold text-[34px] leading-none tnum mt-1">{n}</div>
          {life !== null && (
            <div className="text-xs text-mute mt-1 flex items-center gap-1.5 tnum">
              <span>Lifetime {life}</span>
              {editing && (
                <>
                  <button
                    type="button"
                    className="btn min-h-6 w-6 px-0 rounded-md text-xs"
                    disabled={isSaving || life <= 0}
                    onClick={() => onPatch({ lifetime: life - 1 })}
                    aria-label={`Correct lifetime ${item.name} down by 1`}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="btn min-h-6 w-6 px-0 rounded-md text-xs"
                    disabled={isSaving}
                    onClick={() => onPatch({ lifetime: life + 1 })}
                    aria-label={`Correct lifetime ${item.name} up by 1`}
                  >
                    +
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChange(n - 1)}
              disabled={isSaving}
              className={STEP}
              aria-label={`Take 1 from ${item.name}`}
            >
              −
            </button>
            <button
              type="button"
              onClick={() =>
                life === null ? onChange(n + 1) : onPatch({ value: n + 1, lifetime: life + 1 })
              }
              disabled={isSaving}
              className={STEP}
              aria-label={`Add 1 to ${item.name}`}
            >
              +
            </button>
            {editing && <RemoveButton name={item.name} onRemove={onRemove} />}
          </div>
        )}
      </div>
    );
  }

  if (item.kind === "list") {
    return (
      <ListValue
        item={item}
        canEdit={canEdit} editing={editing}
        isSaving={isSaving}
        onChange={onChange}
        onRemove={onRemove}
      />
    );
  }

  if (item.kind === "stage") {
    return (
      <StageValue item={item} canEdit={canEdit} editing={editing} isSaving={isSaving} onChange={onChange} onRemove={onRemove} />
    );
  }

  if (item.kind === "checklist") {
    return (
      <ChecklistValue item={item} canEdit={canEdit} editing={editing} isSaving={isSaving} onChange={onChange} onRemove={onRemove} />
    );
  }

  if (item.kind === "toggle") {
    const on = item.value === true;
    return (
      <div className="flex items-center gap-3">
        <label
          className={`flex items-center gap-3 flex-1 min-h-9 ${canEdit ? "cursor-pointer" : ""}`}
        >
          <input
            type="checkbox"
            checked={on}
            disabled={!canEdit || isSaving}
            onChange={(e) => onChange(e.target.checked)}
            className="flex-none"
          />
          <span className="font-semibold">{item.name}</span>
          <span className={`ml-auto chip ${on ? "bg-plate text-plate-ink" : ""}`}>
            {on ? "Active" : "Inactive"}
          </span>
        </label>
        {editing && <RemoveButton name={item.name} onRemove={onRemove} />}
      </div>
    );
  }

  // text
  return (
    <div className="flex items-end gap-3">
      <TextValue
        name={item.name}
        value={typeof item.value === "string" ? item.value : ""}
        canEdit={canEdit}
        onSave={onChange}
      />
      {editing && <RemoveButton name={item.name} onRemove={onRemove} />}
    </div>
  );
}

/** A named group of options, each ticked or not. */
function ChecklistValue({
  item,
  canEdit,
  editing,
  isSaving,
  onChange,
  onRemove,
}: {
  item: TrackerItem;
  canEdit: boolean;
  editing: boolean;
  isSaving: boolean;
  onChange: (value: TrackerChecklist) => void;
  onRemove?: () => void;
}) {
  const options =
    item.value && typeof item.value === "object" && "options" in item.value
      ? item.value.options
      : [];
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const on = options.filter((o) => o.on).length;
  const add = () => {
    if (!name.trim()) return;
    onChange({
      options: [
        ...options,
        { id: crypto.randomUUID(), name: name.trim(), detail: detail.trim().slice(0, 2000), on: false },
      ],
    });
    setName("");
    setDetail("");
  };
  const describe = (id: string, current: string, optionName: string) => {
    const next = window.prompt(`Description for "${optionName}" (leave empty for none)`, current);
    if (next === null) return;
    onChange({
      options: options.map((x) => (x.id === id ? { ...x, detail: next.trim().slice(0, 2000) } : x)),
    });
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="label-mono">
          {item.name} ({on} of {options.length})
        </span>
        {editing && <RemoveButton name={item.name} onRemove={onRemove} />}
      </div>
      {options.length === 0 && <p className="m-0 text-mute text-[13px]">No options yet.</p>}
      <ul className="grid grid-cols-[minmax(0,1fr)] list-none m-0 p-0">
        {options.map((o) => (
          <li key={o.id} className="flex items-start gap-2">
            <label
              className={`flex items-start gap-3 flex-1 min-w-0 py-1.5 ${canEdit ? "cursor-pointer" : ""}`}
            >
              <input
                type="checkbox"
                checked={o.on}
                disabled={!canEdit || isSaving}
                onChange={(e) =>
                  onChange({
                    options: options.map((x) => (x.id === o.id ? { ...x, on: e.target.checked } : x)),
                  })
                }
                className="flex-none mt-0.5"
              />
              <span className="min-w-0">
                <span className={o.on ? "font-semibold" : ""}>{o.name}</span>
                {o.detail && (
                  <span className="block text-[13px] text-mute leading-[1.5] whitespace-pre-wrap">
                    {o.detail}
                  </span>
                )}
              </span>
            </label>
            {editing && (
              <button
                type="button"
                onClick={() => describe(o.id, o.detail, o.name)}
                className="btn-link min-h-0 text-xs py-1.5"
                aria-label={`Describe ${o.name}`}
              >
                {o.detail ? "Edit description" : "Describe"}
              </button>
            )}
            {editing && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Remove the option "${o.name}"?`))
                    onChange({ options: options.filter((x) => x.id !== o.id) });
                }}
                className="bg-transparent border-0 cursor-pointer text-mute hover:text-bad py-1.5"
                aria-label={`Remove ${o.name}`}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {editing && (
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Add an option"
            aria-label={`Add an option to ${item.name}`}
            className="field flex-1 min-w-0"
          />
          <button type="button" onClick={add} disabled={isSaving || !name.trim()} className="btn">
            Add
          </button>
        </div>
      )}
      {editing && name.trim() && (
        <input
          type="text"
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="What it means (optional)"
          aria-label={`Description for the new option in ${item.name}`}
          className="field"
        />
      )}
    </div>
  );
}

/** A track of stages the player names, with one marked as current. */
function StageValue({
  item,
  canEdit,
  editing,
  isSaving,
  onChange,
  onRemove,
}: {
  item: TrackerItem;
  canEdit: boolean;
  editing: boolean;
  isSaving: boolean;
  onChange: (value: TrackerStages) => void;
  onRemove?: () => void;
}) {
  const v =
    item.value && typeof item.value === "object" && "stages" in item.value
      ? item.value
      : { stages: [], current: 0 };
  const [name, setName] = useState("");
  const add = () => {
    if (!name.trim()) return;
    onChange({ ...v, stages: [...v.stages, name.trim()] });
    setName("");
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="label-mono">{item.name}</span>
        {editing && <RemoveButton name={item.name} onRemove={onRemove} />}
      </div>
      {v.stages.length === 0 ? (
        <p className="m-0 text-mute text-[13px]">No stages yet. Add them in order.</p>
      ) : (
        <ol className="flex flex-wrap gap-1.5 list-none m-0 p-0">
          {v.stages.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!canEdit || isSaving}
                aria-pressed={i === v.current}
                onClick={() => onChange({ ...v, current: i })}
                className={`chip border-0 font-semibold ${canEdit ? "cursor-pointer" : ""} ${
                  i === v.current
                    ? "bg-plate text-plate-ink"
                    : i < v.current
                      ? "text-mute line-through"
                      : ""
                }`}
              >
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>
      )}
      {editing && (
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder="Next stage name"
            aria-label={`Add a stage to ${item.name}`}
            className="field flex-1 min-w-0"
          />
          <button type="button" onClick={add} disabled={isSaving || !name.trim()} className="btn">
            Add
          </button>
          {v.stages.length > 0 && (
            <button
              type="button"
              className="btn"
              disabled={isSaving}
              title="Remove the last stage"
              onClick={() =>
                onChange({
                  stages: v.stages.slice(0, -1),
                  current: Math.min(v.current, Math.max(0, v.stages.length - 2)),
                })
              }
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A named list the player adds entries to: unlocks, relics, worlds. */
function ListValue({
  item,
  canEdit,
  editing,
  isSaving,
  onChange,
  onRemove,
}: {
  item: TrackerItem;
  canEdit: boolean;
  editing: boolean;
  isSaving: boolean;
  onChange: (value: TrackerEntry[]) => void;
  onRemove?: () => void;
}) {
  const entries = Array.isArray(item.value) ? item.value : [];
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const add = () => {
    if (!name.trim()) return;
    onChange([...entries, { id: crypto.randomUUID(), name: name.trim(), detail: detail.trim() }]);
    setName("");
    setDetail("");
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="label-mono">
          {item.name} ({entries.length})
        </span>
        {editing && <RemoveButton name={item.name} onRemove={onRemove} />}
      </div>
      {entries.length === 0 ? (
        <p className="m-0 text-mute text-[13px]">Nothing here yet.</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1.5 list-none m-0 p-0">
          {entries.map((e) => (
            <li key={e.id} className="inset-panel px-3.5 py-2.5 flex items-start gap-3">
              <span className="flex-1 min-w-0">
                <span className="font-semibold block">{e.name}</span>
                {e.detail && (
                  <span className="block text-[13px] text-mute leading-[1.5] whitespace-pre-wrap">
                    {e.detail}
                  </span>
                )}
              </span>
              {editing && (
                <button
                  type="button"
                  onClick={() => onChange(entries.filter((x) => x.id !== e.id))}
                  className="bg-transparent border-0 cursor-pointer text-mute hover:text-bad"
                  aria-label={`Remove ${e.name}`}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            placeholder={`Add to ${item.name}`}
            aria-label={`Add to ${item.name}: name`}
            className="field"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              placeholder="What it does (optional)"
              aria-label={`Add to ${item.name}: description`}
              className="field flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={add}
              disabled={isSaving || !name.trim()}
              className="btn"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Text tracker with local draft, saved on blur/Enter. */
function TextValue({
  name,
  value,
  canEdit,
  onSave,
}: {
  name: string;
  value: string;
  canEdit: boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [prevRemote, setPrevRemote] = useState(value);
  if (value !== prevRemote) {
    setPrevRemote(value);
    setDraft(value);
  }

  return (
    <span className="grid grid-cols-[minmax(0,1fr)] gap-1.5 flex-1 min-w-0">
      <span className="label-mono">{name}</span>
      {canEdit ? (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onSave(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft !== value) onSave(draft);
          }}
          placeholder="Not set"
          className="field"
        />
      ) : (
        <span className="font-semibold">{value || "Not set"}</span>
      )}
    </span>
  );
}
