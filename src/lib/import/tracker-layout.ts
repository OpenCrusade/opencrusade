/**
 * Tracker sets: a JSON description of a tracker panel (what to track,
 * and optionally reference entries and notes) that anyone can write,
 * host and share. The app ships none; players and GMs import them
 * from a file or a link.
 *
 * {
 *   "format": "crusade-ledger-tracker",
 *   "version": 1,
 *   "name": "My faction's crusade rules",
 *   "audience": "choice",          (optional: "everyone" or "choice")
 *   "columns": 3,                  (optional: tiles across when shown wide)
 *   "placement": "above",          (optional: "side", "above" or "below" the
 *                                   squad; a tracker can set its own too)
 *   "trackers": [
 *     { "name": "Points", "type": "number" },
 *     { "name": "Resource", "type": "number", "lifetime": true },   (also shows
 *                                   a running total of everything ever added)
 *     { "name": "Own tally", "type": "number", "totals": false },    (left out of
 *                                   the campaign page's Campaign totals)
 *     { "name": "Campaign stage", "type": "stages", "stages": ["One", "Two"] },
 *     { "name": "Upgrades", "type": "list",
 *       "entries": [{ "name": "First", "detail": "What it does" }] },
 *     { "name": "Leader chosen", "type": "checkbox" },
 *     { "name": "Options", "type": "checklist",
 *       "options": [{ "name": "First option", "detail": "What it does" }] },
 *     { "name": "Current target", "type": "text" }
 *   ],
 *   "notes": "Free text shown under the trackers."
 * }
 */

import { z } from "zod";
import type {
  TrackerItem,
  TrackerKind,
  TrackerState,
} from "@/components/common/tracker-state";

export const TRACKER_FORMAT = "crusade-ledger-tracker";
const MAX_BYTES = 300_000;

const TYPE_TO_KIND = {
  number: "counter",
  list: "list",
  stages: "stage",
  checkbox: "toggle",
  checklist: "checklist",
  text: "text",
} as const satisfies Record<string, TrackerKind>;

const KIND_TO_TYPE = Object.fromEntries(
  Object.entries(TYPE_TO_KIND).map(([t, k]) => [k, t]),
) as Record<TrackerKind, keyof typeof TYPE_TO_KIND>;

const trackerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(["number", "list", "stages", "checkbox", "checklist", "text"]),
  options: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        detail: z.string().max(2000).optional(),
      }),
    )
    .max(50)
    .optional(),
  stages: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
  entries: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        detail: z.string().max(2000).optional(),
      }),
    )
    .max(100)
    .optional(),
  value: z.union([z.number().int(), z.string().max(2000), z.boolean()]).optional(),
  /** Number only: also keep a running total of everything ever added. */
  lifetime: z.boolean().optional(),
  /** Where it shows on a force page: side, above or below the squad. */
  placement: z.enum(["side", "above", "below"]).optional(),
  /** Number only: false leaves it out of the campaign's Campaign totals. */
  totals: z.boolean().optional(),
});

const layoutSchema = z.object({
  format: z.literal(TRACKER_FORMAT),
  version: z.literal(1),
  name: z.string().max(200).optional(),
  /** Who a GM would usually give this to: every player, or a choice. */
  audience: z.enum(["everyone", "choice"]).optional(),
  /** Default placement for every tracker in the set. */
  placement: z.enum(["side", "above", "below"]).optional(),
  /** Tiles across when shown above or below the squad (1 to 4). */
  columns: z.number().int().min(1).max(4).optional(),
  trackers: z.array(trackerSchema).max(50),
  notes: z.string().max(10000).optional(),
});

export interface TrackerLayout {
  name: string;
  audience?: "everyone" | "choice";
  items: TrackerItem[];
  note: string;
}

export function parseTrackerLayout(text: string): TrackerLayout {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  if (!data || typeof data !== "object" || (data as { format?: unknown }).format !== TRACKER_FORMAT) {
    throw new Error(`That isn't a tracker set. It needs "format": "${TRACKER_FORMAT}".`);
  }
  const parsed = layoutSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `That tracker set has a problem at ${issue.path.join(".") || "the top level"}: ${issue.message}`,
    );
  }
  const items = parsed.data.trackers.map((t): TrackerItem => {
    const kind = TYPE_TO_KIND[t.type];
    let value: TrackerItem["value"];
    if (kind === "counter") value = typeof t.value === "number" ? t.value : 0;
    else if (kind === "toggle") value = t.value === true;
    else if (kind === "text") value = typeof t.value === "string" ? t.value : "";
    else if (kind === "stage") value = { stages: t.stages ?? [], current: 0 };
    else if (kind === "checklist")
      value = {
        options: (t.options ?? []).map((o) => ({
          id: crypto.randomUUID(),
          name: o.name,
          detail: o.detail ?? "",
          on: false,
        })),
      };
    else
      value = (t.entries ?? []).map((e) => ({
        id: crypto.randomUUID(),
        name: e.name,
        detail: e.detail ?? "",
      }));
    const placement = t.placement ?? parsed.data.placement;
    return {
      id: crypto.randomUUID(),
      name: t.name,
      kind,
      value,
      ...(placement && placement !== "side" ? { placement } : {}),
      ...(parsed.data.columns ? { columns: parsed.data.columns } : {}),
      ...(kind === "counter" && t.lifetime ? { lifetime: 0 } : {}),
      ...(kind === "counter" && t.totals === false ? { totals: false } : {}),
    };
  });
  return {
    name: parsed.data.name ?? "",
    ...(parsed.data.audience ? { audience: parsed.data.audience } : {}),
    items,
    note: parsed.data.notes ?? "",
  };
}

