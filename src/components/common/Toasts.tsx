import { useToasts } from "@/stores/toasts";

/** Messages about things that happened out of sight: a failed save, a new version. */
export function Toasts() {
  const { list, dismiss } = useToasts();
  if (list.length === 0) return null;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 pointer-events-none p-3 grid gap-2 justify-items-center"
      aria-live="polite"
    >
      {list.map((t) => (
        <div
          key={t.id}
          role={t.tone === "bad" ? "alert" : "status"}
          className={`pointer-events-auto card px-4 py-3 flex flex-wrap items-center gap-3 max-w-[min(42rem,100%)] shadow-lg border ${
            t.tone === "bad" ? "border-bad" : "border-rule-strong"
          }`}
        >
          <p className="m-0 leading-[1.4] flex-1 min-w-[12rem]">{t.text}</p>
          {t.action && (
            <button type="button" className="btn btn-primary btn-sm" onClick={t.action.run}>
              {t.action.label}
            </button>
          )}
          <button type="button" className="btn-link" onClick={() => dismiss(t.id)}>
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
