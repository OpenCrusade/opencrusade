/**
 * Google Sheets REST wrapper, the app's only storage transport.
 *
 * One spreadsheet per crusade; one tab per player plus GM-owned tabs
 * (see the 2026-11-18 storage decision). Owns:
 *   - bearer-token attachment from the Zustand session store
 *   - one silent token refresh + retry on 401
 *   - retry on network failure and on 429/5xx with backoff
 *
 * Higher layers MUST NOT call `fetch` for Sheets directly.
 *
 * Sheets has no ETag / If-Match: there is no compare-and-swap. The
 * data layout avoids conflicts instead, each client writes only its
 * own tab, existing rows are updated in place and never moved, and
 * new rows go through `appendRows` (values.append).
 *
 * DO NOT add rows with the `appendCells` batchUpdate request: probed
 * 2026-11-18, 12 concurrent appendCells left 3 rows, the rest were
 * silently overwritten. values.append lost none (failures surface as
 * 503s, which are retried; a retry can at worst duplicate a row, and
 * readers take the last row per key).
 */

import { useAppStore, getAccessToken } from "@/stores/app-store";
import { trySilentTokenRefresh } from "./token-refresh";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

export class SheetsError extends Error {
  readonly status: number;
  readonly body?: unknown;

  /** Google's own wording. For logs and checks, never shown to users. */
  readonly detail: string;

  constructor(message: string, status: number, body?: unknown, detail = "") {
    super(message);
    this.name = "SheetsError";
    this.status = status;
    this.body = body;
    this.detail = detail;
  }

  /**
   * The signed-in user can't open this spreadsheet: it was never
   * shared with them, the share was removed, or it was deleted.
   * (A 403 for a missing OAuth scope is a different problem.)
   */
  get notShared(): boolean {
    if (this.status === 404) return true;
    return this.status === 403 && !/scope/i.test(this.detail);
  }

  /** The token lacks the Sheets permission (consent checkbox left unticked). */
  get missingScope(): boolean {
    return this.status === 403 && /scope/i.test(this.detail);
  }

  /** Write refused because the target tab is locked to someone else. */
  get protectedCell(): boolean {
    return this.status === 400 && /protected/i.test(this.detail);
  }
}

/** What to tell a person when Google refuses a request. */
function plainMessage(status: number): string {
  if (status === 401) {
    return "Your Google session has expired. Press Reconnect at the top of the page, then try again.";
  }
  if (status === 429) {
    return "Google Sheets is busy with too many requests right now. Wait a minute and try again.";
  }
  if (status >= 500) {
    return "Google Sheets is having a problem at the moment. Try again shortly.";
  }
  if (status === 403 || status === 404) {
    return "Google Sheets wouldn't allow that. You may no longer have access to this campaign's sheet.";
  }
  return `Google Sheets couldn't do that (error ${status}). Try again; if it keeps happening, reload the page.`;
}

async function requireToken(): Promise<string> {
  let token = getAccessToken(useAppStore.getState());
  if (!token && (await trySilentTokenRefresh())) {
    token = getAccessToken(useAppStore.getState());
  }
  if (!token) throw new SheetsError(plainMessage(401), 401);
  return token;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Backoff for network failures, 429 (per-user quota: 60/min) and 5xx. */
const RETRY_DELAYS_MS = [1000, 2500, 6000];
const QUOTA_DELAYS_MS = [3000, 8000, 15000, 25000];

async function sheetsFetch(
  url: string,
  init: RequestInit = {},
): Promise<unknown> {
  const method = init.method ?? "GET";
  let refreshed = false;

  for (let attempt = 0; ; attempt++) {
    const token = await requireToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body) headers.set("Content-Type", "application/json");

    let res: Response;
    try {
      res = await fetch(url, { ...init, headers });
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw new SheetsError(
          "Couldn't reach Google Sheets. You appear to be offline. " +
            "Your edits are kept on this device; retry when you're back online.",
          0,
          err,
        );
      }
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    if (res.ok) return res.json();

    // Token died mid-session: one silent refresh, then retry.
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      if (await trySilentTokenRefresh()) continue;
    }
    // Google's limit is per minute, so a refused request needs a
    // longer wait than a network blip before it will go through.
    if (res.status === 429 && attempt < QUOTA_DELAYS_MS.length) {
      await sleep(QUOTA_DELAYS_MS[attempt]);
      continue;
    }
    if (res.status >= 500 && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    let body: unknown;
    let detail = "";
    try {
      body = await res.json();
      detail = (body as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      // non-JSON error body
    }
    // The address is left out of the log: it names the spreadsheet.
    console.warn(`[sheets] ${method} failed with ${res.status}: ${detail || "no detail"}`);
    throw new SheetsError(plainMessage(res.status), res.status, body, detail);
  }
}

// ─── Types ─────────────────────────────────────────────────────────

/** A cell as read back with UNFORMATTED_VALUE. */
export type Cell = string | number | boolean;
export type Row = Cell[];

export interface ProtectedRangeInfo {
  protectedRangeId: number;
  description?: string;
  /** Emails allowed to edit. Only visible to users who can edit the range. */
  editors?: { users?: string[] };
  /** Whether the signed-in user may edit inside this range. */
  requestingUserCanEdit?: boolean;
}

export interface TabInfo {
  sheetId: number;
  title: string;
  protectedRanges: ProtectedRangeInfo[];
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  title: string;
  url: string;
  tabs: TabInfo[];
}

interface RawSpreadsheet {
  spreadsheetId: string;
  spreadsheetUrl: string;
  properties: { title: string };
  sheets?: {
    properties: { sheetId: number; title: string };
    protectedRanges?: ProtectedRangeInfo[];
  }[];
}

const META_FIELDS =
  "spreadsheetId,spreadsheetUrl,properties.title," +
  "sheets(properties(sheetId,title),protectedRanges(protectedRangeId,description,editors,requestingUserCanEdit))";

function toInfo(raw: RawSpreadsheet): SpreadsheetInfo {
  return {
    spreadsheetId: raw.spreadsheetId,
    title: raw.properties.title,
    url: raw.spreadsheetUrl,
    tabs: (raw.sheets ?? []).map((s) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      protectedRanges: s.protectedRanges ?? [],
    })),
  };
}