export interface ExportOptions {
  /** Who a GM would usually give the set to. */
  audience?: "everyone" | "choice";
  /**
   * Keep each number, checkbox and text tracker's current value as its
   * starting value. Off when sharing a panel someone has been using, so
   * their progress isn't handed on; on in the set builder.
   */
  startValues?: boolean;
}

/**
 * Write trackers out as a tracker set to share. Structure, list
 * entries, option descriptions, positions, columns, running totals and
 * notes are kept. Progress (numbers, ticks, the current stage, text
 * values) is reset unless `startValues` asks to keep it.
 */
export function exportTrackerLayout(
  state: TrackerState,
  name: string,
  options: ExportOptions = {},
): string {
  const columns = state.items.find((i) => i.columns)?.columns;
  return JSON.stringify(
    {
      format: TRACKER_FORMAT,
      version: 1,
      name,
      ...(options.audience ? { audience: options.audience } : {}),
      ...(columns ? { columns } : {}),
      trackers: state.items.map((i) => {
        const start =
          options.startValues &&
          ((i.kind === "counter" && typeof i.value === "number" && i.value !== 0) ||
            (i.kind === "toggle" && i.value === true) ||
            (i.kind === "text" && typeof i.value === "string" && i.value !== ""))
            ? { value: i.value as number | boolean | string }
            : {};
        const base = {
          name: i.name,
          type: KIND_TO_TYPE[i.kind],
          ...(i.placement && i.placement !== "side" ? { placement: i.placement } : {}),
          ...(typeof i.lifetime === "number" ? { lifetime: true } : {}),
          ...(i.kind === "counter" && i.totals === false ? { totals: false } : {}),
          ...start,
        };
        if (i.value && typeof i.value === "object" && !Array.isArray(i.value)) {
          if (i.kind === "stage" && "stages" in i.value) return { ...base, stages: i.value.stages };
          if (i.kind === "checklist" && "options" in i.value) {
            return {
              ...base,
              options: i.value.options.map((o) => ({
                name: o.name,
                ...(o.detail ? { detail: o.detail } : {}),
              })),
            };
          }
        }
        if (i.kind === "list" && Array.isArray(i.value)) {
          return {
            ...base,
            entries: i.value.map((e) => ({ name: e.name, ...(e.detail ? { detail: e.detail } : {}) })),
          };
        }
        return base;
      }),
      ...(state.note ? { notes: state.note } : {}),
    },
    null,
    2,
  );
}

/** Where a tracker set may be fetched from by link. */
const LINK_HOSTS = new Set([
  "raw.githubusercontent.com",
  "gist.githubusercontent.com",
]);

/**
 * Read a response as text, giving up as soon as it is bigger than a
 * tracker set could be (so a huge file is never fully downloaded).
 */
export async function readCapped(res: Response): Promise<string> {
  const tooBig = new Error("That file is too big to be a tracker set.");
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw tooBig;
  if (!res.body) {
    const text = await res.text();
    if (text.length > MAX_BYTES) throw tooBig;
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      void reader.cancel();
      throw tooBig;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Fetch one tracker set from a direct link to a file on GitHub
 * (a "Raw" link). Nothing about the user is sent. Other sites are
 * refused: the app only ever talks to Google and GitHub.
 */
export async function fetchTrackerLayout(url: string): Promise<TrackerLayout> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error("That isn't a link.");
  }
  if (parsed.protocol !== "https:" || !LINK_HOSTS.has(parsed.hostname)) {
    throw new Error(
      "Links have to be to a GitHub repository, or a GitHub \"Raw\" file link " +
        "(raw.githubusercontent.com). For a set kept anywhere else, download " +
        "the file and choose it here instead.",
    );
  }
  let res: Response;
  try {
    res = await fetch(parsed, { credentials: "omit", referrerPolicy: "no-referrer" });
  } catch {
    throw new Error("Couldn't read that link. Download the file and choose it here instead.");
  }
  if (!res.ok) throw new Error(`That link answered ${res.status}.`);
  return parseTrackerLayout(await readCapped(res));
}

export async function readTrackerLayoutFile(file: File): Promise<TrackerLayout> {
  if (file.size > MAX_BYTES) throw new Error("That file is too big to be a tracker set.");
  return parseTrackerLayout(await file.text());
}

/** At most this many files are read in one go. */
export const MAX_FILES = 40;

/**
 * Read several tracker set files. A file that can't be read doesn't
 * stop the others: its problem is reported with its name. `fallbackName`
 * is the file's name without ".json", for sets that don't name themselves.
 */
export async function readTrackerLayoutFiles(files: File[]): Promise<{
  sets: (TrackerLayout & { fallbackName: string })[];
  problems: string[];
}> {
  const sets: (TrackerLayout & { fallbackName: string })[] = [];
  const problems: string[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    try {
      const layout = await readTrackerLayoutFile(file);
      if (layout.items.length === 0 && !layout.note) problems.push(`${file.name}: it has no trackers in it.`);
      else sets.push({ ...layout, fallbackName: file.name.replace(/\.json$/i, "") });
    } catch (err) {
      problems.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (files.length > MAX_FILES) problems.push(`Only the first ${MAX_FILES} files were read.`);
  return { sets, problems };
}
