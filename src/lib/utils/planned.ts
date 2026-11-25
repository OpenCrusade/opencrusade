import type { Crusade, CrusadePhase, InlineBattle, PlannedBattle } from "@/types";

/** Everyone on a planned battle, both sides. */
export function plannedPlayers(p: PlannedBattle): string[] {
  return [...p.sides[0], ...p.sides[1]];
}

/**
 * The battle each planned battle was played as. A recorded battle
 * counts only if it isn't voided and was recorded by one of the
 * planned battle's players or by the GM, so nobody else can tick off
 * someone's pairing. The first such battle wins.
 */
export function playedAs(crusade: Crusade): Map<string, InlineBattle> {
  const gmIds = new Set(
    crusade.players.filter((p) => p.role === "gm").map((p) => p.user.googleId),
  );
  const planned = new Map<string, PlannedBattle>();
  for (const phase of crusade.phases ?? []) {
    for (const p of phase.planned ?? []) planned.set(p.id, p);
  }
  const out = new Map<string, InlineBattle>();
  for (const b of crusade.battles ?? []) {
    if (!b.plannedId || b.status === "voided" || out.has(b.plannedId)) continue;
    const p = planned.get(b.plannedId);
    if (!p) continue;
    if (gmIds.has(b.createdBy) || plannedPlayers(p).includes(b.createdBy)) {
      out.set(b.plannedId, b);
    }
  }
  return out;
}

export interface OpenPlanned {
  planned: PlannedBattle;
  phase: CrusadePhase;
}

/**
 * Planned battles not yet played that this person can record: the
 * ones they are on, or all of them for the GM.
 */
export function openPlannedFor(
  crusade: Crusade,
  googleId: string | undefined,
  isGm: boolean,
): OpenPlanned[] {
  if (!googleId) return [];
  const played = playedAs(crusade);
  const out: OpenPlanned[] = [];
  for (const phase of crusade.phases ?? []) {
    for (const p of phase.planned ?? []) {
      if (played.has(p.id)) continue;
      if (isGm || plannedPlayers(p).includes(googleId)) out.push({ planned: p, phase });
    }
  }
  return out;
}

/** "Ana v Ben", or "Ana and Cy v Ben" for uneven sides. */
export function plannedLabel(p: PlannedBattle, nameOf: (googleId: string) => string): string {
  const side = (ids: string[]) => (ids.length ? ids.map(nameOf).join(" and ") : "?");
  return `${side(p.sides[0])} v ${side(p.sides[1])}`;
}
