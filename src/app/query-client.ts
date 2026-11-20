import { MutationCache, QueryClient } from "@tanstack/react-query";
import { experimental_createQueryPersister } from "@tanstack/query-persist-client-core";
import { dexieAsyncStorage } from "@/lib/db/persister";
import { useToasts } from "@/stores/toasts";
import { userMessage } from "@/lib/utils/user-message";

/**
 * The one query client. Reads are local-first: a query returns what
 * this device holds and schedules a re-read of the sheet, so nothing
 * refetches on its own. Persisted to the device so a reload paints at
 * once.
 */
export const queryClient = new QueryClient({
  // A change that fails must never just snap back in silence.
  mutationCache: new MutationCache({
    onError: (err) => useToasts.getState().show(userMessage(err), "bad"),
  }),
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Run the query function on every mount: it answers from this
      // device immediately AND re-reads the sheet in the background.
      refetchOnMount: "always",
      retry: false,
      persister: experimental_createQueryPersister({
        storage: dexieAsyncStorage,
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
        buster: "v2", // bump to drop everything persisted by older versions
      }).persisterFn,
    },
  },
});