/** A1 range for a whole tab or a block within it, with the title quoted. */
export function a1(tabTitle: string, cells?: string): string {
  const quoted = `'${tabTitle.replace(/'/g, "''")}'`;
  return cells ? `${quoted}!${cells}` : quoted;
}

/**
 * Pull the spreadsheet id out of whatever the user pasted: a full
 * docs.google.com URL or a bare id. Returns null if neither.
 */
export function parseSpreadsheetId(input: string): string | null {
  const s = input.trim();
  const fromUrl = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (fromUrl) return fromUrl[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

// ─── Spreadsheet-level calls ───────────────────────────────────────

/** Create a spreadsheet with the given tabs (in order). */
export async function createSpreadsheet(
  title: string,
  tabs: { sheetId: number; title: string; hidden?: boolean }[],
): Promise<SpreadsheetInfo> {
  const raw = (await sheetsFetch(`${SHEETS}?fields=${encodeURIComponent(META_FIELDS)}`, {
    method: "POST",
    body: JSON.stringify({
      properties: { title },
      sheets: tabs.map((t) => ({ properties: t })),
    }),
  })) as RawSpreadsheet;
  return toInfo(raw);
}

/** Tabs + their locks. Cheap: no cell data. */
export async function getSpreadsheetInfo(
  spreadsheetId: string,
): Promise<SpreadsheetInfo> {
  const raw = (await sheetsFetch(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent(META_FIELDS)}`,
  )) as RawSpreadsheet;
  return toInfo(raw);
}

/**
 * Structural batchUpdate (add/delete tabs, protected ranges, …).
 * All requests apply atomically or not at all. Returns the replies.
 */
export async function batchUpdate(
  spreadsheetId: string,
  requests: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const res = (await sheetsFetch(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    { method: "POST", body: JSON.stringify({ requests }) },
  )) as { replies?: Record<string, unknown>[] };
  return res.replies ?? [];
}

/** Request: add a tab. */
export function addTabRequest(sheetId: number, title: string) {
  return { addSheet: { properties: { sheetId, title } } };
}

/**
 * Request: lock a whole tab so only `editorEmails` can edit it. The
 * spreadsheet owner can always edit regardless.
 */
export function lockTabRequest(
  sheetId: number,
  editorEmails: string[],
  description: string,
) {
  return {
    addProtectedRange: {
      protectedRange: {
        range: { sheetId },
        description,
        warningOnly: false,
        editors: { users: editorEmails },
      },
    },
  };
}

// ─── Cell values ───────────────────────────────────────────────────

/**
 * Read several ranges in ONE request (counts as one against the
 * 60/min/user quota). Results are in the same order as `ranges`;
 * an empty range yields []. Formulas come back as computed values.
 */
export async function readRanges(
  spreadsheetId: string,
  ranges: string[],
): Promise<Row[][]> {
  if (ranges.length === 0) return [];
  const qs = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE" });
  for (const r of ranges) qs.append("ranges", r);
  const res = (await sheetsFetch(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${qs}`,
  )) as { valueRanges?: { values?: Row[] }[] };
  return ranges.map((_, i) => res.valueRanges?.[i]?.values ?? []);
}

/**
 * Overwrite several ranges in ONE atomic request. `formulas: true`
 * parses strings starting with "=" as formulas (USER_ENTERED); the
 * default RAW stores every string literally, which is what data rows
 * want (no "=…" injection, no date/number coercion).
 */
export async function writeRanges(
  spreadsheetId: string,
  data: { range: string; values: Row[] }[],
  opts: { formulas?: boolean } = {},
): Promise<void> {
  if (data.length === 0) return;
  await sheetsFetch(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: opts.formulas ? "USER_ENTERED" : "RAW",
        data,
      }),
    },
  );
}

