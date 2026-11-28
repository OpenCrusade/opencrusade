import type { CrusadeCard } from "@/types";

/**
 * Whether a unit is its force's Warlord. Units imported before the
 * flag existed carry New Recruit's "Warlord" selection in their wargear.
 */
export function isWarlord(u: Pick<CrusadeCard, "isWarlord" | "equipment">): boolean {
  return u.isWarlord ?? u.equipment.some((e) => e.trim().toLowerCase() === "warlord");
}

/** Wargear without the old "Warlord" entry, which is shown as a badge. */
export function wargearOnly(equipment: string[]): string[] {
  return equipment.filter((e) => e.trim().toLowerCase() !== "warlord");
}
