import { parseSpreadsheetId } from "@/lib/google/sheets";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { ACCESS_MODE } from "@/lib/google/scopes";
import { userMessage } from "@/lib/utils/user-message";
import { useNavigate } from "react-router-dom";
import { useCreateCrusade } from "@/hooks/useCrusade";

/**
 * "New crusade" modal form. Shown after the pre-consent explainer and
 * the Google Sheets permission. Creates the crusade's spreadsheet,
 * saves a local copy and goes to the crusade page.
 */

/**
 * Keep numeric inputs as strings in the form, parse on submit. Avoids
 * react-hook-form / Zod-v4's input-vs-output type mismatch with
 * `z.coerce.number()`.
 */
const newCrusadeSchema = z.object({
  name: z.string().min(2, "At least 2 characters").max(200),
  packId: z.string().max(80),
  supplyLimit: z
    .string()
    .regex(/^\d+$/, "Must be a whole number")
    .refine((s) => Number(s) >= 500, "Most crusades start at 1000+ points")
    .refine((s) => Number(s) <= 5000, "Max 5000 points"),
  startingRP: z
    .string()
    .regex(/^\d+$/, "Must be a whole number")
    .refine((s) => Number(s) <= 20, "Max 20"),
  gmName: z.string().max(80),
  existingSheet: z
    .string()
    .max(500)
    .refine(
      (s) => s.trim() === "" || parseSpreadsheetId(s) !== null,
      "Paste a Google Sheets link, or leave this empty",
    ),
});

type NewCrusadeFormValues = z.infer<typeof newCrusadeSchema>;

export interface NewCrusadeFormProps {
  onClose: () => void;
}

export function NewCrusadeForm({ onClose }: NewCrusadeFormProps) {
  const navigate = useNavigate();
  const createMutation = useCreateCrusade();
  const { user } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewCrusadeFormValues>({
    resolver: zodResolver(newCrusadeSchema),
    defaultValues: {
      name: "",
      gmName: user?.displayName ?? "",
      packId: "",
      supplyLimit: "1000",
      startingRP: "5",
      existingSheet: "",
    },
  });

  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, []);

  const onSubmit = async (values: NewCrusadeFormValues) => {
    setSubmitError(null);
    try {
      const crusade = await createMutation.mutateAsync({
        name: values.name,
        gmName: values.gmName.trim() || undefined,
        packId: values.packId.trim(),
        supplyLimit: Number(values.supplyLimit),
        startingRP: Number(values.startingRP),
        existingSheet: values.existingSheet.trim() || undefined,
      });
      navigate(`/crusades/${crusade.id}`);
    } catch (err) {
      setSubmitError(userMessage(err));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-crusade-title"
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto items-start dialog-scrim p-3"
    >
      <div className="relative w-full max-w-3xl dialog-panel">
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

        <h2
          id="new-crusade-title"
          className="specimen-title text-[clamp(2rem,5vw,3.5rem)] mt-6 [&_em]:specimen-title-em"
        >
          Begin a <em>new crusade</em>
        </h2>

        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="mt-10 grid gap-6 max-w-[600px]"
        >
          <Field
            label="Crusade name"
            error={errors.name?.message}
            description="Visible to every player."
          >
            <input
              type="text"
              autoFocus
              placeholder="e.g. The Varn Reach campaign"
              {...register("name")}
              className="field"
            />
          </Field>

          <Field
            label="Your name in this crusade"
            error={errors.gmName?.message}
            description="What your players see you as."
          >
            <input type="text" {...register("gmName")} className="field" />
          </Field>

          <Field
            label="Campaign pack or setting (optional)"
            error={errors.packId?.message}
            description="The mission pack or book your group is playing, if any. Only a label."
          >
            <input type="text" {...register("packId")} className="field" />
          </Field>

          <div className="grid grid-cols-2 gap-6">
            <Field
              label="Supply limit"
              error={errors.supplyLimit?.message}
              description="Points limit per player roster."
            >
              <input
                type="number"
                {...register("supplyLimit")}
                className="field"
              />
            </Field>
            <Field
              label="Starting RP"
              error={errors.startingRP?.message}
              description="Each player begins with this many Requisition Points."
            >
              <input
                type="number"
                {...register("startingRP")}
                className="field"
              />
            </Field>
          </div>

          {ACCESS_MODE === "sheets" && (
          <Field
            label="Existing Google Sheet (optional)"
            error={errors.existingSheet?.message}
            description="Leave empty to create a new sheet. Or paste the link of a blank sheet you own. Handy if you've already shared it with your group."
          >
            <input
              type="text"
              data-testid="existing-sheet"
              placeholder="https://docs.google.com/spreadsheets/d/…"
              {...register("existingSheet")}
              className="field"
            />
          </Field>
          )}

          <p className="m-0 text-mute text-[13px]">
            This creates a Google Sheet in your Google account.
          </p>

          {submitError && (
            <div className="border border-bad text-bad p-4 font-mono text-[13px] leading-[1.5]">
              <strong className="font-semibold">Failed:</strong> {submitError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-rule-strong">
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
              {isSubmitting ? "Creating…" : "Begin crusade"}
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
