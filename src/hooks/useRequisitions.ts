import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  applyGmAssignments,
  detachRosterFromCrusade,
  setRosterFactionState,
  gmSetRosterFactionState,
  gmAdjustRequisitionPoints,
  spendRequisition,
  undoRequisition,
  updateEquipment,
  type SpendRequisitionInput,
} from "@/lib/sync/roster-ops";
import {
  assignBlessingOrBurden,
  removePlayer,
  type AssignBlessingInput,
} from "@/lib/sync/crusade-ops";
import { useAuth } from "./useAuth";

function invalidateRoster(
  queryClient: ReturnType<typeof useQueryClient>,
  rosterId: string,
) {
  queryClient.invalidateQueries({ queryKey: ["roster", rosterId] });
  queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
}

export function useSpendRequisition(rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SpendRequisitionInput) =>
      spendRequisition(rosterId, input),
    onSettled: () => invalidateRoster(queryClient, rosterId),
  });
}

/** Take back a spent requisition (refund and reverse). */
export function useUndoRequisition(rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => undoRequisition(rosterId, entryId),
    onSettled: () => invalidateRoster(queryClient, rosterId),
  });
}

export function useApplyGmAssignments(rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      assignments: Parameters<typeof applyGmAssignments>[1],
    ) => applyGmAssignments(rosterId, assignments),
    onSettled: () => invalidateRoster(queryClient, rosterId),
  });
}

export function useUpdateEquipment(rosterId: string, unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (equipment: string[]) =>
      updateEquipment(rosterId, unitId, equipment),
    onSettled: () => invalidateRoster(queryClient, rosterId),
  });
}

/** GM corrects a player's trackers (writes the crusade's copy). */
export function useGmSetFactionState(crusadeId: string, rosterId: string) {
  const queryClient = useQueryClient();
  const before = useRef<Record<string, unknown> | undefined>(undefined);
  return useMutation({
    mutationFn: (state: Record<string, unknown>) =>
      gmSetRosterFactionState(crusadeId, rosterId, {
        before: before.current,
        after: state,
      }),
    onMutate: async (state) => {
      await queryClient.cancelQueries({ queryKey: ["roster", rosterId] });
      const prev = queryClient.getQueryData<{ factionState?: Record<string, unknown> }>([
        "roster",
        rosterId,
      ]);
      // What the GM was looking at when they made this change.
      before.current = prev?.factionState;
      queryClient.setQueryData(
        ["roster", rosterId],
        (old: Record<string, unknown> | undefined) =>
          old ? { ...old, factionState: state } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(["roster", rosterId], ctx.prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
      queryClient.invalidateQueries({ queryKey: ["crusade-mirrors", crusadeId] });
      invalidateRoster(queryClient, rosterId);
    },
  });
}

/** GM corrects a player's Requisition points. */
export function useGmAdjustRP(crusadeId: string, rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (delta: number) => gmAdjustRequisitionPoints(crusadeId, rosterId, delta),
    onMutate: async (delta) => {
      await queryClient.cancelQueries({ queryKey: ["roster", rosterId] });
      const prev = queryClient.getQueryData<{ requisitionPoints: number }>(["roster", rosterId]);
      if (prev) {
        queryClient.setQueryData(["roster", rosterId], {
          ...prev,
          requisitionPoints: Math.max(0, Math.min(10, prev.requisitionPoints + delta)),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(["roster", rosterId], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
      invalidateRoster(queryClient, rosterId);
    },
  });
}

export function useSetFactionState(rosterId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (state: Record<string, unknown>) =>
      setRosterFactionState(rosterId, state),
    // Optimistic: tracker clicks (bump, toggle, text) render instantly;
    // the Drive write settles in the background.
    onMutate: async (state) => {
      await queryClient.cancelQueries({ queryKey: ["roster", rosterId] });
      const prev = queryClient.getQueryData(["roster", rosterId]);
      queryClient.setQueryData(
        ["roster", rosterId],
        (old: Record<string, unknown> | undefined) =>
          old ? { ...old, factionState: state } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) {
        queryClient.setQueryData(["roster", rosterId], ctx.prev);
      }
    },
    onSettled: () => invalidateRoster(queryClient, rosterId),
  });
}

export function useDetachRoster(crusadeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rosterId: string) =>
      detachRosterFromCrusade(crusadeId, rosterId),
    onSettled: (_r, _e, rosterId) => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
      invalidateRoster(queryClient, rosterId);
    },
  });
}

export function useAssignBlessing(crusadeId: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AssignBlessingInput) => {
      if (!user) throw new Error("Not signed in");
      return assignBlessingOrBurden(crusadeId, user.googleId, input);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}

export function useRemovePlayer(crusadeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (playerGoogleId: string) =>
      removePlayer(crusadeId, playerGoogleId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crusade", crusadeId] });
    },
  });
}
