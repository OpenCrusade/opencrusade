import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { AttachedRoster } from "@/types";

const newBattleSchema = z.object({
  missionName: z.string().min(1, "Required").max(200),
  date: z.string().min(1, "Required"),
  pointsLevel: z
    .string()
    .regex(/^\d+$/, "Whole number")
    .refine((s) => Number(s) > 0, "Must be > 0"),
  battleSize: z.enum(["Incursion", "Strike Force", "Onslaught", "Custom"]),
});

type FormValues = z.infer<typeof newBattleSchema>;

export interface NewBattleFormProps {
  attached: AttachedRoster[];
  /** The signed-in player: their force is listed first, already picked. */
  meId?: string;
  /** GM-defined mission names (crusade settings), offered as
   *  suggestions; free text always allowed. */
  missionOptions?: string[];
  /** Planned battles (from the phases) this person can record. */
  planned?: { id: string; label: string; participantIds: string[]; mission: string }[];
  /** Pre-select this planned battle (from "Record this battle"). */
  initialPlannedId?: string;
  onClose: () => void;
  onSubmit: (values: {
    missionName: string;
    date: string;
    pointsLevel: number;
    battleSize: "Incursion" | "Strike Force" | "Onslaught" | "Custom";
    participantGoogleIds: string[];
    plannedId?: string;
  }) => Promise<void>;
}

