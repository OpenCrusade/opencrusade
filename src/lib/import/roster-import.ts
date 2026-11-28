/**
 * Roster import, army lists exported from New Recruit or BattleScribe.
 *
 * Reads three shapes, all the same BattleScribe roster tree:
 *   .ros   roster XML
 *   .rosz  a zip holding one .ros
 *   .json  New Recruit's JSON export ({ roster: { forces: [...] } })
 * plus this app's own "JSON backup" of a roster.
 *
 * Only what a crusade card needs is taken: each unit's name, points,
 * model count, whether it is a Character, and its wargear names. When
 * the list carries crusade progress (New Recruit's Crusade entries),
 * that is read too: XP, battle tallies, Crusade Points, and the names
 * of battle honours and scars, plus the Order of Battle's supply limit
 * and requisition points. No rules or profiles are read or kept.
 */

export interface ImportedUnit {
  name: string;
  datasheetName: string;
  pointsCost: number;
  modelCount: number;
  isCharacter: boolean;
  equipment: string[];
  /** The unit's id in the list it came from, when the file has one. */
  sourceId?: string;
  /** True when the list gave the unit its own name. */
  named?: boolean;
  /** Crusade progress, when the list records any for this unit. */
  crusade?: ImportedProgress;
}

export interface ImportedHonour {
  name: string;
  type: "battle-trait" | "weapon-modification" | "crusade-relic";
  relicTier?: "artificer" | "antiquity" | "legendary";
  /** Crusade Points the list gives a relic (0 to 3). */
  relicCrusadePoints?: number;
}

export interface ImportedProgress {
  experiencePoints: number;
  crusadePoints: number;
  battlesPlayed: number;
  battlesSurvived: number;
  enemiesDestroyed: number;
  honours: ImportedHonour[];
  scars: string[];
}

/** The list's Order of Battle, when it has one. */
export interface ImportedOrderOfBattle {
  supplyLimit?: number;
  requisitionPoints?: number;
}

export interface ImportedRoster {
  /** The list's own name, e.g. "Crusade 1000". */
  name: string;
  factionName: string;
  units: ImportedUnit[];
  points: number;
  orderOfBattle?: ImportedOrderOfBattle;
}

/** A roster node, whichever format it came from. */
interface Node {
  id: string;
  name: string;
  customName: string;
  type: string;
  /** The entry group it was picked from, e.g. "Crusade::Battle Tallies". */
  group: string;
  number: number;
  costs: { name: string; value: number }[];
  categories: string[];
  selections: Node[];
}

// ── JSON → Node ───────────────────────────────────────────────────

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] =>
  Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Json[]) : [];
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function nodeFromJson(j: Json): Node {
  return {
    id: str(j.id),
    name: str(j.name),
    customName: str(j.customName),
    type: str(j.type),
    group: str(j.group),
    number: num(j.number, 1),
    costs: arr(j.costs).map((c) => ({ name: str(c.name), value: num(c.value) })),
    categories: arr(j.categories).map((c) => str(c.name)),
    selections: arr(j.selections).map(nodeFromJson),
  };
}

// ── XML → Node ────────────────────────────────────────────────────

/** Direct children of `el` called `wrapper`, then their `item` children. */
function childList(el: Element, wrapper: string, item: string): Element[] {
  const out: Element[] = [];
  for (const w of Array.from(el.children)) {
    if (w.localName !== wrapper) continue;
    for (const c of Array.from(w.children)) if (c.localName === item) out.push(c);
  }
  return out;
}

function nodeFromXml(el: Element): Node {
  return {
    id: el.getAttribute("id") ?? "",
    name: el.getAttribute("name") ?? "",
    customName: el.getAttribute("customName") ?? "",
    type: el.getAttribute("type") ?? "",
    group: el.getAttribute("group") ?? "",
    number: num(el.getAttribute("number"), 1),
    costs: childList(el, "costs", "cost").map((c) => ({
      name: c.getAttribute("name") ?? "",
      value: num(c.getAttribute("value")),
    })),
    categories: childList(el, "categories", "category").map((c) => c.getAttribute("name") ?? ""),
    selections: childList(el, "selections", "selection").map(nodeFromXml),
  };
}

// ── Node → units ──────────────────────────────────────────────────

