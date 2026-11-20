/**
 * The presentation layer of a crusade spreadsheet: the pages a person
 * sees when they open it in Google Sheets.
 *
 *   - "Crusade" (tab 1): a front page, title, headline numbers,
 *     standings with links to each force, campaign tracker, battle log.
 *   - one roster page per player: force summary, recent battles and
 *     the Order of Battle.
 *
 * These pages hold formulas over the (hidden) data tabs, so they stay
 * current without anyone running the app. The app never reads them.
 * They are locked to the GM and rebuilt wholesale by the GM's app
 * (delete tab → recreate), which keeps the builder idempotent.
 *
 * Pure: this module only produces batchUpdate requests.
 */

import { packLabel } from "@/lib/utils/stats";
import { a1 } from "@/lib/google/sheets";
import type { Crusade, CrusadePlayer } from "@/types";
import { OVERVIEW_TAB_ID } from "./sheet-codec";

// ─── Palette (the app's light theme, from src/index.css) ───────────
// Grey page, white surfaces, one near-black for plates and strong
// text. Keep these in step with the tokens there.

const hex = (h: string) => ({
  red: parseInt(h.slice(1, 3), 16) / 255,
  green: parseInt(h.slice(3, 5), 16) / 255,
  blue: parseInt(h.slice(5, 7), 16) / 255,
});

const C = {
  page: hex("#f3f4f6"), // --color-paper
  panel: hex("#ffffff"), // --color-surface
  zebra: hex("#ffffff"), // striped rows: surface on the grey page
  plate: hex("#11161d"), // --color-plate
  plate2: hex("#2a313b"), // --color-plate-2
  plateInk: hex("#ffffff"), // --color-plate-ink
  ink: hex("#11161d"), // --color-ink
  ink2: hex("#3a4350"), // --color-ink-2
  mute: hex("#5b6472"), // --color-mute
  rule: hex("#d5d9df"), // --color-rule-strong
  signal: hex("#b97a00"), // --color-signal
  good: hex("#1e7a4c"), // --color-good
  bad: hex("#b3261e"), // --color-bad
  link: hex("#16324f"), // --color-team
};

// Inter is in Google Sheets' own font list. The site's headings use
// Inter Tight, which is not, so headings here are Inter in bold.
const DISPLAY = "Inter";
const BODY = "Inter";

type Color = ReturnType<typeof hex>;

interface Fmt {
  bg?: Color;
  fg?: Color;
  bold?: boolean;
  italic?: boolean;
  size?: number;
  font?: string;
  align?: "LEFT" | "CENTER" | "RIGHT";
  valign?: "TOP" | "MIDDLE" | "BOTTOM";
  wrap?: boolean;
  /** Thick accent rule under the cell. */
  rule?: Color;
  pattern?: string;
}

function cellFormat(f: Fmt) {
  return {
    ...(f.bg ? { backgroundColor: f.bg } : {}),
    horizontalAlignment: f.align ?? "LEFT",
    verticalAlignment: f.valign ?? "MIDDLE",
    wrapStrategy: f.wrap ? "WRAP" : "OVERFLOW_CELL",
    textFormat: {
      fontFamily: f.font ?? BODY,
      fontSize: f.size ?? 11,
      bold: f.bold ?? false,
      italic: f.italic ?? false,
      underline: false,
      foregroundColor: f.fg ?? C.ink,
    },
    ...(f.rule
      ? { borders: { bottom: { style: "SOLID_MEDIUM", color: f.rule } } }
      : {}),
    ...(f.pattern ? { numberFormat: { type: "NUMBER", pattern: f.pattern } } : {}),
  };
}

type Value = string | number;

/** A page under construction: sparse cells + merges + sizes. */
class Page {
  private cells = new Map<number, Map<number, { v?: Value; f: Fmt }>>();
  private merges: [number, number, number, number][] = [];
  private heights = new Map<number, number>();
  private extra: Record<string, unknown>[] = [];
  readonly sheetId: number;
  private widths: number[];

  constructor(sheetId: number, widths: number[]) {
    this.sheetId = sheetId;
    this.widths = widths;
  }

  set(r: number, c: number, v: Value | undefined, f: Fmt = {}): this {
    let row = this.cells.get(r);
    if (!row) this.cells.set(r, (row = new Map()));
    row.set(c, { v, f });
    return this;
  }

