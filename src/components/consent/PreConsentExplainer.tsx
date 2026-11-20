import { useEffect } from "react";
import type { ScopeExplainer } from "@/lib/consent/copy";

/**
 * Shown before Google's permission window, so the person knows what
 * they are about to be asked and to tick Google's box.
 */
export interface PreConsentExplainerProps {
  explainer: ScopeExplainer;
  /** The person agreed: open Google's window. */
  onContinue: () => void;
  onCancel: () => void;
}

export function PreConsentExplainer({ explainer, onContinue, onCancel }: PreConsentExplainerProps) {
  // Lock body scroll while open.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pre-consent-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto dialog-scrim p-3"
    >
      <div className="w-full max-w-xl dialog-panel">
        <h2 id="pre-consent-title" className="specimen-title m-0">
          {explainer.title}
        </h2>

        <ul className="mt-5 mb-0 p-0 list-none grid gap-2 leading-[1.5]">
          {explainer.willDo.map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden className="font-bold text-good">✓</span>
              <span>
                <span className="sr-only">The app can: </span>
                {item}
              </span>
            </li>
          ))}
          {explainer.cannotDo.map((item) => (
            <li key={item} className="flex gap-3 text-mute">
              <span aria-hidden className="font-bold">✕</span>
              <span>
                <span className="sr-only">The app cannot: </span>
                {item}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 mb-0 font-semibold">
          On Google's screen, tick the box, then Continue.
        </p>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-rule-strong">
          <button type="button" onClick={onCancel} className="btn">
            Not now
          </button>
          <button type="button" onClick={onContinue} className="btn btn-primary">
            Continue to Google
          </button>
        </div>
      </div>
    </div>
  );
}
