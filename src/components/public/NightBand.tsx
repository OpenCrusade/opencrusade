import { useId } from "react";

/**
 * The dark band used at the top of the public pages (start page,
 * questions, about, privacy, terms). Behind the content is a faint
 * campaign map: a survey grid, range rings and a plotted route.
 */
export function NightBand({
  children,
  className = "",
  route = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Draw the plotted route and waypoints as well as the grid. */
  route?: boolean;
}) {
  return (
    <div className={`relative isolate overflow-hidden bg-night text-night-ink ${className}`}>
      <MapBackdrop route={route} />
      {children}
    </div>
  );
}

function MapBackdrop({ route }: { route: boolean }) {
  const id = useId();
  return (
    <svg
      aria-hidden
      className="absolute inset-0 -z-10 h-full w-full"
      viewBox="0 0 1440 640"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id={`${id}-fine`} width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="#fff" strokeOpacity="0.035" />
        </pattern>
        <pattern id={`${id}-grid`} width="120" height="120" patternUnits="userSpaceOnUse">
          <rect width="120" height="120" fill={`url(#${id}-fine)`} />
          <path d="M120 0H0V120" fill="none" stroke="#fff" strokeOpacity="0.09" />
        </pattern>
        <radialGradient id={`${id}-glow`} cx="74%" cy="42%" r="55%">
          <stop offset="0" stopColor="#2b4470" stopOpacity="0.75" />
          <stop offset="1" stopColor="#0b1220" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1440" height="640" fill={`url(#${id}-glow)`} />
      <rect width="1440" height="640" fill={`url(#${id}-grid)`} />
      <g fill="none" stroke="#fff" strokeOpacity="0.1">
        <circle cx="1070" cy="270" r="130" />
        <circle cx="1070" cy="270" r="250" />
        <circle cx="1070" cy="270" r="380" strokeDasharray="3 9" />
      </g>
      {route && (
        <g>
          <path
            d="M-10 614 L310 600 L640 608 L735 392 L1010 430 L1240 250 L1440 170"
            fill="none"
            stroke="#3f74e6"
            strokeOpacity="0.55"
            strokeWidth="2"
            strokeDasharray="2 10"
            strokeLinecap="round"
          />
          {[
            [735, 392],
            [1240, 250],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
              <path d="M0 -9 L9 0 L0 9 L-9 0Z" fill="#0b1220" stroke="#3f74e6" strokeWidth="2" />
              <circle r="2.5" fill="#3f74e6" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}

/** Page title band for the questions, about, privacy and terms pages. */
export function PageBand({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <NightBand route={false}>
      <div className="page py-9 sm:py-12 grid gap-4">
        <h1 className="m-0 font-display font-bold leading-[1.08] tracking-[-0.01em] text-[clamp(1.8rem,4.5vw,2.75rem)]">
          {title}
        </h1>
        {children}
      </div>
    </NightBand>
  );
}
