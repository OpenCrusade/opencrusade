/**
 * Single source of truth for Google OAuth scopes.
 *
 * Each crusade is one Google Sheet. The app requests the minimum that
 * makes that work:
 *
 *   - `openid` + `email`: who is signed in. A player's tab is locked
 *     to their email. `profile` is NOT requested; display names are
 *     set in-app.
 *   - one storage scope, requested only when the user creates or opens
 *     a crusade. Which one is a build setting (VITE_GOOGLE_ACCESS):
 *
 *       "file" (default): `drive.file`. Non-sensitive and per file: the
 *         app can only reach sheets it created or that the user chose
 *         once in Google's file chooser. Needs the Picker API, an API
 *         key and the project number (see lib/google/picker.ts).
 *       "sheets": `spreadsheets`. Opens a crusade's sheet by its id
 *         with no extra step. Google classes it as sensitive and words
 *         it as access to all the user's spreadsheets. The automated
 *         browser tests run in this mode, because Google's chooser
 *         can't be driven by a test.
 *
 * It never requests the full Drive scopes (`drive`, `drive.readonly`),
 * and sharing the spreadsheet is always done by the GM in Google
 * Sheets itself.
 */

/** Which storage permission this build asks for. */
export const ACCESS_MODE: "sheets" | "file" =
  import.meta.env.VITE_GOOGLE_ACCESS === "sheets" ? "sheets" : "file";

export const SCOPE_IDENTITY = ["openid", "email"] as const;

/** Sheets scope: read/write spreadsheets the user can already access. */
export const SCOPE_SPREADSHEETS = "https://www.googleapis.com/auth/spreadsheets" as const;

/** Initial scope set requested at sign-in. Identity only. */
export const INITIAL_SCOPES: readonly string[] = SCOPE_IDENTITY;

/** Per-file scope: only sheets the app created or the user picked. */
export const SCOPE_DRIVE_FILE = "https://www.googleapis.com/auth/drive.file" as const;

/** The one storage scope this build uses. */
export const SCOPE_STORAGE: string =
  ACCESS_MODE === "file" ? SCOPE_DRIVE_FILE : SCOPE_SPREADSHEETS;

/**
 * Google normally hands back every permission the user has ever given
 * this app along with the ones asked for. In "file" mode that would
 * quietly keep an older, broader Google Sheets grant alive, so there
 * the app takes only what it asks for.
 */
export const INCLUDE_GRANTED = ACCESS_MODE !== "file";

/** Requested incrementally at create/open crusade. */
export const CRUSADE_SCOPES: readonly string[] = [SCOPE_STORAGE];

/** All scopes the app might ever request. */
export const ALL_SCOPES: readonly string[] = [...SCOPE_IDENTITY, SCOPE_STORAGE];
