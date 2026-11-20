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
 * model count, whether it is a Character, and its wargear names. No
 * rules or profiles are read or kept.
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
}

export interface ImportedRoster {
  /** The list's own name, e.g. "Crusade 1000". */
  name: string;
  factionName: string;
  units: ImportedUnit[];
  points: number;
}

/** A roster node, whichever format it came from. */
interface Node {
  id: string;
  name: string;
  customName: string;
  type: string;
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

function wargear(n: Node, out: Map<string, number>): void {
  for (const c of n.selections) {
    if (c.type === "upgrade" && c.selections.length === 0 && c.name) {
      out.set(c.name, (out.get(c.name) ?? 0) + Math.max(1, c.number));
    }
    wargear(c, out);
  }
}

function toUnit(n: Node): ImportedUnit {
  const gear = new Map<string, number>();
  wargear(n, gear);
  return {
    name: (n.customName || n.name).slice(0, 200),
    ...(n.id ? { sourceId: n.id.slice(0, 200) } : {}),
    ...(n.customName ? { named: true } : {}),
    datasheetName: n.name.slice(0, 200),
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

function fromForces(name: string, forces: { catalogueName: string; selections: Node[] }[]): ImportedRoster {
  const units = forces.flatMap((f) =>
    // Top-level "upgrade" selections are list settings (battle size,
    // detachment), not units.
    f.selections.filter((s) => s.type === "unit" || s.type === "model").map(toUnit),
  );
  if (units.length === 0) {
    throw new Error("That file has no units in it.");
  }
  return {
    name,
    factionName: tidyFaction(forces.find((f) => f.catalogueName)?.catalogueName ?? ""),
    units: units.slice(0, 200),
    points: units.reduce((s, u) => s + u.pointsCost, 0),
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

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

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
