import { Link } from "react-router-dom";
import { Dot } from "@/components/ui/kit";
import { battleTodo, forceColour, forceName } from "@/lib/utils/stats";
import type { AttachedRoster, InlineBattle } from "@/types";

const STATE: Record<InlineBattle["status"], string> = {
  draft: "No result yet",
  pending: "Awaiting confirmation",
  verified: "Report",
  voided: "Voided",
};

/** One battle as a fixture line: force, score, force, action. */
export function BattleRow({
  battle,
  crusadeId,
  attached,
  me,
  first,
}: {
  battle: InlineBattle;
  crusadeId: string;
  attached: AttachedRoster[];
  me: string | undefined;
  first?: boolean;
}) {
  const side = (i: number) => {
    const p = battle.participants[i];
    const roster = attached.find((m) => m.id === p?.rosterId);
    return {
      p,
      name: roster ? forceName(roster) : (p?.displayName ?? ""),
      colour: roster ? forceColour(roster) : "#5B6472",
    };
  };
  const a = side(0);
  const b = side(1);
  const extra = battle.participants.length - 2;
  const scored = battle.status !== "draft";
  const todo = battleTodo(battle, me);
  const href = `/crusades/${crusadeId}/battles/${battle.id}`;
  const weight = (x: typeof a, y: typeof a) =>
    scored && x.p.victoryPoints >= y.p.victoryPoints ? "font-bold" : "font-medium";

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_84px_minmax(0,1fr)] sm:grid-cols-[minmax(0,1fr)_84px_minmax(0,1fr)_150px] gap-x-3 gap-y-1 items-center min-h-[52px] py-2 tnum ${first ? "" : "border-t border-rule"} ${battle.status === "voided" ? "opacity-55" : ""}`}
    >
      <span className={`flex items-center justify-end gap-2 min-w-0 ${weight(a, b)}`}>
        <span className="truncate">{a.name}</span>
        <Dot colour={a.colour} />
      </span>
      <Link
        to={href}
        className={`score-pill no-underline ${scored ? "text-ink" : "bg-transparent text-mute"}`}
        aria-label={`${battle.missionName}: open battle`}
      >
        {scored ? `${a.p.victoryPoints} – ${b.p.victoryPoints}` : "vs"}
      </Link>
      <span className={`flex items-center gap-2 min-w-0 ${weight(b, a)}`}>
        <Dot colour={b.colour} />
        <span className="truncate">
          {b.name}
          {extra > 0 ? ` +${extra}` : ""}
        </span>
      </span>
      <span className="col-span-3 sm:col-span-1 flex items-center justify-between sm:justify-end gap-3 min-w-0">
        <span className="sm:hidden text-xs text-mute truncate">{battle.missionName}</span>
        {todo ? (
          <Link to={href} className="btn btn-primary btn-sm">
            {todo}
          </Link>
        ) : (
          <Link to={href} className="btn-link whitespace-nowrap">
            {STATE[battle.status]}
          </Link>
        )}
      </span>
    </div>
  );
}
