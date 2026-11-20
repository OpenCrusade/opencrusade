import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const addUnitSchema = z.object({
  name: z.string().min(1, "Required").max(200),
  datasheetName: z.string().min(1, "Required").max(200),
  pointsCost: z
    .string()
    .regex(/^\d+$/, "Whole number")
    .refine((s) => Number(s) > 0, "At least 1"),
  modelCount: z
    .string()
    .regex(/^\d+$/, "Whole number")
    .refine((s) => Number(s) > 0, "At least 1"),
  isCharacter: z.boolean(),
  notes: z.string().max(2000).optional(),
});

type AddUnitFormValues = z.infer<typeof addUnitSchema>;

export interface AddUnitFormProps {
  onClose: () => void;
  onSubmit: (values: {
    name: string;
    datasheetName: string;
    pointsCost: number;
    modelCount: number;
    isCharacter: boolean;
    notes?: string;
  }) => Promise<void>;
}

export function AddUnitForm({ onClose, onSubmit }: AddUnitFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddUnitFormValues>({
    resolver: zodResolver(addUnitSchema),
    defaultValues: {
      name: "",
      datasheetName: "",
      pointsCost: "100",
      modelCount: "5",
      isCharacter: false,
      notes: "",
    },
  });

  useEffect(() => {
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, []);

  const handleFormSubmit = async (values: AddUnitFormValues) => {
    setSubmitError(null);
    try {
      await onSubmit({
        name: values.name,
        datasheetName: values.datasheetName,
        pointsCost: Number(values.pointsCost),
        modelCount: Number(values.modelCount),
        isCharacter: values.isCharacter,
        notes: values.notes || undefined,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-unit-title"
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

        <h2
          id="add-unit-title"
          className="specimen-title text-[clamp(2rem,5vw,3.5rem)] mt-6 [&_em]:specimen-title-em"
        >
          New <em>crusade card</em>
        </h2>

        <form
          onSubmit={(e) => {
            void handleSubmit(handleFormSubmit)(e);
          }}
          className="mt-10 grid gap-6"
        >
          <Field
            label="Unit name"
            error={errors.name?.message}
            description="Your own name for this unit."
          >
            <input
              type="text"
              autoFocus
              data-testid="unit-name"
              {...register("name")}
              className="field"
            />
          </Field>

          <Field
            label="Datasheet"
            error={errors.datasheetName?.message}
            description="As named in your army list."
          >
            <input
              type="text"
              data-testid="unit-datasheet"
              {...register("datasheetName")}
              className="field"
            />
          </Field>

          <div className="grid grid-cols-2 gap-6">
            <Field
              label="Points cost"
              error={errors.pointsCost?.message}
            >
              <input
                type="number"
                min="1"
                data-testid="unit-points"
                {...register("pointsCost")}
                className="field"
              />
            </Field>
            <Field
              label="Model count"
              error={errors.modelCount?.message}
            >
              <input
                type="number"
                min="1"
                data-testid="unit-models"
                {...register("modelCount")}
                className="field"
              />
            </Field>
          </div>

          <Field
            label="CHARACTER?"
            description="Characters can reach Heroic and Legendary rank and hold up to 6 honours."
          >
            <label className="flex items-center gap-3 cursor-pointer font-mono text-[13px] text-ink mt-1">
              <input
                type="checkbox"
                {...register("isCharacter")}
                className="accent-accent w-4 h-4"
              />
              Yes, this unit is a CHARACTER
            </label>
          </Field>

          <Field label="Notes" description="Optional.">
            <textarea
              rows={3}
              {...register("notes")}
              className="field resize-y"
            />
          </Field>

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
              {isSubmitting ? "Saving…" : "Enroll unit"}
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
