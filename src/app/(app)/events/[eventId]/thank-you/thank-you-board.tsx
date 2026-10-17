"use client";

import { useState } from "react";
import type { ThankYouResponse } from "@api/contract";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";
import { ClientApiError, clientApi } from "@/lib/client-api";

type Audience = "ALL" | "ATTENDED" | "GAVE";
type Language = "KM" | "EN";

export function ThankYouBoard({ eventId, initial, t }: { eventId: string; initial: ThankYouResponse; t: Messages["thanks"] }) {
  const [data, setData] = useState(initial);
  const [audience, setAudience] = useState<Audience>("ALL");
  const [language, setLanguage] = useState<Language>("KM");
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/events/${eventId}/thank-you`;
  const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-base text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";

  const load = async (a = audience, l = language) => setData(await clientApi<ThankYouResponse>(`${base}?audience=${a}&language=${l}`));
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice({ text: e instanceof ClientApiError ? e.message : String(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  const withPhone = data.guests.filter((g) => g.phone && g.sms?.status !== "SENT").length;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">{t.hint}</p>

      <form
        className="flex flex-col gap-3 rounded-xl border border-line p-4"
        action={(form) =>
          run(async () => {
            await clientApi(`${base}/settings`, { method: "PUT", body: { thankYouKm: form.get("thankYouKm"), thankYouEn: form.get("thankYouEn") } });
            await load();
            setNotice({ text: t.saved, tone: "ok" });
          })
        }
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.textKm}</span>
          <textarea name="thankYouKm" rows={4} maxLength={1000} defaultValue={data.settings.thankYouKm ?? ""} placeholder={data.settings.defaults.KM} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t.textEn}</span>
          <textarea name="thankYouEn" rows={3} maxLength={1000} defaultValue={data.settings.thankYouEn ?? ""} placeholder={data.settings.defaults.EN} className={input} />
        </label>
        <p className="text-xs text-muted">{t.placeholders}</p>
        <button className={`${secondaryButtonClass} self-start`} disabled={busy}>
          {t.saveText}
        </button>
      </form>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {t.audience}
            <select
              value={audience}
              onChange={(e) => {
                const a = e.target.value as Audience;
                setAudience(a);
                run(() => load(a));
              }}
              className={input}
            >
              {(["ALL", "ATTENDED", "GAVE"] as const).map((a) => (
                <option key={a} value={a}>
                  {t.audiences[a]} ({data.counts[a]})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.language}
            <select
              value={language}
              onChange={(e) => {
                const l = e.target.value as Language;
                setLanguage(l);
                run(() => load(audience, l));
              }}
              className={input}
            >
              <option value="KM">ខ្មែរ</option>
              <option value="EN">English</option>
            </select>
          </label>
        </div>
        <p className="text-sm text-muted">{fill(t.sentCount, { sms: data.sent.SMS, share: data.sent.SHARE })}</p>
        {data.canSend ? (
          <button
            type="button"
            className={`${buttonClass} self-start`}
            disabled={busy || withPhone === 0}
            onClick={() =>
              window.confirm(t.sendConfirm) &&
              run(async () => {
                const r = await clientApi<{ queued: number; alreadySent: number; noPhone: number }>(`${base}/send`, { method: "POST", body: { audience, language } });
                setNotice({ text: fill(t.sendResult, r), tone: "ok" });
                await load();
              })
            }
          >
            {fill(t.sendSms, { count: withPhone })}
          </button>
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.notYet}</p>
        )}
        {notice && <p className={`rounded-lg px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{notice.text}</p>}
      </section>

      {data.guests.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {data.guests.map((g) => (
            <li key={g.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{g.name}</span>
                <span className="flex flex-wrap justify-end gap-1 text-xs">
                  {g.sms && (
                    <span className={`rounded-full px-2 py-0.5 ${g.sms.status === "SENT" ? "bg-emerald-100 text-emerald-800" : g.sms.status === "FAILED" ? "bg-red-100 text-red-800" : "bg-black/5"}`}>
                      {g.sms.status === "SENT" ? t.smsSent : g.sms.status === "FAILED" ? t.smsFailed : t.smsQueued}
                    </span>
                  )}
                  {g.shared && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">{t.shared}</span>}
                </span>
              </div>
              <p className="text-sm text-muted">{g.text}</p>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(g.inviteUrl)}&text=${encodeURIComponent(g.text)}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => run(async () => (await clientApi(`${base}/${g.id}/shared`, { method: "POST", body: { language } }), await load()))}
                className="self-start text-sm text-sky-700 underline"
              >
                {t.share}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
