import { useMemo, useRef, useState } from "react";
import {
  parseRosterFile,
  planImport,
  type ImportedRoster,
} from "@/lib/import/roster-import";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  downloadFile,
  exportStem,
  rosterToJson,
  rosterToRos,
} from "@/lib/export/roster-export";
import { OrderOfBattle } from "@/components/roster/OrderOfBattle";
import { rankProgress } from "@/lib/utils/xp";
import { Card, Crest, FormChips, Pips } from "@/components/ui/kit";
import { teamStyle } from "@/lib/utils/team";
import {
  FORCE_COLOURS,
  countedBattles,
  forceColour,
  forceName,
  standings,
} from "@/lib/utils/stats";
import { AddUnitForm } from "@/components/roster/AddUnitForm";
import { useAuth } from "@/hooks/useAuth";
import { useCrusade, useCrusadeList } from "@/hooks/useCrusade";
import {
  useAddUnit,
  useAddUnits,
  useUpdateUnitsFromList,
  useAdjustRP,
  useCrusadeMirrors,
  useRemoveUnit,
  useRoster,
  useSetFaction,
} from "@/hooks/useRoster";
import {
  useApplyGmAssignments,
  useGmAdjustRP,
  useGmSetFactionState,
  useSetFactionState,
  useSpendRequisition,
  useUndoRequisition,
} from "@/hooks/useRequisitions";
import { honourTally, rosterCrusadePoints } from "@/lib/utils/crusade-points";
import {
  CORE_REQUISITIONS,
  type RequisitionDef,
} from "@/lib/utils/requisitions";
import { resolveFactionModule } from "@/components/factions";
import { LockButton, TrackerPanel } from "@/components/common/TrackerPanel";
import { RosterSyncNotice } from "@/components/roster/RosterSyncNotice";
import { useGmCorrection } from "@/hooks/useGmCorrection";
import { readTrackerState, writeTrackerState } from "@/components/common/tracker-state";
import type { CrusadeCard, GMAssignment, PlayerRoster } from "@/types";

/**
 * Canonical roster view. URL: /rosters/:rosterId.
 */
