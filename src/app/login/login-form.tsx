"use client";

import { useActionState } from "react";
import { requestCode, verifyCode } from "@/app/actions/auth";
import { Field, Message, buttonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";

// Two steps: phone number, then the code sent to it (and a name the first time).
export function LoginForm({ t, next }: { t: Messages["login"]; next: string }) {
  const [phoneState, sendCode, sending] = useActionState(requestCode, undefined);
  const [codeState, verify, verifying] = useActionState(verifyCode, undefined);
  const state = codeState ?? phoneState;
  const onCodeStep = (codeState?.step ?? phoneState?.step) === "code";

  if (!onCodeStep) {
    return (
      <form action={sendCode} className="flex flex-col gap-4">
        <Field
          label={t.phone}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          hint={t.phoneHint}
          defaultValue={phoneState?.values?.phone}
          errors={phoneState?.errors?.phone}
          required
          autoFocus
        />
        <Message text={phoneState?.message} />
        <button className={buttonClass} disabled={sending}>
          {t.sendCode}
        </button>
      </form>
    );
  }

  const phone = state?.phone ?? phoneState?.phone ?? "";
  const devCode = codeState?.devCode ?? phoneState?.devCode;
  return (
    <form action={verify} className="flex flex-col gap-4">
      <p className="text-sm text-muted">{fill(t.codeSent, { phone })}</p>
      {devCode && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{fill(t.devCode, { code: devCode })}</p>}
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="next" value={next} />
      <Field label={t.code} name="code" inputMode="numeric" autoComplete="one-time-code" errors={codeState?.errors?.code} required autoFocus />
      <Field label={t.name} name="name" autoComplete="name" hint={t.nameHint} defaultValue={codeState?.values?.name} errors={codeState?.errors?.name} />
      <Message text={codeState?.message} />
      <button className={buttonClass} disabled={verifying}>
        {t.verify}
      </button>
      <a href="/login" className="text-center text-sm text-muted underline">
        {t.changePhone}
      </a>
    </form>
  );
}