  /** One value across columns c1..c2 (inclusive), merged. */
  span(r: number, c1: number, c2: number, v: Value | undefined, f: Fmt = {}): this {
    for (let c = c1; c <= c2; c++) this.set(r, c, c === c1 ? v : undefined, f);
    if (c2 > c1) this.merges.push([r, c1, r + 1, c2 + 1]);
    return this;
  }

  height(r: number, px: number): this {
    this.heights.set(r, px);
    return this;
  }

  /** Format a block without setting values (for formula spill areas). */
  block(r1: number, r2: number, c1: number, c2: number, f: Fmt): this {
    this.extra.push({
      repeatCell: {
        range: this.range(r1, r2, c1, c2),
        cell: { userEnteredFormat: cellFormat({ bg: C.page, ...f }) },
        fields: "userEnteredFormat",
      },
    });
    return this;
  }

  /** Conditional format: `formula` is evaluated for the block's top-left cell. */
  when(r1: number, r2: number, c1: number, c2: number, formula: string, f: Fmt): this {
    this.extra.push({
      addConditionalFormatRule: {
        index: 0,
        rule: {
          ranges: [this.range(r1, r2, c1, c2)],
          booleanRule: {
            condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: formula }] },
            format: {
              ...(f.bg ? { backgroundColor: f.bg } : {}),
              ...(f.fg || f.bold !== undefined
                ? {
                    textFormat: {
                      ...(f.fg ? { foregroundColor: f.fg } : {}),
                      ...(f.bold !== undefined ? { bold: f.bold } : {}),
                    },
                  }
                : {}),
            },
          },
        },
      },
    });
    return this;
  }

  private range(r1: number, r2: number, c1: number, c2: number) {
    return {
      sheetId: this.sheetId,
      startRowIndex: r1,
      endRowIndex: r2 + 1,
      startColumnIndex: c1,
      endColumnIndex: c2 + 1,
    };
  }

  /**
   * Requests that (re)create the tab and draw the page. `exists` says
   * whether a tab with this id is already in the spreadsheet.
   */
  build(opts: {
    title: string;
    index: number;
    exists: boolean;
    rows: number;
    gmEmail: string;
    tabColor: Color;
  }): Record<string, unknown>[] {
    const { sheetId } = this;
    const cols = this.widths.length;
    const reqs: Record<string, unknown>[] = [];
    if (opts.exists) reqs.push({ deleteSheet: { sheetId } });
    reqs.push({
      addSheet: {
        properties: {
          sheetId,
          title: opts.title,
          index: opts.index,
          tabColor: opts.tabColor,
          gridProperties: {
            rowCount: opts.rows,
            columnCount: cols,
            hideGridlines: true,
          },
        },
      },
    });
    reqs.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId },
          description: `${opts.title}: view page (GM only)`,
          warningOnly: false,
          editors: { users: [opts.gmEmail] },
        },
      },
    });
    // Page background + default type everywhere.
    reqs.push({
      repeatCell: {
        range: { sheetId },
        cell: { userEnteredFormat: cellFormat({ bg: C.page }) },
        fields: "userEnteredFormat",
      },
    });
    this.widths.forEach((px, i) =>
      reqs.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
          properties: { pixelSize: px },
          fields: "pixelSize",
        },
      }),
    );
    for (const [r, px] of this.heights) {
      reqs.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "ROWS", startIndex: r, endIndex: r + 1 },
          properties: { pixelSize: px },
          fields: "pixelSize",
        },
      });
    }
    for (const [r, row] of this.cells) {
      const cs = [...row.keys()].sort((a, b) => a - b);
      const first = cs[0];
      const last = cs[cs.length - 1];
      const values = [];
      for (let c = first; c <= last; c++) {
        const cell = row.get(c);
        if (!cell) {
          values.push({});
          continue;
        }
        const v = cell.v;
        values.push({
          userEnteredFormat: { ...cellFormat({ bg: C.page, ...cell.f }) },
          ...(v === undefined || v === ""
            ? {}
            : typeof v === "number"
              ? { userEnteredValue: { numberValue: v } }
              : v.startsWith("=")
                ? { userEnteredValue: { formulaValue: v } }
                : { userEnteredValue: { stringValue: v } }),
        });
      }
      reqs.push({
        updateCells: {
          range: this.range(r, r, first, last),
          rows: [{ values }],
          fields: "userEnteredValue,userEnteredFormat",
        },
      });
    }
    // After the cells, so a spill area's styling also covers the cell
    // that holds its formula.
    reqs.push(...this.extra);
    for (const [r1, c1, r2, c2] of this.merges) {
      reqs.push({
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: r1,
            endRowIndex: r2,
            startColumnIndex: c1,
            endColumnIndex: c2,
          },
          mergeType: "MERGE_ALL",
        },
      });
    }
    return reqs;
  }
}

