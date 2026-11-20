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
}: {
  crusade: Crusade;
  attached: AttachedRoster[];
  me: string | undefined;
  /** Where the panel is being shown. Wide when not at the side. */
  placement: TotalsPlacement;
  /** Given to the GM while managing: lets them move the panel. */
  onPlace?: (next: TotalsPlacement) => void;
}) {
  const counters = (crusade.trackerSets ?? [])
    .filter((s) => s.scope === "everyone")
    .flatMap((s) =>
      s.items
        .filter((i) => i.kind === "counter")
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
          <PanelPlacementMenu name="Campaign totals" value={placement} onChange={onPlace} />
        )
      }
    >
      <div
        className={
          placement === "side"
            ? "flex flex-col gap-3"
            : "grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3"
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
        const teams = groups
          .map((g) => ({
            g,
            total: rows
              .filter((r) => teamOf.get(r.roster.player.googleId) === g.id)
              .reduce((n, r) => n + (r.value ?? 0), 0),
            members: rows.filter((r) => teamOf.get(r.roster.player.googleId) === g.id).length,
          }))
          .filter((t) => t.members > 0)
          .sort((a, b) => b.total - a.total);

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
              <div
                key={t.g.id}
                className="flex items-center justify-between gap-3 min-h-9 border-t border-rule font-semibold"
              >
                <span className="truncate">{t.g.name}</span>
                <span>{t.total}</span>
              </div>
            ))}
            {rows.map((r) => (
              <div
                key={r.roster.id}
                className="flex items-center justify-between gap-3 min-h-9 border-t border-rule"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Dot colour={forceColour(r.roster)} />
                  <span className={`truncate ${r.roster.player.googleId === me ? "font-bold" : ""}`}>
                    {forceName(r.roster)}
                  </span>
                </span>
                <span className={r.value === null ? "text-mute" : ""}>
                  {r.value === null ? "Not set up" : r.value}
                  {r.lifetime !== null && (
                    <span className="text-mute text-xs"> · {r.lifetime} lifetime</span>
                  )}
                </span>
              </div>
            ))}
          </section>
        );
      })}
      </div>
    </Card>
  );
}
