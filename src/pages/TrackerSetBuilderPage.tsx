import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { PageBand } from "@/components/public/NightBand";
import { TrackerPanel } from "@/components/common/TrackerPanel";
import { readTrackerState, type TrackerState } from "@/components/common/tracker-state";
import { db } from "@/lib/db/dexie";
import { downloadFile } from "@/lib/export/roster-export";
import {
  exportTrackerLayout,
  fetchTrackerLayout,
  parseTrackerLayout,
  readTrackerLayoutFile,
  type TrackerLayout,
} from "@/lib/import/tracker-layout";
import { useTrackerEdit } from "@/stores/tracker-edit";
import { forceName } from "@/lib/utils/stats";

/** Everything the builder holds: the set's own fields and its trackers. */
interface Draft {
  name: string;
  audience: "" | "everyone" | "choice";
  state: TrackerState;
}

const EMPTY: Draft = { name: "", audience: "", state: { items: [], note: "" } };
const DRAFT_KEY = "opencrusade:tracker-set-draft";

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY;
    const d = JSON.parse(raw) as Partial<Draft>;
    // Reuse the stored-state reader: it keeps only well-formed trackers.
    const state = readTrackerState(d.state as Record<string, unknown> | undefined);
    return {
      name: typeof d.name === "string" ? d.name.slice(0, 200) : "",
      audience: d.audience === "everyone" || d.audience === "choice" ? d.audience : "",
      state,
    };
  } catch {
    return EMPTY;
  }
}

function saveDraft(d: Draft) {
  try {
    if (d.name || d.state.items.length || d.state.note) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Private windows can refuse storage; the draft just isn't kept.
  }
}

/** A tracker set file for `draft`, with starting values kept. */
function toFile(d: Draft): string {
  return exportTrackerLayout(d.state, d.name.trim() || "Tracker set", {
    ...(d.audience ? { audience: d.audience } : {}),
    startValues: true,
  });
}

/**
 * Build, check and download a tracker set without signing in or
 * touching a campaign. Everything stays in this browser.
 */