// ─── Shared building blocks ────────────────────────────────────────

const q = (s: string) => s.replace(/"/g, '""');

/**
 * A cell whose text starts with "=" is written as a formula. Names and
 * notes typed by players, or brought in with a tracker set, must never
 * become one (a formula can fetch web addresses and so send sheet
 * contents elsewhere). Give any such text an invisible leading
 * character so the sheet shows it as plain text.
 */
function inert<T>(value: T): T {
  if (typeof value === "string") {
    return (/^\s*=/.test(value) ? `\u200B${value}` : value) as T;
  }
  if (Array.isArray(value)) return value.map(inert) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, inert(v)]),
    ) as T;
  }
  return value;
}
const link = (gid: number, label: string) =>
  `=HYPERLINK("#gid=${gid}","${q(label)}")`;

function titleBand(p: Page, c1: number, c2: number, title: Value, subtitle: Value) {
  p.height(0, 14);
  p.span(1, c1, c2, title, {
    bg: C.plate, fg: C.plateInk, font: DISPLAY, size: 26, bold: true, align: "CENTER",
  }).height(1, 66);
  p.span(2, c1, c2, subtitle, {
    bg: C.plate2, fg: C.plateInk, size: 12, italic: true, align: "CENTER",
  }).height(2, 30);
}

function section(p: Page, r: number, c1: number, c2: number, label: string) {
  p.span(r, c1, c2, label, {
    font: DISPLAY, size: 13, bold: true, fg: C.ink, rule: C.rule, valign: "BOTTOM",
  }).height(r, 34);
}

function tableHeader(
  p: Page,
  r: number,
  c1: number,
  labels: string[],
  numericFrom: number,
) {
  labels.forEach((label, i) =>
    p.set(r, c1 + i, label, {
      bg: C.plate2, fg: C.plateInk, font: DISPLAY, size: 9, bold: true,
      align: i >= numericFrom ? "CENTER" : "LEFT",
    }),
  );
  p.height(r, 26);
}

function statBox(p: Page, r: number, c1: number, c2: number, label: string, value: Value) {
  p.span(r, c1, c2, label, {
    bg: C.panel, fg: C.mute, font: DISPLAY, size: 8, bold: true, align: "CENTER", valign: "BOTTOM",
  });
  p.span(r + 1, c1, c2, value, {
    bg: C.panel, fg: C.ink, font: DISPLAY, size: 22, bold: true, align: "CENTER", rule: C.rule,
  });
  p.height(r, 24).height(r + 1, 46);
}


// ─── Front page ────────────────────────────────────────────────────

export interface ViewContext {
  crusade: Crusade;
  /** Link that opens this crusade in the web app, if known. */
  appUrl?: string;
  /** Tab id → current title. */
  titles: Map<number, string>;
  gmEmail: string;
  /** Ids of tabs that already exist in the spreadsheet. */
  existing: Set<number>;
}

/** Id of a player's roster page, derived from their data tab id. */
export const viewTabId = (dataTabId: number) => dataTabId + 1;

function activePlayers(ctx: ViewContext): (CrusadePlayer & { tabId: number })[] {
  return ctx.crusade.players.filter(
    (p): p is CrusadePlayer & { tabId: number } =>
      p.status !== "Removed" && p.tabId !== undefined && ctx.titles.has(p.tabId),
  );
}

export const FRONT_TITLE = "Crusade";