const isPts = (name: string) => /^\s*(pts|points)\s*$/i.test(name);

function points(n: Node): number {
  const own = n.costs.filter((c) => isPts(c.name)).reduce((s, c) => s + c.value, 0);
  return own + n.selections.reduce((s, c) => s + points(c), 0);
}

function models(n: Node): number {
  const own = n.type === "model" ? n.number : 0;
  return own + n.selections.reduce((s, c) => s + models(c), 0);
}

/** A Crusade entry (XP, tallies, honours, scars), not wargear. */
const isCrusadeEntry = (n: Node) => /^crusade(::|$)/i.test(n.group.trim());

function wargear(n: Node, out: Map<string, number>): void {
  for (const c of n.selections) {
    if (isCrusadeEntry(c)) continue;
    if (c.type === "upgrade" && c.selections.length === 0 && c.name) {
      out.set(c.name, (out.get(c.name) ?? 0) + Math.max(1, c.number));
    }
    wargear(c, out);
  }
}

/** A cost on a node by name, e.g. "Crusade Points". */
function cost(n: Node, name: RegExp): number {
  return n.costs.filter((c) => name.test(c.name.trim())).reduce((s, c) => s + c.value, 0);
}

/** Every Crusade entry under a unit (they sit on the unit, or on its models). */
function crusadeEntries(n: Node, out: Node[] = []): Node[] {
  for (const c of n.selections) {
    if (isCrusadeEntry(c)) out.push(c);
    else crusadeEntries(c, out);
  }
  return out;
}

const count = (n: Node) => Math.max(0, Math.round(n.number));

function progress(n: Node): ImportedProgress | undefined {
  const entries = crusadeEntries(n);
  if (entries.length === 0) return undefined;
  const p: ImportedProgress = {
    experiencePoints: 0,
    crusadePoints: 0,
    battlesPlayed: 0,
    battlesSurvived: 0,
    enemiesDestroyed: 0,
    honours: [],
    scars: [],
  };
  for (const e of entries) {
    const path = e.group.toLowerCase();
    const name = e.name.trim();
    p.crusadePoints += cost(e, /^crusade points$/i);
    if (/^experience points$/i.test(name)) {
      const xp = cost(e, /experience/i);
      p.experiencePoints += xp > 0 ? xp : count(e);
    } else if (/^battles played$/i.test(name)) p.battlesPlayed += count(e);
    else if (/^battles survived$/i.test(name)) p.battlesSurvived += count(e);
    else if (/^enemy units destroyed$/i.test(name)) p.enemiesDestroyed += count(e);
    else if (path.includes("battle scars")) p.scars.push(name.slice(0, 200));
    else if (path.includes("battle honours")) {
      if (path.includes("relic")) {
        const tier = /artificer|antiquity|legendary/.exec(path)?.[0] as ImportedHonour["relicTier"];
        const cp = Math.min(3, Math.max(0, Math.round(cost(e, /^crusade points$/i))));
        p.honours.push({
          name: name.slice(0, 200),
          type: "crusade-relic",
          ...(tier ? { relicTier: tier } : {}),
          relicCrusadePoints: cp,
        });
      } else if (path.includes("weapon")) {
        p.honours.push({ name: name.slice(0, 200), type: "weapon-modification" });
      } else {
        p.honours.push({ name: name.slice(0, 200), type: "battle-trait" });
      }
    }
  }
  p.crusadePoints = Math.max(0, Math.round(p.crusadePoints));
  p.experiencePoints = Math.round(p.experiencePoints);
  p.honours = p.honours.slice(0, 6);
  p.scars = p.scars.slice(0, 20);
  return p;
}

/**
 * New Recruit adds the unit's rank to its name, e.g. "First Squad
 * (Battle-ready)". The rank lives on the crusade card, not the name.
 */
const RANK_SUFFIX = /\s*\((battle-ready|blooded|battle-hardened|heroic|legendary)\)\s*$/i;
export const withoutRank = (name: string) => name.replace(RANK_SUFFIX, "");

