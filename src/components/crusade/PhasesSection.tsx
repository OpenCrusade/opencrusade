import { useState } from "react";
import { Link } from "react-router-dom";
import { useSetPhases } from "@/hooks/useCrusade";
import { playedAs, plannedLabel, plannedPlayers } from "@/lib/utils/planned";
import type { Crusade, CrusadePhase, PlannedBattle } from "@/types";

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
export function PhasesSection({
  crusade,
  isGm,
  me,
  canRecord,
}: {
  crusade: Crusade;
  isGm: boolean;
  /** The signed-in player's Google ID. */
  me?: string;
  /** Whether this person may record battles. */
  canRecord: boolean;
}) {
  const save = useSetPhases(crusade.id);
  const phases = crusade.phases ?? [];
  const [editing, setEditing] = useState<CrusadePhase | null>(null);
  const [planning, setPlanning] = useState<{ phase: CrusadePhase; planned: PlannedBattle } | null>(null);
  const played = playedAs(crusade);
  const nameOf = (id: string) =>
    crusade.players.find((p) => p.user.googleId === id)?.user.displayName ?? "A former player";

  const savePlanned = async (phase: CrusadePhase, planned: PlannedBattle) => {
    const list = phase.planned ?? [];
    const next = list.some((x) => x.id === planned.id)
      ? list.map((x) => (x.id === planned.id ? planned : x))
      : [...list, planned];
    await save.mutateAsync(phases.map((x) => (x.id === phase.id ? { ...x, planned: next } : x)));
    setPlanning(null);
  };
  const removePlanned = (phase: CrusadePhase, id: string) =>
    save.mutate(
      phases.map((x) =>
        x.id === phase.id ? { ...x, planned: (x.planned ?? []).filter((p) => p.id !== id) } : x,
      ),
    );
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
                {((p.planned ?? []).length > 0 || isGm) && (
                  <div className="grid gap-2 border-t border-rule pt-3" data-testid="planned-battles">
                    <h4 className="m-0 text-[13px] font-semibold">Planned battles</h4>
                    {(p.planned ?? []).length === 0 && (
                      <p className="m-0 text-mute text-[13px]">None yet.</p>
                    )}
                    <ul className="m-0 p-0 list-none grid gap-2">
                      {(p.planned ?? []).map((pb) => {
                        const battle = played.get(pb.id);
                        const mine = !!me && plannedPlayers(pb).includes(me);
                        const details = [pb.mission, pb.where, pb.when].filter(Boolean).join(", ");
                        return (
                          <li key={pb.id} className="grid gap-0.5 text-[13px]">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-ink">{plannedLabel(pb, nameOf)}</span>
                              {battle ? (
                                <Link
                                  className="chip flex-none bg-plate text-plate-ink no-underline"
                                  to={`/crusades/${crusade.id}/battles/${battle.id}`}
                                >
                                  Played
                                </Link>
                              ) : (
                                <span className="chip flex-none text-mute">To play</span>
                              )}
                            </div>
                            {details && <span className="text-mute">{details}</span>}
                            {pb.note && <span className="text-ink-2 whitespace-pre-wrap">{pb.note}</span>}
                            {(isGm || (!battle && mine && canRecord)) && (
                              <span className="flex flex-wrap gap-x-3">
                                {!battle && canRecord && (mine || isGm) && (
                                  <Link
                                    className="btn-link min-h-0 text-xs"
                                    to={`/crusades/${crusade.id}/battles?new=1&planned=${pb.id}`}
                                  >
                                    Record this battle
                                  </Link>
                                )}
                                {isGm && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-link min-h-0 text-xs"
                                      onClick={() => setPlanning({ phase: p, planned: pb })}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="btn-link min-h-0 text-xs text-bad"
                                      disabled={save.isPending}
                                      onClick={() => {
                                        if (window.confirm(`Remove the planned battle ${plannedLabel(pb, nameOf)}?`))
                                          removePlanned(p, pb.id);
                                      }}
                                    >
                                      Remove
                                    </button>
                                  </>
                                )}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {isGm && (
                      <div>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() =>
                            setPlanning({
                              phase: p,
                              planned: {
                                id: crypto.randomUUID(),
                                sides: [[], []],
                                mission: "",
                                where: "",
                                when: "",
                                note: "",
                              },
                            })
                          }
                        >
                          Plan a battle
                        </button>
                      </div>
                    )}
                  </div>
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

      {planning && (
        <PlannedBattleDialog
          planned={planning.planned}
          players={crusade.players.map((x) => ({ id: x.user.googleId, name: x.user.displayName }))}
          missions={crusade.packContent?.missions ?? []}
          busy={save.isPending}
          error={save.error}
          onClose={() => setPlanning(null)}
          onSave={(pb) => savePlanned(planning.phase, pb)}
        />
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

function PlannedBattleDialog({
  planned,
  players,
  missions,
  busy,
  error,
  onClose,
  onSave,
}: {
  planned: PlannedBattle;
  players: { id: string; name: string }[];
  missions: string[];
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onSave: (p: PlannedBattle) => Promise<void>;
}) {
  const [draft, setDraft] = useState(planned);
  const set = (patch: Partial<PlannedBattle>) => setDraft((d) => ({ ...d, ...patch }));
  // A player is on one side at most: ticking them on one side takes
  // them off the other.
  const toggle = (side: 0 | 1, id: string) =>
    setDraft((d) => {
      const sides: PlannedBattle["sides"] = [[...d.sides[0]], [...d.sides[1]]];
      const other = side === 0 ? 1 : 0;
      if (sides[side].includes(id)) sides[side] = sides[side].filter((x) => x !== id);
      else {
        sides[side].push(id);
        sides[other] = sides[other].filter((x) => x !== id);
      }
      return { ...d, sides };
    });
  const ready = draft.sides[0].length > 0 && draft.sides[1].length > 0;

  const sideList = (side: 0 | 1) => (
    <fieldset className="grid gap-1.5 m-0 p-0 border-0 min-w-0">
      <legend className="label-mono mb-1.5">{side === 0 ? "One side" : "The other side"}</legend>
      {players.map((pl) => (
        <label key={pl.id} className="flex items-center gap-2 cursor-pointer text-[14px]">
          <input
            type="checkbox"
            checked={draft.sides[side].includes(pl.id)}
            onChange={() => toggle(side, pl.id)}
            className="accent-accent w-4 h-4"
          />
          <span className="truncate">{pl.name}</span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Planned battle"
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto items-start dialog-scrim p-3"
    >
      <form
        className="relative w-full max-w-xl dialog-panel grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          void onSave({
            ...draft,
            mission: draft.mission.trim(),
            where: draft.where.trim(),
            when: draft.when.trim(),
            note: draft.note.trim(),
          });
        }}
      >
        <h2 className="specimen-title m-0">Planned battle</h2>
        <p className="m-0 text-mute text-[13px] leading-[1.5]">
          Tick who plays on each side. It shows as played once one of
          them records the battle and picks this pairing.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {sideList(0)}
          {sideList(1)}
        </div>
        <label className="grid gap-1.5">
          <span className="label-mono">Mission (optional)</span>
          <input
            type="text"
            maxLength={200}
            value={draft.mission}
            onChange={(e) => set({ mission: e.target.value })}
            list={missions.length > 0 ? "planned-missions" : undefined}
            className="field"
          />
          {missions.length > 0 && (
            <datalist id="planned-missions">
              {missions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5">
            <span className="label-mono">Where (optional)</span>
            <input
              type="text"
              maxLength={200}
              value={draft.where}
              onChange={(e) => set({ where: e.target.value })}
              placeholder="e.g. The northern ridge"
              className="field"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="label-mono">When (optional)</span>
            <input
              type="text"
              maxLength={200}
              value={draft.when}
              onChange={(e) => set({ when: e.target.value })}
              placeholder="e.g. Saturday 6pm, club night"
              className="field"
            />
          </label>
        </div>
        <label className="grid gap-1.5">
          <span className="label-mono">Notes (optional)</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={draft.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="Special rules, format, anything the players should know."
            className="field resize-y leading-[1.5]"
          />
        </label>
        {error ? (
          <p role="alert" className="m-0 text-bad text-[13px]">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !ready}>
            {busy ? "Saving…" : "Save planned battle"}
          </button>
        </div>
      </form>
    </div>
  );
}
