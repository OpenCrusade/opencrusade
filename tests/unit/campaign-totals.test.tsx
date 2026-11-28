import { describe, expect, it } from "vitest";
import { render, within } from "@testing-library/react";
import { CampaignTotals } from "@/components/crusade/CampaignTotals";
import { nearEnd } from "@/lib/utils/phases";
import type { AttachedRoster, Crusade, CrusadePhase } from "@/types";

const roster = (id: string, googleId: string, name: string, value: number) =>
  ({
    id,
    player: { googleId },
    factionName: name,
    crusadeBanner: "",
    factionState: { items: [{ id: `i-${id}`, setRef: "s1:c1", name: "Points", kind: "counter", value }] },
  }) as unknown as AttachedRoster;

const crusade = {
  trackerSets: [{ id: "s1", name: "Set", scope: "everyone", items: [{ id: "c1", name: "Points", kind: "counter" }] }],
  groups: [
    { id: "g1", name: "Red Team", playerGoogleIds: [] },
    { id: "g2", name: "Blue Team", playerGoogleIds: [] },
  ],
  players: [
    { user: { googleId: "a" }, groupId: "g1" },
    { user: { googleId: "b" }, groupId: "g2" },
    { user: { googleId: "c" } },
  ],
} as unknown as Crusade;

describe("Campaign totals", () => {
  it("lists each force under its own team", () => {
    const { getByRole } = render(
      <CampaignTotals
        crusade={crusade}
        attached={[roster("r1", "a", "First Force", 2), roster("r2", "b", "Second Force", 5), roster("r3", "c", "Third Force", 1)]}
        me="b"
        placement="side"
      />,
    );
    expect(within(getByRole("group", { name: "Red Team" })).getByText("First Force")).toBeTruthy();
    expect(within(getByRole("group", { name: "Red Team" })).queryByText("Second Force")).toBeNull();
    expect(within(getByRole("group", { name: "Blue Team" })).getByText("Second Force")).toBeTruthy();
    expect(getByRole("region", { name: "Points" }).textContent).toContain("No team");
  });
});

describe("end of phase reminder", () => {
  const phase = (end: string) => ({ id: "p", name: "One", text: "", start: "", end }) as CrusadePhase;
  it("starts three days before the end date and stays after it", () => {
    expect(nearEnd(phase("2026-12-10"), "2026-12-06")).toBe(false);
    expect(nearEnd(phase("2026-12-10"), "2026-12-07")).toBe(true);
    expect(nearEnd(phase("2026-12-10"), "2026-12-20")).toBe(true);
  });
  it("needs an end date", () => {
    expect(nearEnd(phase(""), "2026-12-20")).toBe(false);
  });
});