function toUnit(n: Node): ImportedUnit {
  const gear = new Map<string, number>();
  wargear(n, gear);
  const crusade = progress(n);
  const datasheet = withoutRank(n.name);
  return {
    name: (n.customName || datasheet).slice(0, 200),
    ...(n.id ? { sourceId: n.id.slice(0, 200) } : {}),
    ...(n.customName ? { named: true } : {}),
    ...(crusade ? { crusade } : {}),
    datasheetName: datasheet.slice(0, 200),
    pointsCost: Math.max(0, Math.round(points(n))),
    modelCount: Math.max(1, models(n)),
    isCharacter: n.categories.some((c) => /^(character|epic hero)$/i.test(c.trim())),
    equipment: [...gear]
      .map(([name, count]) => (count > 1 ? `${count}x ${name}` : name).slice(0, 500))
      .slice(0, 50),
  };
}

/** "Group - Faction" → "Faction". */
function tidyFaction(catalogueName: string): string {
  const parts = catalogueName.split(" - ");
  return (parts[parts.length - 1] ?? catalogueName).trim();
}

/** Supply limit and requisition points from the Order of Battle entry. */
function orderOfBattle(forces: { selections: Node[] }[]): ImportedOrderOfBattle | undefined {
  const ob = forces
    .flatMap((f) => f.selections)
    .find((s) => /^order of battle$/i.test(s.name.trim()) || s.categories.some((c) => /^order of battle$/i.test(c.trim())));
  if (!ob) return undefined;
  const out: ImportedOrderOfBattle = {};
  for (const s of ob.selections) {
    if (/^supply limit$/i.test(s.name.trim())) out.supplyLimit = count(s);
    else if (/^requisition points$/i.test(s.name.trim())) out.requisitionPoints = Math.round(s.number);
  }
  return Object.keys(out).length ? out : undefined;
}

function fromForces(name: string, forces: { catalogueName: string; selections: Node[] }[]): ImportedRoster {
  const units = forces.flatMap((f) =>
    // Top-level "upgrade" selections are list settings (battle size,
    // detachment), not units.
    f.selections.filter((s) => s.type === "unit" || s.type === "model").map(toUnit),
  );
  if (units.length === 0) {
    throw new Error("That file has no units in it.");
  }
  const ob = orderOfBattle(forces);
  return {
    name,
    factionName: tidyFaction(forces.find((f) => f.catalogueName)?.catalogueName ?? ""),
    units: units.slice(0, 200),
    points: units.reduce((s, u) => s + u.pointsCost, 0),
    ...(ob ? { orderOfBattle: ob } : {}),
  };
}

export function parseRosterXml(text: string): ImportedRoster {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "roster" || doc.getElementsByTagName("parsererror").length) {
    throw new Error("That isn't a roster file. Export the list as .ros, .rosz or JSON.");
  }
  return fromForces(
    root.getAttribute("name") ?? "",
    childList(root, "forces", "force").map((f) => ({
      catalogueName: f.getAttribute("catalogueName") ?? "",
      selections: childList(f, "selections", "selection").map(nodeFromXml),
    })),
  );
}

export function parseRosterJson(text: string): ImportedRoster {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That JSON file couldn't be read.");
  }
  const top = (data && typeof data === "object" ? data : {}) as Json;

  // This app's own JSON backup: keep names, points and wargear; crusade
  // progress is not carried over by an import.
  if (Array.isArray(top.units) && typeof top.factionName === "string") {
    const units = arr(top.units).map(
      (u): ImportedUnit => ({
        name: str(u.name).slice(0, 200),
        ...(str(u.id) ? { sourceId: str(u.id) } : {}),
        named: true,
        datasheetName: str(u.datasheetName).slice(0, 200),
        pointsCost: Math.max(0, Math.round(num(u.pointsCost))),
        modelCount: Math.max(1, Math.round(num(u.modelCount, 1))),
        isCharacter: u.isCharacter === true,
        equipment: Array.isArray(u.equipment)
          ? u.equipment.filter((e): e is string => typeof e === "string").slice(0, 50)
          : [],
      }),
    );
    if (units.length === 0) throw new Error("That file has no units in it.");
    return {
      name: top.factionName,
      factionName: top.factionName,
      units,
      points: units.reduce((s, u) => s + u.pointsCost, 0),
    };
  }

  const roster = (top.roster && typeof top.roster === "object" ? top.roster : top) as Json;
  const forces = arr(roster.forces);
  if (forces.length === 0) {
    throw new Error("That isn't a roster file. Export the list as .ros, .rosz or JSON.");
  }
  return fromForces(
    str(roster.name),
    forces.map((f) => ({
      catalogueName: str(f.catalogueName),
      selections: arr(f.selections).map(nodeFromJson),
    })),
  );
}

