/**
 * Find tracker sets in a public GitHub repository or folder.
 *
 * Uses GitHub's public API from the browser with no sign-in, so it
 * only sees public repositories and is limited by GitHub to about 60
 * lookups an hour per network address.
 */

import { parseTrackerLayout, readCapped, type TrackerLayout } from "./tracker-layout";

export interface GithubLocation {
  owner: string;
  repo: string;
  ref?: string;
  path: string;
}

/** Understand a github.com link to a repo, folder or file. */
export function parseGithubUrl(url: string): GithubLocation | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.hostname !== "github.com" && u.hostname !== "www.github.com") return null;
  let parts: string[];
  try {
    parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null; // a stray "%" in the link
  }
  if (parts.length < 2) return null;
  // No "." or ".." steps: they would point the lookup somewhere else.
  if (parts.some((p) => p === "." || p === ".." || p.includes("/") || p.includes("\\"))) return null;
  const [owner, repoRaw, kind, ref, ...rest] = parts;
  const repo = repoRaw.replace(/\.git$/, "");
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  if (kind === "tree" || kind === "blob") {
    if (!ref) return null;
    return { owner, repo, ref, path: rest.join("/") };
  }
  return { owner, repo, path: "" };
}

export interface FoundSet {
  /** Path of the file inside the repository. */
  path: string;
  layout: TrackerLayout;
}

interface Entry {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

/** Files are only ever downloaded from GitHub's own file host. */
function isRawGithub(url: string | null | undefined): url is string {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "raw.githubusercontent.com";
  } catch {
    return false;
  }
}

const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

async function list(loc: GithubLocation, path: string): Promise<Entry[]> {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(loc.owner)}/${encodeURIComponent(loc.repo)}/contents/${enc(path)}` +
      (loc.ref ? `?ref=${encodeURIComponent(loc.ref)}` : ""),
    { credentials: "omit", referrerPolicy: "no-referrer", headers: { Accept: "application/vnd.github+json" } },
  );
  if (res.status === 404) {
    throw new Error("GitHub can't find that. Check the link, and that the repository is public.");
  }
  if (res.status === 403 || res.status === 429) {
    throw new Error("GitHub is limiting lookups from your network right now. Try again in a while.");
  }
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
  const body: unknown = await res.json();
  return (Array.isArray(body) ? body : [body]) as Entry[];
}

/**
 * Every tracker set in the folder the link points at and in the
 * folders directly inside it. Files that aren't tracker sets are
 * skipped and counted.
 */
export async function findGithubSets(
  url: string,
): Promise<{ sets: FoundSet[]; skipped: number }> {
  const loc = parseGithubUrl(url);
  if (!loc) throw new Error("That isn't a GitHub repository link.");

  const top = await list(loc, loc.path);
  const files = top.filter((e) => e.type === "file");
  for (const dir of top.filter((e) => e.type === "dir" && !e.name.startsWith(".")).slice(0, 8)) {
    files.push(...(await list(loc, dir.path)).filter((e) => e.type === "file"));
  }
  const json = files
    .filter((f) => /\.json$/i.test(f.name) && isRawGithub(f.download_url))
    .slice(0, 60);

  let skipped = 0;
  const sets: FoundSet[] = [];
  await Promise.all(
    json.map(async (f) => {
      try {
        const res = await fetch(f.download_url!, { credentials: "omit", referrerPolicy: "no-referrer" });
        if (!res.ok) throw new Error(String(res.status));
        const layout = parseTrackerLayout(await readCapped(res));
        sets.push({
          path: f.path,
          layout: { ...layout, name: layout.name || f.name.replace(/\.json$/i, "") },
        });
      } catch {
        skipped++;
      }
    }),
  );
  sets.sort((a, b) => a.path.localeCompare(b.path));
  return { sets, skipped };
}
