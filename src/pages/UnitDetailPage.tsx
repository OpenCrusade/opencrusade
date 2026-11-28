import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { SpecimenHeader } from "@/components/design/SpecimenHeader";
import { Stamped } from "@/components/design/Stamped";
import { rankProgress, reachesTopRanks } from "@/lib/utils/xp";
import { MarginNote } from "@/components/design/MarginNote";
import { useGmCorrection } from "@/hooks/useGmCorrection";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateEquipment } from "@/hooks/useRequisitions";
import { useCrusadeList } from "@/hooks/useCrusade";
import {
  useAdjustUnitXp,
  useApplyScar,
  useAwardHonour,
  useRemoveHonour,
  useRemoveScar,
  useUnit,
  useUpdateUnitNotes,
  useUpdateUnitBasics,
  useSetBonusHonours,
} from "@/hooks/useUnit";
import type { UnitBasics } from "@/lib/sync/roster-ops";
import { honourTally, unitCrusadePoints } from "@/lib/utils/crusade-points";
import { isWarlord, wargearOnly } from "@/lib/utils/warlord";
import type { BattleHonour, BattleScar, CrusadeCard, Rank } from "@/types";


export function UnitDetailPage() {
  const { rosterId, unitId } = useParams<{
    rosterId: string;
    unitId: string;
  }>();
  const { signedIn } = useAuth();
  const { data: unit, roster, isLoading } = useUnit(rosterId, unitId);
  // The player, or the GM once they have unlocked this force.
  const fix = useGmCorrection(roster);
  const canEdit = fix.canEdit;

  const adjustXp = useAdjustUnitXp(rosterId ?? "", unitId ?? "");
  const awardHonour = useAwardHonour(rosterId ?? "", unitId ?? "");
  const removeHonour = useRemoveHonour(rosterId ?? "", unitId ?? "");
  const applyScar = useApplyScar(rosterId ?? "", unitId ?? "");
  const removeScar = useRemoveScar(rosterId ?? "", unitId ?? "");
  const updateNotes = useUpdateUnitNotes(rosterId ?? "", unitId ?? "");
  const updateEquipment = useUpdateEquipment(rosterId ?? "", unitId ?? "");
  const { data: crusadesForHistory } = useCrusadeList();

  const [showHonour, setShowHonour] = useState(false);
  const [showScar, setShowScar] = useState(false);
  const [showBasics, setShowBasics] = useState(false);
  const updateBasics = useUpdateUnitBasics(rosterId ?? "", unitId ?? "");
  const setBonus = useSetBonusHonours(rosterId ?? "", unitId ?? "");

  if (!signedIn) return <Navigate to="/" replace />;
  if (!rosterId || !unitId) return <Navigate to="/rosters" replace />;

  if (isLoading) {
    return (
      <div className="page py-12">
        <p className="label-mono">Loading unit…</p>
      </div>
    );
  }

  if (!roster || !unit) {
    return (
      <div className="page py-12">
        <h1 className="specimen-title text-3xl [&_em]:specimen-title-em">
          <em>Unit not found.</em>
        </h1>
        <Link
          to={`/rosters/${rosterId}`}
          className="btn-link mt-6 inline-block"
        >
          Back to roster
        </Link>
      </div>
    );
  }

  const honours = honourTally(unit);
  const honourCap = honours.cap;
  const honoursFull = unit.battleHonours.length >= honourCap;
  const toNext = rankProgress(unit).toNext;

  return (
    <>
      <SpecimenHeader
        kicker={roster.factionName || "Unnamed force"}
        title={
          <>
            <em>{unit.name}</em>
          </>
        }
        blurb={`${isWarlord(unit) ? "Warlord, " : ""}${unit.datasheetName}${
          unit.isCharacter ? ", Character" : ""
        }, ${unit.modelCount} model${
          unit.modelCount === 1 ? "" : "s"
        }, ${unit.pointsCost} pts`}
        beneath={
          <div className="flex flex-wrap items-center gap-4">
            <Stamped tone={canEdit ? "good" : "ink"} rotation={-2}>
              {fix.isOwner ? "Your unit" : fix.correcting ? "Correcting as GM" : "Read-only"}
            </Stamped>
            {canEdit && (
              <button type="button" className="btn btn-sm" onClick={() => setShowBasics(true)}>
                Edit unit details
              </button>
            )}
            {fix.isGmVisitor && (
              <button
                type="button"
                className={fix.correcting ? "btn btn-primary btn-sm" : "btn btn-sm"}
                aria-pressed={fix.correcting}
                onClick={fix.correcting ? fix.lock : fix.unlock}
              >
                {fix.correcting ? "Lock this force" : "Unlock to correct"}
              </button>
            )}
            <span className="label-mono">
              Owner · {roster.player.displayName}
            </span>
          </div>
        }
        meta={[
          { label: "Rank", value: unit.rank },
          { label: "XP", value: `${unit.experiencePoints}` },
          ...(toNext !== null
            ? [{ label: "To next", value: `${toNext} XP` }]
            : []),
          { label: "Battles", value: String(unit.battlesPlayed) },
          { label: "Crusade pts", value: String(unitCrusadePoints(unit)) },
        ]}
      />

      <section className="page pt-4 pb-9">
        <div className="flex flex-col gap-4">
          <aside className="grid gap-4 order-last">
            <Link
              to={`/rosters/${rosterId}`}
              className="btn-link inline-block"
            >
              Back to roster
            </Link>
            <MarginNote label="About ranks">
              Battle-ready Blooded (6 XP) Battle-hardened (16) Heroic
              (31, characters only) Legendary (51, characters only).
              Honours cap at {honourCap} for this unit.
            </MarginNote>
          </aside>

          <article className="grid gap-4">
            {/* Pending promotion banner */}
            {unit.pendingPromotion && (
              <div className="card p-5 grid sm:grid-cols-[1fr_auto] gap-4 items-center">
                <div>
                  <span className="label-mono text-accent block mb-2">
                    Promotion earned
                  </span>
                  <p className="m-0 text-ink leading-[1.5]">
                    <strong className="font-semibold">{unit.name}</strong> was
                    promoted to{" "}
                    <strong className="font-semibold text-accent">
                      {unit.pendingPromotion.newRank}
                    </strong>{" "}
                    after a battle.{" "}
                    {canEdit
                      ? "Pick a battle honour to claim the promotion reward."
                      : "Awaiting the owner's honour pick."}
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    disabled={honoursFull}
                    onClick={() => setShowHonour(true)}
                    className="btn btn-primary"
                  >
                    Pick honour
                  </button>
                )}
              </div>
            )}

            <div className="card p-5 flex flex-col gap-4">
            <RankXpRuler
              currentXp={unit.experiencePoints}
              currentRank={unit.rank}
              isCharacter={reachesTopRanks(unit)}
            />

            {/* XP adjust controls (owner only) */}
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-rule">
                <span className="label-mono">Adjust XP</span>
                <XpDelta label="-1" delta={-1} onClick={() => adjustXp.mutate(-1)} />
                <XpDelta label="+1" delta={1} onClick={() => adjustXp.mutate(1)} />
                <XpDelta label="+3" delta={3} onClick={() => adjustXp.mutate(3)} />
                <XpDelta label="+5" delta={5} onClick={() => adjustXp.mutate(5)} />
                <span className="text-mute text-xs ml-2">
                  Manual corrections only. Battles award XP when you apply
                  their results.
                </span>
              </div>
            )}
            </div>

            {/* Tallies */}
            <Tallies>
              <Tally label="Battles played" value={unit.battlesPlayed} />
              <Tally label="Battles survived" value={unit.battlesSurvived} />
              <Tally label="Enemies destroyed" value={unit.enemiesDestroyed} />
              <Tally label="Crusade pts" value={unitCrusadePoints(unit)} />
            </Tallies>

            {/* Honours */}
            <Section
              title="Battle honours"
              meta={
                honours.available > 0
                  ? `${honours.held} of ${honourCap} · ${honours.available} to pick`
                  : `${honours.held} of ${honourCap}`
              }
              action={
                canEdit && (
                  <button
                    type="button"
                    disabled={honoursFull}
                    onClick={() => setShowHonour(true)}
                    className="btn btn-sm"
                    title={honoursFull ? "Honour cap reached" : "Award an honour"}
                  >
                    + Award honour
                  </button>
                )
              }
            >
              <div
                data-testid="honour-tally"
                className="inset-panel rounded-[10px] px-4 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[14px]"
              >
                <span>
                  <strong className="font-semibold">
                    {honours.available > 0
                      ? `${honours.available} honour${honours.available === 1 ? "" : "s"} to pick.`
                      : "No honours waiting to be picked."}
                  </strong>{" "}
                  Earned {honours.earned}: {honours.fromRank} from rank
                  {honours.fromRewards > 0 ? `, ${honours.fromRewards} from mission rewards` : ""}
                  {honours.lost > 0 ? `, less ${honours.lost} lost Out of Action` : ""}.
                </span>
                {canEdit && (
                  <span className="flex items-center gap-2">
                    <span className="text-[13px] text-mute">From mission rewards</span>
                    <button
                      type="button"
                      className="btn btn-sm w-9 px-0"
                      aria-label="One fewer honour from mission rewards"
                      disabled={honours.fromRewards === 0}
                      onClick={() => setBonus.mutate(honours.fromRewards - 1)}
                    >
                      −
                    </button>
                    <span className="tnum font-semibold w-4 text-center">{honours.fromRewards}</span>
                    <button
                      type="button"
                      className="btn btn-sm w-9 px-0"
                      aria-label="One more honour from mission rewards"
                      disabled={honours.fromRewards >= 6}
                      onClick={() => setBonus.mutate(honours.fromRewards + 1)}
                    >
                      +
                    </button>
                  </span>
                )}
              </div>
              {unit.battleHonours.length === 0 ? (
                <p className="text-mute italic">No honours awarded yet.</p>
              ) : (
                <ul className="grid gap-3 list-none p-0 m-0">
                  {unit.battleHonours.map((h) => (
                    <HonourRow
                      key={h.id}
                      honour={h}
                      canRemove={canEdit}
                      onRemove={() => removeHonour.mutate(h.id)}
                    />
                  ))}
                </ul>
              )}
            </Section>

            {/* Scars */}
            <Section
              title="Battle scars"
              meta={`${unit.battleScars.length}`}
              action={
                canEdit && (
                  <button
                    type="button"
                    onClick={() => setShowScar(true)}
                    className="btn btn-danger btn-sm"
                  >
                    + Apply scar
                  </button>
                )
              }
            >
              {unit.battleScars.length === 0 ? (
                <p className="text-mute italic">No scars. Hardy lot.</p>
              ) : (
                <ul className="grid gap-3 list-none p-0 m-0">
                  {unit.battleScars.map((s) => (
                    <ScarRow
                      key={s.id}
                      scar={s}
                      canRemove={canEdit}
                      onRemove={() => removeScar.mutate(s.id)}
                    />
                  ))}
                </ul>
              )}
            </Section>

            {/* Notes */}
            <Section title="Notes">
              {canEdit ? (
                <NotesEditor
                  initial={unit.notes}
                  onSave={(notes) => updateNotes.mutate(notes)}
                />
              ) : unit.notes ? (
                <p className="whitespace-pre-wrap text-ink-2 leading-[1.55]">
                  {unit.notes}
                </p>
              ) : (
                <p className="text-mute italic">No notes.</p>
              )}
            </Section>

            {/* Blessings & burdens (GM-assigned) */}
            {(unit.blessings.length > 0 || unit.burdens.length > 0) && (
              <Section
                title="Blessings & burdens"
                meta={`${unit.blessings.length + unit.burdens.length}`}
              >
                <ul className="grid gap-3 list-none p-0 m-0">
                  {unit.blessings.map((b) => (
                    <li
                      key={b.id}
                      className="grid grid-cols-[110px_1fr_auto] gap-5 py-4 border-b border-rule items-baseline"
                    >
                      <div className="label-mono text-good">Blessing</div>
                      <div>
                        <div className="font-display text-lg leading-tight">
                          {b.name}
                        </div>
                        {b.description && (
                          <p className="mt-1 text-sm text-ink-2 leading-[1.5] max-w-[60ch]">
                            {b.description}
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-[13px] text-mute whitespace-nowrap">
                        {formatDate(b.assignedAt)}
                      </span>
                    </li>
                  ))}
                  {unit.burdens.map((b) => (
                    <li
                      key={b.id}
                      className="grid grid-cols-[110px_1fr_auto] gap-5 py-4 border-b border-rule items-baseline"
                    >
                      <div className="label-mono text-bad">Burden</div>
                      <div>
                        <div className="font-display text-lg leading-tight">
                          {b.name}
                        </div>
                        {b.description && (
                          <p className="mt-1 text-sm text-ink-2 leading-[1.5] max-w-[60ch]">
                            {b.description}
                          </p>
                        )}
                      </div>
                      <span className="font-mono text-[13px] text-mute whitespace-nowrap">
                        {formatDate(b.assignedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Equipment / wargear */}
            <Section title="Equipment" meta={String(wargearOnly(unit.equipment).length)}>
              <EquipmentEditor
                items={wargearOnly(unit.equipment)}
                canEdit={canEdit}
                isSaving={updateEquipment.isPending}
                // An older import keeps the Warlord in the wargear list;
                // don't lose it when the wargear is edited.
                onChange={(items) =>
                  updateEquipment.mutate(
                    unit.isWarlord === undefined && isWarlord(unit) ? [...items, "Warlord"] : items,
                  )
                }
              />
            </Section>

            {/* History timeline (derived from unit data + battles) */}
            <Section title="History">
              <UnitHistory
                unit={unit}
                requisitions={roster.requisitionLog.filter((r) => r.targetUnitId === unit.id)}
                crusades={crusadesForHistory ?? []}
              />
            </Section>
          </article>
        </div>
      </section>

      {showHonour && (
        <AwardHonourDialog
          unitName={unit.name}
          onClose={() => setShowHonour(false)}
          onSubmit={async (input) => {
            await awardHonour.mutateAsync(input);
            setShowHonour(false);
          }}
        />
      )}

      {showBasics && (
        <BasicsDialog
          unit={unit}
          onClose={() => setShowBasics(false)}
          onSubmit={async (basics) => {
            await updateBasics.mutateAsync(basics);
            setShowBasics(false);
          }}
        />
      )}

      {showScar && (
        <ApplyScarDialog
          unitName={unit.name}
          onClose={() => setShowScar(false)}
          onSubmit={async (input) => {
            await applyScar.mutateAsync(input);
            setShowScar(false);
          }}
        />
      )}
    </>
  );
}

// ─── XP ruler ──────────────────────────────────────────────────────

function RankXpRuler({
  currentXp,
  currentRank,
  isCharacter,
}: {
  currentXp: number;
  currentRank: Rank;
  isCharacter: boolean;
}) {
  const prog = rankProgress({ experiencePoints: currentXp, isCharacter });
  const names = ["Ready", "Blooded", "Hardened", "Heroic", "Legendary"];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display font-bold text-[28px] leading-none">
          {currentXp}
          <span className="text-sm text-mute"> XP · {currentRank}</span>
        </span>
        <span className="text-[13px] text-mute">{prog.next}</span>
      </div>
      <div aria-hidden="true" className="grid items-center">
        <div className="[grid-area:1/1] grid grid-cols-5 gap-[3px]">
          {names.map((n) => (
            <div key={n} className="h-2 rounded bg-track" />
          ))}
        </div>
        <div
          className="[grid-area:1/1] h-2 rounded"
          style={{ width: `${(prog.career * 100).toFixed(1)}%`, background: "var(--mark, var(--color-ink))" }}
        />
      </div>
      <div className="grid grid-cols-5 gap-[3px] text-[11px] text-mute">
        {names.map((n, i) => (
          <span key={n} className={i >= 3 && !isCharacter ? "opacity-50" : ""}>
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Tallies ───────────────────────────────────────────────────────

function Tallies({ children }: { children: React.ReactNode }) {
  return (
    <div className="card px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
      {children}
    </div>
  );
}

function Tally({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stat-cell">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

// ─── Section ───────────────────────────────────────────────────────

function Section({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="plate-heading m-0">
          {title}
          {meta && <span className="ml-2 text-[13px] font-medium text-mute">{meta}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─── Honour / Scar rows ───────────────────────────────────────────

function HonourRow({
  honour,
  canRemove,
  onRemove,
}: {
  honour: BattleHonour;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="grid grid-cols-[110px_1fr_auto] gap-5 py-4 border-b border-rule items-baseline">
      <div>
        <div className="label-mono">{honour.type.replace(/-/g, " ")}</div>
        <div className="font-mono text-[13px] text-mute mt-1">
          {honour.source}
          {honour.relicTier && ` · ${honour.relicTier}`}
        </div>
      </div>
      <div>
        <div className="font-display text-lg leading-tight">{honour.name}</div>
        {honour.rules && (
          <p className="mt-1 text-sm text-ink-2 leading-[1.5] max-w-[60ch]">
            {honour.rules}
          </p>
        )}
        {honour.targetWeapon && (
          <div className="font-mono text-[13px] text-mute mt-1">
            on {honour.targetWeapon}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[13px] text-mute whitespace-nowrap">
          {formatDate(honour.awardedAt)}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="font-mono text-[13px] text-mute hover:text-bad px-2 py-1"
            title="Remove honour"
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

function ScarRow({
  scar,
  canRemove,
  onRemove,
}: {
  scar: BattleScar;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="grid grid-cols-[110px_1fr_auto] gap-5 py-4 border-b border-rule items-baseline">
      <div>
        <div className="label-mono text-bad">Scar</div>
      </div>
      <div>
        <div className="font-display text-lg leading-tight">{scar.name}</div>
        {scar.rules && (
          <p className="mt-1 text-sm text-ink-2 leading-[1.5] max-w-[60ch]">
            {scar.rules}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[13px] text-mute whitespace-nowrap">
          {formatDate(scar.receivedAt)}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="font-mono text-[13px] text-mute hover:text-bad px-2 py-1"
            title="Remove scar"
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

// ─── Notes editor (debounced auto-save) ───────────────────────────

function NotesEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (notes: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Sync if the underlying roster changes from a remote update.
  useEffect(() => {
    setValue(initial);
  }, [initial]);

  // Debounce saves.
  useEffect(() => {
    if (value === initial) return;
    setStatus("saving");
    const t = setTimeout(() => {
      onSave(value);
      setStatus("saved");
      const t2 = setTimeout(() => setStatus("idle"), 1200);
      return () => clearTimeout(t2);
    }, 1000);
    return () => clearTimeout(t);
    // intentionally omit onSave from deps to avoid re-arming on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, initial]);

  return (
    <div className="grid gap-2">
      <textarea
        rows={5}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Anything notable about this unit: narrative, painter's notes, who they killed in the last battle…"
        className="field resize-y"
      />
      <div className="font-mono text-[13px] text-mute h-4">
        {status === "saving" && "Saving…"}
        {status === "saved" && "Saved."}
      </div>
    </div>
  );
}

// ─── Dialogs ───────────────────────────────────────────────────────

function AwardHonourDialog({
  unitName,
  onClose,
  onSubmit,
}: {
  unitName: string;
  onClose: () => void;
  onSubmit: (input: import("@/lib/sync/roster-ops").AwardHonourInput) => Promise<void>;
}) {
  const [type, setType] = useState<
    "battle-trait" | "weapon-modification" | "crusade-relic"
  >("battle-trait");
  const [name, setName] = useState("");
  const [rules, setRules] = useState("");
  const [targetWeapon, setTargetWeapon] = useState("");
  const [relicTier, setRelicTier] = useState<
    "artificer" | "antiquity" | "legendary"
  >("artificer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <DialogShell label="Award honour" title={`New honour for ${unitName}`} onClose={onClose} disabled={submitting}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || submitting) return;
          setError(null);
          setSubmitting(true);
          try {
            const relicTierCost = relicTier === "artificer" ? 1 : relicTier === "antiquity" ? 2 : 3;
            await onSubmit({
              type,
              name: name.trim(),
              rules: rules.trim(),
              source: "custom",
              ...(type === "weapon-modification" && targetWeapon.trim()
                ? { targetWeapon: targetWeapon.trim() }
                : {}),
              ...(type === "crusade-relic"
                ? {
                    relicTier,
                    relicCrusadePointsCost: relicTierCost,
                  }
                : {}),
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSubmitting(false);
          }
        }}
        className="grid gap-6 mt-8"
      >
        <label className="grid gap-2">
          <span className="label-mono">Type</span>
          <div className="flex gap-3 flex-wrap">
            {(
              [
                ["battle-trait", "Battle Trait"],
                ["weapon-modification", "Weapon Mod"],
                ["crusade-relic", "Crusade Relic"],
              ] as const
            ).map(([v, label]) => (
              <label
                key={v}
                className="flex items-center gap-2 font-mono text-[13px] cursor-pointer"
              >
                <input
                  type="radio"
                  name="honour-type"
                  value={v}
                  checked={type === v}
                  onChange={() => setType(v)}
                  className="accent-accent"
                />
                {label}
              </label>
            ))}
          </div>
        </label>

        <label className="grid gap-2">
          <span className="label-mono">Name</span>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Steady aim, Heirloom blade"
            className="field"
          />
        </label>

        {type === "weapon-modification" && (
          <label className="grid gap-2">
            <span className="label-mono">Target weapon</span>
            <input
              type="text"
              value={targetWeapon}
              onChange={(e) => setTargetWeapon(e.target.value)}
              placeholder="Which weapon profile this modifies"
              className="field"
            />
          </label>
        )}

        {type === "crusade-relic" && (
          <label className="grid gap-2">
            <span className="label-mono">Relic tier</span>
            <div className="flex gap-3">
              {(["artificer", "antiquity", "legendary"] as const).map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2 font-mono text-[13px] capitalize cursor-pointer"
                >
                  <input
                    type="radio"
                    name="relic-tier"
                    value={t}
                    checked={relicTier === t}
                    onChange={() => setRelicTier(t)}
                    className="accent-accent"
                  />
                  {t}
                </label>
              ))}
            </div>
          </label>
        )}

        <label className="grid gap-2">
          <span className="label-mono">Reminder, in your own words</span>
          <textarea
            rows={4}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder="What the honour does mechanically"
            className="field resize-y"
          />
        </label>

        {error && (
          <div className="border border-bad text-bad p-4 font-mono text-[13px]">
            <strong className="font-semibold">Failed:</strong> {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-rule-strong">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="btn btn-primary"
          >
            {submitting ? "Awarding…" : "Award"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function ApplyScarDialog({
  unitName,
  onClose,
  onSubmit,
}: {
  unitName: string;
  onClose: () => void;
  onSubmit: (input: { name: string; rules: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [rules, setRules] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <DialogShell label="Apply scar" title={`New scar for ${unitName}`} onClose={onClose} disabled={submitting}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || submitting) return;
          setError(null);
          setSubmitting(true);
          try {
            await onSubmit({ name: name.trim(), rules: rules.trim() });
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSubmitting(false);
          }
        }}
        className="grid gap-6 mt-8"
      >
        <label className="grid gap-2">
          <span className="label-mono">Scar name</span>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Shaken, Walking wounded"
            className="field"
          />
        </label>

        <label className="grid gap-2">
          <span className="label-mono">Reminder, in your own words</span>
          <textarea
            rows={4}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder="What the scar does mechanically"
            className="field resize-y"
          />
        </label>

        {error && (
          <div className="border border-bad text-bad p-4 font-mono text-[13px]">
            <strong className="font-semibold">Failed:</strong> {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-rule-strong">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="btn btn-danger"
          >
            {submitting ? "Applying…" : "Apply scar"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function BasicsDialog({
  unit,
  onClose,
  onSubmit,
}: {
  unit: CrusadeCard;
  onClose: () => void;
  onSubmit: (basics: UnitBasics) => Promise<void>;
}) {
  const [name, setName] = useState(unit.name);
  const [datasheet, setDatasheet] = useState(unit.datasheetName);
  const [models, setModels] = useState(String(unit.modelCount));
  const [points, setPoints] = useState(String(unit.pointsCost));
  const [isCharacter, setIsCharacter] = useState(unit.isCharacter);
  const [warlord, setWarlord] = useState(isWarlord(unit));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const whole = (v: string) => /^\d+$/.test(v.trim());
  const valid = name.trim() !== "" && whole(models) && whole(points);

  return (
    <DialogShell title={`Edit ${unit.name}`} onClose={onClose} disabled={submitting}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || submitting) return;
          setError(null);
          setSubmitting(true);
          try {
            await onSubmit({
              name: name.trim(),
              datasheetName: datasheet.trim(),
              modelCount: Number(models),
              pointsCost: Number(points),
              isCharacter,
              isWarlord: warlord,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setSubmitting(false);
          }
        }}
        className="grid gap-6 mt-8"
      >
        <label className="grid gap-2">
          <span className="label-mono">Unit name</span>
          <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="field" maxLength={200} />
        </label>
        <label className="grid gap-2">
          <span className="label-mono">Datasheet</span>
          <input type="text" value={datasheet} onChange={(e) => setDatasheet(e.target.value)} className="field" maxLength={200} />
        </label>
        <div className="grid grid-cols-2 gap-6">
          <label className="grid gap-2">
            <span className="label-mono">Models</span>
            <input type="number" min={0} inputMode="numeric" value={models} onChange={(e) => setModels(e.target.value)} className="field" />
          </label>
          <label className="grid gap-2">
            <span className="label-mono">Points</span>
            <input type="number" min={0} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} className="field" />
          </label>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={isCharacter} onChange={(e) => setIsCharacter(e.target.checked)} className="accent-accent w-4 h-4" />
          <span>This unit is a Character</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={warlord} onChange={(e) => setWarlord(e.target.checked)} className="accent-accent w-4 h-4" />
          <span>This unit is the Warlord</span>
        </label>
        <p className="m-0 text-[13px] text-mute">
          A force has one Warlord: ticking it here takes it off any other unit.
          XP, honours, scars and battle tallies stay as they are.
        </p>
        {error && (
          <div className="border border-bad text-bad p-4 text-[13px]">
            <strong className="font-semibold">Not saved:</strong> {error}
          </div>
        )}
        <div className="flex justify-end gap-3 pt-4 border-t border-rule-strong">
          <button type="button" onClick={onClose} disabled={submitting} className="btn">
            Cancel
          </button>
          <button type="submit" disabled={!valid || submitting} className="btn btn-primary">
            {submitting ? "Saving…" : "Save unit"}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

function DialogShell({
  title,
  children,
  onClose,
  disabled,
}: {
  /** Unused; kept so call sites needn't change. */
  label?: string;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  disabled: boolean;
}) {
  useEffect(() => {
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = o;
    };
  }, []);

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
            disabled={disabled}
            className="btn-link"
          >
            Cancel
          </button>
        </div>
        <h2 className="specimen-title text-[clamp(1.75rem,4vw,2.75rem)] mt-6 [&_em]:specimen-title-em">
          <em>{title}</em>
        </h2>
        {children}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

// Convince TS that `CrusadeCard` is referenced (used in JSX type guard).
type _UnitTypeRef = CrusadeCard;
void (null as unknown as _UnitTypeRef | undefined);

function XpDelta({
  label,
  onClick,
}: {
  label: string;
  delta: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-sm"
    >
      {label}
    </button>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── Equipment editor ─────────────────────────────────────────────

function EquipmentEditor({
  items,
  canEdit,
  isSaving,
  onChange,
}: {
  items: string[];
  canEdit: boolean;
  isSaving: boolean;
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="grid gap-3">
      {items.length === 0 ? (
        <p className="text-mute italic m-0">
          {canEdit ? "No wargear recorded yet." : "No wargear recorded."}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
          {items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="inline-flex items-center gap-2 border border-rule-strong px-3 py-1.5 font-mono text-[13px]"
            >
              {item}
              {canEdit && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  className="text-mute hover:text-bad disabled:opacity-40"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                onChange([...items, draft.trim()]);
                setDraft("");
              }
            }}
            placeholder="e.g. Sidearm, Squad banner"
            className="field flex-1"
          />
          <button
            type="button"
            disabled={isSaving || !draft.trim()}
            onClick={() => {
              onChange([...items, draft.trim()]);
              setDraft("");
            }}
            className="btn btn-sm"
          >
            + Add
          </button>
        </div>
      )}
    </div>
  );
}

// ─── History timeline ─────────────────────────────────────────────

interface HistoryEvent {
  at: string;
  what: React.ReactNode;
}

function UnitHistory({
  unit,
  requisitions,
  crusades,
}: {
  unit: CrusadeCard;
  /** Requisitions spent on this unit. */
  requisitions: Array<{ name: string; rpCost: number; appliedAt: string }>;
  crusades: Array<{
    name: string;
    battles?: Array<{ id: string; missionName: string; date: string }>;
  }>;
}) {
  // Battle id label lookup across every known crusade.
  const battleLabel = (id: string): string => {
    for (const c of crusades) {
      const b = (c.battles ?? []).find((x) => x.id === id);
      if (b) return `${b.missionName} (${c.name})`;
    }
    return "a battle";
  };

  const events: HistoryEvent[] = [];

  events.push({
    at: unit.createdAt,
    what: (
      <>
        Enrolled in the Order of Battle as <em>{unit.datasheetName}</em>.
      </>
    ),
  });

  for (const battleId of unit.appliedBattleIds) {
    // Battle apply time isn't stored per-unit; the battle date is the
    // closest truthful anchor.
    const label = battleLabel(battleId);
    for (const c of crusades) {
      const b = (c.battles ?? []).find((x) => x.id === battleId);
      if (b) {
        events.push({
          at: `${b.date}T12:00:00Z`,
          what: <>Fought in <strong>{label}</strong>.</>,
        });
      }
    }
  }

  for (const h of unit.battleHonours) {
    events.push({
      at: h.awardedAt,
      what: (
        <>
          Awarded <strong>{h.name}</strong> ({h.type.replace(/-/g, " ")}
          {h.relicTier ? ` · ${h.relicTier}` : ""}).
        </>
      ),
    });
  }

  for (const scar of unit.battleScars) {
    events.push({
      at: scar.receivedAt,
      what: (
        <>
          Suffered the battle scar <strong>{scar.name}</strong>
          {scar.receivedFromBattleId
            ? <> after {battleLabel(scar.receivedFromBattleId)}</>
            : null}
          .
        </>
      ),
    });
  }

  for (const ooa of unit.appliedOoA) {
    events.push({
      at: ooa.resolvedAt,
      what: (
        <>
          Out of Action test after {battleLabel(ooa.battleId)}: rolled{" "}
          {ooa.rolled}:{" "}
          {ooa.outcome === "none"
            ? "no lasting damage."
            : ooa.outcome === "scar-gained"
              ? "gained a scar."
              : "lost an honour."}
        </>
      ),
    });
  }

  for (const r of requisitions) {
    events.push({
      at: r.appliedAt,
      what: (
        <>
          Requisition spent: <strong>{r.name}</strong> ({r.rpCost} RP).
        </>
      ),
    });
  }

  for (const b of unit.blessings) {
    events.push({
      at: b.assignedAt,
      what: (
        <>
          GM granted the blessing <strong>{b.name}</strong>.
        </>
      ),
    });
  }
  for (const b of unit.burdens) {
    events.push({
      at: b.assignedAt,
      what: (
        <>
          GM imposed the burden <strong>{b.name}</strong>.
        </>
      ),
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : -1));

  if (events.length === 0) {
    return <p className="text-mute italic m-0">No history yet.</p>;
  }

  return (
    <ul className="grid list-none p-0 m-0">
      {events.map((e, i) => (
        <li
          key={i}
          className="grid grid-cols-[110px_1fr] gap-5 py-3 border-b border-rule"
        >
          <span className="font-mono text-[13px] text-mute pt-1">
            {formatDate(e.at)}
          </span>
          <span className="text-[15px] text-ink-2 leading-[1.5] [&_strong]:text-ink [&_strong]:font-semibold [&_em]:font-display">
            {e.what}
          </span>
        </li>
      ))}
    </ul>
  );
}