export function TrackerSetBuilderPage() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [link, setLink] = useState("");
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const edit = useTrackerEdit();

  // The builder is always in set-up mode; put things back on the way out.
  useEffect(() => {
    edit.open();
    return () => edit.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => saveDraft(draft), [draft]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  /** Replace the draft with a loaded set, after asking if there is work to lose. */
  const startFrom = (layout: TrackerLayout, from: string) => {
    if (
      draft.state.items.length > 0 &&
      !window.confirm("Replace the set you are building? It is not kept anywhere else.")
    )
      return;
    setDraft({
      name: layout.name,
      audience: layout.audience ?? "",
      state: { items: layout.items, note: layout.note },
    });
    setMessage({ text: `Loaded ${layout.items.length} tracker${layout.items.length === 1 ? "" : "s"} from ${from}.` });
  };

  const tryLoad = async (load: () => Promise<TrackerLayout>, from: string) => {
    setMessage(null);
    try {
      startFrom(await load(), from);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : String(err), bad: true });
    }
  };

  const ready = draft.state.items.length > 0;
  const fileName = `${draft.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "tracker-set"}.json`;

  return (
    <div className="min-h-screen grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto]">
      <Header />
      <main>
        <PageBand title="Build a tracker set">
          <p className="m-0 text-night-mute text-[16px] max-w-[62ch]">
            Make a tracker set file to share with your group, without signing in. Your work stays in
            this browser until you download it.
          </p>
        </PageBand>

        <div className="page pt-8 pb-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] items-start">
          <div className="grid gap-6 min-w-0">
            <section className="card p-5 grid gap-4" aria-labelledby="set-details">
              <h2 id="set-details" className="plate-heading m-0">
                The set
              </h2>
              <label className="grid gap-1.5">
                <span className="label-mono">Name</span>
                <input
                  type="text"
                  value={draft.name}
                  maxLength={200}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="For example: Red Force campaign"
                  className="field"
                />
              </label>
              <fieldset className="m-0 p-0 border-0 grid gap-1.5">
                <legend className="label-mono mb-1.5">Who a GM would usually give it to</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {(
                    [
                      ["", "Not set"],
                      ["everyone", "Every player"],
                      ["choice", "Players choose"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="audience"
                        checked={draft.audience === value}
                        onChange={() => update({ audience: value })}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <span className="text-xs text-mute">
                  Only a suggestion. The GM still chooses when adding the set.
                </span>
              </fieldset>
            </section>

            <section className="card p-5 grid gap-4" aria-labelledby="set-trackers">
              <h2 id="set-trackers" className="plate-heading m-0">
                Trackers
              </h2>
              <TrackerPanel
                state={draft.state}
                canEdit
                onUpdate={(state) => update({ state })}
                isSaving={false}
                allowPlacement
                allowColumns
                allowTotals
                hideSetTools
                lockElsewhere
                setName={draft.name}
                emptyText="No trackers yet."
                noteLabel="Notes"
                notePlaceholder="How the set is used, in your own words. No rules text."
              />
            </section>

            <section className="card p-5 grid gap-3" aria-labelledby="set-preview">
              <h2 id="set-preview" className="plate-heading m-0">
                Preview
              </h2>
              {ready ? (
                <Preview state={draft.state} />
              ) : (
                <p className="m-0 text-sm text-mute">Add a tracker to see how it will look.</p>
              )}
            </section>
          </div>

          <div className="grid gap-6 min-w-0 lg:sticky lg:top-6">
            <section className="card p-5 grid gap-3" aria-labelledby="set-start">
              <h2 id="set-start" className="plate-heading m-0">
                Start from
              </h2>
              <input
                ref={file}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                aria-label="Tracker set file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void tryLoad(() => readTrackerLayoutFile(f), f.name);
                }}
              />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-sm" onClick={() => file.current?.click()}>
                  A file
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!ready && !draft.name}
                  onClick={() => {
                    if (window.confirm("Clear the set you are building and start again?")) {
                      setDraft(EMPTY);
                      setMessage(null);
                    }
                  }}
                >
                  Start again
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="GitHub Raw or gist link"
                  aria-label="Link to a tracker set"
                  className="field flex-1 min-w-0"
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!link.trim()}
                  onClick={() => void tryLoad(() => fetchTrackerLayout(link), "the link")}
                >
                  Load
                </button>
              </div>
              <DeviceSources onPick={(layout, from) => startFrom(layout, from)} />
              <details>
                <summary className="text-sm cursor-pointer">Check or load a set as text</summary>
                <div className="grid gap-2 mt-2">
                  <textarea
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    rows={6}
                    placeholder='{ "format": "crusade-ledger-tracker", ... }'
                    aria-label="Tracker set as text"
                    className="field font-mono text-xs"
                  />
                  <PasteCheck text={pasted} onLoad={(layout) => startFrom(layout, "the text")} />
                </div>
              </details>
              {message && (
                <p role={message.bad ? "alert" : "status"} className={`m-0 text-sm ${message.bad ? "text-bad" : "text-mute"}`}>
                  {message.text}
                </p>
              )}
            </section>

            <section className="card p-5 grid gap-3" aria-labelledby="set-out">
              <h2 id="set-out" className="plate-heading m-0">
                Finish
              </h2>
              {!draft.name.trim() && ready && (
                <p className="m-0 text-sm text-mute">Give the set a name so GMs can tell it apart.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!ready}
                  onClick={() => downloadFile(fileName, "application/json", toFile(draft))}
                >
                  Download the file
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!ready}
                  onClick={() => {
                    void navigator.clipboard?.writeText(toFile(draft)).then(
                      () => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 2000);
                      },
                      () => setMessage({ text: "Couldn't copy. Use Download instead.", bad: true }),
                    );
                  }}
                >
                  {copied ? "Copied" : "Copy as text"}
                </button>
              </div>
              <p className="m-0 text-xs text-mute leading-[1.5]">
                Copy as text is handy for a secret gist. Starting values (numbers, ticks and text you
                have filled in) go into the file.{" "}
                <a
                  className="underline"
                  href="https://github.com/OpenCrusade/opencrusade/blob/main/docs/tracker-sets.md"
                  rel="noreferrer"
                >
                  How to share a set
                </a>
              </p>
            </section>

          </div>
        </div>

        <p className="page pb-8 m-0 text-sm text-mute">
          Tracker sets hold names and numbers only. Describe things in your own words, and leave
          rules text in your books. <Link className="underline" to="/faq/">FAQ</Link>
        </p>
      </main>
      <Footer />
    </div>
  );
}

