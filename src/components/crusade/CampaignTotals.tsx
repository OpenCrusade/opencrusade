import { Card, Dot } from "@/components/ui/kit";
import { readTrackerState } from "@/components/common/tracker-state";
import { forceColour, forceName } from "@/lib/utils/stats";
import type { AttachedRoster, Crusade } from "@/types";

/**
 * Crusade-level view of the campaign sets every player has: each
 * number tracker added up across forces and teams. The numbers
 * themselves live on each player's force.
 */
import { PanelPlacementMenu, type PanelPlacement } from "@/components/crusade/PanelPlacement";

export type TotalsPlacement = PanelPlacement;

export function CampaignTotals({
  crusade,
  attached,
  me,
  placement,
  onPlace,
  columns = 3,
  onColumns,
}: {
  crusade: Crusade;
  attached: AttachedRoster[];
  me: string | undefined;
  /** Where the panel is being shown. Wide when not at the side. */
  placement: TotalsPlacement;
  /** Given to the GM while managing: lets them move the panel. */
  onPlace?: (next: TotalsPlacement) => void;
  /** Trackers side by side when full width (1 to 4). */
  columns?: number;
  /** Given to the GM while managing: lets them change the columns. */
  onColumns?: (next: number) => void;
}) {
  const counters = (crusade.trackerSets ?? [])
    .filter((s) => s.scope === "everyone")
    .flatMap((s) =>
      s.items
        .filter((i) => i.kind === "counter" && i.totals !== false)
        .map((i) => ({ ref: `${s.id}:${i.id}`, name: i.name })),
    );
  if (counters.length === 0 || attached.length === 0) return null;

  const states = attached.map((roster) => ({
    roster,
    items: readTrackerState(roster.factionState).items,
  }));
  const groups = crusade.groups ?? [];
  const teamOf = new Map(crusade.players.map((p) => [p.user.googleId, p.groupId]));

  return (
    <Card
      title="Campaign totals"
      label="Campaign totals"
      action={
        onPlace && (
          <span className="flex flex-wrap items-center gap-x-3 justify-end">
            {placement !== "side" && onColumns && (
              <select
                value={columns}
                onChange={(e) => onColumns(Number(e.target.value))}
                aria-label="Campaign totals: trackers side by side"
                className="bg-transparent border-0 text-xs text-mute underline cursor-pointer"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} across
                  </option>
                ))}
              </select>
            )}
            <PanelPlacementMenu name="Campaign totals" value={placement} onChange={onPlace} />
          </span>
        )
      }
    >
      <div
        className={placement === "side" ? "flex flex-col gap-3" : "grid gap-x-8 gap-y-6"}
        style={
          placement === "side"
            ? undefined
            : {
                // At most `columns` across, fewer when there isn't room.
                gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, max(220px, calc((100% - ${(columns - 1) * 32}px) / ${columns}))), 1fr))`,
              }
        }
      >
      {counters.map((c) => {
        const rows = states
          .map((s) => {
            const item = s.items.find((i) => i.setRef === c.ref);
            return {
              roster: s.roster,
              value: typeof item?.value === "number" ? item.value : null,
              lifetime: typeof item?.lifetime === "number" ? item.lifetime : null,
            };
          })
          .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
        const total = rows.reduce((n, r) => n + (r.value ?? 0), 0);
        // Each force sits under its own team, so it can't be read as
        // belonging to the team listed just above it.
        const teams = groups
          .map((g) => {
            const members = rows.filter((r) => teamOf.get(r.roster.player.googleId) === g.id);
            return { g, rows: members, total: members.reduce((n, r) => n + (r.value ?? 0), 0) };
          })
          .filter((t) => t.rows.length > 0)
          .sort((a, b) => b.total - a.total);
        const inTeam = new Set(teams.flatMap((t) => t.rows.map((r) => r.roster.id)));
        const noTeam = rows.filter((r) => !inTeam.has(r.roster.id));

        return (
          <section key={c.ref} aria-label={c.name} className="flex flex-col tnum">
            <div className="flex items-end justify-between gap-3 pb-2">
              <span className="label-mono">{c.name}</span>
              <span className="font-display font-bold text-[26px] leading-none">
                {total}
                {rows.some((r) => r.lifetime !== null) && (
                  <span className="text-xs font-medium text-mute">
                    {" "}
                    · {rows.reduce((n, r) => n + (r.lifetime ?? 0), 0)} lifetime
                  </span>
                )}
              </span>
            </div>
            {teams.map((t) => (
              <div key={t.g.id} role="group" aria-label={t.g.name} className="flex flex-col">
                <div className="flex items-center justify-between gap-3 min-h-9 border-t border-rule font-semibold">
                  <span className="truncate">{t.g.name}</span>
                  <span>{t.total}</span>
                </div>
                {t.rows.map((r) => (
                  <ForceRow key={r.roster.id} row={r} me={me} indent />
                ))}
              </div>
            ))}
            {noTeam.length > 0 && teams.length > 0 && (
              <div className="flex items-center min-h-9 border-t border-rule font-semibold">No team</div>
            )}
            {noTeam.map((r) => (
              <ForceRow key={r.roster.id} row={r} me={me} indent={teams.length > 0} />
            ))}
          </section>
        );
      })}
      </div>
    </Card>
  );
}

interface TotalsRow {
  roster: AttachedRoster;
  value: number | null;
  lifetime: number | null;
}

function ForceRow({ row: r, me, indent }: { row: TotalsRow; me: string | undefined; indent?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 min-h-9 border-t border-rule ${indent ? "pl-4" : ""}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Dot colour={forceColour(r.roster)} />
        <span className={`truncate ${r.roster.player.googleId === me ? "font-bold" : ""}`}>
          {forceName(r.roster)}
        </span>
      </span>
      <span className={r.value === null ? "text-mute" : ""}>
        {r.value === null ? "Not set up" : r.value}
        {r.lifetime !== null && <span className="text-mute text-xs"> · {r.lifetime} lifetime</span>}
      </span>
    </div>
  );
}
