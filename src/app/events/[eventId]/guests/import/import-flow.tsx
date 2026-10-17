"use client";

import Link from "next/link";
import { useActionState } from "react";
import { type ImportState, confirmImport, previewImport } from "@/app/actions/guests";
import { Errors, Message, buttonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";

// Upload → preview (nothing saved yet) → confirm.
export function ImportFlow({ eventId, t, sides, back }: { eventId: string; t: Messages["importer"]; sides: Messages["side"]; back: string }) {
  const [previewState, preview, previewing] = useActionState<ImportState, FormData>(previewImport.bind(null, eventId), undefined);
  const [confirmState, confirm, confirming] = useActionState<ImportState, FormData>(confirmImport.bind(null, eventId), undefined);

  if (confirmState?.step === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">{fill(t.done, { created: confirmState.created, skipped: confirmState.skipped })}</p>
        <Link href={`/events/${eventId}/guests`} className={buttonClass}>
          {back}
        </Link>
      </div>
    );
  }

  if (previewState?.step === "preview") {
    const { rows, errors, duplicates } = previewState.preview;
    const dup = new Set(duplicates);
    const toAdd = rows.filter((r) => !dup.has(r.line));
    return (
      <div className="flex flex-col gap-4">
        <p className="font-semibold">{fill(t.ready, { count: toAdd.length })}</p>
        {duplicates.length > 0 && <p className="text-sm text-amber-800">{fill(t.duplicates, { count: duplicates.length })}</p>}
        {errors.length > 0 && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            <p>{fill(t.problems, { count: errors.length })}</p>
            <ul className="mt-1 list-disc pl-5">
              {errors.map((e) => (
                <li key={e.line}>
                  {fill(t.line, { line: e.line })}: {e.messages.join(" ")}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="max-h-96 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.line} className={dup.has(r.line) ? "text-muted line-through" : ""}>
                  <td className="whitespace-nowrap px-3 py-2 text-muted">{r.line}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.guest.name}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.guest.phone}</td>
                  <td className="whitespace-nowrap px-3 py-2">{sides[r.guest.side]}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.guest.group}</td>
                  <td className="px-3 py-2 text-right">{r.guest.invitedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={confirm} className="flex flex-col gap-2">
          <input type="hidden" name="guests" value={JSON.stringify(toAdd.map((r) => r.guest))} />
          {confirmState?.step === "upload" && <Message text={confirmState.message} />}
          <button className={buttonClass} disabled={confirming || toAdd.length === 0}>
            {fill(t.confirm, { count: toAdd.length })}
          </button>
        </form>
        <a href={`/events/${eventId}/guests/import`} className="text-center text-sm text-muted underline">
          {t.another}
        </a>
      </div>
    );
  }

  return (
    <form action={preview} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">{t.file}</span>
        <input type="file" name="file" accept=".csv,.xlsx" required className="text-sm file:mr-3 file:rounded-lg file:border file:border-line file:bg-transparent file:px-3 file:py-2" />
      </label>
      {previewState?.step === "upload" && (
        <>
          <Errors errors={previewState.errors?.file} />
          <Message text={previewState.message} />
        </>
      )}
      <button className={buttonClass} disabled={previewing}>
        {t.preview}
      </button>
    </form>
  );
}