/** How the trackers look locked: at the side, and as tiles full width. */
function Preview({ state }: { state: TrackerState }) {
  const side = { ...state, items: state.items.filter((i) => (i.placement ?? "side") === "side") };
  const wide = { ...state, items: state.items.filter((i) => (i.placement ?? "side") !== "side") };
  const noop = () => {};
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] items-start">
      {side.items.length > 0 && (
        <div className="grid gap-2">
          <span className="label-mono">At the side</span>
          <div className="inset-panel p-3.5">
            <TrackerPanel state={side} canEdit={false} onUpdate={noop} isSaving={false} hideNotes />
          </div>
        </div>
      )}
      {wide.items.length > 0 && (
        <div className="grid gap-2">
          <span className="label-mono">Above or below the squad (full width)</span>
          <TrackerPanel state={wide} canEdit={false} onUpdate={noop} isSaving={false} wide />
          <span className="text-xs text-mute">
            Up to the chosen number of tiles sit side by side when there is room.
          </span>
        </div>
      )}
    </div>
  );
}

/** Checks pasted text as it is typed, and offers to load it. */
function PasteCheck({ text, onLoad }: { text: string; onLoad: (l: TrackerLayout) => void }) {
  if (!text.trim()) return null;
  let layout: TrackerLayout | null = null;
  let problem = "";
  try {
    layout = parseTrackerLayout(text);
  } catch (err) {
    problem = err instanceof Error ? err.message : String(err);
  }
  return layout ? (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-good">
        A valid set: {layout.items.length} tracker{layout.items.length === 1 ? "" : "s"}.
      </span>
      <button type="button" className="btn btn-sm" onClick={() => onLoad(layout)}>
        Load it
      </button>
    </div>
  ) : (
    <p role="alert" className="m-0 text-sm text-bad">
      {problem}
    </p>
  );
}

/** Trackers already on this device: each force's and each campaign's. */
function DeviceSources({ onPick }: { onPick: (l: TrackerLayout, from: string) => void }) {
  const [sources, setSources] = useState<{ key: string; label: string; state: TrackerState }[]>([]);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const rosters = await db.rosters.toArray();
        const crusades = await db.crusades.toArray();
        const found = [
          ...rosters.map((r) => ({
            key: `r:${r.rosterId}`,
            label: `Force: ${forceName(r.payload)}`,
            state: readTrackerState(r.payload.factionState),
          })),
          ...crusades.map((c) => ({
            key: `c:${c.crusadeId}`,
            label: `Campaign tracker: ${c.payload.name}`,
            state: readTrackerState(c.payload.packState as Record<string, unknown>),
          })),
        ].filter((s) => s.state.items.length > 0);
        if (live) setSources(found);
      } catch {
        // No local data (or storage refused): nothing to offer.
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  if (sources.length === 0) return null;
  return (
    <label className="grid gap-1.5">
      <span className="text-sm">Trackers on this device</span>
      <select
        className="field"
        value=""
        onChange={(e) => {
          const s = sources.find((x) => x.key === e.target.value);
          if (!s) return;
          // A layout only: values and ticks are not carried over.
          const layout = parseTrackerLayout(exportTrackerLayout(s.state, ""));
          onPick({ ...layout, name: "" }, s.label);
        }}
      >
        <option value="">Choose…</option>
        {sources.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
