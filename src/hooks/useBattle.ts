import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  applyBattleResults,
  confirmBattleResult,
  declareBattleResult,
  type DeclaredOutcome,
  createBattle,
  setBattleStatus,
  updateBattleParticipant,
  type CreateBattleInput,
  type ParticipantPatch,
} from "@/lib/sync/battle-ops";
import { useCrusade } from "./useCrusade";
import { useAuth } from "./useAuth";
import type { Crusade, InlineBattle } from "@/types";

/** Read a single battle by id, derived from the parent crusade query. */
export function useBattle(
  crusadeId: string | undefined,
  battleId: string | undefined,
): {
  data: InlineBattle | undefined;
  crusade: Crusade | undefined;
  isLoading: boolean;
} {
  const { data: crusade, isLoading } = useCrusade(crusadeId);
  const battle = crusade && battleId
    ? (crusade.battles ?? []).find((b) => b.id === battleId)
    : undefined;
  return { data: battle, crusade, isLoading };
}

export function useCreateBattle(crusadeId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBattleInput) => {
      if (!user) throw new Error("Not signed in");
      return createBattle(crusadeId, user.googleId, input);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

/**
 * Persist a participant's battle record. The BattlePage keeps a local
 * draft and debounces calls to this, so no optimistic cache patching
 * is needed here (the draft IS the optimistic layer). We only refresh
 * the crusade query after the write settles.
 */
export function useUpdateBattleParticipant(
  crusadeId: string,
  battleId: string,
  participantGoogleId: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ParticipantPatch) =>
      updateBattleParticipant(crusadeId, battleId, participantGoogleId, patch),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

export function useSetBattleStatus(crusadeId: string, battleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: "draft" | "pending" | "verified" | "voided") =>
      setBattleStatus(crusadeId, battleId, status),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

/**
 * Apply battle results to the current user's canonical roster.
 * Returns a summary of XP awarded per unit.
 */
export function useApplyBattleResults(crusadeId: string, battleId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      return applyBattleResults(crusadeId, battleId, user.googleId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
      queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
    },
  });
}

export function useDeclareBattleResult(crusadeId: string, battleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (outcomes: DeclaredOutcome[]) =>
      declareBattleResult(crusadeId, battleId, outcomes),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

export function useConfirmBattleResult(crusadeId: string, battleId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      return confirmBattleResult(crusadeId, battleId, user.googleId);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}
