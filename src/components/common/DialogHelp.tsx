import { useEffect } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard and screen-reader behaviour for every dialog in the app,
 * in one place: when a dialog opens, focus moves into it and stays
 * there; Escape presses its Cancel or Close button; when it closes,
 * focus goes back to where it was. A dialog without a label is named
 * after its heading.
 */
export function DialogHelp() {
  useEffect(() => {
    const returnTo = new WeakMap<Element, HTMLElement | null>();
    let labelSeq = 0;

    const dialogs = () =>
      [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
    const top = () => dialogs().at(-1);

    const opened = (d: HTMLElement) => {
      returnTo.set(d, document.activeElement as HTMLElement | null);
      d.setAttribute("aria-modal", "true");
      if (!d.hasAttribute("aria-label") && !d.hasAttribute("aria-labelledby")) {
        const heading = d.querySelector<HTMLElement>("h1, h2, h3");
        if (heading) {
          heading.id ||= `dialog-title-${++labelSeq}`;
          d.setAttribute("aria-labelledby", heading.id);
        }
      }
      // Leave focus alone if the dialog already placed it (autoFocus).
      if (!d.contains(document.activeElement)) {
        d.querySelector<HTMLElement>(FOCUSABLE)?.focus();
      }
    };

    const watch = new MutationObserver((changes) => {
      for (const change of changes) {
        for (const node of change.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches('[role="dialog"]')) opened(node);
          node.querySelectorAll<HTMLElement>('[role="dialog"]').forEach(opened);
        }
        for (const node of change.removedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const closed = node.matches('[role="dialog"]')
            ? node
            : node.querySelector<HTMLElement>('[role="dialog"]');
          if (!closed) continue;
          const back = returnTo.get(closed);
          if (back?.isConnected) back.focus();
        }
      }
    });
    watch.observe(document.body, { childList: true, subtree: true });

    const onKey = (e: KeyboardEvent) => {
      const d = top();
      if (!d) return;
      if (e.key === "Escape") {
        const close = [...d.querySelectorAll<HTMLButtonElement>("button:not([disabled])")].find(
          (b) => /^(cancel|close|not now|done|back)$/i.test(b.textContent?.trim() ?? ""),
        );
        if (close) {
          e.preventDefault();
          close.click();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...d.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!d.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      watch.disconnect();
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return null;
}
