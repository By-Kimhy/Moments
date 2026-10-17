"use client";

import { useState } from "react";
import type { SeatingPlan } from "@api/contract";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";
import { ClientApiError, clientApi } from "@/lib/client-api";

type Props = { eventId: string; initial: SeatingPlan; locale: "km" | "en"; t: Messages["seating"]; sides: Messages["side"] };

/** The seating plan: tables with their guests, the guests still without a table, and tools. */
export function SeatingBoard({ eventId, initial, locale, t, sides }: Props) {
  const [plan, setPlan] = useState(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/events/${eventId}`;
  const input = "rounded-lg border border-line bg-white px-3 py-2 text-sm text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";

  async function run<T>(fn: () => Promise<T>, after?: (result: T) => void) {
    setBusy(true);
    try {
      const result = await fn();
      after?.(result);
    } catch (e) {
      setNotice({ text: e instanceof ClientApiError ? e.message : String(e), tone: "error" });
    } finally {
      setBusy(false);
    }
  }
  const reload = () => run(() => clientApi<SeatingPlan>(`${base}/seating`), setPlan);
  const assign = (guestIds: string[], tableId: string | null) =>
    run(() => clientApi<SeatingPlan>(`${base}/seating/assign`, { method: "POST", body: { guestIds, tableId } }), (p) => {
      setPlan(p);
      setSelected(new Set());
    });

  const s = plan.summary;
  const stats = [
    [t.tables, s.tables],
    [t.seats, s.capacity],
    [t.seated, s.seatedPeople],
    [t.unseated, s.unseatedPeople],
  ] as const;

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line p-3">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {s.overTables > 0 && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{t.overFull}: {s.overTables}</p>}
      {notice && <p className={`rounded-lg px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{notice.text}</p>}

      <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <form
          className="flex flex-wrap items-end gap-2"
          action={(form) =>
            run(() => clientApi<SeatingPlan>(`${base}/tables/bulk`, { method: "POST", body: { count: form.get("count"), capacity: form.get("capacity") } }), setPlan)
          }
        >
          <label className="flex flex-col gap-1 text-sm">
            {t.count}
            <input name="count" type="number" min={1} max={200} defaultValue={plan.tables.length ? 1 : 10} className={`${input} w-24`} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.capacity}
            <input name="capacity" type="number" min={1} max={100} defaultValue={10} className={`${input} w-24`} />
          </label>
          <button className={buttonClass} disabled={busy}>
            {t.addTables}
          </button>
        </form>
        {plan.tables.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">{t.autoHint}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() =>
                  run(() => clientApi<SeatingPlan & { seated: number; unplaced: number }>(`${base}/seating/auto`, { method: "POST", body: { mode: "unassigned" } }), (r) => {
                    setPlan(r);
                    setNotice({ text: fill(r.unplaced ? t.autoResult : t.autoDone, { seated: r.seated, unplaced: r.unplaced }), tone: r.unplaced ? "error" : "ok" });
                  })
                }
              >
                {t.auto}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(t.rearrangeConfirm)) return;
                  run(() => clientApi<SeatingPlan & { seated: number; unplaced: number }>(`${base}/seating/auto`, { method: "POST", body: { mode: "all" } }), (r) => {
                    setPlan(r);
                    setNotice({ text: fill(r.unplaced ? t.autoResult : t.autoDone, { seated: r.seated, unplaced: r.unplaced }), tone: r.unplaced ? "error" : "ok" });
                  });
                }}
              >
                {t.rearrange}
              </button>
              <a href={`/api${base}/seating/plan.pdf?lang=${locale}`} className={secondaryButtonClass}>
                {t.pdf}
              </a>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">
          {t.waiting} ({plan.unassigned.length})
        </h2>
        {plan.unassigned.length === 0 ? (
          <p className="text-sm text-muted">{t.none}</p>
        ) : (
          <>
            {plan.tables.length > 0 && (
              <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl bg-background/95 py-2">
                <span className="text-sm text-muted">{fill(t.selected, { count: selected.size })}</span>
                <select value={target} onChange={(e) => setTarget(e.target.value)} className={input} aria-label={t.chooseTable}>
                  <option value="">{t.chooseTable}</option>
                  {plan.tables.map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name} ({table.seatsUsed}/{table.capacity})
                    </option>
                  ))}
                </select>
                <button type="button" className={buttonClass} disabled={busy || !target || selected.size === 0} onClick={() => assign([...selected], target)}>
                  {t.seatAt}
                </button>
              </div>
            )}
            <ul className="divide-y divide-line rounded-xl border border-line">
              {plan.unassigned.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
                    <input
                      type="checkbox"
                      className="size-5"
                      checked={selected.has(g.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(g.id);
                        else next.delete(g.id);
                        setSelected(next);
                      }}
                    />
                    <span className="flex-1">
                      {g.name}
                      <span className="block text-xs text-muted">{[sides[g.side], g.group].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="text-sm text-muted">{fill(t.people, { count: g.seats })}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {plan.tables.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">{t.empty}</p>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2">
          {plan.tables.map((table) => (
            <article key={table.id} className={`flex flex-col gap-2 rounded-xl border p-4 ${table.over ? "border-red-400" : "border-line"}`}>
              <header className="flex items-baseline justify-between gap-2">
                <h3 className="text-lg font-semibold">{table.name}</h3>
                <span className={`text-sm ${table.over ? "font-semibold text-red-700" : "text-muted"}`}>
                  {table.seatsUsed}/{table.capacity}
                </span>
              </header>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                <div className={`h-full ${table.over ? "bg-red-600" : "bg-accent"}`} style={{ width: `${Math.min(100, (table.seatsUsed / table.capacity) * 100)}%` }} />
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {table.guests.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2">
                    <span>
                      {g.name} <span className="text-muted">({g.seats})</span>
                    </span>
                    <button type="button" className="text-xs text-red-700 underline" disabled={busy} onClick={() => assign([g.id], null)}>
                      {t.remove}
                    </button>
                  </li>
                ))}
              </ul>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">{t.rename}</summary>
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
                  action={(form) =>
                    run(() => clientApi(`${base}/tables/${table.id}`, { method: "PATCH", body: { name: form.get("name"), capacity: form.get("capacity") } }), reload)
                  }
                >
                  <input name="name" defaultValue={table.name} aria-label={t.name} className={`${input} w-28`} />
                  <input name="capacity" type="number" min={1} max={100} defaultValue={table.capacity} aria-label={t.capacity} className={`${input} w-20`} />
                  <button className={secondaryButtonClass} disabled={busy}>
                    {t.save}
                  </button>
                  <button
                    type="button"
                    className="text-red-700 underline"
                    onClick={() => window.confirm(t.deleteConfirm) && run(() => clientApi(`${base}/tables/${table.id}`, { method: "DELETE" }), reload)}
                  >
                    {t.deleteTable}
                  </button>
                </form>
              </details>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