export function NewBattleForm({
  attached,
  meId,
  missionOptions = [],
  planned = [],
  initialPlannedId,
  onClose,
  onSubmit,
}: NewBattleFormProps) {
  const today = new Date().toISOString().slice(0, 10);

  const start = planned.find((p) => p.id === initialPlannedId);
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(newBattleSchema),
    defaultValues: {
      missionName: start?.mission ?? "",
      date: today,
      pointsLevel: "1000",
      battleSize: "Strike Force",
    },
  });

  // The person recording is in the battle; they pick who they played.
  const mine = attached.filter((a) => a.player.googleId === meId);
  const others = attached.filter((a) => a.player.googleId !== meId);
  const attachedIds = new Set(attached.map((a) => a.player.googleId));
  const fromPlan = (ids: string[]) => new Set(ids.filter((id) => attachedIds.has(id)));
  const [plannedId, setPlannedId] = useState(start?.id ?? "");
  const [includedIds, setIncludedIds] = useState<Set<string>>(() =>
    start ? fromPlan(start.participantIds) : new Set(mine.map((a) => a.player.googleId)),
  );
  // Picking a planned battle fills in its players and mission.
  const choosePlanned = (id: string) => {
    setPlannedId(id);
    const p = planned.find((x) => x.id === id);
    if (!p) return;
    setIncludedIds(fromPlan(p.participantIds));
    if (p.mission && !getValues("missionName").trim()) setValue("missionName", p.mission);
  };
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = o;
    };
  }, []);

  const handleFormSubmit = async (values: FormValues) => {
    setSubmitError(null);
    if (includedIds.size < 2) {
      setSubmitError(
        mine.length > 0 ? "Pick who you played against." : "Pick at least 2 players.",
      );
      return;
    }
    try {
      await onSubmit({
        missionName: values.missionName,
        date: values.date,
        pointsLevel: Number(values.pointsLevel),
        battleSize: values.battleSize,
        participantGoogleIds: Array.from(includedIds),
        ...(plannedId ? { plannedId } : {}),
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggle = (id: string) => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const row = (a: AttachedRoster) => (
    <li key={a.player.googleId}>
      <label className="flex items-center gap-3 cursor-pointer p-3 border border-rule hover:border-ink">
        <input
          type="checkbox"
          checked={includedIds.has(a.player.googleId)}
          onChange={() => toggle(a.player.googleId)}
          className="accent-accent w-4 h-4"
        />
        <span>
          <span className="font-display text-base leading-tight">
            {a.crusadeBanner || a.factionName}
          </span>
          <span className="block font-mono text-[13px] text-mute mt-1">
            {a.player.displayName}
          </span>
        </span>
      </label>
    </li>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto items-start dialog-scrim p-3"
    >
      <div className="relative w-full max-w-2xl dialog-panel">
        <div className="flex items-start justify-between gap-8">
          <span />
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-link"
          >
            Cancel
          </button>
        </div>

        <h2 className="specimen-title text-[clamp(2rem,5vw,3rem)] mt-6 [&_em]:specimen-title-em">
          Record a <em>battle</em>
        </h2>

        <form
          onSubmit={(e) => {
            void handleSubmit(handleFormSubmit)(e);
          }}
          className="mt-10 grid gap-6"
        >
          {planned.length > 0 && (
            <Field
              label="Planned battle"
              description="If the GM planned this battle in a phase, pick it so it shows as played."
            >
              <select
                value={plannedId}
                onChange={(e) => choosePlanned(e.target.value)}
                className="field"
                data-testid="battle-planned"
              >
                <option value="">Not a planned battle</option>
                {planned.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field
            label="Mission"
            error={errors.missionName?.message}
            description={
              missionOptions.length > 0
                ? "Pick from your pack's mission list, or type anything."
                : "From the pack, or whatever you played."
            }
          >
            <input
              type="text"
              autoFocus={planned.length === 0}
              {...register("missionName")}
              placeholder="e.g. Battle for the relay station"
              list={missionOptions.length > 0 ? "mission-options" : undefined}
              className="field"
            />
            {missionOptions.length > 0 && (
              <datalist id="mission-options">
                {missionOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-6">
            <Field
              label="Date"
              error={errors.date?.message}
            >
              <input
                type="date"
                {...register("date")}
                className="field"
              />
            </Field>
            <Field
              label="Points level"
              error={errors.pointsLevel?.message}
            >
              <input
                type="number"
                {...register("pointsLevel")}
                className="field"
              />
            </Field>
          </div>

          <Field label="Size" description="Strike Force is standard 2k.">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(
                ["Incursion", "Strike Force", "Onslaught", "Custom"] as const
              ).map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 cursor-pointer font-mono text-[13px]"
                >
                  <input
                    type="radio"
                    value={s}
                    {...register("battleSize")}
                    className="accent-accent"
                  />
                  {s}
                </label>
              ))}
            </div>
          </Field>

          <Field
            label="Participants"
            description="Tick everyone who fought in this battle."
          >
            {attached.length === 0 ? (
              <p className="text-mute italic text-sm">
                No attached rosters yet. At least 2 players need to attach
                rosters before a battle can be recorded.
              </p>
            ) : (
              <div className="grid gap-5">
                {mine.length > 0 && (
                  <div className="grid gap-2">
                    <span className="text-[13px] font-semibold">You</span>
                    <ul className="grid gap-2 list-none p-0 m-0">{mine.map(row)}</ul>
                  </div>
                )}
                {others.length > 0 && (
                  <div className="grid gap-2" data-testid="battle-opponents">
                    <span className="text-[13px] font-semibold">
                      {mine.length > 0 ? "Who you played" : "Players"}
                    </span>
                    <ul className="grid gap-2 list-none p-0 m-0">{others.map(row)}</ul>
                  </div>
                )}
              </div>
            )}
          </Field>

          {submitError && (
            <div className="border border-bad text-bad p-4 font-mono text-[13px] leading-[1.5]">
              <strong className="font-semibold">Failed:</strong> {submitError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-rule-strong">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || attached.length < 2}
              className="btn btn-primary"
            >
              {isSubmitting ? "Recording…" : "Record battle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <span className="label-mono">{label}</span>
      {description && (
        <span className="text-mute text-[13px] leading-[1.5]">
          {description}
        </span>
      )}
      {children}
      {error && (
        <span className="font-mono text-[13px] text-bad mt-1">{error}</span>
      )}
    </div>
  );
}
