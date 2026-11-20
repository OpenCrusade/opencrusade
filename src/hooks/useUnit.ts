import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  adjustUnitXp,
  applyScar,
  awardHonour,
  removeHonour,
  removeScar,
  resolveOoA,
  updateUnitNotes,
  updateUnitBasics,
  setBonusHonours,
  type UnitBasics,
  type ApplyScarInput,
  type AwardHonourInput,
  type ResolveOoAInput,
} from "@/lib/sync/roster-ops";
import type { CrusadeCard, PlayerRoster } from "@/types";
import { useRoster } from "./useRoster";

/**
 * Read a single unit from a roster. Derives from the roster query so
 * it stays in sync with any roster-level revalidation automatically.
 */
export function useUnit(rosterId: string | undefined, unitId: string | undefined) {
  const { data: roster, isLoading } = useRoster(rosterId);
  const unit: CrusadeCard | undefined = roster && unitId
    ? roster.units.find((u) => u.id === unitId)
    : undefined;
  return { data: unit, roster, isLoading };
}

// ── Unit-edit mutations (owner only) ──────────────────────────────

/**
 * Optimistically patch the roster's units array in the TQ cache so
 * the UI flips before Drive responds. Returns a snapshot for
 * rollback.
 */
function optimisticUnitPatch(
  queryClient: ReturnType<typeof useQueryClient>,
  rosterId: string,
  unitId: string,
  patch: (u: CrusadeCard) => CrusadeCard,
): { previous: PlayerRoster | undefined } {
  const key = ["roster", rosterId] as const;
  const previous = queryClient.getQueryData<PlayerRoster | undefined>(key);
  if (previous) {
    queryClient.setQueryData<PlayerRoster>(key, {
      ...previous,
      units: previous.units.map((u) =>
        u.id === unitId ? patch(u) : u,
      ),
    });
  }
  return { previous };
}

function rollback(
  queryClient: ReturnType<typeof useQueryClient>,
  rosterId: string,
  ctx: { previous: PlayerRoster | undefined } | undefined,
) {
  if (ctx?.previous) {
    queryClient.setQueryData(["roster", rosterId], ctx.previous);
  }
}

function settle(
  queryClient: ReturnType<typeof useQueryClient>,
  rosterId: string,
) {
  queryClient.invalidateQueries({ queryKey: ["roster", rosterId] });
  queryClient.invalidateQueries({ queryKey: ["my-rosters"] });
}

export function useAdjustUnitXp(rosterId: string, unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (delta: number) => adjustUnitXp(rosterId, unitId, delta),
    onMutate: (delta) =>
      optimisticUnitPatch(queryClient, rosterId, unitId, (u) => ({
        ...u,
        experiencePoints: Math.max(0, u.experiencePoints + delta),
      })),
    onError: (_e, _v, ctx) => rollback(queryClient, rosterId, ctx),
    onSettled: () => settle(queryClient, rosterId),
  });
}

export function useAwardHonour(rosterId: string, unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AwardHonourInput) =>
      awardHonour(rosterId, unitId, input),
    onSettled: () => settle(queryClient, rosterId),
  });
}

export function useRemoveHonour(rosterId: string, unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (honourId: string) =>
      removeHonour(rosterId, unitId, honourId),
    onMutate: (honourId) =>
      optimisticUnitPatch(queryClient, rosterId, unitId, (u) => ({
        ...u,
        battleHonours: u.battleHonours.filter((h) => h.id !== honourId),
      })),
    onError: (_e, _v, ctx) => rollback(queryClient, rosterId, ctx),
    onSettled: () => settle(queryClient, rosterId),
  });
}

export function useApplyScar(rosterId: string, unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplyScarInput) => applyScar(rosterId, unitId, input),
    onSettled: () => settle(queryClient, rosterId),
  });
}

export function useRemoveScar(rosterId: string, unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scarId: string) => removeScar(rosterId, unitId, scarId),
    onMutate: (scarId) =>
      optimisticUnitPatch(queryClient, rosterId, unitId, (u) => ({
        ...u,
        battleScars: u.battleScars.filter((s) => s.id !== scarId),
      })),
    onError: (_e, _v, ctx) => rollback(queryClient, rosterId, ctx),
    onSettled: () => settle(queryClient, rosterId),
  });
}

/** Change a unit's name, datasheet, model count, points or type. */
export function useUpdateUnitBasics(rosterId: string, unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (basics: UnitBasics) => updateUnitBasics(rosterId, unitId, basics),
    onSettled: () => settle(queryClient, rosterId),
  });
}

/** Set how many Battle Honours came from mission rewards. */
export function useSetBonusHonours(rosterId: string, unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (count: number) => setBonusHonours(rosterId, unitId, count),
    onMutate: (count) =>
      optimisticUnitPatch(queryClient, rosterId, unitId, (u) => ({
        ...u,
        bonusHonours: Math.max(0, Math.min(6, count)),
      })),
    onError: (_e, _v, ctx) => rollback(queryClient, rosterId, ctx),
    onSettled: () => settle(queryClient, rosterId),
  });
}

/** Resolve an Out of Action test (d6, scar-or-honour-loss on 1). */
export function useResolveOoA(rosterId: string, unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ResolveOoAInput) =>
      resolveOoA(rosterId, unitId, input),
    onSettled: () => settle(queryClient, rosterId),
  });
}

export function useUpdateUnitNotes(rosterId: string, unitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notes: string) => updateUnitNotes(rosterId, unitId, notes),
    onMutate: (notes) =>
      optimisticUnitPatch(queryClient, rosterId, unitId, (u) => ({
        ...u,
        notes,
      })),
    onError: (_e, _v, ctx) => rollback(queryClient, rosterId, ctx),
    onSettled: () => settle(queryClient, rosterId),
  });
}
