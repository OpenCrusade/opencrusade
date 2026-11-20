import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { parseRosterFile, type ImportedRoster } from "@/lib/import/roster-import";

const newRosterSchema = z.object({
  factionName: z.string().min(2, "At least 2 characters").max(200),
  name: z.string().max(200).optional(),
});

type NewRosterFormValues = z.infer<typeof newRosterSchema>;

export interface NewRosterFormProps {
  onClose: () => void;
  onSubmit: (
    values: NewRosterFormValues & { units?: ImportedRoster["units"] },
  ) => Promise<void>;
  /** Set when the roster will go straight into a crusade. */
  crusadeName?: string;
}

export function NewRosterForm({ onClose, onSubmit, crusadeName }: NewRosterFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportedRoster | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<NewRosterFormValues>({
    resolver: zodResolver(newRosterSchema),
    defaultValues: { factionName: "", name: "" },
  });

  useEffect(() => {
    const o = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = o;
    };
  }, []);

  const handleFormSubmit = async (values: NewRosterFormValues) => {
    setSubmitError(null);
    try {
      await onSubmit({ ...values, ...(imported ? { units: imported.units } : {}) });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto items-start dialog-scrim p-3"
    >
      <div className="relative w-full max-w-2xl dialog-panel">
        <div className="flex items-start justify-between gap-8">
          <span />
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn-link"
          >
            Cancel
          </button>
        </div>

        <h2 className="specimen-title mt-0">Build a new force</h2>

        <p className="mt-2 text-mute max-w-[56ch] leading-[1.55]">
          {crusadeName
            ? `This creates your roster and adds it to ${crusadeName}.`
            : "A roster belongs to one crusade. It stays on this device until you attach it."}
        </p>

        <form
          onSubmit={(e) => {
            void handleSubmit(handleFormSubmit)(e);
          }}
          className="mt-6 grid gap-5"
        >
          <Field
            label="Faction"
            error={errors.factionName?.message}
            description="Your army."
          >
            <input
              type="text"
              autoFocus
              placeholder="e.g. The Ashen Host"
              {...register("factionName")}
              className="field"
            />
          </Field>

          <Field
            label="Banner name (optional)"
            error={errors.name?.message}
            description="A name for this force, if it has one."
          >
            <input
              type="text"
              {...register("name")}
              className="field"
            />
          </Field>

          <div className="inset-panel p-4 grid gap-2">
            <span className="label-mono">Import an army list (optional)</span>
            <span className="text-mute text-[13px] leading-[1.5]">
              Start from a list you built in New Recruit or BattleScribe. Export
              it as .ros, .rosz or JSON and choose the file. Unit names, points,
              model counts and wargear come across; you can also add units by
              hand afterwards.
            </span>
            <input
              type="file"
              accept=".ros,.rosz,.json,application/json,text/xml,application/xml"
              data-testid="roster-import-file"
              aria-label="Army list file"
              ref={fileInput}
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setFileName(file?.name ?? null);
                setImportError(null);
                setImported(null);
                if (!file) return;
                try {
                  const r = await parseRosterFile(file);
                  setImported(r);
                  if (!getValues("factionName") && r.factionName) {
                    setValue("factionName", r.factionName, { shouldValidate: true });
                  }
                  if (!getValues("name") && r.name) {
                    setValue("name", r.name.slice(0, 200), { shouldValidate: true });
                  }
                } catch (err) {
                  setImportError(err instanceof Error ? err.message : String(err));
                }
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
                {fileName ? "Choose a different file" : "Choose a list file"}
              </button>
              <span className="text-[13px] text-mute truncate">
                {fileName ?? "No file chosen"}
              </span>
            </div>
            {imported && (
              <span className="font-semibold" data-testid="roster-import-summary">
                {imported.units.length} unit{imported.units.length === 1 ? "" : "s"},{" "}
                {imported.points} pts
                {imported.name ? ` from "${imported.name}"` : ""}
              </span>
            )}
            {importError && (
              <span role="alert" className="text-bad text-[13px]">
                {importError}
              </span>
            )}
          </div>

          {submitError && (
            <div role="alert" className="text-bad text-[13px] leading-[1.5]">
              <strong className="font-semibold">Failed:</strong> {submitError}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-primary"
            >
              {isSubmitting ? "Creating…" : "Create roster"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  description,
  error,
  children,
}: {
  label: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <span className="label-mono">{label}</span>
      {description && (
        <span className="text-mute text-[13px] leading-[1.5]">
          {description}
        </span>
      )}
      {children}
      {error && (
        <span className="font-mono text-[13px] text-bad mt-1">{error}</span>
      )}
    </div>
  );
}
