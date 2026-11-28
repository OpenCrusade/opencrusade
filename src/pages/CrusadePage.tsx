import { appCrusadeUrl, sheetUrl } from "@/lib/sync/sheet-store";
import { rememberReturnTo } from "@/lib/utils/return-to";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { NewRosterForm } from "@/components/roster/NewRosterForm";
import { addUnits } from "@/lib/sync/roster-ops";
import { Card, Crest, Dot, FormChips } from "@/components/ui/kit";
import { teamStyle } from "@/lib/utils/team";
import { MapCard } from "@/components/crusade/MapCard";
import { PhasesSection } from "@/components/crusade/PhasesSection";
import { CampaignTotals } from "@/components/crusade/CampaignTotals";
import { TrackerSetsCard } from "@/components/crusade/TrackerSetsCard";
import { battleTodo, forceColour, forceName, packLabel, standings } from "@/lib/utils/stats";
import { useAuth } from "@/hooks/useAuth";
import {
  useJoinCrusade,
  useCrusade,
  useSetPlayerGroup,
  useUpdateCrusadeConfig,
  useUpdatePackState,
} from "@/hooks/useCrusade";
import { CrusadeSettingsDialog } from "@/components/crusade/CrusadeSettingsDialog";
import { PackPanel } from "@/components/crusade/PackPanel";
import { PanelPlacementMenu } from "@/components/crusade/PanelPlacement";
import { useGmManage } from "@/stores/gm-manage";
import {
  useAttachRoster,
  useCreateRoster,
  useCrusadeMirrors,
  useMyRosters,
  useRenameAttachmentBanner,
} from "@/hooks/useRoster";
import {
  useAssignBlessing,
  useDetachRoster,
  useRemovePlayer,
} from "@/hooks/useRequisitions";
import type {
  AttachedRoster,
  InlineBattle,
  PlayerGroup,
} from "@/types";

/**
 * Crusade detail page. v2.5: attached rosters are read from the
 * `rosters/` subfolder mirrors, not from crusade.json.
 */
