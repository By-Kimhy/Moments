"use client";

import { useActionState } from "react";
import { Errors, Message, buttonClass } from "@/components/form";
import type { FormState } from "@/lib/api";

/** A file input and a submit button, for photo and KHQR uploads. */
export function UploadForm({
  action,
  name,
  label,
  multiple = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  name: string;
  label: string;
  multiple?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input
        type="file"
        name={name}
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        required
        className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-transparent file:px-3 file:py-2"
      />
      <Errors errors={state?.errors?.[name]} />
      <Message text={state?.message} />
      <button className={buttonClass} disabled={pending}>
        {pending ? "…" : label}
      </button>
    </form>
  );
}
