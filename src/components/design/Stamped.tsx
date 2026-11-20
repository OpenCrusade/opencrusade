import type { ReactNode } from "react";

export type StampedTone = "accent" | "ink" | "good" | "bad";

/** A status tag. Colour reinforces the word; it never replaces it. */
export function Stamped({
  children,
  tone = "accent",
}: {
  children: ReactNode;
  tone?: StampedTone;
  /** Ignored, kept so older call sites compile. */
  rotation?: number;
}) {
  const toneClass = {
    accent: "text-ink bg-fill",
    ink: "text-mute bg-fill",
    good: "text-good bg-good-soft",
    bad: "text-bad bg-bad-soft",
  }[tone];

  return <span className={`stamped ${toneClass}`}>{children}</span>;
}