export function frontPageRequests(raw: ViewContext): Record<string, unknown>[] {
  const ctx = { ...raw, crusade: inert(raw.crusade) };
  const { crusade, titles } = ctx;
  const players = activePlayers(ctx);
  // A margin | B..L content | M margin
  const p = new Page(OVERVIEW_TAB_ID, [24, 250, 200, 130, 70, 90, 80, 100, 80, 56, 56, 56, 24]);
  const L = 1;
  const R = 11;

  const started = new Date(crusade.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
  titleBand(
    p, L, R, crusade.name,
    `${packLabel(crusade.packId) ? `${packLabel(crusade.packId)}  ·  ` : ""}Supply limit ${crusade.supplyLimit} pts  ·  Begun ${started}  ·  GM ${crusade.createdBy.displayName}`,
  );
  p.span(
    3, L, R,
    ctx.appUrl
      ? `=HYPERLINK("${q(ctx.appUrl)}","Open this crusade in OpenCrusade  →")`
      : "A live view of the campaign. Make changes in the OpenCrusade app.",
    ctx.appUrl
      ? { fg: C.link, bold: true, size: 11, align: "CENTER" }
      : { fg: C.mute, italic: true, size: 10, align: "CENTER" },
  ).height(3, 30);

  // Whole-column references only: new data rows are INSERTED, which
  // would shift a range that starts at row 2 ("A2:A" becomes "A6:A").
  const col = (tabId: number, c: string) => a1(titles.get(tabId)!, `${c}:${c}`);
  const sumAll = (f: (tabId: number) => string) =>
    players.length ? "=" + players.map((pl) => f(pl.tabId)).join("+") : 0;
  statBox(p, 5, 1, 1, "PLAYERS", players.length);
  statBox(p, 5, 2, 3, "UNITS ENLISTED", sumAll((t) => `COUNTIF(${col(t, "A")},"unit")`));
  statBox(p, 5, 4, 7, "BATTLES FOUGHT", sumAll((t) => `COUNTIF(${col(t, "A")},"battle")`));
  statBox(p, 5, 8, 11, "EXPERIENCE EARNED", sumAll((t) => `SUMIF(${col(t, "A")},"unit",${col(t, "F")})`));

  let r = 8;
  section(p, r, L, R, "STANDINGS");
  r++;
  tableHeader(p, r, L, ["FORCE", "COMMANDER", "TEAM", "UNITS", "SUPPLY", "XP", "CRUSADE PTS", "BATTLES", "W", "D", "L"], 3);
  r++;
  const groupName = new Map((crusade.groups ?? []).map((g) => [g.id, g.name]));
  const firstRow = r;
  for (const pl of players) {
    const kind = col(pl.tabId, "A");
    const roster = (c: string, fallback: string) =>
      `IFERROR(INDEX(FILTER(${col(pl.tabId, c)},${kind}="roster"),1),${fallback})`;
    const sum = (c: string) => `=SUMIF(${kind},"unit",${col(pl.tabId, c)})`;
    const outcome = (o: string) => `=COUNTIFS(${kind},"result",${col(pl.tabId, "D")},"${o}")`;
    const num: Fmt = { align: "CENTER" };
    p.set(r, 1, `=HYPERLINK("#gid=${viewTabId(pl.tabId)}",${roster("C", `"${q(pl.user.displayName)} (no roster yet)"`)})`, {
      fg: C.link, bold: true, size: 12,
    });
    p.set(r, 2, pl.user.displayName + (pl.role === "gm" ? "  (GM)" : ""), { fg: C.mute });
    p.set(r, 3, pl.groupId ? (groupName.get(pl.groupId) ?? "") : "", { fg: C.mute });
    p.set(r, 4, `=COUNTIF(${kind},"unit")`, num);
    p.set(r, 5, sum("E"), num);
    p.set(r, 6, sum("F"), { ...num, bold: true, fg: C.ink });
    p.set(r, 7, sum("H"), num);
    p.set(r, 8, `=COUNTIF(${kind},"result")`, num);
    p.set(r, 9, outcome("victory"), { ...num, fg: C.good, bold: true });
    p.set(r, 10, outcome("draw"), num);
    p.set(r, 11, outcome("defeat"), { ...num, fg: C.bad });
    p.height(r, 28);
    r++;
  }
  if (players.length === 0) {
    p.span(r, L, R, "No players yet.", { fg: C.mute, italic: true });
    r++;
  } else {
    p.when(firstRow, r - 1, L, R, `=ISEVEN(ROW())`, { bg: C.zebra });
  }

  const tracker = [
    ...crusade.packState.items.map((i) => ({
      name: i.name,
      value:
        typeof i.value === "boolean"
          ? i.value
            ? "Yes"
            : "No"
          : Array.isArray(i.value)
            ? i.value.map((e) => e.name).join(", ") || "None"
            : typeof i.value === "object"
              ? "stages" in i.value
                ? (i.value.stages[i.value.current] ?? "Not set")
                : i.value.options.filter((o) => o.on).map((o) => o.name).join(", ") || "None"
              : i.value,
    })),
    ...crusade.packState.counters.map((c) => ({ name: c.name, value: c.value })),
  ];
  if (tracker.length || crusade.packState.note.trim()) {
    r++;
    section(p, r, L, R, "CAMPAIGN TRACKER");
    r++;
    for (const t of tracker) {
      p.span(r, 1, 2, t.name, { bg: C.panel });
      p.span(r, 3, R, t.value, { bg: C.panel, bold: true, fg: C.ink });
      p.height(r, 26);
      r++;
    }
    if (crusade.packState.note.trim()) {
      const note = crusade.packState.note.trim();
      p.span(r, L, R, note, { wrap: true, valign: "TOP", italic: true });
      p.height(r, Math.min(400, 24 + 18 * Math.ceil(note.length / 110)));
      r++;
    }
  }

  r++;
  section(p, r, L, R, "BATTLE LOG");
  r++;
  tableHeader(p, r, L, ["BATTLE", "DATE", "POINTS", "FOUGHT BY"], 99);
  for (let c = 5; c <= R; c++) p.set(r, c, undefined, { bg: C.plate2 });
  r++;
  const stacked = players.map((pl) => a1(titles.get(pl.tabId)!, "A:K")).join(";");
  p.set(
    r, 1,
    stacked
      ? `=IFERROR(QUERY({${stacked}},"select Col3, Col4, Col5, Col11 where Col1 = 'battle' order by Col4 desc",0),"No battles fought yet")`
      : "No battles fought yet",
  );
  const logRows = 200;
  p.block(r, r + logRows, 1, 1, { bold: true });
  p.block(r, r + logRows, 2, 2, { fg: C.mute });
  p.block(r, r + logRows, 3, 3, { align: "LEFT", fg: C.mute });
  p.when(r, r + logRows, L, R, `=AND($B${r + 1}<>"",ISEVEN(ROW()))`, { bg: C.zebra });

  return p.build({
    title: FRONT_TITLE,
    index: 0,
    exists: ctx.existing.has(OVERVIEW_TAB_ID),
    rows: r + logRows + 2,
    gmEmail: ctx.gmEmail,
    tabColor: C.plate,
  });
}

// ─── Roster page (one per player) ──────────────────────────────────

export function rosterPageRequests(
  raw: ViewContext,
  rawPlayer: CrusadePlayer & { tabId: number },
  rawTitle: string,
  index: number,
): Record<string, unknown>[] {
  const ctx = { ...raw, crusade: inert(raw.crusade) };
  const player = inert(rawPlayer);
  const title = inert(rawTitle);
  const id = viewTabId(player.tabId);
  const data = ctx.titles.get(player.tabId)!;
  // A margin | B..J content | K margin
  const p = new Page(id, [24, 250, 200, 80, 70, 140, 100, 80, 70, 480, 24]);
  const L = 1;
  const R = 9;
  // Whole-column references only, see frontPageRequests.
  const col = (c: string) => a1(data, `${c}:${c}`);
  const kind = col("A");
  const roster = (c: string, fallback: string) =>
    `IFERROR(INDEX(FILTER(${col(c)},${kind}="roster"),1),${fallback})`;

  titleBand(
    p, L, R,
    `=${roster("C", '"No roster attached yet"')}`,
    `="${q(player.user.displayName)}"&IFERROR("  ·  "&INDEX(FILTER(${col("D")},${kind}="roster"),1),"")`,
  );
  p.set(3, 1, link(OVERVIEW_TAB_ID, "←  Back to the crusade"), { fg: C.link, bold: true, size: 10 });
  p.span(
    3, 2, R,
    ctx.appUrl
      ? `=HYPERLINK("${q(ctx.appUrl)}","Open in OpenCrusade  →")`
      : "Live view of this force. Make changes in the OpenCrusade app.",
    ctx.appUrl
      ? { fg: C.link, bold: true, size: 10, align: "RIGHT" }
      : { fg: C.mute, italic: true, size: 10, align: "RIGHT" },
  ).height(3, 26);

  // Roster row columns: E supply used · F requisition · H crusade pts · J supply limit
  statBox(p, 5, 1, 1, "BATTLES", `=COUNTIF(${kind},"result")`);
  statBox(p, 5, 2, 2, "VICTORIES", `=COUNTIFS(${kind},"result",${col("D")},"victory")`);
  statBox(p, 5, 3, 5, "SUPPLY USED / LIMIT", `=${roster("E", "0")}&" / "&${roster("J", "0")}`);
  statBox(p, 5, 6, 7, "REQUISITION", `=${roster("F", "0")}`);
  statBox(p, 5, 8, 8, "UNITS", `=COUNTIF(${kind},"unit")`);
  statBox(p, 5, 9, 9, "TOTAL EXPERIENCE", `=SUMIF(${kind},"unit",${col("F")})`);

  let r = 8;
  section(p, r, L, R, "LAST SIX BATTLES");
  r++;
  tableHeader(p, r, L, ["BATTLE", "RESULT", "VP", "RECORD"], 99);
  for (let c = 5; c <= R; c++) p.set(r, c, undefined, { bg: C.plate2 });
  r++;
  const battleRows = 6;
  p.set(
    r, 1,
    `=IFERROR(QUERY(${a1(data, "A:L")},"select C, D, E, K where A = 'result' order by L desc limit ${battleRows}",0),"No battles fought yet")`,
  );
  p.block(r, r + battleRows - 1, 1, 1, { bold: true });
  p.block(r, r + battleRows - 1, 2, 2, { bold: true, fg: C.mute });
  p.block(r, r + battleRows - 1, 4, 4, { fg: C.mute });
  p.when(r, r + battleRows - 1, 2, 2, `=$C${r + 1}="victory"`, { fg: C.good });
  p.when(r, r + battleRows - 1, 2, 2, `=$C${r + 1}="defeat"`, { fg: C.bad });
  p.when(r, r + battleRows - 1, L, R, `=AND($B${r + 1}<>"",ISEVEN(ROW()))`, { bg: C.zebra });
  r += battleRows + 1;

  section(p, r, L, R, "ORDER OF BATTLE");
  r++;
  tableHeader(p, r, L, ["UNIT", "DATASHEET", "POINTS", "XP", "RANK", "CRUSADE PTS", "BATTLES", "KILLS", "HONOURS, SCARS & NOTES"], 2);
  p.set(r, 9, "HONOURS, SCARS & NOTES", { bg: C.plate2, fg: C.plateInk, font: DISPLAY, size: 9, bold: true });
  r++;
  const unitRows = 200;
  p.set(
    r, 1,
    `=IFERROR(QUERY(${a1(data, "A:K")},"select C, D, E, F, G, H, I, J, K where A = 'unit'",0),"No units enlisted yet")`,
  );
  p.block(r, r + unitRows, 1, 1, { bold: true, size: 12, valign: "TOP" });
  p.block(r, r + unitRows, 2, 2, { fg: C.mute, valign: "TOP" });
  p.block(r, r + unitRows, 3, 8, { align: "CENTER", valign: "TOP" });
  p.block(r, r + unitRows, 4, 4, { align: "CENTER", valign: "TOP", bold: true, fg: C.ink });
  p.block(r, r + unitRows, 5, 5, { align: "CENTER", valign: "TOP", font: DISPLAY, size: 9, bold: true, fg: C.ink2 });
  p.block(r, r + unitRows, 9, 9, { wrap: true, valign: "TOP", size: 10, fg: C.mute });
  p.when(r, r + unitRows, 5, 5, `=OR($F${r + 1}="Heroic",$F${r + 1}="Legendary")`, { fg: C.signal });
  p.when(r, r + unitRows, 5, 5, `=$F${r + 1}="Battle-ready"`, { fg: C.mute });
  p.when(r, r + unitRows, L, R, `=AND($B${r + 1}<>"",ISEVEN(ROW()))`, { bg: C.zebra });

  return p.build({
    title,
    index,
    exists: ctx.existing.has(id),
    rows: r + unitRows + 2,
    gmEmail: ctx.gmEmail,
    tabColor: C.plate2,
  });
}

export { activePlayers };
