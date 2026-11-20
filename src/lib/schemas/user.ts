import { z } from "zod";

/**
 * Shared identity schema. Extracted here so both `crusade.ts` and
 * `roster.ts` can depend on it without forming a circular import.
 */
export const googleUserSchema = z.object({
  googleId: z.string(),
  email: z.string().email(),
  displayName: z.string().max(200),
});

export type GoogleUser = z.infer<typeof googleUserSchema>;
