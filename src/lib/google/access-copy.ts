import { ACCESS_MODE } from "./scopes";

/**
 * Wording that depends on which storage permission this build asks
 * for. Kept together so the two never drift apart.
 */
const file = ACCESS_MODE === "file";

/** The label of the box on Google's permission screen. */
export const GOOGLE_BOX_LABEL = file
  ? "See, edit, create, and delete only the specific Google Drive files you use with this app"
  : "See, edit, create, and delete all your Google Sheets spreadsheets";

/** One or two sentences on what the permission really covers. */
export const ACCESS_SUMMARY = file
  ? "Google gives the app access only to crusade sheets it creates for you, or that you choose yourself in Google's file chooser the first time you open one. It cannot see any other file."
  : "Google words this as all your spreadsheets. The app only opens crusade sheets you create or join here, and gets no access to Drive, Docs or Gmail.";
