/**
 * What the app says before it sends someone to Google's permission
 * screen: what the permission is for, and what it does not cover.
 */

import { ACCESS_MODE } from "@/lib/google/scopes";

export interface ScopeExplainer {
  title: string;
  /** What the app will do with the permission. */
  willDo: string[];
  /** What it cannot do. */
  cannotDo: string[];
}

export const SHEETS_EXPLAINER: ScopeExplainer = {
  title: "Allow access to your crusade's sheet",
  willDo: [
    "Create a spreadsheet for a crusade you start, and keep it up to date.",
    ACCESS_MODE === "file"
      ? "Open a crusade's sheet that you choose, and write to your own tab."
      : "Open a crusade's sheet shared with you, and write to your own tab.",
  ],
  cannotDo: [
    ACCESS_MODE === "file"
      ? "See or change any other file, or your Gmail, Calendar or contacts."
      : "See your Drive files, Gmail, Calendar or contacts.",
  ],
};
