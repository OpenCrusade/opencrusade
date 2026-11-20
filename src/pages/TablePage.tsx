import { Link, Navigate, useParams } from "react-router-dom";
import { Card, Crest, Dot, FormChips } from "@/components/ui/kit";
import { useAuth } from "@/hooks/useAuth";
import { useCrusade } from "@/hooks/useCrusade";
import { useCrusadeMirrors } from "@/hooks/useRoster";
import {
  countedBattles,
  forceColour,
  forceName,
  headToHead,
  standings,
} from "@/lib/utils/stats";
import { rosterCrusadePoints } from "@/lib/utils/crusade-points";
import type { CrusadePlayer, InlineBattle, PlayerGroup, AttachedRoster } from "@/types";

const COLS =
  "grid grid-cols-[24px_minmax(220px,1fr)_36px_36px_36px_36px_52px_52px_56px_64px_124px] gap-x-3 items-center";

/** Full standings and the head-to-head grid. /crusades/:id/table */
export function TablePage() {
  const { crusadeId } = useParams<{ crusadeId: string }>();
  const { user, signedIn } = useAuth();
  const { data: crusade, isLoading } = useCrusade(crusadeId);
  const { data: mirrors } = useCrusadeMirrors(crusadeId);

  if (!signedIn || (!isLoading && !crusade)) {
    return <Navigate to={`/crusades/${crusadeId}`} replace />;
  }
  if (!crusade) return <p className="page py-12 text-mute">Loading…</p>;

  const battles = crusade.battles ?? [];
  const rows = standings(mirrors ?? [], battles);
  const played = countedBattles(battles).length;
  const waiting = battles.filter((b) => b.status === "pending").length;

  return (
    <div className="page pt-7 pb-9 flex flex-col gap-4">
      <div className="flex flex-col gap-1 px-1 pb-1">
        <h1 className="nameplate">Table</h1>
        <div className="text-mute">
          {played} battle{played === 1 ? "" : "s"} counted
          {waiting > 0 ? ` · ${waiting} waiting for confirmation` : ""}
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <p className="m-0 text-mute">
            No forces yet. The table fills in once players attach a roster.
          </p>
        </Card>
      ) : (
        <>
          <section aria-label="Standings" className="card px-2 pt-3 pb-2">
            <div className="overflow-x-auto">
              <div className="min-w-[900px] flex flex-col gap-0.5">
                <div className={`${COLS} px-4 py-2 text-mute text-xs font-semibold`}>
                  <div />
                  <div>Force</div>
                  <div className="text-center" title="Played">P</div>
                  <div className="text-center">W</div>
                  <div className="text-center">D</div>
                  <div className="text-center">L</div>
                  <div className="text-right" title="Victory points scored">VP for</div>
                  <div className="text-right" title="Victory points conceded">Agst</div>
                  <div className="text-right">Diff</div>
                  <div className="text-right" title="Crusade points">Crusade</div>
                  <div>Form</div>
                </div>
                {rows.map((r, i) => {
                  const mine = r.roster.player.googleId === user?.googleId;
                  return (
                    <Link
                      key={r.roster.id}
                      to={`/rosters/${r.roster.id}`}
                      className={`${COLS} min-h-16 px-4 rounded-xl no-underline text-ink tnum ${mine ? "bg-inset" : "hover:bg-inset"}`}
                    >
                      <span className="text-mute font-bold text-base">{i + 1}</span>
                      <span className="flex items-center gap-3 min-w-0">
                        <Crest name={forceName(r.roster)} colour={forceColour(r.roster)} />
                        <span className="flex flex-col min-w-0">
                          <span className={`truncate ${mine ? "font-bold" : "font-semibold"}`}>
                            {forceName(r.roster)}
                          </span>
                          <span className="text-xs text-mute truncate">
                            {mine ? "You" : r.roster.player.displayName}
                            {r.roster.factionName && r.roster.factionName !== forceName(r.roster)
                              ? ` · ${r.roster.factionName}`
                              : ""}
                          </span>
                        </span>
                      </span>
                      <span className="text-center">{r.played}</span>
                      <span className="text-center font-bold">{r.w}</span>
                      <span className="text-center">{r.d}</span>
                      <span className="text-center">{r.l}</span>
                      <span className="text-right">{r.vpFor}</span>
                      <span className="text-right">{r.vpAgainst}</span>
                      <span className="text-right font-semibold">
                        {r.diff > 0 ? "+" : ""}
                        {r.diff}
                      </span>
                      <span className="text-right">{r.crusadePoints}</span>
                      <FormChips results={r.results} last={5} />
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          <TeamTable
            groups={crusade.groups ?? []}
            players={crusade.players}
            attached={mirrors ?? []}
            battles={battles}
          />

          {rows.length > 1 && (
            <Card
              label="Head to head"
              title="Head to head"
              action={
                <span className="text-mute text-[13px]">
                  Read across: the row force's results against each column
                </span>
              }
            >
              <div className="overflow-x-auto">
                <div className="flex flex-col" style={{ minWidth: 200 + rows.length * 130 }}>
                  <div
                    className="grid gap-x-3 py-2 text-mute text-xs font-semibold"
                    style={{
                      gridTemplateColumns: `minmax(200px,1.4fr) repeat(${rows.length}, minmax(0,1fr))`,
                    }}
                  >
                    <div />
                    {rows.map((r) => (
                      <div key={r.roster.id} className="flex items-center gap-2 min-w-0">
                        <Dot colour={forceColour(r.roster)} />
                        <span className="truncate">{forceName(r.roster)}</span>
                      </div>
                    ))}
                  </div>
                  {rows.map((r) => (
                    <div
                      key={r.roster.id}
                      className="grid gap-x-3 items-center min-h-[52px] border-t border-rule"
                      style={{
                        gridTemplateColumns: `minmax(200px,1.4fr) repeat(${rows.length}, minmax(0,1fr))`,
                      }}
                    >
                      <div className="flex items-center gap-2.5 font-semibold min-w-0">
                        <Dot colour={forceColour(r.roster)} />
                        <span className="truncate">{forceName(r.roster)}</span>
                      </div>
                      {rows.map((c) =>
                        c.roster.id === r.roster.id ? (
                          <span key={c.roster.id} className="text-mute" aria-label="Same force">
                            –
                          </span>
                        ) : (
                          <span key={c.roster.id}>
                            <FormChips
                              results={headToHead(
                                battles,
                                r.roster.player.googleId,
                                c.roster.player.googleId,
                              )}
                              label={`Against ${forceName(c.roster)}`}
                            />
                          </span>
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/** Team standings: shown only when the GM has set up teams. */
function TeamTable({
  groups,
  players,
  attached,
  battles,
}: {
  groups: PlayerGroup[];
  players: CrusadePlayer[];
  attached: AttachedRoster[];
  battles: InlineBattle[];
}) {
  const assigned = players.filter((p) => p.groupId);
  if (groups.length === 0 || assigned.length === 0) return null;
  const counted = countedBattles(battles);
  const rows = groups
    .map((g) => {
      const ids = new Set(assigned.filter((p) => p.groupId === g.id).map((p) => p.user.googleId));
      let w = 0,
        d = 0,
        l = 0;
      for (const b of counted)
        for (const p of b.participants) {
          if (!ids.has(p.googleId)) continue;
          if (p.outcome === "victory") w++;
          else if (p.outcome === "draw") d++;
          else if (p.outcome === "defeat") l++;
        }
      const cp = attached
        .filter((m) => ids.has(m.player.googleId))
        .reduce((n, m) => n + rosterCrusadePoints(m), 0);
      return { g, members: ids.size, w, d, l, cp };
    })
    .sort((a, b) => b.w - a.w || a.l - b.l || b.cp - a.cp);

  return (
    <Card title="Team standings" label="Team standings">
      <div className="flex flex-col tnum">
        <div className="grid grid-cols-[minmax(0,1fr)_60px_36px_36px_36px_64px] gap-x-3 py-2 text-mute text-xs font-semibold">
          <div>Team</div>
          <div className="text-right">Players</div>
          <div className="text-center">W</div>
          <div className="text-center">D</div>
          <div className="text-center">L</div>
          <div className="text-right">Crusade</div>
        </div>
        {rows.map((r) => (
          <div
            key={r.g.id}
            className="grid grid-cols-[minmax(0,1fr)_60px_36px_36px_36px_64px] gap-x-3 items-center min-h-[52px] border-t border-rule"
          >
            <span className="font-semibold truncate">{r.g.name}</span>
            <span className="text-right">{r.members}</span>
            <span className="text-center font-bold">{r.w}</span>
            <span className="text-center">{r.d}</span>
            <span className="text-center">{r.l}</span>
            <span className="text-right">{r.cp}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
