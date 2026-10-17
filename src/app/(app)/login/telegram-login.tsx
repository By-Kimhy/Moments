"use client";

import { useCallback, useEffect, useState } from "react";
import { finishTelegramLogin } from "@/app/actions/auth";
import { Field, Message, buttonClass, secondaryButtonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";
import { ClientApiError, clientApi } from "@/lib/client-api";

type Start = { token: string; url: string | null; dev: boolean };
const POLL_MS = 2000;

// Opens the bot with a one-time login token, then asks every two seconds whether the person
// has shared their phone number there.
export function TelegramLogin({ t, next }: { t: Messages["login"]; next: string }) {
  const [start, setStart] = useState<Start | null>(null);
  const [state, setState] = useState<"ready" | "waiting" | "expired" | "unavailable">("ready");
  const [devError, setDevError] = useState<{ message?: string; fields?: Record<string, string[] | undefined> }>({});

  const begin = useCallback(async () => {
    try {
      setStart(await clientApi<Start>("/auth/telegram/start", { method: "POST" }));
      setState("ready");
    } catch {
      setState("unavailable");
    }
  }, []);

  useEffect(() => {
    // Getting a token is the effect's job: it talks to the API, then stores the answer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void begin();
  }, [begin]);

  useEffect(() => {
    if (state !== "waiting" || !start) return;
    let stopped = false;
    const timer = setInterval(async () => {
      const result = await finishTelegramLogin(start.token, next);
      if (stopped) return;
      if (result.status === "done") {
        stopped = true;
        window.location.assign(result.next);
      } else if (result.status === "expired") {
        setState("expired");
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [state, start, next]);

  async function devConfirm(formData: FormData) {
    if (!start) return;
    try {
      await clientApi("/auth/telegram/dev-confirm", { method: "POST", body: { token: start.token, phone: formData.get("phone"), name: formData.get("name") || undefined } });
      setState("waiting");
    } catch (e) {
      if (!(e instanceof ClientApiError)) throw e;
      const fields = e.body.fieldErrors as Record<string, string[] | undefined> | undefined;
      setDevError({ message: fields ? undefined : e.message, fields });
    }
  }

  if (state === "unavailable") return <Message text={t.unavailable} />;
  if (state === "expired") {
    return (
      <div className="flex flex-col gap-3">
        <Message text={t.expired} />
        <button type="button" className={secondaryButtonClass} onClick={begin}>
          {t.restart}
        </button>
      </div>
    );
  }
  if (!start) return <p className="text-sm text-muted">…</p>;

  return (
    <div className="flex flex-col gap-4">
      {start.url && (
        <>
          <a
            href={start.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => setState("waiting")}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#229ED9] px-4 py-2.5 font-medium text-white hover:opacity-90"
            data-testid="telegram-login"
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
              <path d="M9.04 15.47 8.9 19.5c.4 0 .58-.17.8-.38l1.9-1.82 3.95 2.89c.72.4 1.24.19 1.43-.67l2.6-12.2c.25-1.08-.4-1.5-1.1-1.24L3.2 10.1c-1.04.41-1.03 1-.18 1.26l3.92 1.22 9.1-5.74c.43-.26.82-.12.5.17" />
            </svg>
            {state === "waiting" ? t.openAgain : t.telegram}
          </a>
          <p className="text-sm text-muted">{state === "waiting" ? t.waiting : t.steps}</p>
        </>
      )}
      {start.dev && (
        <form action={devConfirm} className="flex flex-col gap-3 rounded-xl border border-dashed border-amber-400 p-4">
          <p className="text-sm font-medium text-amber-800">{t.devTitle}</p>
          <Field label={t.phone} name="phone" type="tel" inputMode="tel" errors={devError.fields?.phone} required />
          <Field label={t.name} name="name" hint={t.nameHint} errors={devError.fields?.name} />
          <Message text={devError.message} />
          <button className={buttonClass}>{t.devConfirm}</button>
        </form>
      )}
    </div>
  );
}
