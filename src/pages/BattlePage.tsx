import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Stamped } from "@/components/design/Stamped";
import { Card, Crest, Dot } from "@/components/ui/kit";
import { teamStyle } from "@/lib/utils/team";
import { forceColour, forceName } from "@/lib/utils/stats";
import { useAuth } from "@/hooks/useAuth";
import {
  useApplyBattleResults,
  useBattle,
  useConfirmBattleResult,
  useDeclareBattleResult,
  useSetBattleStatus,
  useUpdateBattleParticipant,
} from "@/hooks/useBattle";
import { useRoster } from "@/hooks/useRoster";
import { useResolveOoA } from "@/hooks/useUnit";
import type {
  BattleAgenda,
  BattleParticipantInline,
  InlineBattle,
  BattleUnitFielded,
  CrusadeCard,
  AttachedRoster,
} from "@/types";

export function BattlePage() {
  const { crusadeId, battleId } = useParams<{
    crusadeId: string;
    battleId: string;
  }>();
  const { user, signedIn } = useAuth();
  const { data: battle, crusade, isLoading } = useBattle(crusadeId, battleId);
  const setStatus = useSetBattleStatus(crusadeId ?? "", battleId ?? "");

  if (!signedIn) return <Navigate to="/" replace />;
  if (!crusadeId || !battleId) return <Navigate to="/crusades" replace />;

  if (isLoading) {
    return (
      <div className="page py-12">
        <p className="label-mono">Loading battle…</p>
      </div>
    );
  }
  if (!battle || !crusade) {
    return (
      <div className="page py-12">
        <h1 className="specimen-title text-3xl [&_em]:specimen-title-em">
          <em>Battle not found.</em>
        </h1>
        <Link
          to={`/crusades/${crusadeId}`}
          className="btn-link mt-6 inline-block"
        >
          Back to crusade
        </Link>
      </div>
    );
  }

  const isCreator = battle.createdBy === user?.googleId;
  const isGm =
    crusade.players.find((p) => p.role === "gm")?.user.googleId ===
    user?.googleId;
  const canManage = isCreator || isGm;
  const isVoided = battle.status === "voided";
  const allConfirmed = battle.participants.every((p) => p.confirmed);

  const attached = crusade.attachedRosters ?? [];
  const me = battle.participants.find((p) => p.googleId === user?.googleId);
  // The banner reads from the viewer's side when they played, else side one.
  const left = me ?? battle.participants[0];
  const right = battle.participants.find((p) => p !== left)!;
  const rosterOf = (p: BattleParticipantInline) => attached.find((m) => m.id === p.rosterId);
  const nameOf = (p: BattleParticipantInline) => {
    const r = rosterOf(p);
    return r ? forceName(r) : p.displayName;
  };
  const colourOf = (p: BattleParticipantInline) => {
    const r = rosterOf(p);
    return r ? forceColour(r) : "#5B6472";
  };
  const declared = battle.participants.every((p) => p.outcome !== "unset");
  const verb = { victory: "Won", defeat: "Lost", draw: "Drew", unset: "" }[left.outcome];
  const waitingOn = battle.participants.filter((p) => !p.confirmed).map((p) => p.displayName);
  const mine = [...battle.participants].sort(
    (x, y) => Number(y.googleId === user?.googleId) - Number(x.googleId === user?.googleId),
  );

  return (
    <div className="page pt-7 pb-9 flex flex-col gap-4" style={teamStyle(colourOf(left))}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1 pb-1">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="nameplate">{battle.missionName}</h1>
          <div className="text-mute">
            {formatDate(battle.date)} · {battle.battleSize} · {battle.pointsLevel} pts
          </div>
        </div>
        <Link to={`/crusades/${crusadeId}/battles`} className="btn-link">
          All battles
        </Link>
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[999_1_600px] min-w-0 flex flex-col gap-4">
          <ResultPanel
            battle={battle}
            crusadeId={crusadeId}
            battleId={battleId}
            myGoogleId={user?.googleId}
            canDeclare={canManage && !isVoided}
            creatorName={
              battle.participants.find((p) => p.googleId === battle.createdBy)
                ?.displayName ??
              crusade.players.find((p) => p.user.googleId === battle.createdBy)
                ?.user.displayName ??
              "the player who recorded it"
            }
          />
          <BattleRewards
            battle={battle}
            crusadeId={crusadeId}
            battleId={battleId}
            myGoogleId={user?.googleId}
            locked={isVoided}
          />
          {mine.map((p) => (
            <ParticipantSection
              key={p.googleId}
              participant={p}
              attachedRosters={attached}
              isMine={p.googleId === user?.googleId}
              crusadeId={crusadeId}
              battleId={battleId}
              agendaSuggestions={crusade.packContent?.agendas ?? []}
              isVoided={isVoided}
            />
          ))}
        </div>

        <aside aria-label="Match report" className="flex-[1_1_320px] min-w-0 flex flex-col gap-4">
          <section className="banner px-5 py-[22px] flex flex-col items-center gap-2 text-center">
            <div className="text-[#D5DEE8] text-xs font-medium">
              {battle.battleSize} · {formatDate(battle.date)}
            </div>
            <div className="flex items-center gap-3.5 font-display font-bold">
              <Crest name={nameOf(left)} size={32} tone="glass" />
              <span className="text-[34px] leading-none tnum">
                {declared ? `${left.victoryPoints} – ${right.victoryPoints}` : "vs"}
              </span>
              <Crest name={nameOf(right)} size={32} colour={colourOf(right)} />
            </div>
            <div className="font-semibold">
              {declared
                ? `${nameOf(left)} ${verb.toLowerCase()} vs ${nameOf(right)}`
                : `${nameOf(left)} vs ${nameOf(right)}`}
              {battle.participants.length > 2
                ? ` and ${battle.participants.length - 2} more`
                : ""}
            </div>
          </section>

          <Card title="Status" action={
            <Stamped tone={battle.status === "verified" ? "good" : isVoided ? "bad" : "ink"}>
              {battle.status}
            </Stamped>
          }>
            <div className="flex flex-col tnum">
              <div className="flex justify-between items-center gap-3 min-h-11 border-t border-rule">
                <span>Result</span>
                <span className="font-semibold text-right">
                  {!declared
                    ? "Not entered yet"
                    : waitingOn.length === 0
                      ? "Confirmed by all"
                      : `Waiting on ${waitingOn.join(", ")}`}
                </span>
              </div>
              {battle.participants.map((p) => (
                <div
                  key={p.googleId}
                  className="flex justify-between items-center gap-3 min-h-11 border-t border-rule"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Dot colour={colourOf(p)} />
                    <span className="truncate">{p.displayName}</span>
                  </span>
                  <span className="font-semibold text-right">
                    {p.appliedResults
                      ? "XP applied"
                      : `${p.unitsFielded.length} unit${p.unitsFielded.length === 1 ? "" : "s"} fielded`}
                  </span>
                </div>
              ))}
            </div>
            <BattleLogLinks
              battle={battle}
              crusadeId={crusadeId}
              battleId={battleId}
              myGoogleId={user?.googleId}
              locked={isVoided}
            />
            {/* Battles verify themselves when every participant confirms
                the result; the GM-only button force-closes one where
                somebody never will (dropped player, abandoned game). */}
            {(isGm || canManage) && (
              <div className="flex flex-wrap gap-2">
                {isGm && !isVoided && battle.status !== "verified" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        allConfirmed ||
                        window.confirm(
                          "Not everyone has confirmed the result yet. Mark " +
                            "verified anyway? Use this only when a player " +
                            "can't confirm.",
                        )
                      ) {
                        setStatus.mutate("verified");
                      }
                    }}
                    disabled={setStatus.isPending}
                    className="btn btn-sm"
                    title="Battles verify automatically when everyone confirms the result. Use this to close one out early"
                  >
                    Mark verified
                  </button>
                )}
                {canManage && !isVoided && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          "Void this battle? It stops counting toward standings " +
                            "and any XP, tallies and Requisition point already applied " +
                            "from it are taken back off each player's force. Honours " +
                            "picked and Out of Action results stay. You can restore it later.",
                        )
                      ) {
                        setStatus.mutate("voided");
                      }
                    }}
                    disabled={setStatus.isPending}
                    className="btn btn-danger btn-sm"
                    title="Void this battle (recorded by mistake, abandoned game…)"
                  >
                    Void battle
                  </button>
                )}
                {canManage && isVoided && (
                  <button
                    type="button"
                    onClick={() => setStatus.mutate("draft")}
                    disabled={setStatus.isPending}
                    className="btn btn-sm"
                  >
                    Restore battle
                  </button>
                )}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

