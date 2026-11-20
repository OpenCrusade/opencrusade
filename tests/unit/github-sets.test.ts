import { describe, expect, it } from "vitest";
import { parseGithubUrl } from "@/lib/import/github-sets";

describe("GitHub links", () => {
  it("reads repo, folder and file links", () => {
    expect(parseGithubUrl("https://github.com/someone/sets")).toEqual({
      owner: "someone", repo: "sets", path: "",
    });
    expect(parseGithubUrl("https://github.com/someone/sets.git")).toMatchObject({ repo: "sets" });
    expect(parseGithubUrl("https://github.com/someone/sets/tree/main/my%20crusade/factions")).toEqual({
      owner: "someone", repo: "sets", ref: "main", path: "my crusade/factions",
    });
    expect(parseGithubUrl("https://github.com/someone/sets/blob/main/a.json")).toEqual({
      owner: "someone", repo: "sets", ref: "main", path: "a.json",
    });
  });
  it("rejects anything else", () => {
    expect(parseGithubUrl("https://example.com/a/b")).toBeNull();
    expect(parseGithubUrl("https://github.com/someone")).toBeNull();
    expect(parseGithubUrl("nope")).toBeNull();
  });
});
