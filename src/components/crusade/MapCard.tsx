import { useRef, useState } from "react";
import { Card } from "@/components/ui/kit";
import { useSetCrusadeMap } from "@/hooks/useCrusade";
import { shrinkImage } from "@/lib/utils/image";
import type { Crusade } from "@/types";

/**
 * The campaign map: one picture. The GM uploads it and can replace or
 * remove it; everyone else sees it.
 */
export function MapCard({ crusade, isGm }: { crusade: Crusade; isGm: boolean }) {
  const setMap = useSetCrusadeMap(crusade.id);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const map = crusade.map;

  if (!map && !isGm) return null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const img = await shrinkImage(file);
      await setMap.mutateAsync({
        ...img,
        caption: map?.caption ?? "",
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Card
      label="Campaign map"
      title="Map"
      action={
        isGm && (
          <span className="flex flex-wrap items-center gap-2">
            <input
              ref={input}
              type="file"
              accept="image/*"
              className="sr-only"
              data-testid="map-file"
              aria-label="Map picture"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? "Saving…" : map ? "Replace map" : "Upload a map"}
            </button>
            {map && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Remove the map from this crusade?")) setMap.mutate(null);
                }}
              >
                Remove
              </button>
            )}
          </span>
        )
      }
    >
      {map ? (
        <>
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="block w-full p-0 border-0 bg-inset rounded-xl overflow-hidden cursor-zoom-in"
            aria-label="Open the map full size"
          >
            <img
              src={map.dataUrl}
              alt={map.caption || "Campaign map"}
              width={map.width}
              height={map.height}
              className="block w-full h-auto max-h-[520px] object-contain"
            />
          </button>
          <p className="m-0 text-xs text-mute">
            Updated{" "}
            {new Date(map.updatedAt).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </>
      ) : (
        <p className="m-0 text-mute text-[13px] max-w-[60ch]">
          Upload a picture of your campaign map. Every player sees it here.
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-bad text-[13px]">
          {error}
        </p>
      )}

      {zoomed && map && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Campaign map"
          className="fixed inset-0 z-50 dialog-scrim p-3 overflow-auto flex"
          onClick={() => setZoomed(false)}
        >
          <img
            src={map.dataUrl}
            alt={map.caption || "Campaign map"}
            className="m-auto max-w-none rounded-xl cursor-zoom-out"
            style={{ width: map.width }}
          />
        </div>
      )}
    </Card>
  );
}
