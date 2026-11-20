import type { CSSProperties, ReactNode } from "react";
import { monogram, sayResults, type FormLetter } from "@/lib/utils/stats";
import { markColour } from "@/lib/utils/team";

/** Monogram tile for a force or unit. */
export function Crest({
  name,
  colour,
  size = 36,
  tone = "force",
}: {
  name: string;
  colour?: string;
  size?: number;
  /** "force" = solid force colour; "glass" = on a banner; "plain" = grey. */
  tone?: "force" | "glass" | "plain";
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.27),
    fontSize: size >= 50 ? 20 : size >= 40 ? 13 : 12,
    ...(tone === "force"
      ? { background: colour, color: "#fff" }
      : tone === "glass"
        ? { background: "rgb(255 255 255 / 0.14)", color: "#fff" }
        : {}),
  };
  return (
    <span
      aria-hidden="true"
      className={`crest font-display ${tone === "plain" ? "bg-fill text-ink-2" : ""}`}
      style={style}
    >
      {monogram(name)}
    </span>
  );
}

/** Small square in a force's colour, beside its name. */
export function Dot({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-2.5 h-2.5 flex-none rounded-[3px]"
      style={{ background: markColour(colour) }}
    />
  );
}

/** W / D / L chips. They differ by fill, not hue. */
export function FormChips({
  results,
  label,
  onBanner,
  last,
}: {
  results: FormLetter[];
  label?: string;
  onBanner?: boolean;
  /** Show only the most recent n. */
  last?: number;
}) {
  const shown = last ? results.slice(-last) : results;
  if (shown.length === 0) return <span className="text-mute">–</span>;
  return (
    <span
      role="img"
      aria-label={`${label ?? (last ? `Last ${shown.length}` : "Results")}: ${sayResults(shown)}`}
      className="inline-flex gap-[3px]"
    >
      {shown.map((r, i) => (
        <span key={i} className="form-chip" style={chipStyle(r, onBanner)}>
          {r}
        </span>
      ))}
    </span>
  );
}

function chipStyle(r: FormLetter, onBanner?: boolean): CSSProperties {
  if (onBanner) {
    if (r === "W") return { background: "#fff", color: "#11161D" };
    if (r === "D") return { background: "rgb(255 255 255 / 0.28)", color: "#fff" };
    return { border: "1.5px solid #D5DEE8", color: "#fff" };
  }
  if (r === "W")
    return { background: "var(--color-plate)", color: "var(--color-plate-ink)" };
  if (r === "D") return { background: "var(--color-draw)", color: "var(--color-ink)" };
  return {
    background: "var(--color-surface)",
    border: "1.5px solid var(--color-loss-line)",
    color: "var(--color-ink)",
  };
}

/** Segmented control. */
export function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg-btn"
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A row of pips, e.g. requisition points out of 10. */
export function Pips({
  filled,
  total,
  label,
  onBanner,
  tall,
}: {
  filled: number;
  total: number;
  label: string;
  onBanner?: boolean;
  tall?: boolean;
}) {
  return (
    <span role="img" aria-label={label} className="inline-flex gap-[3px]">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="block rounded-[3px]"
          style={{
            width: tall ? 8 : 5,
            height: tall ? 22 : 5,
            background: onBanner
              ? i < filled
                ? "#fff"
                : "rgb(255 255 255 / 0.22)"
              : i < filled
                ? "var(--color-plate)"
                : "var(--color-track)",
          }}
        />
      ))}
    </span>
  );
}

/** A white card with a heading. */
export function Card({
  title,
  action,
  children,
  className = "",
  label,
  flush,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  label?: string;
  /** Rows run close to the card edge (lists and tables). */
  flush?: boolean;
}) {
  return (
    <section
      aria-label={label}
      className={`card flex flex-col gap-3 min-w-0 overflow-hidden ${flush ? "px-2 pt-5 pb-2" : "p-5"} ${className}`}
    >
      {(title || action) && (
        <div
          className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${flush ? "px-3" : ""}`}
        >
          {title && <h2 className="plate-heading m-0">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
