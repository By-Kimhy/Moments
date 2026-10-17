"use client";

import { useActionState } from "react";
import { type TelegramState, createTelegramLink, disconnectTelegram, sendTelegramTest } from "@/app/actions/telegram";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";

type Status = { enabled: boolean; connected: boolean; botUsername: string | null };

export function TelegramSection({ eventId, status, t }: { eventId: string; status: Status; t: Messages["telegram"] }) {
  const [linkState, link, linking] = useActionState<TelegramState>(() => createTelegramLink(eventId), undefined);
  const [testState, test, testing] = useActionState<TelegramState>(() => sendTelegramTest(eventId), undefined);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <h2 className="font-semibold">{t.title}</h2>
      <p className="text-sm text-muted">{t.hint}</p>
      {!status.enabled ? (
        <p className="text-sm text-muted">{t.notSetUp}</p>
      ) : status.connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-emerald-700">{t.connected}</span>
          <form action={test}>
            <button className={secondaryButtonClass} disabled={testing}>
              {t.test}
            </button>
          </form>
          <form action={disconnectTelegram.bind(null, eventId)}>
            <button className="text-sm text-red-700 underline">{t.disconnect}</button>
          </form>
          {testState?.tested && <span className="text-sm text-muted">{t.testSent}</span>}
          {testState?.message && <span className="text-sm text-red-700">{testState.message}</span>}
        </div>
      ) : linkState?.link ? (
        <div className="flex flex-col gap-3 text-sm">
          {linkState.link.url && (
            <a href={linkState.link.url} target="_blank" rel="noreferrer" className={`${buttonClass} self-start`}>
              {t.openBot}
            </a>
          )}
          {linkState.link.botUsername && <p>{fill(t.groupHint, { bot: linkState.link.botUsername })}</p>}
          <code className="self-start rounded-lg bg-black/5 px-3 py-2 text-base">{linkState.link.groupCommand}</code>
          <p className="text-muted">{t.expires}</p>
        </div>
      ) : (
        <form action={link}>
          <button className={buttonClass} disabled={linking}>
            {t.connect}
          </button>
          {linkState?.message && <p className="mt-2 text-sm text-red-700">{linkState.message}</p>}
        </form>
      )}
    </section>
  );
}