export function RosterPage() {
  const { rosterId } = useParams<{ rosterId: string }>();
  const { user, signedIn } = useAuth();
  const { data: roster, isLoading } = useRoster(rosterId);
  const { data: crusades } = useCrusadeList();
  const addUnit = useAddUnit(rosterId ?? "");
  const removeUnit = useRemoveUnit(rosterId ?? "");
  const setFaction = useSetFaction(rosterId ?? "");
  const adjustRP = useAdjustRP(rosterId ?? "");
  const spendReq = useSpendRequisition(rosterId ?? "");
  const undoReq = useUndoRequisition(rosterId ?? "");
  const applyAssignments = useApplyGmAssignments(rosterId ?? "");
  const setFactionState = useSetFactionState(rosterId ?? "");
  const navigate = useNavigate();

  const [showAddUnit, setShowAddUnit] = useState(false);
  const [editingFaction, setEditingFaction] = useState(false);
  const [showRequisitions, setShowRequisitions] = useState(false);
  const addUnits = useAddUnits(rosterId ?? "");
  const importInput = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importList, setImportList] = useState<ImportedRoster | null>(null);
  const updateFromList = useUpdateUnitsFromList(rosterId ?? "");

  const isOwner = user?.googleId === roster?.player.googleId;
  const crusadeId = roster?.attachedTo?.[0]?.crusadeId;
  const gmSetFactionState = useGmSetFactionState(crusadeId ?? "", rosterId ?? "");
  const gmAdjustRP = useGmAdjustRP(crusadeId ?? "", rosterId ?? "");
  const fix = useGmCorrection(roster);
  const { data: crusade } = useCrusade(crusadeId);
  const { data: mirrors } = useCrusadeMirrors(crusadeId);

  // Pending GM assignments for this roster across every known crusade.
  const pendingAssignments = useMemo(() => {
    if (!roster || !isOwner) return [];
    const out: GMAssignment[] = [];
    for (const c of crusades ?? []) {
      for (const a of c.gmAssignments ?? []) {
        if (
          a.rosterId === roster.id &&
          !roster.appliedGmAssignments.includes(a.id)
        ) {
          out.push(a);
        }
      }
    }
    return out;
  }, [crusades, roster, isOwner]);

  if (!signedIn) return <Navigate to="/" replace />;
  if (!rosterId) return <Navigate to="/rosters" replace />;

  if (isLoading) {
    return (
      <div className="page py-12">
        <p className="label-mono">Loading roster…</p>
      </div>
    );
  }

  if (!roster) {
    return (
      <div className="page py-12">
        <h1 className="specimen-title text-3xl [&_em]:specimen-title-em">
          <em>Roster not found.</em>
        </h1>
        <p className="mt-4 text-ink-2 max-w-[60ch]">
          This roster isn't on this device. Open the crusade it belongs to
          and it will appear here.
        </p>
        <Link
          to="/rosters"
          className="btn-link mt-6 inline-block"
        >
          Back to library
        </Link>
      </div>
    );
  }

  const totalCP = rosterCrusadePoints(roster);
  const factionModule = resolveFactionModule(roster.factionName);
  const colour = forceColour(roster);
  const name = roster.factionName || "Unnamed force";

  // Where this force stands in its crusade.
  const table = crusade ? standings(mirrors ?? [], crusade.battles ?? []) : [];
  const position = table.findIndex((r) => r.roster.id === roster.id);
  const row = position >= 0 ? table[position] : undefined;
  const last = crusade
    ? countedBattles(crusade.battles ?? [])
        .filter((b) => b.participants.some((p) => p.googleId === roster.player.googleId))
        .at(-1)
    : undefined;
  const lastMe = last?.participants.find((p) => p.googleId === roster.player.googleId);
  const lastThem = last?.participants.find((p) => p.googleId !== roster.player.googleId);
  const lastThemRoster = (mirrors ?? []).find((m) => m.id === lastThem?.rosterId);

  // Attention cards.
  const closest = roster.units
    .map((u) => ({ u, p: rankProgress(u) }))
    .filter((x) => x.p.toNext !== null)
    .sort((a, b) => (a.p.toNext ?? 0) - (b.p.toNext ?? 0))[0];
  const topKills = [...roster.units].sort((a, b) => b.enemiesDestroyed - a.enemiesDestroyed)[0];
  const scarred = roster.units.filter((u) => u.battleScars.length > 0);
  const pendingPromotions = roster.units.filter((u) => honourTally(u).available > 0);
  const unitHref = (id: string) => `/rosters/${rosterId}/units/${id}`;
  const free = roster.supplyLimit - roster.supplyUsed;

  // The GM can correct a player's trackers; everything else on a
  // player's force stays read-only to them.
  const isGmHere =
    !!crusade &&
    crusade.players.find((p) => p.role === "gm")?.user.googleId === user?.googleId;
  const { isGmVisitor, correcting } = fix;
  const canEditTrackers = fix.canEdit;
  const changeRP = isOwner ? adjustRP : gmAdjustRP;
  const saveTrackers = isOwner ? setFactionState : gmSetFactionState;

  // Trackers placed above or below the squad, grouped by the GM set
  // they came from.
  const trackers = readTrackerState(roster.factionState);
  const wideTrackers = (where: "above" | "below") => {
    const here = trackers.items.filter((i) => i.placement === where);
    if (here.length === 0) return null;
    const groups = new Map<string, string>();
    for (const i of here) {
      const setId = i.setRef?.split(":")[0] ?? "";
      if (!groups.has(setId)) {
        groups.set(
          setId,
          (crusade?.trackerSets ?? []).find((s) => s.id === setId)?.name ?? "Trackers",
        );
      }
    }
    return (
      <>
        {[...groups].map(([setId, title]) => (
          <Card key={setId || "own"} title={title} label={title}>
            <TrackerPanel
              state={trackers}
              canEdit={canEditTrackers}
              isSaving={saveTrackers.isPending}
              onUpdate={(next) =>
                saveTrackers.mutate(writeTrackerState(roster.factionState, next))
              }
              show={(i) => i.placement === where && (i.setRef?.split(":")[0] ?? "") === setId}
              wide
              allowPlacement
              keep={(i) =>
                (crusade?.trackerSets ?? []).some(
                  (s) => s.scope === "everyone" && i.setRef?.startsWith(`${s.id}:`),
                )
              }
            />
          </Card>
        ))}
      </>
    );
  };

  return (
    <div className="page pt-5 pb-9 flex flex-col gap-4" style={teamStyle(colour)}>
      {isOwner && <RosterSyncNotice rosterId={roster.id} />}
      {isOwner && !crusadeId && (
        <p className="note m-0" data-testid="device-only">
          <strong className="font-semibold text-ink">Only on this device.</strong>{" "}
          Add it to a campaign to save it to that campaign's sheet.
        </p>
      )}
      <section
        aria-label="Force summary"
        className="banner flex flex-wrap items-center justify-between gap-x-10 gap-y-5"
      >
        <div className="flex items-center gap-4 min-w-0">
          <Crest name={name} size={56} tone="glass" />
          <div className="flex flex-col gap-1.5 min-w-0">
            <h1 className="nameplate">{name}</h1>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[#D5DEE8] text-[13px]">
              <span>
                {row ? `${ordinal(position + 1)} of ${table.length} · ` : ""}
                {isOwner
                  ? "Your force"
                  : isGmHere
                    ? `${roster.player.displayName}'s force`
                    : `${roster.player.displayName}'s force, read-only`}
              </span>
              {row && row.played > 0 && (
                <span data-testid="force-record">
                  Won {row.w}, drawn {row.d}, lost {row.l}
                </span>
              )}
              {row && <FormChips results={row.results} last={5} onBanner />}
            </div>
          </div>
        </div>

        {last && lastMe && lastThem && (
          <Link
            to={`/crusades/${crusadeId}/battles/${last.id}`}
            className="flex flex-col items-center gap-2 no-underline text-white"
          >
            <div className="text-[#D5DEE8] text-xs font-medium">
              Last battle · {OUTCOME_WORD[lastMe.outcome] ?? ""}
            </div>
            <div className="flex items-center gap-3.5 font-display font-bold">
              <Crest name={name} size={32} tone="glass" />
              <span className="text-[34px] leading-none tnum">
                {lastMe.victoryPoints} – {lastThem.victoryPoints}
              </span>
              <Crest
                name={lastThemRoster ? forceName(lastThemRoster) : lastThem.displayName}
                size={32}
                colour={lastThemRoster ? forceColour(lastThemRoster) : "#5B6472"}
              />
            </div>
            <div className="text-[#D5DEE8] text-xs">
              vs {lastThemRoster ? forceName(lastThemRoster) : lastThem.displayName}
            </div>
          </Link>
        )}

        <div className="flex flex-wrap gap-x-7 gap-y-4 items-start">
          <div className="flex flex-col gap-1.5 w-[150px]">
            <div className="font-display font-bold text-[22px] leading-[1.1] tnum">
              {roster.supplyUsed}
              <span className="text-[13px] font-semibold text-[#D5DEE8]">
                {" "}
                / {roster.supplyLimit}
              </span>
            </div>
            <div aria-hidden="true" className="h-[5px] rounded-[3px] bg-white/20">
              <div
                className="h-[5px] rounded-[3px] bg-white"
                style={{
                  width: `${Math.min(100, (roster.supplyUsed / Math.max(1, roster.supplyLimit)) * 100)}%`,
                }}
              />
            </div>
            <div className="text-[#D5DEE8] text-xs">
              Supply · {free >= 0 ? `${free} free` : `${-free} over`}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="font-display font-bold text-[22px] leading-[1.1] tnum">
              {roster.requisitionPoints}
            </div>
            <Pips
              filled={roster.requisitionPoints}
              total={10}
              label={`${roster.requisitionPoints} of 10 Requisition points`}
              onBanner
            />
            <div className="text-[#D5DEE8] text-xs">Requisition</div>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="font-display font-bold text-[22px] leading-[1.1] tnum">{totalCP}</div>
            <div aria-hidden="true" className="h-[5px]" />
            <div className="text-[#D5DEE8] text-xs">Crusade pts</div>
          </div>
        </div>
      </section>

      {isGmVisitor && (
        <section
          aria-label="GM corrections"
          className={`card p-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 ${
            correcting ? "border-2 border-signal" : ""
          }`}
        >
          <p className="m-0 max-w-[70ch] text-[14px]">
            {correcting ? (
              <>
                <strong className="font-semibold">
                  You are correcting {roster.player.displayName}'s force.
                </strong>{" "}
                Lock it again when you are done.
              </>
            ) : (
              <>
                You are viewing {roster.player.displayName}'s force.
              </>
            )}
          </p>
          <button
            type="button"
            className={correcting ? "btn btn-primary" : "btn"}
            aria-pressed={correcting}
            onClick={() => {
              if (correcting) fix.lock();
              else fix.unlock();
            }}
          >
            {correcting ? "Lock this force" : "Unlock to correct"}
          </button>
        </section>
      )}

      {pendingAssignments.length > 0 && (
        <section className="card p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="label-mono mb-1">
              From your GM: {pendingAssignments.length} to accept
            </div>
            <ul className="m-0 p-0 list-none grid gap-1">
              {pendingAssignments.map((a) => (
                <li key={a.id}>
                  <strong className="font-semibold capitalize">{a.type}</strong> · {a.name} for{" "}
                  {roster.units.find((u) => u.id === a.unitId)?.name ?? "(unit removed)"}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            disabled={applyAssignments.isPending}
            onClick={() =>
              applyAssignments.mutate(
                pendingAssignments.map((a) => ({
                  id: a.id,
                  unitId: a.unitId,
                  type: a.type,
                  name: a.name,
                  description: a.description,
                  assignedBy: a.assignedBy,
                  assignedAt: a.assignedAt,
                })),
              )
            }
            className="btn btn-primary"
          >
            {applyAssignments.isPending ? "Applying…" : "Accept all"}
          </button>
        </section>
      )}

      {roster.units.length > 0 && (
        <section
          aria-label="Needs attention"
          className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))]"
        >
          {pendingPromotions.length > 0 ? (
            <Attention
              to={unitHref(pendingPromotions[0].id)}
              label="Honour to choose"
              title={pendingPromotions.map((u) => u.name).join(", ")}
              detail="Earned a Battle Honour that hasn't been picked yet"
              figure={pendingPromotions.reduce((n, u) => n + honourTally(u).available, 0)}
            />
          ) : (
            closest && (
              <Attention
                to={unitHref(closest.u.id)}
                label="Closest to promotion"
                title={closest.u.name}
                detail={closest.p.next}
                figure={closest.u.experiencePoints}
              />
            )
          )}
          {topKills && topKills.enemiesDestroyed > 0 && (
            <Attention
              to={unitHref(topKills.id)}
              label="Top kills"
              title={topKills.name}
              detail={`${topKills.enemiesDestroyed} destroyed in ${topKills.battlesPlayed} battle${topKills.battlesPlayed === 1 ? "" : "s"}`}
              figure={topKills.enemiesDestroyed}
            />
          )}
          {scarred.length > 0 && (
            <Attention
              to={unitHref(scarred[0].id)}
              label="Carrying Battle Scars"
              title={scarred.map((u) => u.name).join(", ")}
              detail="Repair and Recuperate from 1 RP"
              figure={scarred.length}
            />
          )}
        </section>
      )}

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[999_1_600px] min-w-0 flex flex-col gap-4">
          {wideTrackers("above")}
          <OrderOfBattle
            roster={roster}
            supplyCeiling={roster.supplyLimit}
            onRemove={canEditTrackers ? (id) => removeUnit.mutate(id) : undefined}
            isRemoving={removeUnit.isPending}
            action={
              canEditTrackers && (
                <button
                  type="button"
                  onClick={() => setShowAddUnit(true)}
                  className="btn btn-primary btn-sm"
                >
                  Add unit
                </button>
              )
            }
          />
          {wideTrackers("below")}
        </div>

        <div className="flex-[1_1_340px] min-w-0 flex flex-col gap-4">
          <Card
            title="Requisition"
            action={
              <span className="flex items-center gap-3">
                <Pips
                  filled={roster.requisitionPoints}
                  total={10}
                  tall
                  label={`${roster.requisitionPoints} of 10 Requisition points`}
                />
                <span className="font-display font-bold text-[22px] leading-none tnum">
                  {roster.requisitionPoints}
                  <span className="text-sm text-mute"> RP</span>
                </span>
              </span>
            }
          >
            {canEditTrackers && (
              <div className="flex flex-wrap items-center gap-2">
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => setShowRequisitions(true)}
                    className="btn btn-primary flex-1"
                  >
                    Spend requisition
                  </button>
                ) : (
                  <span className="flex-1 text-[13px] text-mute">Correct their RP</span>
                )}
                <button
                  type="button"
                  onClick={() => changeRP.mutate(-1)}
                  disabled={roster.requisitionPoints === 0 || changeRP.isPending}
                  className="btn w-11 px-0"
                  aria-label="Take away 1 Requisition point"
                  title="Adjust RP down"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => changeRP.mutate(1)}
                  disabled={changeRP.isPending || roster.requisitionPoints >= 10}
                  className="btn w-11 px-0"
                  aria-label="Add 1 Requisition point"
                  title="Adjust RP up (cap 10)"
                >
                  +
                </button>
              </div>
            )}
            {roster.requisitionLog.length === 0 ? (
              <p className="m-0 text-mute text-[13px]">
                Nothing spent yet.
              </p>
            ) : (
              <div className="flex flex-col">
                {[...roster.requisitionLog].reverse().map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between gap-3 min-h-[52px] py-1.5 border-t border-rule"
                  >
                    <span className="flex flex-col gap-px min-w-0">
                      <span className="font-semibold">{r.name}</span>
                      <span className="text-xs text-mute">
                        {[
                          r.targetUnitId
                            ? (roster.units.find((u) => u.id === r.targetUnitId)?.name ??
                              "(removed unit)")
                            : r.description,
                          new Date(r.appliedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          }),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-semibold tnum whitespace-nowrap">−{r.rpCost} RP</span>
                      {canEditTrackers && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={undoReq.isPending}
                          aria-label={`Undo ${r.name}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Undo ${r.name}? ${r.rpCost} RP comes back. A supply increase or Legendary Veterans is reversed; a removed scar or a picked honour is not changed, so fix those by hand.`,
                              )
                            ) {
                              undoReq.mutate(r.id);
                            }
                          }}
                        >
                          Undo
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {undoReq.isError && (
              <p role="alert" className="m-0 text-bad text-[13px] font-semibold">
                {undoReq.error instanceof Error ? undoReq.error.message : String(undoReq.error)}
              </p>
            )}
          </Card>

          <Card title={isOwner ? factionModule.label : "Trackers"}>
            <factionModule.Component
              roster={roster}
              isOwner={canEditTrackers}
              onUpdateState={(state) => saveTrackers.mutate(state)}
              isSaving={saveTrackers.isPending}
            />
          </Card>

          <Card title="This force">
            <div className="flex flex-wrap gap-2">
              {isOwner && (
                <button type="button" onClick={() => setEditingFaction(true)} className="btn btn-sm">
                  {roster.factionName ? "Edit faction" : "Set faction"}
                </button>
              )}
              {isOwner && trackers.items.length > 0 && <LockButton />}
              {isOwner && (
                <>
                  <input
                    ref={importInput}
                    type="file"
                    accept=".ros,.rosz,.json,application/json,text/xml,application/xml"
                    className="sr-only"
                    data-testid="roster-import-file"
                    aria-label="Army list file"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setImportMessage(null);
                      try {
                        const list = await parseRosterFile(file);
                        // Open the choice: update matching units or add all.
                        setImportList({ ...list, name: list.name || file.name });
                      } catch (err) {
                        setImportMessage(err instanceof Error ? err.message : String(err));
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={addUnits.isPending}
                    onClick={() => importInput.current?.click()}
                  >
                    {addUnits.isPending ? "Importing…" : "Import a list"}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() =>
                  downloadFile(`${exportStem(roster)}.ros`, "application/xml", rosterToRos(roster))
                }
                className="btn btn-sm"
              >
                .ros file
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadFile(
                    `${exportStem(roster)}.json`,
                    "application/json",
                    rosterToJson(roster),
                  )
                }
                className="btn btn-sm"
              >
                JSON backup
              </button>
            </div>
            {importMessage && (
              <p role="status" className="m-0 text-[13px] font-semibold">
                {importMessage}
              </p>
            )}
            <p className="m-0 text-mute text-[13px] leading-[1.5]">
              Import takes a New Recruit or BattleScribe list (.ros, .rosz or
              JSON).
            </p>
            {!crusade && (
              <Link to="/rosters" className="btn-link self-start">
                Back to library
              </Link>
            )}
          </Card>
        </div>
      </div>

      {importList && (
        <ImportListDialog
          list={importList}
          units={roster.units}
          busy={addUnits.isPending || updateFromList.isPending}
          onClose={() => setImportList(null)}
          onAddAll={async () => {
            await addUnits.mutateAsync(importList.units);
            setImportMessage(`Added ${importList.units.length} units.`);
            setImportList(null);
          }}
          onUpdate={async () => {
            const plan = planImport(roster.units, importList.units);
            await updateFromList.mutateAsync(importList.units);
            setImportMessage(
              `Updated ${plan.updates.length} unit${plan.updates.length === 1 ? "" : "s"}, added ${plan.additions.length}.`,
            );
            setImportList(null);
          }}
        />
      )}

      {showAddUnit && (
        <AddUnitForm
          onClose={() => setShowAddUnit(false)}
          onSubmit={async (values) => {
            await addUnit.mutateAsync(values);
            setShowAddUnit(false);
          }}
        />
      )}

      {editingFaction && (
        <FactionDialog
          current={roster.factionName}
          currentColour={colour}
          onSubmit={async (name, picked) => {
            await setFaction.mutateAsync({ factionName: name, colour: picked });
            setEditingFaction(false);
          }}
          onClose={() => setEditingFaction(false)}
        />
      )}

      {showRequisitions && (
        <RequisitionsDialog
          roster={roster}
          onClose={() => setShowRequisitions(false)}
          onSpend={async (input) => {
            const result = await spendReq.mutateAsync(input);
            setShowRequisitions(false);
            // Renowned Heroes: route straight to the honour pick.
            if (
              result.def.effect.kind === "pick-unit" &&
              result.def.effect.apply === "grant-honour-pick" &&
              input.unitId
            ) {
              navigate(`/rosters/${rosterId}/units/${input.unitId}`);
            }
          }}
        />
      )}
    </div>
  );
}

const OUTCOME_WORD: Record<string, string> = { victory: "Won", defeat: "Lost", draw: "Drew" };

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** A card that points at one thing worth looking at. */
function Attention({
  to,
  label,
  title,
  detail,
  figure,
}: {
  to: string;
  label: string;
  title: string;
  detail: string;
  figure: number;
}) {
  return (
    <Link
      to={to}
      className="card rounded-2xl min-h-[76px] px-[18px] py-3.5 flex items-center justify-between gap-3.5 no-underline text-ink"
    >
      <span className="flex flex-col gap-[3px] min-w-0">
        <span className="label-mono">{label}</span>
        <span className="font-semibold truncate">{title}</span>
        <span className="text-xs text-mute">{detail}</span>
      </span>
      <span className="font-display font-bold text-[26px] tnum">{figure}</span>
    </Link>
  );
}

// ─── Import a list onto a force ───────────────────────────────────

function ImportListDialog({
  list,
  units,
  busy,
  onClose,
  onAddAll,
  onUpdate,
}: {
  list: ImportedRoster;
  units: CrusadeCard[];
  busy: boolean;
  onClose: () => void;
  onAddAll: () => Promise<void>;
  onUpdate: () => Promise<void>;
}) {
  const plan = planImport(units, list.units);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const HOW = { id: "same unit as last import", name: "same name", datasheet: "only unit of this type" };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import a list"
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto items-start dialog-scrim p-3"
    >
      <div className="relative w-full max-w-2xl dialog-panel grid gap-4">
        <div>
          <h2 className="specimen-title m-0">Import "{list.name}"</h2>
          <p className="m-0 mt-1 text-mute">
            {list.units.length} unit{list.units.length === 1 ? "" : "s"}, {list.points} pts.
            {units.length > 0
              ? " This force already has units, so choose what the list should do."
              : ""}
          </p>
        </div>

        {units.length > 0 && (
          <div className="grid gap-3" data-testid="import-plan">
            <PlanGroup
              title={`Would update (${plan.updates.length})`}
              hint="Points, models, datasheet and wargear come from the list. XP, rank, honours, scars and battle history are kept."
              empty="No unit in the list matches one you have."
            >
              {plan.updates.map((u) => (
                <li key={u.existing.id} className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-semibold">{u.existing.name}</span>
                  <span className="text-mute text-[13px]">
                    {u.incoming.datasheetName} · {u.existing.pointsCost}
                    {u.incoming.pointsCost !== u.existing.pointsCost
                      ? ` → ${u.incoming.pointsCost}`
                      : ""}{" "}
                    pts · {HOW[u.how]}
                  </span>
                </li>
              ))}
            </PlanGroup>
            <PlanGroup title={`Would add as new (${plan.additions.length})`} empty="Nothing new.">
              {plan.additions.map((u, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-3">
                  <span className="font-semibold">{u.name}</span>
                  <span className="text-mute text-[13px]">
                    {u.datasheetName} · {u.pointsCost} pts
                  </span>
                </li>
              ))}
            </PlanGroup>
            {plan.untouched.length > 0 && (
              <PlanGroup
                title={`Not in the list, left as they are (${plan.untouched.length})`}
                hint="Nothing is removed by an import."
              >
                {plan.untouched.map((u) => (
                  <li key={u.id} className="flex flex-wrap justify-between gap-x-3">
                    <span className="font-semibold">{u.name}</span>
                    <span className="text-mute text-[13px]">{u.datasheetName}</span>
                  </li>
                ))}
              </PlanGroup>
            )}
            <p className="m-0 text-mute text-[13px] leading-[1.5]">
              Units are matched by name and datasheet. Unnamed units of the
              same datasheet are added as new.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="m-0 text-bad text-[13px]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {units.length > 0 ? (
            <>
              <button type="button" className="btn" disabled={busy} onClick={() => void run(onAddAll)}>
                Add all {list.units.length} as new
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void run(onUpdate)}
              >
                {busy ? "Importing…" : "Update my units"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void run(onAddAll)}
            >
              {busy ? "Importing…" : `Add ${list.units.length} units`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanGroup({
  title,
  hint,
  empty,
  children,
}: {
  title: string;
  hint?: string;
  empty?: string;
  children: React.ReactNode;
}) {
  const none = Array.isArray(children) && children.length === 0;
  return (
    <section className="inset-panel p-3.5 grid gap-1.5">
      <span className="label-mono">{title}</span>
      {hint && <span className="text-xs text-mute leading-[1.5]">{hint}</span>}
      {none ? (
        <span className="text-[13px] text-mute">{empty}</span>
      ) : (
        <ul className="grid gap-1 list-none m-0 p-0 max-h-48 overflow-y-auto">{children}</ul>
      )}
    </section>
  );
}

// ─── Requisitions dialog ──────────────────────────────────────────

function RequisitionsDialog({
  roster,
  onSpend,
  onClose,
}: {
  roster: PlayerRoster;
  onSpend: (input: {
    requisitionId: string;
    unitId?: string;
    scarId?: string;
    note?: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<RequisitionDef | null>(null);
  const [unitId, setUnitId] = useState("");
  const [scarId, setScarId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eligibleUnits = (def: RequisitionDef): CrusadeCard[] => {
    if (def.effect.kind === "pick-unit") {
      return def.effect.apply === "grant-honour-pick"
        ? roster.units.filter((u) => u.isCharacter)
        : roster.units.filter((u) => !u.isCharacter && !u.honourCapRaised);
    }
    if (def.effect.kind === "pick-scar") {
      return roster.units.filter((u) => u.battleScars.length > 0);
    }
    return [];
  };

  const pickedUnit = roster.units.find((u) => u.id === unitId);
  const needsUnit =
    selected &&
    (selected.effect.kind === "pick-unit" ||
      selected.effect.kind === "pick-scar");
  const needsScar = selected?.effect.kind === "pick-scar";
  const needsNote = selected?.effect.kind === "log-only";
  const canSubmit =
    selected &&
    roster.requisitionPoints >= selected.cost &&
    (!needsUnit || unitId) &&
    (!needsScar || scarId) &&
    (!needsNote || note.trim());

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
            disabled={busy}
            className="btn-link"
          >
            Cancel
          </button>
        </div>

        <h2 className="specimen-title mt-0 mb-1">Spend requisition</h2>
        <p className="m-0 text-mute">You have {roster.requisitionPoints} RP.</p>

        <ul className="mt-4 grid gap-0.5 list-none m-0 p-0">
          {CORE_REQUISITIONS.map((def) => {
            const affordable = roster.requisitionPoints >= def.cost;
            const isSel = selected?.id === def.id;
            return (
              <li key={def.id}>
                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => {
                    setSelected(def);
                    setUnitId("");
                    setScarId("");
                    setError(null);
                  }}
                  aria-pressed={isSel}
                  className={[
                    "w-full text-left grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 items-center min-h-[68px] px-4 py-2.5 border-0 rounded-xl text-ink cursor-pointer",
                    isSel ? "bg-inset" : "bg-transparent hover:bg-inset",
                    affordable ? "" : "opacity-40 cursor-not-allowed",
                  ].join(" ")}
                >
                  <span className="flex flex-col gap-[3px] min-w-0">
                    <span className="font-semibold">{def.name}</span>
                    <span className="text-[13px] text-mute">{def.summary}</span>
                  </span>
                  <span
                    className={[
                      "score-pill min-w-16",
                      isSel ? "bg-plate text-plate-ink" : "",
                    ].join(" ")}
                  >
                    {def.cost} RP
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {selected && (
          <div className="mt-4 grid gap-4 inset-panel p-4">
            {needsUnit && (
              <label className="grid gap-2">
                <span className="label-mono">Target unit</span>
                <select
                  value={unitId}
                  onChange={(e) => {
                    setUnitId(e.target.value);
                    setScarId("");
                  }}
                  className="field"
                >
                  <option value="">Pick a unit</option>
                  {eligibleUnits(selected).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.datasheetName})
                    </option>
                  ))}
                </select>
              </label>
            )}

            {needsScar && pickedUnit && (
              <label className="grid gap-2">
                <span className="label-mono">Scar to remove</span>
                <select
                  value={scarId}
                  onChange={(e) => setScarId(e.target.value)}
                  className="field"
                >
                  <option value="">Pick a scar</option>
                  {pickedUnit.battleScars.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {needsNote && (
              <label className="grid gap-2">
                <span className="label-mono">What happened</span>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Swapped the sergeant's sidearm for a heavier weapon"
                  className="field resize-y"
                />
              </label>
            )}

            {error && (
              <p className="m-0 border border-bad text-bad p-3 font-mono text-[13px]">
                {error}
              </p>
            )}

            <button
              type="button"
              disabled={!canSubmit || busy}
              onClick={async () => {
                if (!selected) return;
                setBusy(true);
                setError(null);
                try {
                  await onSpend({
                    requisitionId: selected.id,
                    ...(unitId ? { unitId } : {}),
                    ...(scarId ? { scarId } : {}),
                    ...(note.trim() ? { note: note.trim() } : {}),
                  });
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                  setBusy(false);
                }
              }}
              className="btn btn-primary"
            >
              {busy ? "Spending…" : `Spend ${selected.cost} RP`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Faction dialog (unchanged behaviour) ─────────────────────────

function FactionDialog({
  current,
  currentColour,
  onSubmit,
  onClose,
}: {
  current: string;
  currentColour: string;
  onSubmit: (name: string, colour: string) => Promise<void>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(current);
  const [colour, setColour] = useState(currentColour);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center dialog-scrim p-3"
    >
      <div className="w-full max-w-xl dialog-panel">
        <h2 className="specimen-title mt-0 mb-5">Faction and colour</h2>
        <label className="label-mono block mb-2" htmlFor="faction-name">
          Faction
        </label>
        <input
          id="faction-name"
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. The Ashen Host"
          className="field"
        />
        <div className="label-mono mt-5 mb-2">Force colour</div>
        <div role="group" aria-label="Force colour" className="flex flex-wrap gap-2">
          {FORCE_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={c === colour}
              aria-label={`Colour ${c}`}
              onClick={() => setColour(c)}
              className="w-11 h-11 rounded-xl border-0 cursor-pointer"
              style={{
                background: c,
                boxShadow:
                  c === colour
                    ? "0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-ink)"
                    : "none",
              }}
            />
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-7">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={async () => {
              setSubmitting(true);
              try {
                await onSubmit(value.trim(), colour);
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={submitting || value.trim().length === 0}
            className="btn btn-primary"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
