import type { ReactNode } from "react";

/** A short explanation of how something works. */
export function MarginNote({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <aside className="note">
      <strong className="font-semibold text-ink">{label}.</strong> {children}
    </aside>
  );
}
