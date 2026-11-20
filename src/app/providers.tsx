import { QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import type { ReactNode } from "react";
import { getGoogleClientId } from "@/lib/google/auth";
import { queryClient } from "./query-client";

/** Root providers: Google sign-in and the query client. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={getGoogleClientId()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </GoogleOAuthProvider>
  );
}
