import { useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { BattleRow } from "@/components/battle/BattleRows";
import { NewBattleForm } from "@/components/battle/NewBattleForm";
import { Card, Seg } from "@/components/ui/kit";
import { useAuth } from "@/hooks/useAuth";
import { useCreateBattle } from "@/hooks/useBattle";
import { useCrusade } from "@/hooks/useCrusade";
import { useCrusadeMirrors } from "@/hooks/useRoster";
import type { InlineBattle } from "@/types";

/** Every battle in the crusade, newest first. /crusades/:id/battles */
export function BattlesPage() {
  const { crusadeId } = useParams<{ crusadeId: string }>();
  const { user, signedIn } = useAuth();
  const { data: crusade, isLoading } = useCrusade(crusadeId);
  const { data: mirrors } = useCrusadeMirrors(crusadeId);
  const createBattle = useCreateBattle(crusadeId ?? "");
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [show, setShow] = useState<"all" | "mine">("all");

  if (!signedIn || (!isLoading && !crusade)) {
    return <Navigate to={`/crusades/${crusadeId}`} replace />;
  }
  if (!crusade || !crusadeId) return <p className="page py-12 text-mute">Loading…</p>;

  const attached = mirrors ?? [];
  const me = user?.googleId;
  const isGm = crusade.players.find((p) => p.role === "gm")?.user.googleId === me;
  const canLog =
    attached.length >= 2 && (isGm || crusade.settings.allowPlayerBattleCreation !== false);
  const showNew = params.get("new") === "1" && canLog;
  // Closing the dialog only changes the query string: stay put.
  const closeNew = () => setParams({}, { replace: true, preventScrollReset: true });

  const all = [...(crusade.battles ?? [])].sort((a, b) =>
    (b.date + b.createdAt).localeCompare(a.date + a.createdAt),
  );
  const battles = show === "mine" ? all.filter((b) => b.participants.some((p) => p.googleId === me)) : all;

  // Group by month.
  const groups: { key: string; label: string; battles: InlineBattle[] }[] = [];
  for (const b of battles) {
    const key = b.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: monthLabel(b.date), battles: [] };
      groups.push(g);
    }
    g.battles.push(b);
  }
  const counted = all.filter((b) => b.status === "verified").length;
  const open = all.filter((b) => b.status === "draft" || b.status === "pending").length;

  return (
    <div className="page max-w-[960px] pt-7 pb-9 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3 px-1 pb-1">
        <div className="flex flex-col gap-1">
          <h1 className="nameplate">Battles</h1>
          <div className="text-mute">
            {counted} confirmed{open > 0 ? ` · ${open} open` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Seg
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: "all", label: "All battles" },
              { value: "mine", label: "Mine" },
            ]}
          />
        </div>
      </div>

      {groups.length === 0 && (
        <Card>
          <p className="m-0 text-mute">
            {all.length > 0
              ? "You haven't played a battle yet."
              : attached.length < 2
                ? "No battles yet. Two players need an attached roster before a battle can be logged."
                : "No battles yet. Log the first one when you've played it."}
          </p>
        </Card>
      )}

      {groups.map((g) => (
        <section
          key={g.key}
          aria-label={g.label}
          className="card px-5 py-1.5 flex flex-wrap items-center gap-x-5"
        >
          <div className="flex-[0_0_96px] py-2.5 flex flex-col gap-0.5">
            <span className="font-display font-bold text-[15px]">{g.label}</span>
            <span className="text-xs text-mute">
              {g.battles.length} battle{g.battles.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex-[999_1_420px] min-w-0 flex flex-col">
            {g.battles.map((b, i) => (
              <BattleRow
                key={b.id}
                battle={b}
                crusadeId={crusadeId}
                attached={attached}
                me={me}
                first={i === 0}
              />
            ))}
          </div>
        </section>
      ))}

      {showNew && (
        <NewBattleForm
          attached={attached}
          meId={me}
          missionOptions={crusade.packContent?.missions ?? []}
          onClose={closeNew}
          onSubmit={async (values) => {
            const result = await createBattle.mutateAsync(values);
            navigate(`/crusades/${crusadeId}/battles/${result.battle.id}`);
          }}
        />
      )}
    </div>
  );
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
