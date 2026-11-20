/**
 * Turn any thrown value into a sentence a player can act on. Errors
 * the app raises itself already read that way; this catches the rest
 * (validation dumps, browser errors) so none of them reach the page.
 */
export function userMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "ZodError") {
      return "That couldn't be saved because something in it isn't valid. Check what you entered (very long names or notes are the usual cause) and try again.";
    }
    if (err.name === "TypeError" && /fetch|network/i.test(err.message)) {
      return "Couldn't reach the internet. Check your connection and try again.";
    }
    if (err.name === "QuotaExceededError") {
      return "This device is out of storage space for the app. Free some space and try again.";
    }
    if (err.message && err.message.length < 400 && !/^\s*[[{]/.test(err.message)) {
      return err.message;
    }
  }
  return "Something went wrong. Try again; if it keeps happening, reload the page.";
}
