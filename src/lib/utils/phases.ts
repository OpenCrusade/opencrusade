import type { CrusadePhase } from "@/types";

/** Days before a phase's end date that the GM is reminded to name a version. */
const REMIND_DAYS = 3;

/** The phase ends within a few days, or has ended. */
export function nearEnd(p: CrusadePhase, today: string): boolean {
  if (!p.end) return false;
  const remindFrom = new Date(`${p.end}T00:00:00`);
  if (Number.isNaN(remindFrom.getTime())) return false;
  remindFrom.setDate(remindFrom.getDate() - REMIND_DAYS);
  return today >= remindFrom.toLocaleDateString("en-CA");
}
