/**
 * Remember where a signed-out visitor was heading (e.g. a crusade link
 * a GM sent them) so sign-in can take them there afterwards.
 */
const KEY = "opencrusade:return-to";

export function rememberReturnTo(path: string): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // storage unavailable, they land on the dashboard instead
  }
}

/** Read and clear the remembered path. Only same-app paths are honoured. */
export function takeReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
}
