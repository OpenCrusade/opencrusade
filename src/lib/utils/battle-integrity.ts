import type { BattlePlayerData } from "@/types";

/**
 * Tamper detection for verified battles (spec.md FR-031 / US5 acc.#5).
 *
 * Each participant's confirmation includes a SHA-256 snapshot hash of
 * all OTHER participants' submitted data at signing time. On read, we
 * re-hash the current data and compare. A mismatch flags the battle
 * as `tampered`.
 *
 * v2: payload narrowed to the fields that actually affect roster
 * outcomes, agendas/outcome/totalEnemiesDestroyed were removed.
 */

type IntegrityPayload = Pick<
  BattlePlayerData,
  "playerId" | "unitsFielded" | "markedForGreatnessUnitIds"
>;

function snapshotPayload(p: BattlePlayerData): IntegrityPayload {
  return {
    playerId: p.playerId,
    unitsFielded: p.unitsFielded,
    markedForGreatnessUnitIds: p.markedForGreatnessUnitIds,
  };
}

async function sha256(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeConfirmationHash(
  otherParticipantsData: BattlePlayerData[],
): Promise<string> {
  const sorted = [...otherParticipantsData].sort((a, b) =>
    a.playerId.localeCompare(b.playerId),
  );
  const payload = sorted.map(snapshotPayload);
  return sha256(JSON.stringify(payload));
}

export type BattleIntegrityStatus = "valid" | "tampered" | "unverified";

export async function verifyBattleIntegrity(
  allParticipantsData: BattlePlayerData[],
): Promise<BattleIntegrityStatus> {
  const confirmed = allParticipantsData.filter((p) => p.confirmed);
  if (confirmed.length < allParticipantsData.length) return "unverified";

  for (const participant of confirmed) {
    if (!participant.confirmationSnapshot) return "unverified";
    const others = allParticipantsData.filter(
      (p) => p.playerId !== participant.playerId,
    );
    const currentHash = await computeConfirmationHash(others);
    if (currentHash !== participant.confirmationSnapshot) return "tampered";
  }

  return "valid";
}