/** Append rows after the last row of the table in `range`. */
export async function appendRows(
  spreadsheetId: string,
  range: string,
  rows: Row[],
): Promise<void> {
  if (rows.length === 0) return;
  const qs = new URLSearchParams({
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
  });
  await sheetsFetch(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?${qs}`,
    { method: "POST", body: JSON.stringify({ values: rows }) },
  );
}

/** Clear ranges (values only; formatting and locks stay). */
export async function clearRanges(
  spreadsheetId: string,
  ranges: string[],
): Promise<void> {
  if (ranges.length === 0) return;
  await sheetsFetch(
    `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values:batchClear`,
    { method: "POST", body: JSON.stringify({ ranges }) },
  );
}

/**
 * Request: overwrite one existing row in place, addressed by sheet id
 * and 0-based row index (no tab title needed). `clearWidth` is how
 * many cells the row held before, so stale trailing cells are blanked.
 */
export function updateRowRequest(
  sheetId: number,
  rowIndex: number,
  cells: Row,
  clearWidth = 0,
  opts: { formulas?: boolean } = {},
) {
  const width = Math.max(cells.length, clearWidth);
  const values = Array.from({ length: width }, (_, i) => {
    const v = cells[i];
    if (v === undefined || v === "") return {};
    if (typeof v === "number") return { userEnteredValue: { numberValue: v } };
    if (typeof v === "boolean") return { userEnteredValue: { boolValue: v } };
    if (opts.formulas && v.startsWith("=")) {
      return { userEnteredValue: { formulaValue: v } };
    }
    return { userEnteredValue: { stringValue: v } };
  });
  return {
    updateCells: {
      range: {
        sheetId,
        startRowIndex: rowIndex,
        endRowIndex: rowIndex + 1,
        startColumnIndex: 0,
        endColumnIndex: width,
      },
      rows: [{ values }],
      fields: "userEnteredValue",
    },
  };
}

/** Request: blank every value in a tab (locks and formatting stay). */
export function clearTabRequest(sheetId: number) {
  return { updateCells: { range: { sheetId }, fields: "userEnteredValue" } };
}

/**
 * Requests: make a data tab pleasant to read in Google Sheets itself,
 * frozen bold header, sensible column widths, wrapped summary text,
 * and the technical columns (the id in B, and everything from
 * `firstDataCol` on) hidden. Hidden columns stay readable by the API.
 */
export function dataTabStyleRequests(sheetId: number, firstDataCol: number) {
  const width = (startIndex: number, endIndex: number, pixelSize: number) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex, endIndex },
      properties: { pixelSize },
      fields: "pixelSize",
    },
  });
  const hide = (startIndex: number, endIndex: number) => ({
    updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex, endIndex },
      properties: { hiddenByUser: true },
      fields: "hiddenByUser",
    },
  });
  return [
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.85, green: 0.85, blue: 0.8 },
          },
        },
        fields: "userEnteredFormat(textFormat.bold,backgroundColor)",
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 1,
          startColumnIndex: firstDataCol - 2,
          endColumnIndex: firstDataCol - 1,
        },
        cell: { userEnteredFormat: { wrapStrategy: "WRAP" } },
        fields: "userEnteredFormat.wrapStrategy",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: firstDataCol },
        cell: { userEnteredFormat: { wrapStrategy: "CLIP" } },
        fields: "userEnteredFormat.wrapStrategy",
      },
    },
    width(0, 1, 80), // kind
    width(2, 3, 220), // name
    width(3, 4, 180), // detail
    width(firstDataCol - 2, firstDataCol - 1, 480), // summary
    width(firstDataCol - 1, firstDataCol, 170), // updated
    hide(1, 2), // id
    hide(firstDataCol, 26), // JSON data
    { setBasicFilter: { filter: { range: { sheetId, startColumnIndex: 0, endColumnIndex: firstDataCol } } } },
  ];
}

/** Request: change who may edit an existing locked range. */
export function setLockEditorsRequest(
  protectedRangeId: number,
  editorEmails: string[],
) {
  return {
    updateProtectedRange: {
      protectedRange: { protectedRangeId, editors: { users: editorEmails } },
      fields: "editors",
    },
  };
}