export function CrusadePage() {
  const { crusadeId } = useParams<{ crusadeId: string }>();
  const { user, signedIn } = useAuth();
  const { data: crusade, isLoading } = useCrusade(crusadeId);
  const { data: myRosters } = useMyRosters();
  const { data: mirrors, isLoading: mirrorsLoading } = useCrusadeMirrors(crusadeId);
  const attachMutation = useAttachRoster();
  const renameMutation = useRenameAttachmentBanner();
  const assignBlessing = useAssignBlessing(crusadeId ?? "");
  const detachRoster = useDetachRoster(crusadeId ?? "");
  const removePlayerMutation = useRemovePlayer(crusadeId ?? "");
  const updateConfigMutation = useUpdateCrusadeConfig(crusadeId ?? "");
  const setPlayerGroupMutation = useSetPlayerGroup(crusadeId ?? "");
  const updatePackStateMutation = useUpdatePackState(crusadeId ?? "");

  const [showAttach, setShowAttach] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const createRoster = useCreateRoster();
  const navigate = useNavigate();
  const [renamingRosterId, setRenamingRosterId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const manageChoice = useGmManage((m) => (crusadeId ? m.open[crusadeId] : undefined));
  const setManaging = useGmManage((m) => m.set);
  const [blessTarget, setBlessTarget] = useState<AttachedRoster | null>(null);

  if (!signedIn) {
    // Arrived from a crusade link while signed out: come back here
    // after sign-in.
    if (crusadeId) rememberReturnTo(`/crusades/${crusadeId}`);
    return <Navigate to="/" replace />;
  }

  if (!crusadeId) return <NotFound />;
  // Not on this device yet (first visit from a shared link): use the
  // same "Open a crusade" step as the Crusades page, where the person
  // chooses the sheet themselves.
  if (!isLoading && !crusade) {
    return <Navigate to={`/crusades?open=${encodeURIComponent(crusadeId)}`} replace />;
  }

  if (!crusade) {
    return (
      <div className="page py-12">
        <p className="label-mono">Loading crusade…</p>
      </div>
    );
  }

  const gm = crusade.players.find((p) => p.role === "gm");
  const isGmUser = gm?.user.googleId === user?.googleId;
  // The GM sees the page as a player does until they unlock it. While
  // they are the only one here they are still setting up, so it starts
  // unlocked.
  const managing = manageChoice ?? crusade.players.length <= 1;
  const isGm = isGmUser && managing;
  const me = crusade.players.find((p) => p.user.googleId === user?.googleId);
  const groups: PlayerGroup[] = crusade.groups ?? [];
  const canRecordBattle =
    isGmUser || crusade.settings.allowPlayerBattleCreation !== false;
  const attached: AttachedRoster[] = mirrors ?? [];
  const myAttached = attached.filter(
    (m) => m.player.googleId === user?.googleId,
  );
  const myAvailableRosters = (myRosters ?? []).filter(
    (r) => !attached.some((m) => m.id === r.id),
  );

  const battles = crusade.battles ?? [];
  const table = standings(attached, battles);
  const recent = [...battles]
    .sort((x, y) => (y.date + y.createdAt).localeCompare(x.date + x.createdAt))
    .slice(0, 5);
  const colour = myAttached[0] ? forceColour(myAttached[0]) : "#16324F";
  const tracker = crusade.packState ?? { counters: [], items: [], note: "" };
  const trackerEmpty =
    tracker.counters.length === 0 && tracker.items.length === 0 && !tracker.note;

  // Where Campaign totals shows is the GM's choice, like tracker
  // positions on a force. The side column is the default.
  const totalsPlacement = crusade.settings.totalsPlacement ?? "side";
  const totals = (
    <CampaignTotals
      crusade={crusade}
      attached={attached}
      me={user?.googleId}
      placement={totalsPlacement}
      onPlace={
        isGm
          ? (next) => updateConfigMutation.mutate({ settings: { totalsPlacement: next } })
          : undefined
      }
      columns={crusade.settings.totalsColumns ?? 3}
      onColumns={
        isGm
          ? (next) => updateConfigMutation.mutate({ settings: { totalsColumns: next } })
          : undefined
      }
    />
  );

  // The GM's Campaign tracker card can move the same way.
  const trackerPlacement = crusade.settings.trackerPlacement ?? "side";
  const campaignTracker = (isGm || !trackerEmpty) && (
    <Card
      title="Campaign tracker"
      action={
        isGm && (
          <PanelPlacementMenu
            name="Campaign tracker"
            value={trackerPlacement}
            onChange={(next) => updateConfigMutation.mutate({ settings: { trackerPlacement: next } })}
          />
        )
      }
    >
      <PackPanel
        packState={tracker}
        isGm={isGm}
        onUpdateState={(next) => updatePackStateMutation.mutate(next)}
        isSaving={updatePackStateMutation.isPending}
        wide={trackerPlacement !== "side"}
      />
    </Card>
  );

  return (
    <div className="page pt-5 pb-9 flex flex-col gap-4" style={teamStyle(colour)}>
      <section
        aria-label="Crusade summary"
        className="banner flex flex-wrap items-center justify-between gap-x-10 gap-y-5"
      >
        <div className="flex items-center gap-4 min-w-0">
          <Crest name={crusade.name} size={56} tone="glass" />
          <div className="flex flex-col gap-1.5 min-w-0">
            <h1 className="nameplate">{crusade.name}</h1>
            <div className="text-[#D5DEE8] text-[13px]">
              {packLabel(crusade.packId) ? `${packLabel(crusade.packId)} · ` : ""}Run by{" "}
              {gm?.user.displayName ?? "an unknown GM"} · started {formatDate(crusade.createdAt)}
            </div>
          </div>
        </div>
        <dl className="m-0 flex flex-wrap gap-x-7 gap-y-4">
          {[
            ["Supply limit", `${crusade.supplyLimit}`],
            ["Starting RP", String(crusade.startingRP)],
            ["Forces", String(attached.length)],
            ["Battles", String(battles.filter((x) => x.status !== "voided").length)],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col-reverse gap-1.5">
              <dt className="text-[#D5DEE8] text-xs">{label}</dt>
              <dd className="m-0 font-display font-bold text-[22px] leading-[1.1] tnum">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-2 px-1">
        {myAttached.length > 0 && (
          <Link to={`/rosters/${myAttached[0].id}`} className="btn btn-primary">
            Open my roster
          </Link>
        )}
        {isGmUser && (
          <button
            type="button"
            className={managing ? "btn btn-primary" : "btn"}
            aria-pressed={managing}
            onClick={() => setManaging(crusade.id, !managing)}
          >
            {managing ? "Done managing" : "Manage campaign"}
          </button>
        )}
        {isGm && (
          <button type="button" onClick={() => setShowSettings(true)} className="btn">
            Settings
          </button>
        )}
        {isGm && (
          <a href={sheetUrl(crusade.id)} target="_blank" rel="noreferrer" className="btn">
            Open the Google Sheet
          </a>
        )}
        <CopyLinkButton crusadeId={crusade.id} />
      </div>

      {!me && user && (
        <JoinPanel crusadeId={crusade.id} defaultName={user.email.split("@")[0]} />
      )}
      {me?.status === "Active" && myAttached.length === 0 && (
        <section className="card p-5 flex flex-wrap items-center justify-between gap-4" data-testid="create-force">
          <div className="flex flex-col gap-1 min-w-0 max-w-[62ch]">
            <h2 className="plate-heading m-0">Add your force</h2>
            <p className="m-0 text-mute">
              Create one by hand, or import a New Recruit or BattleScribe list.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowCreate(true)} className="btn btn-primary">
              Create my roster
            </button>
            {myAvailableRosters.length > 0 && (
              <button type="button" onClick={() => setShowAttach(true)} className="btn">
                Attach a roster
              </button>
            )}
          </div>
        </section>
      )}
      {me?.status === "Removed" && (
        <p role="alert" className="card m-0 p-5">
          The GM has removed you from this crusade. You can still read it, but
          you can't make changes.
        </p>
      )}

      <PhasesSection crusade={crusade} isGm={isGm} me={user?.googleId} canRecord={canRecordBattle} />

      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-[999_1_600px] min-w-0 flex flex-col gap-4">
          {trackerPlacement === "above" && campaignTracker}
          {totalsPlacement === "above" && totals}
          <MapCard crusade={crusade} isGm={isGm} />

          <Card title="Forces" label="Forces" flush>
            {mirrorsLoading ? (
              <p className="m-0 px-3 pb-3 text-mute">Loading…</p>
            ) : attached.length === 0 ? (
              <p className="m-0 px-3 pb-3 text-mute">
                No forces in this crusade yet.
              </p>
            ) : (
              <div className="overflow-x-auto px-3">
                <table>
                  <thead>
                    <tr>
                      <Th>Force</Th>
                      <Th>Owner</Th>
                      <Th className="text-right">Units</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {attached.map((mirror) => {
                      const isMine = mirror.player.googleId === user?.googleId;
                      return (
                        <MirrorRow
                          key={mirror.id}
                          mirror={mirror}
                          isMine={isMine}
                          canRename={isMine || isGm}
                          isRenaming={renamingRosterId === mirror.id}
                          onStartRename={() => setRenamingRosterId(mirror.id)}
                          onCancelRename={() => setRenamingRosterId(null)}
                          onSaveRename={async (newBanner) => {
                            await renameMutation.mutateAsync({
                              rosterId: mirror.id,
                              crusadeId,
                              newBanner,
                            });
                            setRenamingRosterId(null);
                          }}
                          isSavingRename={renameMutation.isPending}
                          canDetach={isMine || isGm}
                          onDetach={() => {
                            if (
                              window.confirm(
                                "Detach this roster from the crusade? The roster itself is untouched.",
                              )
                            ) {
                              detachRoster.mutate(mirror.id);
                            }
                          }}
                          canBless={isGm}
                          onBless={() => setBlessTarget(mirror)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Players" label="Players" flush>
            <div className="overflow-x-auto px-3">
              <table>
                <thead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Role</Th>
                    <Th>Status</Th>
                    {groups.length > 0 && <Th>Team</Th>}
                    {isGm && <Th />}
                  </tr>
                </thead>
                <tbody>
                  {crusade.players.map((p) => (
                    <tr key={p.user.googleId}>
                      <Td>
                        <span className="font-semibold">{p.user.displayName}</span>
                      </Td>
                      <Td>
                        <span className="chip">{p.role === "gm" ? "GM" : "Player"}</span>
                      </Td>
                      <Td>
                        <span className={p.status === "Removed" ? "text-bad" : ""}>{p.status}</span>
                      </Td>
                      {groups.length > 0 && (
                        <Td>
                          {isGm ? (
                            <select
                              value={p.groupId ?? ""}
                              disabled={setPlayerGroupMutation.isPending}
                              onChange={(e) =>
                                setPlayerGroupMutation.mutate({
                                  playerGoogleId: p.user.googleId,
                                  groupId: e.target.value || undefined,
                                })
                              }
                              className="field min-h-9"
                              aria-label={`Team for ${p.user.displayName}`}
                            >
                              <option value="">No team</option>
                              {groups.map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            (groups.find((g) => g.id === p.groupId)?.name ?? "–")
                          )}
                        </Td>
                      )}
                      {isGm && (
                        <Td className="text-right">
                          {p.role !== "gm" && p.status !== "Removed" && (
                            <button
                              type="button"
                              disabled={removePlayerMutation.isPending}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Remove ${p.user.displayName} from the crusade? Their tab is locked and their roster leaves the crusade. Also remove them from the sheet's sharing in Google Sheets. This app can't do that for you.`,
                                  )
                                ) {
                                  removePlayerMutation.mutate(p.user.googleId);
                                }
                              }}
                              className="btn-link text-bad"
                              title="Lock their tab and remove from crusade"
                            >
                              Remove
                            </button>
                          )}
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isGm && (
              <div className="inset-panel mx-2 mb-1 p-4 grid gap-3" data-testid="invite-players">
                <p className="m-0 font-semibold">Invite players</p>
                <ol className="m-0 pl-5 grid gap-1 text-mute leading-[1.5]">
                  <li>
                    Share the Google Sheet with each player as{" "}
                    <strong className="font-semibold text-ink">Editor</strong>.
                  </li>
                  <li>Send them the crusade link.</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={sheetUrl(crusade.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-sm"
                  >
                    Open the Google Sheet
                  </a>
                  <CopyLinkButton crusadeId={crusade.id} small />
                </div>
              </div>
            )}
          </Card>

          {trackerPlacement === "below" && campaignTracker}
          {totalsPlacement === "below" && totals}
        </div>

        <div className="flex-[1_1_340px] min-w-0 flex flex-col gap-4">
          <Card
            title="Table"
            label="Table"
            action={
              <Link to={`/crusades/${crusadeId}/table`} className="btn-link">
                Full table
              </Link>
            }
          >
            {table.length === 0 ? (
              <p className="m-0 text-mute text-[13px]">No forces yet.</p>
            ) : (
              <div className="flex flex-col tnum">
                <div className="grid grid-cols-[16px_minmax(0,1fr)_20px_20px_20px_66px] gap-x-2.5 py-1.5 text-mute text-xs font-semibold">
                  <div />
                  <div>Force</div>
                  <div className="text-center">W</div>
                  <div className="text-center">D</div>
                  <div className="text-center">L</div>
                  <div>Form</div>
                </div>
                {table.map((r, i) => {
                  const mine = r.roster.player.googleId === user?.googleId;
                  return (
                    <Link
                      key={r.roster.id}
                      to={`/rosters/${r.roster.id}`}
                      className="grid grid-cols-[16px_minmax(0,1fr)_20px_20px_20px_66px] gap-x-2.5 items-center min-h-[52px] border-t border-rule no-underline text-ink"
                    >
                      <span className="text-mute font-semibold">{i + 1}</span>
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Dot colour={forceColour(r.roster)} />
                        <span className="flex flex-col min-w-0">
                          <span className={`truncate ${mine ? "font-bold" : "font-medium"}`}>
                            {forceName(r.roster)}
                          </span>
                          <span className="text-xs text-mute truncate">
                            {mine ? "You" : r.roster.player.displayName}
                          </span>
                        </span>
                      </span>
                      <span className="text-center font-semibold">{r.w}</span>
                      <span className="text-center">{r.d}</span>
                      <span className="text-center">{r.l}</span>
                      <FormChips results={r.results} last={3} />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            title="Battles"
            label="Battles"
            action={
              <Link to={`/crusades/${crusadeId}/battles`} className="btn-link">
                All battles
              </Link>
            }
          >
            {attached.length >= 2 && canRecordBattle && me?.status === "Active" && (
              <div className="inset-panel px-3.5 py-3 flex items-center justify-between gap-3">
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="label-mono">Played a game?</span>
                  <span className="font-semibold">Record who won and the points</span>
                </span>
                <Link to={`/crusades/${crusadeId}/battles?new=1`} className="btn btn-primary">
                  Log battle
                </Link>
              </div>
            )}
            {recent.length === 0 ? (
              <p className="m-0 text-mute text-[13px]">No battles recorded yet.</p>
            ) : (
              <div className="flex flex-col">
                {recent.map((x) => (
                  <RecentBattle
                    key={x.id}
                    battle={x}
                    crusadeId={crusadeId}
                    attached={attached}
                    me={user?.googleId}
                  />
                ))}
              </div>
            )}
          </Card>

          {trackerPlacement === "side" && campaignTracker}

          {totalsPlacement === "side" && totals}

          {isGm && <TrackerSetsCard crusade={crusade} />}

          {isGm && (
            <p className="m-0 text-mute text-[13px]">
              To delete this crusade, delete its spreadsheet in Google Drive.
            </p>
          )}
        </div>
      </div>

      {showCreate && (
        <NewRosterForm
          crusadeName={crusade.name}
          onClose={() => setShowCreate(false)}
          onSubmit={async (values) => {
            const roster = await createRoster.mutateAsync({
              name: values.name ?? "",
              factionName: values.factionName,
              ...values.orderOfBattle,
            });
            if (values.units?.length) await addUnits(roster.id, values.units);
            await attachMutation.mutateAsync({ crusadeId, rosterId: roster.id });
            if (values.name?.trim()) {
              await renameMutation.mutateAsync({
                rosterId: roster.id,
                crusadeId,
                newBanner: values.name.trim(),
              });
            }
            setShowCreate(false);
            navigate(`/rosters/${roster.id}`);
          }}
        />
      )}

      {showAttach && (
        <AttachRosterDialog
          rosters={myAvailableRosters.map((r) => ({
            id: r.id,
            factionName: r.factionName,
            units: r.units.length,
          }))}
          onClose={() => setShowAttach(false)}
          onAttach={async (rosterId) => {
            await attachMutation.mutateAsync({ crusadeId, rosterId });
            setShowAttach(false);
          }}
        />
      )}

      {blessTarget && (
        <BlessDialog
          mirror={blessTarget}
          onClose={() => setBlessTarget(null)}
          onSubmit={async (input) => {
            await assignBlessing.mutateAsync({
              playerId: blessTarget.player.googleId,
              rosterId: blessTarget.id,
              ...input,
            });
            setBlessTarget(null);
          }}
        />
      )}

      {showSettings && (
        <CrusadeSettingsDialog
          crusade={crusade}
          onClose={() => setShowSettings(false)}
          onSave={async (patch) => {
            await updateConfigMutation.mutateAsync(patch);
          }}
        />
      )}

    </div>
  );
}

/** A recent battle: two score lines, as on a results ticker. */
function RecentBattle({
  battle,
  crusadeId,
  attached,
  me,
}: {
  battle: InlineBattle;
  crusadeId: string;
  attached: AttachedRoster[];
  me: string | undefined;
}) {
  const scored = battle.status !== "draft";
  const top = Math.max(...battle.participants.map((p) => p.victoryPoints));
  const todo = battleTodo(battle, me);
  return (
    <Link
      to={`/crusades/${crusadeId}/battles/${battle.id}`}
      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center py-2.5 border-t border-rule no-underline text-ink tnum ${battle.status === "voided" ? "opacity-55" : ""}`}
    >
      <span className="flex flex-col gap-1 min-w-0">
        <span className="text-xs text-mute truncate">{battle.missionName}</span>
        {battle.participants.map((p) => {
          const roster = attached.find((m) => m.id === p.rosterId);
          return (
            <span
              key={p.googleId}
              className={`flex items-center justify-between gap-2.5 ${scored && p.victoryPoints >= top ? "font-bold" : ""}`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Dot colour={roster ? forceColour(roster) : "#5B6472"} />
                <span className="truncate">{roster ? forceName(roster) : p.displayName}</span>
              </span>
              <span>{scored ? p.victoryPoints : "–"}</span>
            </span>
          );
        })}
      </span>
      {todo ? (
        <span className="btn btn-primary btn-sm">{todo}</span>
      ) : (
        <span className="text-xs font-semibold text-mute text-right max-w-[92px]">
          {battle.status === "verified"
            ? formatDate(battle.date)
            : battle.status === "pending"
              ? "Awaiting confirmation"
              : battle.status === "draft"
                ? "No result yet"
                : "Voided"}
        </span>
      )}
    </Link>
  );
}

function MirrorRow({
  mirror,
  isMine,
  canRename,
  isRenaming,
  onStartRename,
  onCancelRename,
  onSaveRename,
  isSavingRename,
  canDetach,
  onDetach,
  canBless,
  onBless,
}: {
  mirror: AttachedRoster;
  isMine: boolean;
  canRename: boolean;
  isRenaming: boolean;
  onStartRename: () => void;
  onCancelRename: () => void;
  onSaveRename: (newBanner: string) => Promise<void>;
  isSavingRename: boolean;
  canDetach: boolean;
  onDetach: () => void;
  canBless: boolean;
  onBless: () => void;
}) {
  const banner =
    (mirror.crusadeBanner ?? "").trim() || mirror.factionName || "Unnamed";
  const subline =
    mirror.factionName && mirror.factionName !== (mirror.crusadeBanner ?? "")
      ? mirror.factionName
      : null;

  return (
    <tr className="border-b border-rule hover:bg-paper-2">
      <Td>
        {isRenaming ? (
          <InlineRenameField
            initial={mirror.crusadeBanner || mirror.factionName || ""}
            saving={isSavingRename}
            onSave={onSaveRename}
            onCancel={onCancelRename}
          />
        ) : (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <Link
                to={`/rosters/${mirror.id}`}
                className="font-display text-lg leading-tight hover:text-accent"
              >
                {banner}
              </Link>
              {isMine && (
                <span className="font-mono text-[13px] text-accent">
                  · yours
                </span>
              )}
              {canRename && (
                <button
                  type="button"
                  onClick={onStartRename}
                  className="btn-link"
                  title="Rename banner for this crusade"
                >
                  Rename
                </button>
              )}
            </div>
            {subline && (
              <div className="font-mono text-[13px] text-mute mt-1">
                Library: {subline}
              </div>
            )}
          </>
        )}
      </Td>
      <Td>
        <span className="font-display leading-tight">
          {mirror.player.displayName}
        </span>
      </Td>
      <Td className="text-right tnum font-mono">{mirror.units.length}</Td>
      <Td>
        <span className="inline-flex items-center gap-3">
          <Link
            to={`/rosters/${mirror.id}`}
            className="btn-link"
          >
            Open
          </Link>
          {canBless && (
            <button
              type="button"
              onClick={onBless}
              className="btn-link"
              title="Assign a blessing or burden"
            >
              Bless
            </button>
          )}
          {canDetach && (
            <button
              type="button"
              onClick={onDetach}
              className="btn-link text-bad"
              title="Detach from crusade"
            >
              Detach
            </button>
          )}
        </span>
      </Td>
    </tr>
  );
}

function BlessDialog({
  mirror,
  onSubmit,
  onClose,
}: {
  mirror: AttachedRoster;
  onSubmit: (input: {
    unitId: string;
    type: "blessing" | "burden";
    name: string;
    description: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [unitId, setUnitId] = useState("");
  const [type, setType] = useState<"blessing" | "burden">("blessing");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            disabled={busy}
            className="btn-link"
          >
            Cancel
          </button>
        </div>

        <h2 className="specimen-title text-[clamp(1.75rem,4vw,2.5rem)] mt-6 [&_em]:specimen-title-em">
          Bestow a <em>{type}</em>
        </h2>

        <p className="mt-4 text-mute text-sm leading-[1.5] max-w-[52ch]">
          The player accepts it when they next open their roster.
        </p>

        <div className="mt-8 grid gap-5">
          <label className="grid gap-2">
            <span className="label-mono">Type</span>
            <div className="flex gap-4">
              {(["blessing", "burden"] as const).map((t) => (
                <label
                  key={t}
                  className="flex items-center gap-2 font-mono text-[13px] capitalize cursor-pointer"
                >
                  <input
                    type="radio"
                    checked={type === t}
                    onChange={() => setType(t)}
                    className="accent-accent"
                  />
                  {t}
                </label>
              ))}
            </div>
          </label>

          <label className="grid gap-2">
            <span className="label-mono">Unit</span>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="field"
            >
              <option value="">Pick a unit</option>
              {mirror.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.datasheetName})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="label-mono">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Field promotion"
              className="field"
            />
          </label>

          <label className="grid gap-2">
            <span className="label-mono">Effect</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What it does, in your own words or from your pack."
              className="field resize-y"
            />
          </label>

          {error && (
            <p className="m-0 border border-bad text-bad p-3 font-mono text-[13px]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-rule-strong">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="btn"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!unitId || !name.trim() || busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onSubmit({
                    unitId,
                    type,
                    name: name.trim(),
                    description: description.trim(),
                  });
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                  setBusy(false);
                }
              }}
              className="btn btn-primary"
            >
              {busy ? "Assigning…" : "Assign"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineRenameField({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: string;
  saving: boolean;
  onSave: (newBanner: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving && value.trim().length > 0) void onSave(value.trim());
      }}
      className="flex items-center gap-3"
    >
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        disabled={saving}
        className="bg-transparent border-b border-accent py-2 text-lg font-display text-ink focus:outline-none w-[24ch] disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={saving || value.trim().length === 0}
        className="btn btn-primary btn-sm"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="btn-link"
      >
        Cancel
      </button>
    </form>
  );
}

function AttachRosterDialog({
  rosters,
  onAttach,
  onClose,
}: {
  rosters: { id: string; factionName: string; units: number }[];
  onAttach: (rosterId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto dialog-scrim p-3"
    >
      <div className="w-full max-w-2xl dialog-panel">
        <div className="flex items-start justify-between gap-8">
          <span />
          <button
            type="button"
            onClick={onClose}
            disabled={!!busyId}
            className="btn-link"
          >
            Cancel
          </button>
        </div>

        <h2 className="specimen-title text-[clamp(2rem,5vw,3rem)] mt-6 [&_em]:specimen-title-em">
          Pick a <em>force</em>
        </h2>

        {rosters.length === 0 ? (
          <p className="mt-8 text-ink-2 italic">
            You have no library rosters to attach.{" "}
            <Link to="/rosters" className="underline text-accent">
              Build one first
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-8 grid gap-3 list-none p-0 m-0">
            {rosters.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-4 p-4 border border-rule-strong hover:border-ink"
              >
                <div>
                  <div className="font-display text-lg">{r.factionName}</div>
                  <div className="font-mono text-[13px] text-mute mt-1">
                    {r.units} unit{r.units === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!!busyId}
                  onClick={async () => {
                    setBusyId(r.id);
                    try {
                      await onAttach(r.id);
                    } finally {
                      setBusyId(null);
                    }
                  }}
                  className="btn btn-primary"
                >
                  {busyId === r.id ? "Attaching…" : "Attach"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Shown to someone the sheet is shared with who hasn't joined yet.
 * Joining creates their own tab in the crusade's sheet.
 */
function JoinPanel({
  crusadeId,
  defaultName,
}: {
  crusadeId: string;
  defaultName: string;
}) {
  const join = useJoinCrusade(crusadeId);
  const [name, setName] = useState(defaultName);
  return (
    <section>
      <form
        data-testid="join-crusade"
        className="card p-5 grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          join.mutate(name);
        }}
      >
        <h2 className="plate-heading m-0">Join this crusade</h2>
        <p className="m-0 text-mute text-sm max-w-[65ch]">
          Joining writes your name, email address and Google account ID into
          the sheet, where the GM and the other players can read them.
        </p>
        <label className="grid gap-1 max-w-sm">
          <span className="label-mono">Your name in this crusade</span>
          <input
            type="text"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            className="field"
          />
        </label>
        <div>
          <button
            type="submit"
            disabled={join.isPending || !name.trim()}
            className="btn btn-primary"
          >
            {join.isPending ? "Joining…" : "Join crusade"}
          </button>
        </div>
        {join.isError && (
          <p role="alert" className="m-0 text-bad text-sm">
            {join.error instanceof Error ? join.error.message : String(join.error)}
          </p>
        )}
      </form>
    </section>
  );
}

/** Copies this app's link to the crusade, what a GM sends players. */
function CopyLinkButton({
  crusadeId,
  small,
}: {
  crusadeId: string;
  small?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const url = appCrusadeUrl(crusadeId) ?? "";
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this crusade link:", url);
        }
      }}
      title={url}
      className={small ? "btn btn-sm" : "btn"}
    >
      {copied ? "Link copied" : "Copy crusade link"}
    </button>
  );
}

/**
 * First visit to a crusade from its link: it isn't on this device, so
 * fetch it from the Google Sheet. Needs the Sheets permission and the
 * sheet to be shared with this account; says which is missing.
 */
/** In "file" access mode, no access usually means "not chosen yet". */
function NotFound() {
  return (
    <div className="page py-12">
      <h1 className="specimen-title text-3xl [&_em]:specimen-title-em">
        <em>Crusade not found.</em>
      </h1>
      <p className="mt-4 text-ink-2">
        This crusade isn't on this device. Open it again from the link your
        GM sent you.
      </p>
    </div>
  );
}

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
      className={["py-4 pr-4 align-baseline text-[15px]", className ?? ""].join(
        " ",
      )}
    >
      {children}
    </td>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