// ── .rosz (zip with one file) ─────────────────────────────────────

async function unzipFirst(buf: ArrayBuffer): Promise<string> {
  const view = new DataView(buf);
  // End-of-central-directory record: search backwards for its signature.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("That .rosz file is damaged.");
  const central = view.getUint32(eocd + 16, true);
  if (view.getUint32(central, true) !== 0x02014b50) throw new Error("That .rosz file is damaged.");
  const method = view.getUint16(central + 10, true);
  const compressedSize = view.getUint32(central + 20, true);
  const local = view.getUint32(central + 42, true);
  const start =
    local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const data = new Uint8Array(buf, start, compressedSize);
  if (method === 0) return new TextDecoder().decode(data);
  if (method !== 8) throw new Error("That .rosz file uses a compression this app can't read.");
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).text();
}

/** Read an exported list, whatever its format. */
export async function parseRosterFile(file: File): Promise<ImportedRoster> {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const text = isZip ? await unzipFirst(await file.arrayBuffer()) : await file.text();
  return text.trimStart().startsWith("{") ? parseRosterJson(text) : parseRosterXml(text);
}

// ── Re-importing onto a force that already has units ──────────────

/** The fields a unit card needs to be matched against a list. */
export interface ExistingUnit {
  id: string;
  name: string;
  datasheetName: string;
  pointsCost: number;
  modelCount: number;
  importId?: string;
}

export interface ImportPlan<T extends ExistingUnit = ExistingUnit> {
  /** Units in the list paired with a unit already on the force. */
  updates: { existing: T; incoming: ImportedUnit; how: "id" | "name" | "datasheet" }[];
  /** Units in the list with no counterpart: added as new. */
  additions: ImportedUnit[];
  /** Units on the force that the list doesn't mention: left alone. */
  untouched: T[];
}

const same = (a: string, b: string) =>
  withoutRank(a).trim().toLowerCase() === withoutRank(b).trim().toLowerCase();

/**
 * Pair a list's units with the force's existing units, so a re-import
 * can update points and wargear without losing crusade progress.
 *
 * Matching, strongest first, each existing unit used once:
 *   1. the list's own unit id, remembered from an earlier import (or
 *      this app's id, when the list is one this app exported);
 *   2. same name and same datasheet;
 *   3. same datasheet, but only where exactly one unit of that
 *      datasheet is left on each side.
 * Several unnamed units of the same datasheet are never guessed at:
 * whatever can't be told apart is added as new.
 */
export function planImport<T extends ExistingUnit>(
  existing: T[],
  incoming: ImportedUnit[],
): ImportPlan<T> {
  const free = new Set(existing);
  const paired = new Map<ImportedUnit, { existing: T; how: "id" | "name" | "datasheet" }>();
  const take = (u: ImportedUnit, e: T | undefined, how: "id" | "name" | "datasheet") => {
    if (!e) return;
    free.delete(e);
    paired.set(u, { existing: e, how });
  };

  for (const u of incoming) {
    if (!u.sourceId) continue;
    take(u, [...free].find((e) => e.importId === u.sourceId || e.id === u.sourceId), "id");
  }
  for (const u of incoming) {
    if (paired.has(u)) continue;
    take(
      u,
      [...free].find((e) => same(e.name, u.name) && same(e.datasheetName, u.datasheetName)),
      "name",
    );
  }
  for (const u of incoming) {
    if (paired.has(u)) continue;
    const mine = [...free].filter((e) => same(e.datasheetName, u.datasheetName));
    const theirs = incoming.filter((x) => !paired.has(x) && same(x.datasheetName, u.datasheetName));
    if (mine.length === 1 && theirs.length === 1) take(u, mine[0], "datasheet");
  }

  return {
    updates: incoming.filter((u) => paired.has(u)).map((u) => ({ incoming: u, ...paired.get(u)! })),
    additions: incoming.filter((u) => !paired.has(u)),
    untouched: [...free],
  };
}
