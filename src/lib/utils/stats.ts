import { rosterCrusadePoints } from "./crusade-points";
import type { AttachedRoster, InlineBattle, PlayerRoster } from "@/types";

/** Colours a player can pick for their force. The first is the default. */
export const FORCE_COLOURS = [
  "#16324F",
  "#7B2D8E",
  "#1E7A4C",
  "#C2571A",
  "#7A2318",
  "#3B2A6B",
  "#0F6B75",
  "#5A4A1F",
];

type Named = Pick<PlayerRoster, "id" | "factionName"> & {
  crusadeBanner?: string;
  colour?: string;
};

export function forceName(r: Named): string {
  return r.crusadeBanner || r.factionName || "Unnamed force";
}

/** A force's colour: the one its owner chose, else a stable pick. */
export function forceColour(r: Named): string {
  if (r.colour) return r.colour;
  let h = 0;
  for (const ch of r.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FORCE_COLOURS[h % FORCE_COLOURS.length];
}

/**
 * The crusade's pack or setting as the GM typed it. Older crusades
 * stored an id such as "some-pack"; those read as "Some Pack".
 */
export function packLabel(id: string): string {
  const t = (id ?? "").trim();
  if (!t || t === "core") return "";
  if (/[\sA-Z]/.test(t)) return t;
  return t
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/** Two letters standing for a name: "Vigil of Ash" → "VA". */
export function monogram(name: string): string {
  const words = name
    .replace(/^the\s+/i, "")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w) && !/^(of|the|and)$/i.test(w));
  if (words.length === 0) return "?";
  const first = words[0];
  const second = words[1];
  return ((first[0] ?? "") + (second ? second[0] : (first[1] ?? ""))).toUpperCase();
}

export type FormLetter = "W" | "D" | "L";

const LETTER: Record<string, FormLetter | undefined> = {
  victory: "W",
  draw: "D",
  defeat: "L",
};

/** Battles whose result every player has confirmed, oldest first. */
export function countedBattles(battles: InlineBattle[]): InlineBattle[] {
  return battles
    .filter((b) => b.status === "verified")
    .sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt));
}

export interface StandingRow {
  roster: AttachedRoster;
  played: number;
  w: number;
  d: number;
  l: number;
  vpFor: number;
  vpAgainst: number;
  diff: number;
  crusadePoints: number;
  /** Every result, oldest first. */
  results: FormLetter[];
}

/**
 * The campaign table. Sorted by wins, then fewest losses, then VP
 * difference, then crusade points. "VP against" is the best score any
 * opponent made in the same battle.
 */
export function standings(
  attached: AttachedRoster[],
  battles: InlineBattle[],
): StandingRow[] {
  const counted = countedBattles(battles);
  return attached
    .map((roster) => {
      const row: StandingRow = {
        roster,
        played: 0,
        w: 0,
        d: 0,
        l: 0,
        vpFor: 0,
        vpAgainst: 0,
        diff: 0,
        crusadePoints: rosterCrusadePoints(roster),
        results: [],
      };
      for (const b of counted) {
        const me = b.participants.find((p) => p.googleId === roster.player.googleId);
        const letter = me && LETTER[me.outcome];
        if (!me || !letter) continue;
        row.played++;
        if (letter === "W") row.w++;
        else if (letter === "D") row.d++;
        else row.l++;
        row.results.push(letter);
        row.vpFor += me.victoryPoints;
        row.vpAgainst += Math.max(
          0,
          ...b.participants.filter((p) => p !== me).map((p) => p.victoryPoints),
        );
      }
      row.diff = row.vpFor - row.vpAgainst;
      return row;
    })
    .sort(
      (a, b) =>
        b.w - a.w || a.l - b.l || b.diff - a.diff || b.crusadePoints - a.crusadePoints,
    );
}

/** Results of player `a` in battles that also included player `b`. */
export function headToHead(
  battles: InlineBattle[],
  a: string,
  b: string,
): FormLetter[] {
  const out: FormLetter[] = [];
  for (const battle of countedBattles(battles)) {
    const pa = battle.participants.find((p) => p.googleId === a);
    if (!pa || !battle.participants.some((p) => p.googleId === b)) continue;
    const letter = LETTER[pa.outcome];
    if (letter) out.push(letter);
  }
  return out;
}

const WORD: Record<FormLetter, string> = { W: "won", D: "drew", L: "lost" };

export function sayResults(results: FormLetter[]): string {
  return results.length ? results.map((r) => WORD[r]).join(", ") : "no battles";
}

/** What the signed-in player still has to do on a battle, if anything. */
export function battleTodo(b: InlineBattle, me: string | undefined): string | null {
  const mine = b.participants.find((p) => p.googleId === me);
  if (!mine || b.status === "voided") return null;
  if (b.status === "draft") return b.createdBy === me ? "Enter result" : null;
  if (b.status === "pending") return mine.confirmed ? null : "Confirm result";
  return mine.appliedResults ? null : "Apply results";
}

