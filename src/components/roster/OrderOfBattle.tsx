import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, Seg } from "@/components/ui/kit";
import { monogram } from "@/lib/utils/stats";
import { rankProgress } from "@/lib/utils/xp";
import { honourTally } from "@/lib/utils/crusade-points";
import type { CrusadeCard, PlayerRoster } from "@/types";

/**
 * The squad list: one row per unit, sortable, each row opening a
 * summary card with the unit's rank progress, honours and scars.
 */

export interface OrderOfBattleProps {
  roster: PlayerRoster;
  supplyCeiling: number;
  onRemove?: (unitId: string) => void;
  isRemoving?: boolean;
  /** Extra action beside the heading (e.g. Add unit). */
  action?: React.ReactNode;
}

type SortKey = "xp" | "kills" | "pts";

const RANK_SHORT = ["Ready", "Blooded", "Hardened", "Heroic", "Legendary"];

const COLS =
  "grid grid-cols-[40px_minmax(170px,1fr)_140px_32px_32px_32px_32px_44px_36px] gap-x-3 items-center";

export function OrderOfBattle({ roster, onRemove, isRemoving, action }: OrderOfBattleProps) {
  const [sort, setSort] = useState<SortKey>("xp");
  const [openId, setOpenId] = useState<string | null>(null);

  const key = (u: CrusadeCard) =>
    sort === "xp" ? u.experiencePoints : sort === "kills" ? u.enemiesDestroyed : u.pointsCost;
  const sorted = [...roster.units].sort(
    (a, b) => key(b) - key(a) || b.experiencePoints - a.experiencePoints,
  );

  return (
    <Card
      label="Squad"
      title="Squad"
      flush
      action={
        <div className="flex flex-wrap items-center gap-3">
          {sorted.length > 1 && (
            <Seg
              label="Sort by"
              value={sort}
              onChange={setSort}
              options={[
                { value: "xp", label: "XP" },
                { value: "kills", label: "Kills" },
                { value: "pts", label: "Points" },
              ]}
            />
          )}
          {action}
        </div>
      }
    >
      {sorted.length === 0 ? (
        <p className="m-0 px-3 pb-4 text-mute max-w-[60ch]">
          No units yet. Add the first one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[680px] flex flex-col">
            <div className={`${COLS} px-4 py-2 text-mute text-xs font-semibold`}>
              <div />
              <div>Unit</div>
              <div>Rank</div>
              <div className="text-center" title="Battles played">P</div>
              <div className="text-center" title="Units destroyed">K</div>
              <div className="text-center" title="Battle Honours">H</div>
              <div className="text-center" title="Battle Scars">S</div>
              <div className="text-center">XP</div>
              <div />
            </div>
            {sorted.map((unit) => (
              <UnitRow
                key={unit.id}
                unit={unit}
                rosterId={roster.id}
                open={openId === unit.id}
                onToggle={() => setOpenId(openId === unit.id ? null : unit.id)}
                onRemove={onRemove}
                isRemoving={isRemoving}
              />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function UnitRow({
  unit,
  rosterId,
  open,
  onToggle,
  onRemove,
  isRemoving,
}: {
  unit: CrusadeCard;
  rosterId: string;
  open: boolean;
  onToggle: () => void;
  onRemove?: (id: string) => void;
  isRemoving?: boolean;
}) {
  const prog = rankProgress(unit);
  const toPick = honourTally(unit).available;
  const href = `/rosters/${rosterId}/units/${unit.id}`;

  return (
    <div className="border-t border-rule flex flex-col">
      <div className={`${COLS} min-h-[60px] px-4 tnum`}>
        <span
          aria-hidden="true"
          className="crest font-display w-10 h-10 text-[13px]"
          style={
            open
              ? { background: "var(--color-team)", color: "#fff" }
              : { background: "var(--color-fill)", color: "var(--color-ink-2)" }
          }
        >
          {monogram(unit.name)}
        </span>
        <span className="flex flex-col gap-px min-w-0">
          <Link to={href} className="font-semibold text-ink no-underline hover:underline truncate">
            {unit.name}
          </Link>
          <span className="text-xs text-mute truncate">
            {unit.datasheetName}
            {unit.isCharacter ? " · Character" : ""} · {unit.pointsCost} pts
          </span>
        </span>
        <span className="flex flex-col gap-[5px]">
          <span className="text-xs font-medium">{unit.rank}</span>
          <span aria-hidden="true" className="block h-1 rounded-sm bg-track">
            <span
              className="block h-1 rounded-sm"
              style={{ width: `${Math.round(prog.inRank * 100)}%`, background: "var(--mark)" }}
            />
          </span>
        </span>
        <span className="text-center">{unit.battlesPlayed}</span>
        <span className="text-center">{unit.enemiesDestroyed}</span>
        <span
          className="text-center"
          title={toPick > 0 ? `${toPick} Battle Honour${toPick === 1 ? "" : "s"} to pick` : undefined}
        >
          {unit.battleHonours.length}
          {toPick > 0 && (
            <span className="font-semibold" style={{ color: "var(--mark)" }}>
              <span aria-hidden="true">+{toPick}</span>
              <span className="sr-only"> held, {toPick} to pick</span>
            </span>
          )}
        </span>
        <span className="text-center">{unit.battleScars.length}</span>
        <span className="xp-badge">{unit.experiencePoints}</span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} details for ${unit.name}`}
          className="w-9 h-9 grid place-items-center bg-transparent border-0 rounded-lg cursor-pointer text-mute hover:bg-fill"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="mx-2 mb-2.5 px-5 py-[18px] inset-panel rounded-[14px] flex flex-wrap gap-x-9 gap-y-5">
          <div className="flex-[2_1_280px] min-w-0 flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display font-bold text-[28px] leading-none">
                {unit.experiencePoints}
                <span className="text-sm text-mute"> XP</span>
              </span>
              <span className="text-[13px] text-mute">{prog.next}</span>
            </div>
            <div aria-hidden="true" className="grid items-center">
              <div className="[grid-area:1/1] grid grid-cols-5 gap-[3px]">
                {RANK_SHORT.map((r) => (
                  <div key={r} className="h-2 rounded bg-track" />
                ))}
              </div>
              <div
                className="[grid-area:1/1] h-2 rounded"
                style={{ width: `${(prog.career * 100).toFixed(1)}%`, background: "var(--mark)" }}
              />
            </div>
            <div className="grid grid-cols-5 gap-[3px] text-[11px] text-mute">
              {RANK_SHORT.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </div>
          </div>
          <div className="flex-[1_1_180px] flex flex-col gap-2">
            <div className="label-mono">Honours and scars</div>
            <div className="flex flex-wrap gap-1.5">
              {unit.battleHonours.map((h) => (
                <span key={h.id} className="chip bg-surface">
                  <span
                    aria-hidden="true"
                    className="block w-2 h-2 rounded-full"
                    style={{ background: "var(--mark)" }}
                  />
                  {h.name}
                </span>
              ))}
              {unit.battleScars.map((s) => (
                <span key={s.id} className="chip bg-surface">
                  <span
                    aria-hidden="true"
                    className="block w-2 h-2 rounded-full border-2 border-ink"
                  />
                  {s.name}
                </span>
              ))}
              {unit.battleHonours.length + unit.battleScars.length === 0 && (
                <span className="text-[13px] text-mute">None yet</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-start">
            <Link to={href} className="btn">
              Open unit card
            </Link>
            {onRemove && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={isRemoving}
                onClick={() => {
                  if (window.confirm(`Remove ${unit.name} from this force?`)) onRemove(unit.id);
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