// ─── Links to battle logs kept elsewhere ───────────────────────────

/**
 * Each player can link their own log or write-up of the battle (a
 * battle-tracking app, a blog post, a shared album).
 */
/** The newest "what was at stake" text any player has written. */
function latestRewards(battle: InlineBattle) {
  return battle.participants
    .filter((p) => p.rewardsAt)
    .sort((a, b) => (b.rewardsAt ?? "").localeCompare(a.rewardsAt ?? ""))[0];
}

/**
 * Rewards for this battle: one text box any of its players can fill
 * in. Each player's edit is saved on their own side; the newest wins.
 */
function BattleRewards({
  battle,
  crusadeId,
  battleId,
  myGoogleId,
  locked,
}: {
  battle: InlineBattle;
  crusadeId: string;
  battleId: string;
  myGoogleId: string | undefined;
  locked: boolean;
}) {
  const me = battle.participants.find((p) => p.googleId === myGoogleId);
  const update = useUpdateBattleParticipant(crusadeId, battleId, myGoogleId ?? "");
  const latest = latestRewards(battle);
  const current = latest?.rewards ?? "";
  const [draft, setDraft] = useState(current);
  const [seen, setSeen] = useState(current);
  if (current !== seen) {
    setSeen(current);
    setDraft(current);
  }
  const canEdit = !!me && !locked;
  const changed = draft.trim() !== current;
  if (!canEdit && !current) return null;

  return (
    <Card title="Rewards" label="Rewards">
      {canEdit ? (
        <form
          className="grid gap-2"
          data-testid="battle-rewards"
          onSubmit={(e) => {
            e.preventDefault();
            if (changed) {
              update.mutate({ rewards: draft.trim(), rewardsAt: new Date().toISOString() });
            }
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={2000}
            aria-label="Rewards for this battle"
            placeholder="What the winner and loser get, e.g. Winner gets 1 extra Requisition point, loser gets nothing."
            className="field resize-y"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] text-mute">
              {latest && current
                ? `Last written by ${latest.googleId === myGoogleId ? "you" : latest.displayName}. Any player in this battle can change it.`
                : "Any player in this battle can fill this in."}
            </span>
            {changed && (
              <button type="submit" className="btn btn-primary btn-sm" disabled={update.isPending}>
                {update.isPending ? "Saving…" : "Save rewards"}
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="m-0 whitespace-pre-wrap leading-[1.55]">{current}</p>
      )}
    </Card>
  );
}

function BattleLogLinks({
  battle,
  crusadeId,
  battleId,
  myGoogleId,
  locked,
}: {
  battle: InlineBattle;
  crusadeId: string;
  battleId: string;
  myGoogleId: string | undefined;
  locked: boolean;
}) {
  const me = battle.participants.find((p) => p.googleId === myGoogleId);
  const update = useUpdateBattleParticipant(crusadeId, battleId, myGoogleId ?? "");
  const [draft, setDraft] = useState(me?.logUrl ?? "");
  const [seen, setSeen] = useState(me?.logUrl ?? "");
  if ((me?.logUrl ?? "") !== seen) {
    setSeen(me?.logUrl ?? "");
    setDraft(me?.logUrl ?? "");
  }
  const linked = battle.participants.filter((p) => p.logUrl);
  const trimmed = draft.trim();
  const valid = trimmed === "" || /^https?:\/\/\S+$/i.test(trimmed);
  const changed = trimmed !== (me?.logUrl ?? "");
  if (linked.length === 0 && (!me || locked)) return null;

  return (
    <div className="grid gap-2 border-t border-rule pt-3" data-testid="battle-logs">
      <span className="label-mono">Battle logs</span>
      {linked.map((p) => (
        <a
          key={p.googleId}
          href={p.logUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="font-semibold underline break-all"
        >
          {p.googleId === myGoogleId ? "Your battle log" : `${p.displayName}'s battle log`}
        </a>
      ))}
      {me && !locked && (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && changed) update.mutate({ logUrl: trimmed || undefined });
          }}
        >
          <input
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Link to your log of this battle"
            aria-label="Link to your battle log"
            className="field"
          />
          {!valid && (
            <span role="alert" className="text-bad text-[13px]">
              A link starts with https://
            </span>
          )}
          {changed && valid && (
            <button type="submit" className="btn btn-sm justify-self-start" disabled={update.isPending}>
              {update.isPending ? "Saving…" : trimmed ? "Save link" : "Remove link"}
            </button>
          )}
        </form>
      )}
    </div>
  );
}

// ─── Result: declared by the creator, confirmed by the others ─────

type Outcome = "victory" | "defeat" | "draw" | "unset";

const OUTCOME_LABEL: Record<Outcome, string> = {
  victory: "Victory",
  defeat: "Defeat",
  draw: "Draw",
  unset: "Not set",
};

function ResultPanel({
  battle,
  crusadeId,
  battleId,
  myGoogleId,
  canDeclare,
  creatorName,
}: {
  battle: InlineBattle;
  crusadeId: string;
  battleId: string;
  myGoogleId: string | undefined;
  canDeclare: boolean;
  creatorName: string;
}) {
  const declare = useDeclareBattleResult(crusadeId, battleId);
  const confirm = useConfirmBattleResult(crusadeId, battleId);

  const remote = battle.participants.map((p) => ({
    googleId: p.googleId,
    outcome: p.outcome as Outcome,
    victoryPoints: p.victoryPoints,
  }));
  const remoteKey = JSON.stringify(remote);
  const [draft, setDraft] = useState(remote);
  const [dirty, setDirty] = useState(false);
  // Adopt the saved result whenever it changes and we have no edits.
  useEffect(() => {
    if (!dirty) setDraft(JSON.parse(remoteKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteKey]);

  const declared = battle.participants.every((p) => p.outcome !== "unset");
  const me = battle.participants.find((p) => p.googleId === myGoogleId);
  const iAmCreator = battle.createdBy === myGoogleId;
  const view = canDeclare ? draft : remote;
  const complete = draft.every((d) => d.outcome !== "unset");

  const setOutcome = (googleId: string, outcome: Outcome) => {
    setDirty(true);
    setDraft((d) => {
      const next = d.map((x) => (x.googleId === googleId ? { ...x, outcome } : x));
      // Two-player battle: the other side follows automatically.
      if (next.length === 2 && outcome !== "unset") {
        const mirror: Outcome =
          outcome === "victory" ? "defeat" : outcome === "defeat" ? "victory" : "draw";
        return next.map((x) => (x.googleId === googleId ? x : { ...x, outcome: mirror }));
      }
      return next;
    });
  };
  const setVp = (googleId: string, raw: string) => {
    const victoryPoints = Math.max(0, Math.floor(Number(raw) || 0));
    setDirty(true);
    setDraft((d) => d.map((x) => (x.googleId === googleId ? { ...x, victoryPoints } : x)));
  };

  const othersConfirmed = battle.participants.some(
    (p) => p.googleId !== battle.createdBy && p.confirmed,
  );

  return (
    <section className="card p-5 flex flex-col gap-2 overflow-x-auto" data-testid="battle-result">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="plate-heading m-0">1. Result</h2>
        <span className="text-[13px] text-mute">
          {!declared
            ? "Not entered yet"
            : battle.participants.every((p) => p.confirmed)
              ? "Confirmed by everyone"
              : "Awaiting confirmation"}
        </span>
      </header>

      <table className="w-full border-collapse mt-2">
        <thead>
          <tr>
            <Th>Player</Th>
            <Th>Outcome</Th>
            <Th>Victory points</Th>
            <Th>Confirmation</Th>
          </tr>
        </thead>
        <tbody>
          {battle.participants.map((p) => {
            const row = view.find((v) => v.googleId === p.googleId)!;
            return (
              <tr key={p.googleId} className="border-b border-rule">
                <Td>
                  <span className="font-semibold">{p.displayName}</span>
                </Td>
                <Td>
                  {canDeclare ? (
                    <select
                      aria-label={`Outcome for ${p.displayName}`}
                      value={row.outcome}
                      onChange={(e) => setOutcome(p.googleId, e.target.value as Outcome)}
                      className="field"
                    >
                      {(["unset", "victory", "defeat", "draw"] as const).map((o) => (
                        <option key={o} value={o}>
                          {OUTCOME_LABEL[o]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={[
                        "font-mono text-[13px]",
                        row.outcome === "victory"
                          ? "text-good font-semibold"
                          : row.outcome === "defeat"
                            ? "text-bad"
                            : "text-ink-2",
                      ].join(" ")}
                    >
                      {OUTCOME_LABEL[row.outcome]}
                    </span>
                  )}
                </Td>
                <Td>
                  {canDeclare ? (
                    <input
                      type="number"
                      min={0}
                      aria-label={`Victory points for ${p.displayName}`}
                      value={row.victoryPoints}
                      onChange={(e) => setVp(p.googleId, e.target.value)}
                      className="field w-24 tnum"
                    />
                  ) : (
                    <span className="font-mono text-[13px] tnum">
                      {declared ? row.victoryPoints : "-"}
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="font-mono text-[13px] text-ink-2">
                    {!declared
                      ? "-"
                      : p.googleId === battle.createdBy
                        ? "Entered the result"
                        : p.confirmed
                          ? "Confirmed"
                          : "Not yet confirmed"}
                  </span>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {canDeclare && (
        <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2 max-w-[60ch] m-0">
            {dirty && othersConfirmed
              ? "Saving a changed result means the other players have to confirm again."
              : "The other players confirm the result once it's saved."}
          </p>
          <button
            type="button"
            disabled={!dirty || !complete || declare.isPending}
            onClick={() =>
              declare.mutate(draft, { onSuccess: () => setDirty(false) })
            }
            className="btn btn-primary"
          >
            {declare.isPending ? "Saving…" : declared ? "Save changed result" : "Save result"}
          </button>
        </div>
      )}

      {!canDeclare && !declared && (
        <p className="pt-4 text-sm text-mute italic m-0">
          Waiting for {creatorName} to enter the result.
        </p>
      )}

      {me && !iAmCreator && declared && !me.confirmed && battle.status !== "voided" && (
        <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2 max-w-[60ch] m-0">
            Do you agree with who won and the points?
          </p>
          <button
            type="button"
            disabled={confirm.isPending}
            onClick={() => confirm.mutate()}
            className="btn btn-primary"
          >
            {confirm.isPending ? "Confirming…" : "Confirm result"}
          </button>
        </div>
      )}

      {(declare.isError || confirm.isError) && (
        <p role="alert" className="mt-3 font-mono text-[13px] text-bad">
          {(() => {
            const err = declare.error ?? confirm.error;
            return err instanceof Error ? err.message : String(err);
          })()}
        </p>
      )}
    </section>
  );
}

// ─── Per-participant section ──────────────────────────────────────

interface ParticipantDraft {
  unitsFielded: BattleUnitFielded[];
  agendas: BattleAgenda[];
  notes: string;
}

function ParticipantSection({
  participant,
  attachedRosters,
  isMine,
  crusadeId,
  battleId,
  agendaSuggestions,
  isVoided,
}: {
  participant: BattleParticipantInline;
  attachedRosters: AttachedRoster[];
  isMine: boolean;
  crusadeId: string;
  battleId: string;
  agendaSuggestions: string[];
  isVoided: boolean;
  /** Every player has confirmed the result, XP can be applied. */
}) {
  const roster = useMemo(
    () => attachedRosters.find((a) => a.id === participant.rosterId),
    [attachedRosters, participant.rosterId],
  );

  const update = useUpdateBattleParticipant(
    crusadeId,
    battleId,
    participant.googleId,
  );
  const apply = useApplyBattleResults(crusadeId, battleId);

  const [showAddUnit, setShowAddUnit] = useState(false);

  // ── Local draft (owner only) ─────────────────────────────────
  // All edits go to local state instantly; a debounced effect pushes
  // the whole patch to Drive ~1.2 s after the last change. While the
  // draft is dirty, incoming remote refreshes do NOT clobber it,
  // this is what stops the jumping-in-and-out while typing.
  const [draft, setDraft] = useState<ParticipantDraft>({
    unitsFielded: participant.unitsFielded,
    agendas: participant.agendas ?? [],
    notes: participant.notes ?? "",
  });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  // Bumped to re-arm the autosave effect after a failed save (offline,
  // token expiry, write conflict), without it, a failed save sits
  // dirty until the user's next edit.
  const [retryNonce, setRetryNonce] = useState(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Coming back online is the natural retry moment.
  useEffect(() => {
    const onOnline = () => setRetryNonce((n) => n + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Adopt remote state only while clean.
  useEffect(() => {
    if (!dirty && saveState !== "saving") {
      setDraft({
        unitsFielded: participant.unitsFielded,
        agendas: participant.agendas ?? [],
        notes: participant.notes ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    participant.unitsFielded,
    participant.agendas,
    participant.notes,
  ]);

  // Debounced autosave.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      const snapshot = draftRef.current;
      setSaveState("saving");
      update.mutate(
        {
          unitsFielded: snapshot.unitsFielded,
          agendas: snapshot.agendas,
          notes: snapshot.notes,
        },
        {
          onSuccess: () => {
            // Only mark clean if no edits happened during the save.
            if (
              JSON.stringify(draftRef.current) === JSON.stringify(snapshot)
            ) {
              setDirty(false);
              setSaveState("saved");
              setTimeout(() => setSaveState("idle"), 1500);
            } else {
              setSaveState("idle"); // still dirty; next debounce will fire
            }
          },
          onError: () => {
            setSaveState("idle");
            // Still dirty; re-arm a retry in 8 s (or sooner if the
            // user edits again / the browser comes back online).
            setTimeout(() => setRetryNonce((n) => n + 1), 8000);
          },
        },
      );
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, draft, retryNonce]);

  // Don't lose what was typed in the pause before autosave: save at
  // once when the page is left, the tab is hidden or the app is put
  // in the background, and warn before the tab is closed mid-edit.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const flushRef = useRef(() => {});
  flushRef.current = () => {
    if (!dirtyRef.current) return;
    const snapshot = draftRef.current;
    update.mutate(
      {
        unitsFielded: snapshot.unitsFielded,
        agendas: snapshot.agendas,
        notes: snapshot.notes,
      },
      {
        onSuccess: () => {
          if (JSON.stringify(draftRef.current) === JSON.stringify(snapshot)) setDirty(false);
        },
      },
    );
  };
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushRef.current();
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      flushRef.current();
      e.preventDefault();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onLeave);
      flushRef.current();
    };
  }, []);

  const edit = (fn: (d: ParticipantDraft) => ParticipantDraft) => {
    setDraft((d) => fn(d));
    setDirty(true);
  };

  const fieldedIds = new Set(draft.unitsFielded.map((u) => u.unitId));
  const availableUnits = (roster?.units ?? []) as CrusadeCard[];
  const notYetFielded = availableUnits.filter((u) => !fieldedIds.has(u.id));

  const toFielded = (unit: CrusadeCard): BattleUnitFielded => ({
    unitId: unit.id,
    unitName: unit.name,
    enemiesDestroyed: 0,
    survived: true,
    markedForGreatness: false,
    bonusXp: 0,
  });

  const fieldUnit = (unit: CrusadeCard) =>
    edit((d) => ({ ...d, unitsFielded: [...d.unitsFielded, toFielded(unit)] }));

  const fieldAll = () =>
    edit((d) => ({
      ...d,
      unitsFielded: [...d.unitsFielded, ...notYetFielded.map(toFielded)],
    }));

  const updateFielded = (unitId: string, patch: Partial<BattleUnitFielded>) =>
    edit((d) => ({
      ...d,
      unitsFielded: d.unitsFielded.map((u) =>
        u.unitId === unitId ? { ...u, ...patch } : u,
      ),
    }));

  const removeFielded = (unitId: string) =>
    edit((d) => ({
      ...d,
      unitsFielded: d.unitsFielded.filter((u) => u.unitId !== unitId),
    }));

  // Only one mark-for-greatness per battle, per spec. Setting it on
  // one unit clears it from others.
  const setMarked = (unitId: string, marked: boolean) =>
    edit((d) => ({
      ...d,
      unitsFielded: d.unitsFielded.map((u) => ({
        ...u,
        markedForGreatness: u.unitId === unitId ? marked : false,
      })),
    }));

  const addAgenda = (name: string) =>
    edit((d) => ({
      ...d,
      agendas: [
        ...d.agendas,
        { id: crypto.randomUUID(), name, completed: false },
      ],
    }));

  const toggleAgenda = (id: string) =>
    edit((d) => ({
      ...d,
      agendas: d.agendas.map((a) =>
        a.id === id ? { ...a, completed: !a.completed } : a,
      ),
    }));

  const removeAgenda = (id: string) =>
    edit((d) => ({
      ...d,
      agendas: d.agendas.filter((a) => a.id !== id),
    }));

  // What the table renders: owner sees their draft; others see remote.

  const setNotes = (notes: string) => edit((d) => ({ ...d, notes }));

  const view: ParticipantDraft = isMine
    ? draft
    : {
        unitsFielded: participant.unitsFielded,
        agendas: participant.agendas ?? [],
        notes: participant.notes ?? "",
      };

  return (
    <section className="card p-5 flex flex-col gap-2 overflow-x-auto">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="plate-heading">
            {participant.displayName}
          </h3>
          <div className="font-mono text-[13px] text-mute mt-1">
            {roster?.crusadeBanner || roster?.factionName || "Unknown roster"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isMine && saveState !== "idle" && (
            <span className="font-mono text-[13px] text-mute">
              {saveState === "saving" ? "Saving…" : "Saved."}
            </span>
          )}
          {isMine && dirty && saveState === "idle" && (
            <span className="font-mono text-[13px] text-mute">
              Unsaved edits
            </span>
          )}
          {isMine && (
            <Stamped tone="accent" rotation={-2}>
              Your side
            </Stamped>
          )}
          {!isMine && (
            <Stamped tone="ink" rotation={2}>
              Read-only
            </Stamped>
          )}
          {participant.appliedResults && (
            <Stamped tone="good">Applied</Stamped>
          )}
        </div>
      </header>

      <div className="py-4">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <span className="label-mono">Units fielded</span>
          {isMine && notYetFielded.length > 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={fieldAll}
                className="btn btn-sm"
                title={`Field all ${notYetFielded.length} remaining units`}
              >
                Field all ({notYetFielded.length})
              </button>
              <button
                type="button"
                onClick={() => setShowAddUnit(true)}
                className="btn btn-sm"
              >
                + Field a unit
              </button>
            </div>
          )}
        </div>

        {view.unitsFielded.length === 0 ? (
          <p className="text-mute italic">
            {isMine
              ? "No units fielded yet. Click + Field a unit."
              : "No units fielded."}
          </p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Unit</Th>
                <Th className="text-right w-[100px]">Kills</Th>
                <Th className="text-right w-[100px]">Bonus XP</Th>
                <Th className="w-[90px]">Survived</Th>
                <Th className="w-[150px]">Mark for Greatness</Th>
                {isMine && <Th />}
              </tr>
            </thead>
            <tbody>
              {view.unitsFielded.map((u) => (
                <tr key={u.unitId} className="border-b border-rule">
                  <Td>
                    <div className="font-display text-base leading-tight">
                      {u.unitName}
                    </div>
                  </Td>
                  <Td className="text-right">
                    {isMine ? (
                      <input
                        type="number"
                        min="0"
                        aria-label={`Enemy units destroyed by ${u.unitName}`}
                        value={u.enemiesDestroyed}
                        onChange={(e) =>
                          updateFielded(u.unitId, {
                            enemiesDestroyed: Math.max(
                              0,
                              Number(e.target.value) || 0,
                            ),
                          })
                        }
                        className="field text-right"
                      />
                    ) : (
                      <span className="font-mono">{u.enemiesDestroyed}</span>
                    )}
                  </Td>
                  <Td className="text-right">
                    {isMine ? (
                      <input
                        type="number"
                        min="0"
                        aria-label={`Bonus experience for ${u.unitName}`}
                        value={u.bonusXp ?? 0}
                        onChange={(e) =>
                          updateFielded(u.unitId, {
                            bonusXp: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        title="Agenda rewards, mission rules, GM fiat"
                        className="field text-right"
                      />
                    ) : (
                      <span className="font-mono">{u.bonusXp ?? 0}</span>
                    )}
                  </Td>
                  <Td>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={u.survived}
                        onChange={(e) =>
                          isMine &&
                          updateFielded(u.unitId, {
                            survived: e.target.checked,
                          })
                        }
                        disabled={!isMine}
                        className="accent-accent w-4 h-4"
                      />
                      <span className="font-mono text-sm">
                        {u.survived ? "Yes" : "No"}
                      </span>
                    </label>
                  </Td>
                  <Td>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={u.markedForGreatness}
                        onChange={(e) =>
                          isMine && setMarked(u.unitId, e.target.checked)
                        }
                        disabled={!isMine}
                        className="accent-accent w-4 h-4"
                      />
                      <span className="font-mono text-sm">
                        {u.markedForGreatness ? "Yes" : "-"}
                      </span>
                    </label>
                  </Td>
                  {isMine && (
                    <Td>
                      <button
                        type="button"
                        onClick={() => removeFielded(u.unitId)}
                        className="font-mono text-[13px] text-mute hover:text-bad px-2 py-1"
                        title="Unfield"
                      >
                        ✕
                      </button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Agendas (free text, per participant) */}
      <div className="py-4 border-t border-rule">
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <span className="label-mono">
            Agendas{view.agendas.length > 0 ? ` (${view.agendas.length})` : ""}
          </span>
        </div>
        {view.agendas.length === 0 && !isMine ? (
          <p className="text-mute italic text-sm m-0">No agendas recorded.</p>
        ) : (
          <ul className="grid gap-2 list-none m-0 p-0">
            {view.agendas.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <label
                  className={[
                    "flex items-center gap-2",
                    isMine ? "cursor-pointer" : "opacity-70",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={a.completed}
                    disabled={!isMine}
                    onChange={() => isMine && toggleAgenda(a.id)}
                    className="accent-accent w-4 h-4"
                  />
                  <span
                    className={[
                      "text-sm",
                      a.completed ? "text-ink" : "text-ink-2",
                    ].join(" ")}
                  >
                    {a.name}
                    <span className={`ml-2 text-[13px] ${a.completed ? "text-good font-semibold" : "text-mute"}`}>
                      {a.completed ? "Achieved" : isMine ? "Tick if achieved" : "Not achieved"}
                    </span>
                  </span>
                </label>
                {isMine && (
                  <button
                    type="button"
                    onClick={() => removeAgenda(a.id)}
                    aria-label={`Remove ${a.name}`}
                    title="Remove"
                    className="w-9 h-9 grid place-items-center bg-transparent border-0 rounded-lg cursor-pointer text-mute hover:bg-fill hover:text-bad"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {isMine && (
          <AgendaAdder
            onAdd={addAgenda}
            onRemove={removeAgenda}
            chosen={view.agendas}
            suggestions={agendaSuggestions}
          />
        )}
        {isMine && view.agendas.some((a) => a.completed) && (
          <p className="mt-2 text-mute text-xs m-0">
            Agenda XP rewards go in each unit's Bonus XP column.
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="py-4 border-t border-rule grid gap-2">
        <span className="label-mono">Battle notes</span>
        {isMine ? (
          <textarea
            rows={3}
            aria-label="Battle notes"
            value={view.notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How it went: heroics, disasters, house rulings, grudges sworn…"
            className="field resize-y"
          />
        ) : view.notes ? (
          <p className="whitespace-pre-wrap text-ink-2 text-sm m-0 leading-[1.55]">
            {view.notes}
          </p>
        ) : (
          <p className="text-mute italic text-sm m-0">No notes.</p>
        )}
      </div>

      {isMine && isVoided && (
        <p className="pt-4 border-t border-rule text-sm text-mute m-0">
          {participant.appliedResults
            ? "This battle is voided. Its XP, tallies and Requisition point are being taken back off your force."
            : "This battle is voided, so nothing from it counts on your force. Results can be applied again if it is restored."}
        </p>
      )}

      {isMine && !isVoided && view.unitsFielded.length > 0 && (
        <div className="pt-4 border-t border-rule flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-2 max-w-[60ch]">
            {participant.appliedResults
              ? "You've applied this battle's results to your roster."
              : dirty || saveState === "saving"
                  ? "Waiting for your edits to save before results can be applied…"
                  : "Apply results to write XP and tallies to your roster."}
          </p>
          <button
            type="button"
            onClick={() => apply.mutate()}
            disabled={
              participant.appliedResults ||
              apply.isPending ||
              dirty ||
              saveState === "saving"
            }
            className="btn btn-primary"
          >
            {participant.appliedResults
              ? "Applied"
              : apply.isPending
                ? "Applying…"
                : dirty || saveState === "saving"
                    ? "Saving…"
                    : "Apply results"}
          </button>
        </div>
      )}

      {apply.isError && (
        <p className="mt-3 font-mono text-[13px] text-bad">
          Apply failed:{" "}
          {apply.error instanceof Error
            ? apply.error.message
            : String(apply.error)}
        </p>
      )}

      {apply.isSuccess && apply.data && apply.data.length > 0 && (
        <div className="mt-3 inset-panel p-3 text-[13px] leading-[1.5]">
          <strong className="font-semibold">Applied:</strong>
          <ul className="list-none m-0 p-0 mt-2 grid gap-1">
            {apply.data.map((s) => (
              <li key={s.unitId}>
                {s.unitName}: +{s.xpAwarded} XP
                {s.promotedTo && (
                  <span className="text-accent ml-2"> promoted to {s.promotedTo}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Out of Action tests for non-survivors (own side, post-apply) */}
      {isMine && participant.appliedResults && (
        <OoASection participant={participant} battleId={battleId} />
      )}

      {showAddUnit && (
        <FieldUnitDialog
          units={notYetFielded}
          onClose={() => setShowAddUnit(false)}
          onPick={(unit) => {
            fieldUnit(unit);
            setShowAddUnit(false);
          }}
        />
      )}
    </section>
  );
}

// ─── Out of Action section ────────────────────────────────────────

/**
 * Per crusade rules: each destroyed unit takes an Out of Action test
 * after the battle, d6, on a 1 the unit must lose a battle honour or
 * gain a battle scar. This section appears on the owner's side once
 * results are applied, listing every non-survivor with a resolution
 * widget. Resolutions write to the canonical roster (idempotent per
 * battle via appliedOoA[]).
 */
function OoASection({
  participant,
  battleId,
}: {
  participant: BattleParticipantInline;
  battleId: string;
}) {
  const { data: roster } = useRoster(participant.rosterId);
  const nonSurvivors = participant.unitsFielded.filter((u) => !u.survived);
  if (nonSurvivors.length === 0 || !roster) return null;

  return (
    <div className="mt-4 border-t border-rule pt-4">
      <span className="label-mono block mb-3">
        Out of Action tests: {nonSurvivors.length} unit
        {nonSurvivors.length === 1 ? "" : "s"} destroyed
      </span>
      <div className="grid gap-3">
        {nonSurvivors.map((f) => {
          const unit = roster.units.find((u) => u.id === f.unitId);
          if (!unit) return null;
          return (
            <OoAWidget
              key={f.unitId}
              unit={unit}
              rosterId={participant.rosterId}
              battleId={battleId}
            />
          );
        })}
      </div>
    </div>
  );
}

function OoAWidget({
  unit,
  rosterId,
  battleId,
}: {
  unit: CrusadeCard;
  rosterId: string;
  battleId: string;
}) {
  const resolve = useResolveOoA(rosterId, unit.id);
  const resolved = unit.appliedOoA.find((e) => e.battleId === battleId);

  const [roll, setRoll] = useState<number | null>(null);
  const [choice, setChoice] = useState<"scar" | "honour" | null>(null);
  const [scarName, setScarName] = useState("");
  const [scarRules, setScarRules] = useState("");
  const [honourId, setHonourId] = useState("");

  if (resolved) {
    return (
      <div className="inset-panel p-3 text-[13px] text-ink-2 leading-[1.5]">
        <strong className="font-semibold">{unit.name}</strong>: rolled{" "}
        {resolved.rolled}:{" "}
        {resolved.outcome === "none"
          ? "survived intact."
          : resolved.outcome === "scar-gained"
            ? "gained a battle scar."
            : "lost a battle honour."}
      </div>
    );
  }

  const doRoll = (value: number) => {
    setRoll(value);
    if (value !== 1) {
      // 2-6: no effect. Record immediately.
      resolve.mutate({ battleId, rolled: value, outcome: "none" });
    }
  };

  return (
    <div className="inset-panel p-4 grid gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <span className="font-display text-lg">{unit.name}</span>
        <span className="font-mono text-[13px] text-accent">
          Out of Action test pending
        </span>
      </div>

      {roll === null && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-[13px] text-mute">Enter your d6:</span>
          {[1, 2, 3, 4, 5, 6].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => doRoll(v)}
              disabled={resolve.isPending}
              className="btn w-11 px-0 font-bold"
            >
              {v}
            </button>
          ))}
          <button
            type="button"
            onClick={() => doRoll(1 + Math.floor(Math.random() * 6))}
            disabled={resolve.isPending}
            className="btn btn-sm"
          >
            Roll for me
          </button>
        </div>
      )}

      {roll === 1 && (
        <div className="grid gap-3">
          <p className="m-0 text-sm text-ink-2">
            Rolled a <strong className="text-accent font-semibold">1</strong>.
            Choose: gain a battle scar, or lose a battle honour.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setChoice("scar")}
              className={[
                "font-mono text-[13px] border-[1.5px] px-3 py-2",
                choice === "scar"
                  ? "border-accent text-accent"
                  : "border-rule-strong text-mute hover:text-ink hover:border-ink",
              ].join(" ")}
            >
              Gain scar
            </button>
            <button
              type="button"
              onClick={() => setChoice("honour")}
              disabled={unit.battleHonours.length === 0}
              className={[
                "font-mono text-[13px] border-[1.5px] px-3 py-2 disabled:opacity-40",
                choice === "honour"
                  ? "border-accent text-accent"
                  : "border-rule-strong text-mute hover:text-ink hover:border-ink",
              ].join(" ")}
              title={
                unit.battleHonours.length === 0
                  ? "No honours to lose"
                  : undefined
              }
            >
              Lose honour
            </button>
          </div>

          {choice === "scar" && (
            <div className="grid gap-2">
              <input
                type="text"
                value={scarName}
                onChange={(e) => setScarName(e.target.value)}
                aria-label="Scar name"
                placeholder="Scar name (e.g. Walking wounded)"
                className="field"
              />
              <input
                type="text"
                value={scarRules}
                onChange={(e) => setScarRules(e.target.value)}
                aria-label="What the scar does (optional)"
                placeholder="What it does, in your own words (optional)"
                className="field"
              />
              <button
                type="button"
                disabled={!scarName.trim() || resolve.isPending}
                onClick={() =>
                  resolve.mutate({
                    battleId,
                    rolled: 1,
                    outcome: "scar-gained",
                    scar: { name: scarName.trim(), rules: scarRules.trim() },
                  })
                }
                className="btn btn-primary justify-self-start"
              >
                {resolve.isPending ? "Applying…" : "Apply scar"}
              </button>
            </div>
          )}

          {choice === "honour" && (
            <div className="grid gap-2">
              <select
                value={honourId}
                onChange={(e) => setHonourId(e.target.value)}
                className="field"
              >
                <option value="">Pick an honour to lose</option>
                {unit.battleHonours.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.type})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!honourId || resolve.isPending}
                onClick={() =>
                  resolve.mutate({
                    battleId,
                    rolled: 1,
                    outcome: "honour-lost",
                    honourId,
                  })
                }
                className="btn btn-primary justify-self-start"
              >
                {resolve.isPending ? "Removing…" : "Remove honour"}
              </button>
            </div>
          )}
        </div>
      )}

      {roll !== null && roll !== 1 && !resolved && (
        <p className="m-0 font-mono text-[13px] text-good">
          Rolled {roll}: no effect. Recording…
        </p>
      )}

      {resolve.isError && (
        <p className="m-0 font-mono text-[13px] text-bad">
          Failed:{" "}
          {resolve.error instanceof Error
            ? resolve.error.message
            : String(resolve.error)}
        </p>
      )}
    </div>
  );
}

// ─── Field-a-unit dialog ──────────────────────────────────────────

function FieldUnitDialog({
  units,
  onClose,
  onPick,
}: {
  units: CrusadeCard[];
  onClose: () => void;
  onPick: (unit: CrusadeCard) => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto dialog-scrim p-3"
    >
      <div className="w-full max-w-xl dialog-panel">
        <div className="flex items-start justify-between gap-8">
          <span />
          <button
            type="button"
            onClick={onClose}
            className="btn-link"
          >
            Cancel
          </button>
        </div>
        <h2 className="specimen-title text-[clamp(1.5rem,4vw,2.5rem)] mt-6 [&_em]:specimen-title-em">
          Pick a <em>unit</em>
        </h2>
        {units.length === 0 ? (
          <p className="mt-6 text-mute italic">
            Every unit on your roster is already fielded.
          </p>
        ) : (
          <ul className="mt-8 grid gap-2 list-none p-0 m-0">
            {units.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onPick(u)}
                  className="w-full text-left flex items-center justify-between gap-4 p-3 border-0 rounded-xl bg-transparent hover:bg-inset cursor-pointer text-ink"
                >
                  <span>
                    <span className="font-display text-base leading-tight">
                      {u.name}
                    </span>
                    <span className="block font-mono text-[13px] text-mute mt-1">
                      {u.datasheetName} · {u.rank} · {u.pointsCost} pts
                    </span>
                  </span>
                  <span className="font-mono text-[13px] text-accent">
                    Field
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={[
        "text-left font-mono text-[13px] font-medium text-mute pb-3 pr-4 border-b border-rule-strong",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={["py-3 pr-4 align-baseline text-[14px]", className ?? ""].join(
        " ",
      )}
    >
      {children}
    </td>
  );
}

function formatDate(iso: string): string {
  // Accept both `YYYY-MM-DD` and full ISO timestamps.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function AgendaAdder({
  onAdd,
  onRemove,
  chosen,
  suggestions = [],
}: {
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  chosen: BattleAgenda[];
  /** The GM's agenda names for this crusade: one tap picks one. */
  suggestions?: string[];
}) {
  const [name, setName] = useState("");
  const add = () => {
    const typed = name.trim();
    if (!typed) return;
    if (!chosen.some((a) => a.name.toLowerCase() === typed.toLowerCase())) onAdd(typed);
    setName("");
  };
  return (
    <div className="grid gap-3 mt-3">
      {suggestions.length > 0 && (
        <div className="grid gap-2">
          <span className="text-[13px] text-mute">Tap the agendas you chose for this battle.</span>
          <div className="flex flex-wrap gap-2" data-testid="agenda-choices">
            {suggestions.map((s) => {
              const picked = chosen.find((a) => a.name === s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={!!picked}
                  onClick={() => (picked ? onRemove(picked.id) : onAdd(s))}
                  className={picked ? "btn btn-sm btn-primary" : "btn btn-sm"}
                >
                  {picked ? "✓ " : ""}
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <label className="grid gap-2">
        <span className="text-[13px] text-mute">
          {suggestions.length > 0
            ? "Not in the list? Type it here."
            : "Type each agenda you chose for this battle."}
        </span>
        <span className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            // Typing a name and moving on counts as adding it.
            onBlur={add}
            placeholder="e.g. Hold the line"
            className="field flex-1"
          />
          <button type="button" disabled={!name.trim()} onClick={add} className="btn btn-primary">
            Add agenda
          </button>
        </span>
      </label>
    </div>
  );
}
