import { Link } from "react-router-dom";
import { useRef, useState } from "react";
import { Card, Seg } from "@/components/ui/kit";
import { useSetTrackerSets } from "@/hooks/useCrusade";
import {
  fetchTrackerLayout,
  readTrackerLayoutFiles,
  type TrackerLayout,
} from "@/lib/import/tracker-layout";
import { findGithubSets, parseGithubUrl, type FoundSet } from "@/lib/import/github-sets";
import type { Crusade, CrusadeTrackerSet } from "@/types";

/** The file's own hint, else a guess from where it sits. */
function defaultScope(f: FoundSet): CrusadeTrackerSet["scope"] {
  return f.layout.audience ?? (/faction/i.test(f.path) ? "choice" : "everyone");
}

/**
 * GM only: tracker sets for the crusade's players. A set marked for
 * every player is added to each player's own trackers automatically;
 * the others are offered for players to pick (faction sets).
 */
export function TrackerSetsCard({ crusade }: { crusade: Crusade }) {
  const save = useSetTrackerSets(crusade.id);
  const sets = crusade.trackerSets ?? [];
  const file = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<CrusadeTrackerSet["scope"]>("everyone");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<{ sets: FoundSet[]; skipped: number } | null>(null);
  const [chosen, setChosen] = useState<Record<string, CrusadeTrackerSet["scope"]>>({});
  /** The set whose trackers are listed for editing. */
  const [openSet, setOpenSet] = useState<string | null>(null);

  const removeTracker = (set: CrusadeTrackerSet, itemId: string, itemName: string) => {
    const last = set.items.length === 1;
    const effect =
      set.scope === "everyone"
        ? "It disappears from every player's force, with whatever they have recorded in it, the next time they open their force."
        : "Players who already added it keep it.";
    const question = last
      ? `"${itemName}" is the last tracker in "${set.name}", so this removes the whole set. ${effect}`
      : `Remove "${itemName}" from "${set.name}"? ${effect}`;
    if (!window.confirm(question)) return;
    save.mutate(
      last
        ? sets.filter((x) => x.id !== set.id)
        : sets.map((x) =>
            x.id === set.id
              ? {
                  ...x,
                  items: x.items.filter((i) => i.id !== itemId),
                  updatedAt: new Date().toISOString(),
                }
              : x,
          ),
    );
  };

  const add = async (load: () => Promise<TrackerLayout>, fallbackName: string) => {
    setMessage(null);
    try {
      const layout = await load();
      if (layout.items.length === 0) {
        setMessage("That tracker set has no trackers in it.");
        return;
      }
      const set: CrusadeTrackerSet = {
        id: crypto.randomUUID(),
        name: (layout.name || fallbackName).slice(0, 200),
        scope,
        items: layout.items as CrusadeTrackerSet["items"],
        note: layout.note,
        updatedAt: new Date().toISOString(),
      };
      await save.mutateAsync([...sets, set]);
      setUrl("");
      setMessage(
        scope === "everyone"
          ? `Added "${set.name}". Each player gets it the next time they open their force.`
          : `Added "${set.name}". Players can now choose it on their force page.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  /** Add several set files at once, each as its own set, in one save. */
  const addFiles = async (files: File[]) => {
    setMessage(null);
    try {
      const { sets: read, problems } = await readTrackerLayoutFiles(files);
      const usable = read.filter((l) => l.items.length > 0);
      for (const l of read.filter((x) => x.items.length === 0)) {
        problems.push(`${l.fallbackName}: it has no trackers in it.`);
      }
      const room = Math.max(0, 40 - sets.length);
      if (usable.length > room) {
        problems.push(`A campaign holds at most 40 sets, so ${usable.length - room} were left out.`);
      }
      const now = new Date().toISOString();
      const added: CrusadeTrackerSet[] = usable.slice(0, room).map((l) => ({
        id: crypto.randomUUID(),
        name: (l.name || l.fallbackName).slice(0, 200),
        scope,
        items: l.items as CrusadeTrackerSet["items"],
        note: l.note,
        updatedAt: now,
      }));
      if (added.length > 0) await save.mutateAsync([...sets, ...added]);
      const names = added.map((s) => `"${s.name}"`).join(", ");
      const done =
        added.length === 0
          ? ""
          : `Added ${added.length === 1 ? names : `${added.length} sets: ${names}`}. ` +
            (scope === "everyone"
              ? "Each player gets them the next time they open their force."
              : "Players can now choose them on their force page.");
      setMessage([done, ...problems].filter(Boolean).join(" "));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  const lookUp = async () => {
    setMessage(null);
    setFound(null);
    setChosen({});
    if (!parseGithubUrl(url)) {
      await add(() => fetchTrackerLayout(url), "Tracker set");
      return;
    }
    setLooking(true);
    try {
      const result = await findGithubSets(url);
      if (result.sets.length === 0) setMessage("No tracker sets found there.");
      else setFound(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setLooking(false);
    }
  };

  const addChosen = async () => {
    if (!found) return;
    const now = new Date().toISOString();
    const picked = found.sets
      .filter((f) => chosen[f.path])
      .map(
        (f): CrusadeTrackerSet => ({
          id: crypto.randomUUID(),
          name: f.layout.name.slice(0, 200),
          scope: chosen[f.path],
          items: f.layout.items as CrusadeTrackerSet["items"],
          note: f.layout.note,
          updatedAt: now,
        }),
      );
    try {
      await save.mutateAsync([...sets, ...picked].slice(0, 40));
      setMessage(`Added ${picked.length} set${picked.length === 1 ? "" : "s"}.`);
      setFound(null);
      setChosen({});
      setUrl("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card title="Tracker sets for players" label="Tracker sets for players">
      <p className="m-0 text-mute text-[13px] leading-[1.5]">
        Campaign sets go to every player. Faction sets are offered for each
        player to choose from.
      </p>

      {sets.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] list-none m-0 p-0" data-testid="tracker-set-list">
          {sets.map((s) => (
            <li key={s.id} className="border-t border-rule">
              <div className="flex items-center justify-between gap-3 min-h-[52px] py-1.5">
                <span className="flex flex-col gap-px min-w-0">
                  <span className="font-semibold truncate">{s.name}</span>
                  <span className="text-xs text-mute">
                    {s.scope === "everyone" ? "Every player" : "Players choose"} · {s.items.length}{" "}
                    tracker{s.items.length === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex flex-none gap-3">
                  <button
                    type="button"
                    className="btn-link"
                    aria-expanded={openSet === s.id}
                    onClick={() => setOpenSet(openSet === s.id ? null : s.id)}
                  >
                    {openSet === s.id ? "Done" : "Edit"}
                  </button>
                  <button
                    type="button"
                    className="btn-link text-bad"
                    disabled={save.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          s.scope === "everyone"
                            ? `Remove "${s.name}"? Its trackers disappear from every player's force, with whatever they have recorded in them, the next time they open their force.`
                            : `Remove "${s.name}"? Players who already added its trackers keep them.`,
                        )
                      )
                        save.mutate(sets.filter((x) => x.id !== s.id));
                    }}
                  >
                    Remove set
                  </button>
                </span>
              </div>
              {openSet === s.id && (
                <ul
                  className="list-none m-0 mb-2.5 p-0 inset-panel px-3.5"
                  aria-label={`Trackers in ${s.name}`}
                  data-testid="tracker-set-items"
                >
                  {s.items.map((i, n) => (
                    <li
                      key={i.id}
                      className={`flex items-center justify-between gap-3 min-h-11 ${n > 0 ? "border-t border-rule" : ""}`}
                    >
                      <span className="truncate">{i.name}</span>
                      {s.scope === "everyone" && i.kind === "counter" && (
                        <label className="ml-auto flex items-center gap-2 text-xs text-mute cursor-pointer flex-none">
                          <input
                            type="checkbox"
                            checked={i.totals !== false}
                            disabled={save.isPending}
                            onChange={(e) =>
                              save.mutate(
                                sets.map((x) =>
                                  x.id === s.id
                                    ? {
                                        ...x,
                                        items: x.items.map((y) =>
                                          y.id === i.id ? { ...y, totals: e.target.checked ? undefined : false } : y,
                                        ),
                                        updatedAt: new Date().toISOString(),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                          In Campaign totals
                        </label>
                      )}
                      <button
                        type="button"
                        className="btn-link text-bad flex-none"
                        disabled={save.isPending}
                        aria-label={`Remove ${i.name}`}
                        onClick={() => removeTracker(s, i.id, i.name)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="inset-panel p-3.5 grid grid-cols-[minmax(0,1fr)] gap-2.5">
        <span className="label-mono">Add a set</span>
        <Seg
          label="Who gets it"
          value={scope}
          onChange={setScope}
          options={[
            { value: "everyone", label: "Every player" },
            { value: "choice", label: "Players choose" },
          ]}
        />
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          data-testid="crusade-set-file"
          aria-label="Tracker set files"
          multiple
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length > 0) void addFiles(files);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-sm"
            disabled={save.isPending}
            onClick={() => file.current?.click()}
          >
            {save.isPending ? "Saving…" : "Add from files"}
          </button>
          <a href={`${import.meta.env.BASE_URL}example-tracker-set.json`} download className="btn-link">
            Download an example
          </a>
          <Link to="/tracker-sets/new" className="btn-link">
            Build a set
          </Link>
        </div>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="GitHub repository or file link"
            aria-label="Link to a tracker set or a GitHub repository"
            className="field bg-surface flex-1 min-w-0"
          />
          <button
            type="button"
            className="btn"
            disabled={!url.trim() || save.isPending || looking}
            onClick={() => void lookUp()}
          >
            {looking ? "Looking…" : "Look up"}
          </button>
        </div>
        <span className="text-xs text-mute leading-[1.5]">
          A public GitHub repository or folder, or a "Raw" link to one set.
        </span>

        {found && (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2" data-testid="github-sets">
            <span className="label-mono">
              {found.sets.length} set{found.sets.length === 1 ? "" : "s"} found
              {found.skipped > 0 ? ` · ${found.skipped} other file${found.skipped === 1 ? "" : "s"} skipped` : ""}
            </span>
            <ul className="grid grid-cols-[minmax(0,1fr)] list-none m-0 p-0">
              {found.sets.map((f) => {
                const sel = chosen[f.path];
                const have = sets.some((x) => x.name === f.layout.name);
                return (
                  <li key={f.path} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 border-t border-rule">
                    <label className="flex items-start gap-3 flex-1 min-w-[180px] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!sel}
                        onChange={(e) =>
                          setChosen((c) => {
                            const next = { ...c };
                            if (e.target.checked) next[f.path] = defaultScope(f);
                            else delete next[f.path];
                            return next;
                          })
                        }
                        className="flex-none mt-0.5"
                      />
                      <span className="min-w-0">
                        <span className="font-semibold block truncate">{f.layout.name}</span>
                        <span className="text-xs text-mute block truncate">
                          {f.path} · {f.layout.items.length} tracker{f.layout.items.length === 1 ? "" : "s"}
                          {have ? " · already added" : ""}
                        </span>
                      </span>
                    </label>
                    {sel && (
                      <select
                        value={sel}
                        onChange={(e) =>
                          setChosen((c) => ({ ...c, [f.path]: e.target.value as CrusadeTrackerSet["scope"] }))
                        }
                        aria-label={`Who gets ${f.layout.name}`}
                        className="field bg-surface min-h-9"
                      >
                        <option value="everyone">Every player</option>
                        <option value="choice">Players choose</option>
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              className="btn btn-primary"
              disabled={Object.keys(chosen).length === 0 || save.isPending}
              onClick={() => void addChosen()}
            >
              Add {Object.keys(chosen).length || ""} selected
            </button>
          </div>
        )}
        {message && (
          <span role="status" className="text-[13px] font-semibold">
            {message}
          </span>
        )}
      </div>
    </Card>
  );
}
