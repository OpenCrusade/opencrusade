import { useState } from "react";
import { useSetPhases } from "@/hooks/useCrusade";
import type { Crusade, CrusadePhase } from "@/types";

/** Where a phase stands today, from its dates. */
function phaseStatus(p: CrusadePhase, today: string): "Active" | "Upcoming" | "Ended" | "" {
  if (!p.start && !p.end) return "";
  if (p.start && today < p.start) return "Upcoming";
  if (p.end && today > p.end) return "Ended";
  return "Active";
}

function showDate(iso: string): string {
  if (!iso) return "Not set";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * The campaign's story in phases: a row of boxes, each with a title,
 * some narrative and the dates it runs. The GM writes them.
 */
export function PhasesSection({ crusade, isGm }: { crusade: Crusade; isGm: boolean }) {
  const save = useSetPhases(crusade.id);
  const phases = crusade.phases ?? [];
  const [editing, setEditing] = useState<CrusadePhase | null>(null);
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local

  if (phases.length === 0 && !isGm) return null;

  const commit = async (p: CrusadePhase) => {
    const exists = phases.some((x) => x.id === p.id);
    await save.mutateAsync(exists ? phases.map((x) => (x.id === p.id ? p : x)) : [...phases, p]);
    setEditing(null);
  };

  return (
    <section aria-label="Phases" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="plate-heading m-0">Phases</h2>
        {isGm && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              setEditing({ id: crypto.randomUUID(), name: "", text: "", start: "", end: "" })
            }
          >
            Add a phase
          </button>
        )}
      </div>

      {phases.length === 0 ? (
        <p className="card m-0 p-5 text-mute">
          No phases yet.
        </p>
      ) : (
        <ol className="grid gap-4 list-none m-0 p-0 grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]">
          {phases.map((p, i) => {
            const status = phaseStatus(p, today);
            return (
              <li key={p.id} className="card p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="m-0 font-display font-bold text-base leading-tight">{p.name}</h3>
                  {status && (
                    <span
                      className={`chip flex-none font-semibold ${status === "Active" ? "bg-plate text-plate-ink" : "text-mute"}`}
                    >
                      {status}
                    </span>
                  )}
                </div>
                {p.text && (
                  <p className="m-0 text-ink-2 leading-[1.55] whitespace-pre-wrap">{p.text}</p>
                )}
                <dl className="m-0 mt-auto flex justify-between gap-4 text-[13px]">
                  <div>
                    <dt className="label-mono">Begins</dt>
                    <dd className="m-0">{showDate(p.start)}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="label-mono">Ends</dt>
                    <dd className="m-0">{showDate(p.end)}</dd>
                  </div>
                </dl>
                {isGm && (
                  <div className="flex flex-wrap items-center gap-x-3 text-xs border-t border-rule pt-2">
                    <button type="button" className="btn-link min-h-0 text-xs" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-link min-h-0 text-xs"
                      disabled={i === 0 || save.isPending}
                      onClick={() => {
                        const next = [...phases];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        save.mutate(next);
                      }}
                    >
                      Move earlier
                    </button>
                    <button
                      type="button"
                      className="btn-link min-h-0 text-xs text-bad"
                      disabled={save.isPending}
                      onClick={() => {
                        if (window.confirm(`Remove the phase "${p.name}"?`))
                          save.mutate(phases.filter((x) => x.id !== p.id));
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {editing && (
        <PhaseDialog
          phase={editing}
          busy={save.isPending}
          error={save.error}
          onClose={() => setEditing(null)}
          onSave={commit}
        />
      )}
    </section>
  );
}

function PhaseDialog({
  phase,
  busy,
  error,
  onClose,
  onSave,
}: {
  phase: CrusadePhase;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (p: CrusadePhase) => Promise<void>;
}) {
  const [draft, setDraft] = useState(phase);
  const set = (patch: Partial<CrusadePhase>) => setDraft((d) => ({ ...d, ...patch }));
  const badDates = !!draft.start && !!draft.end && draft.end < draft.start;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Phase"
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto items-start dialog-scrim p-3"
    >
      <form
        className="relative w-full max-w-xl dialog-panel grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({ ...draft, name: draft.name.trim() });
        }}
      >
        <h2 className="specimen-title m-0">Phase</h2>
        <label className="grid gap-1.5">
          <span className="label-mono">Title</span>
          <input
            type="text"
            autoFocus
            maxLength={200}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. First landings"
            className="field"
          />
        </label>
        <label className="grid gap-1.5">
          <span className="label-mono">Narrative</span>
          <textarea
            rows={6}
            maxLength={5000}
            value={draft.text}
            onChange={(e) => set({ text: e.target.value })}
            placeholder="What is happening in this part of the campaign."
            className="field resize-y leading-[1.5]"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="label-mono">Begins</span>
            <input
              type="date"
              value={draft.start}
              onChange={(e) => set({ start: e.target.value })}
              className="field"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="label-mono">Ends</span>
            <input
              type="date"
              value={draft.end}
              onChange={(e) => set({ end: e.target.value })}
              className="field"
            />
          </label>
        </div>
        {badDates && (
          <p role="alert" className="m-0 text-bad text-[13px]">
            The end date is before the start date.
          </p>
        )}
        {error ? (
          <p role="alert" className="m-0 text-bad text-[13px]">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !draft.name.trim() || badDates}
          >
            {busy ? "Saving…" : "Save phase"}
          </button>
        </div>
      </form>
    </div>
  );
}
