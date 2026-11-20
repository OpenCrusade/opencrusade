/**
 * Google's file chooser, used in "file" access mode (the default; the
 * `drive.file` permission).
 *
 * Under that permission the app can open a spreadsheet only if it
 * created it or the user has chosen it here once. So the first time a
 * player opens a crusade someone else created, they are shown this
 * chooser with just that one sheet in it and press Select. Google then
 * remembers the choice for this app and account.
 *
 * Needs, in the Google Cloud project: the Google Picker API enabled,
 * an API key (VITE_GOOGLE_API_KEY) and the project NUMBER
 * (VITE_GOOGLE_APP_ID). Google requires the project number for this
 * permission; with the wrong one the pick appears to work but the
 * sheet still can't be opened.
 */

import { getAccessToken, useAppStore } from "@/stores/app-store";

const API_KEY = (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined)?.trim() ?? "";
const APP_ID = (import.meta.env.VITE_GOOGLE_APP_ID as string | undefined)?.trim() ?? "";

/** Is this build set up to show the chooser? */
export function pickerConfigured(): boolean {
  return API_KEY !== "" && APP_ID !== "";
}

/* The slice of Google's picker library this file uses. */
interface PickerView {
  setFileIds(ids: string): PickerView;
  setMode(mode: unknown): PickerView;
  setMimeTypes(types: string): PickerView;
  setOwnedByMe(mine: boolean): PickerView;
  setLabel?(label: string): PickerView;
}
interface PickerBuilder {
  addView(view: PickerView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(cb: (data: Record<string, unknown>) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}
interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: unknown) => PickerView;
  ViewId: { SPREADSHEETS: unknown };
  DocsViewMode: { LIST: unknown };
  Response: { ACTION: string; DOCUMENTS: string };
  Action: { PICKED: string; CANCEL: string };
}
interface Gapi {
  load(name: string, done: { callback: () => void; onerror: () => void } | (() => void)): void;
}

const win = () =>
  window as unknown as { gapi?: Gapi; google?: { picker?: PickerNamespace } };

let loading: Promise<PickerNamespace> | null = null;

/** Load Google's picker library the first time it is needed. */
function loadPicker(): Promise<PickerNamespace> {
  loading ??= new Promise<PickerNamespace>((resolve, reject) => {
    const fail = () => {
      loading = null;
      reject(new Error("Couldn't load Google's file chooser. Check your connection and try again."));
    };
    const ready = () => {
      const gapi = win().gapi;
      if (!gapi) return fail();
      gapi.load("picker", {
        callback: () => {
          const picker = win().google?.picker;
          if (picker) resolve(picker);
          else fail();
        },
        onerror: fail,
      });
    };
    if (win().gapi) return ready();
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = ready;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Show the chooser. With an id, it lists just that spreadsheet; with
 * none, every spreadsheet the user owns or has been given, to browse.
 * Resolves the chosen spreadsheet's id, or null if the chooser was
 * closed.
 */
export async function pickSheet(spreadsheetId?: string): Promise<string | null> {
  if (!pickerConfigured()) {
    throw new Error(
      "This copy of the app isn't set up to choose files (its API key or project number is missing). Whoever runs it needs to finish the set-up in the README.",
    );
  }
  const token = getAccessToken(useAppStore.getState());
  if (!token) {
    throw new Error("Your Google session has expired. Press Reconnect at the top of the page, then try again.");
  }
  const picker = await loadPicker();
  return new Promise<string | null>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.SPREADSHEETS)
      .setMimeTypes("application/vnd.google-apps.spreadsheet")
      // Thumbnails aren't available under this permission.
      .setMode(picker.DocsViewMode.LIST);
    if (spreadsheetId) view.setFileIds(spreadsheetId);
    // When browsing, also offer a tab of sheets other people have
    // shared: a player's crusade is one of those, and Google's main
    // list tends to show only sheets the person has opened before.
    let shared: PickerView | null = null;
    if (!spreadsheetId) {
      shared = new picker.DocsView(picker.ViewId.SPREADSHEETS)
        .setMimeTypes("application/vnd.google-apps.spreadsheet")
        .setMode(picker.DocsViewMode.LIST)
        .setOwnedByMe(false);
      shared.setLabel?.("Shared with me");
    }
    const builder = new picker.PickerBuilder().addView(view);
    if (shared) builder.addView(shared);
    builder
      .setOAuthToken(token)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setTitle(spreadsheetId ? "Select this crusade's sheet" : "Select a crusade's sheet")
      .setCallback((data) => {
        const action = data[picker.Response.ACTION];
        if (action === picker.Action.PICKED) {
          const docs = data[picker.Response.DOCUMENTS] as { id?: string }[] | undefined;
          const chosen = (docs ?? []).map((d) => d.id).filter((id): id is string => !!id);
          resolve(
            spreadsheetId
              ? (chosen.includes(spreadsheetId) ? spreadsheetId : null)
              : (chosen[0] ?? null),
          );
        } else if (action === picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build()
      .setVisible(true);
  });
}
