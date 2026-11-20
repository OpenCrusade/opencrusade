import { describe, it, expect } from "vitest";
import {
  crusadeSchema,
  inlineBattleSchema,
} from "@/lib/schemas/crusade";
import {
  attachedRosterSchema,
  crusadeCardSchema,
  playerRosterSchema,
} from "@/lib/schemas/roster";

const user = { googleId: "g1", email: "gm@test.com", displayName: "GM" };

function validCrusade() {
  return {
    id: "folder-123",
    name: "Blood & Iron",
    packId: "pariah-nexus",
    createdAt: "2026-03-30T12:00:00Z",
    createdBy: user,
    supplyLimit: 1000,
    startingRP: 5,
    players: [],
    settings: { allowPlayerBattleCreation: true },
  };
}

function validCard() {
  return {
    id: "unit-1",
    name: "Squad Alpha",
    datasheetName: "First Squad",
    pointsCost: 100,
    modelCount: 5,
    experiencePoints: 0,
    rank: "Battle-ready",
    crusadePoints: 0,
    battlesPlayed: 0,
    battlesSurvived: 0,
    enemiesDestroyed: 0,
    battleHonours: [],
    battleScars: [],
    blessings: [],
    burdens: [],
    equipment: [],
    notes: "",
    isCharacter: false,
    createdAt: "2026-03-30T12:00:00Z",
    updatedAt: "2026-03-30T12:00:00Z",
    appliedBattleIds: [],
  };
}

function validRoster() {
  return {
    id: "roster-1",
    player: user,
    factionName: "Blue Force",
    supplyUsed: 100,
    requisitionPoints: 5,
    crusadePoints: 0,
    units: [validCard()],
    requisitionLog: [],
  };
}

describe("Crusade schema (v2.7)", () => {
  it("parses a valid crusade and defaults the v2.5+ arrays", () => {
    const parsed = crusadeSchema.parse(validCrusade());
    expect(parsed.attachedRosters).toEqual([]);
    expect(parsed.gmAssignments).toEqual([]);
    expect(parsed.battles).toEqual([]);
  });

  it("rejects missing required fields", () => {
    expect(() => crusadeSchema.parse({})).toThrow();
  });

  it("rejects name over 200 chars", () => {
    expect(() =>
      crusadeSchema.parse({ ...validCrusade(), name: "A".repeat(201) }),
    ).toThrow();
  });
});

describe("CrusadeCard schema", () => {
  it("parses a valid crusade card and defaults appliedOoA", () => {
    const parsed = crusadeCardSchema.parse(validCard());
    expect(parsed.appliedOoA).toEqual([]);
  });

  it("rejects invalid rank", () => {
    expect(() =>
      crusadeCardSchema.parse({ ...validCard(), rank: "Godlike" }),
    ).toThrow();
  });

  it("rejects more than 6 battle honours", () => {
    const honours = Array.from({ length: 7 }, (_, i) => ({
      id: String(i),
      type: "battle-trait",
      name: "test",
      rules: "test",
      source: "core",
      awardedAt: "2026-03-30T12:00:00Z",
    }));
    expect(() =>
      crusadeCardSchema.parse({ ...validCard(), battleHonours: honours }),
    ).toThrow();
  });
});

describe("PlayerRoster schema (canonical, v2.6)", () => {
  it("parses and defaults attachedTo + appliedGmAssignments", () => {
    const parsed = playerRosterSchema.parse(validRoster());
    expect(parsed.attachedTo).toEqual([]);
    expect(parsed.appliedGmAssignments).toEqual([]);
  });

  it("has no crusadeId field (rosters are not crusade-bound)", () => {
    const parsed = playerRosterSchema.parse(validRoster());
    expect("crusadeId" in parsed).toBe(false);
  });
});

describe("AttachedRoster schema (inline mirror, v2.6)", () => {
  it("parses a roster extended with attachment metadata", () => {
    const data = {
      ...validRoster(),
      attachedAt: "2026-05-28T12:00:00Z",
      lastSyncedAt: "2026-05-28T12:00:00Z",
      canonicalFileId: "drive-file-1",
      crusadeBanner: "The Red Banner",
    };
    expect(() => attachedRosterSchema.parse(data)).not.toThrow();
  });

  it("rejects when attachment metadata is missing", () => {
    expect(() => attachedRosterSchema.parse(validRoster())).toThrow();
  });
});

describe("InlineBattle schema (v2.7)", () => {
  const participant = (id: string) => ({
    googleId: id,
    displayName: `P-${id}`,
    rosterId: `roster-${id}`,
  });

  it("requires at least 2 participants", () => {
    const data = {
      id: "b1",
      missionName: "Test Mission",
      date: "2026-05-28",
      pointsLevel: 2000,
      participants: [participant("g1")],
      createdBy: "g1",
      createdAt: "2026-05-28T12:00:00Z",
      updatedAt: "2026-05-28T12:00:00Z",
    };
    expect(() => inlineBattleSchema.parse(data)).toThrow();
  });

  it("parses a valid 2-player battle with defaults", () => {
    const data = {
      id: "b1",
      missionName: "Test Mission",
      date: "2026-05-28",
      pointsLevel: 2000,
      participants: [participant("g1"), participant("g2")],
      createdBy: "g1",
      createdAt: "2026-05-28T12:00:00Z",
      updatedAt: "2026-05-28T12:00:00Z",
    };
    const parsed = inlineBattleSchema.parse(data);
    expect(parsed.status).toBe("draft");
    expect(parsed.battleSize).toBe("Strike Force");
    expect(parsed.participants[0].appliedResults).toBe(false);
    expect(parsed.participants[0].unitsFielded).toEqual([]);
  });
});
