import type { ReactNode } from "react";

export interface SpecimenHeaderProps {
  /** One plain line of context under the title. */
  kicker?: string;
  title: ReactNode;
  blurb?: ReactNode;
  /** Headline figures. */
  meta?: Array<{ label: string; value: ReactNode }>;
  /** Actions for this page. */
  beneath?: ReactNode;
}

/** Page title block: title, a line of context, actions and figures. */
export function SpecimenHeader({ kicker, title, blurb, meta, beneath }: SpecimenHeaderProps) {
  return (
    <section className="page pt-7 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-1">
        <div className="flex flex-col gap-1 min-w-0">
          <h1 className="nameplate">{title}</h1>
          {(kicker || blurb) && (
            <p className="m-0 text-mute max-w-[68ch]">{kicker ?? blurb}</p>
          )}
          {kicker && blurb && <p className="m-0 text-mute max-w-[68ch]">{blurb}</p>}
        </div>
        {beneath}
      </div>
      {meta && meta.length > 0 && (
        <dl className="card m-0 px-5 py-4 flex flex-wrap gap-x-9 gap-y-4">
          {meta.map((entry) => (
            <div key={entry.label} className="stat-cell">
              <dt className="stat-label">{entry.label}</dt>
              <dd className="stat-value m-0">{entry.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
