"use client";

import { useActionState } from "react";
import { deleteAccount, updateAccount } from "@/app/actions/account";
import { Errors, Field, Message, Select, buttonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";

type T = Messages["account"];

export function AccountForm({ name, language, t }: { name: string; language: "KM" | "EN"; t: T }) {
  const [state, action, pending] = useActionState(updateAccount, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label={t.name} name="name" defaultValue={state?.values?.name ?? name} errors={state?.errors?.name} required />
      <Select label={t.language} name="language" defaultValue={state?.values?.language ?? language}>
        <option value="KM">ខ្មែរ</option>
        <option value="EN">English</option>
      </Select>
      <Message text={state?.message} />
      {state?.done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t.saved}</p>}
      <button className={`${buttonClass} self-start`} disabled={pending}>
        {t.save}
      </button>
    </form>
  );
}

export function DeleteAccountForm({ t }: { t: T }) {
  const [state, action, pending] = useActionState(deleteAccount, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t.confirm}</span>
        <input name="confirm" autoComplete="off" className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base dark:bg-zinc-900" required />
        <Errors errors={state?.errors?.confirm} />
      </label>
      <Message text={state?.message} />
      <button className="self-start rounded-lg bg-red-700 px-4 py-2.5 font-medium text-white disabled:opacity-50" disabled={pending}>
        {t.delete}
      </button>
    </form>
  );
}
