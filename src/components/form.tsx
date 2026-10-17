// Form building blocks. Inputs are large, since many helpers and parents use phones.
import type { ReactNode } from "react";

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-zinc-900 outline-none focus:border-accent dark:bg-zinc-900 dark:text-zinc-100";

type FieldProps = {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  errors?: string[];
  hint?: string;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "tel" | "url";
  required?: boolean;
  autoFocus?: boolean;
};

export function Field({ label, name, type = "text", defaultValue, errors, hint, ...rest }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} className={inputClass} {...rest} />
      {hint && <span className="text-muted">{hint}</span>}
      <Errors errors={errors} />
    </label>
  );
}

export function TextArea({ label, name, defaultValue, errors, hint, rows = 4 }: FieldProps & { rows?: number }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <textarea name={name} defaultValue={defaultValue} rows={rows} className={inputClass} />
      {hint && <span className="text-muted">{hint}</span>}
      <Errors errors={errors} />
    </label>
  );
}

export function Select({
  label,
  name,
  defaultValue,
  errors,
  children,
}: Pick<FieldProps, "label" | "name" | "defaultValue" | "errors"> & { children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      <select name={name} defaultValue={defaultValue} className={inputClass}>
        {children}
      </select>
      <Errors errors={errors} />
    </label>
  );
}

export function Errors({ errors }: { errors?: string[] }) {
  return errors?.map((e) => (
    <span key={e} className="text-red-600">
      {e}
    </span>
  ));
}

export function Message({ text }: { text?: string }) {
  return text ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{text}</p> : null;
}

export const buttonClass =
  "inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-line px-4 py-2.5 font-medium hover:bg-black/5 disabled:opacity-50";
