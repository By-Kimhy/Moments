"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeskGuest, DeskGuestsResponse, DeskStats } from "@api/contract";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";
import { ClientApiError, clientApi, hashToken, tokenFromQr } from "@/lib/client-api";
import { QrScanner } from "./qr-scanner";

type Props = {
  eventId: string;
  t: Messages["desk"];
  sides: Messages["side"];
  rsvp: Messages["rsvp"];
};

const LIST_REFRESH_MS = 60_000;
const STATS_REFRESH_MS = 10_000;
const MAX_RESULTS = 60;

// Khmer text often carries zero-width spaces; people type names with or without spaces.
const squash = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s​-‍.\-()]/g, "");
const digitsOf = (s: string) => s.replace(/\D/g, "");

function matches(guest: DeskGuest, query: string) {
  const q = squash(query);
  if (!q) return true;
  if (squash(guest.name).includes(q) || (guest.nameAlt && squash(guest.nameAlt).includes(q))) return true;
  const digits = digitsOf(query).replace(/^0/, "");
  return digits.length >= 3 && Boolean(guest.phone && digitsOf(guest.phone).includes(digits));
}

const timeOf = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", minute: "2-digit" }).format(d);

/** The guest desk: find a guest by name or QR, check them in, add walk-ins, see the count. */
export function DeskApp({ eventId, t, sides, rsvp }: Props) {
  const [guests, setGuests] = useState<DeskGuest[] | null>(null);
  const [stats, setStats] = useState<DeskStats | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [walkIn, setWalkIn] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const base = `/events/${eventId}`;

  const flash = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    setNotice({ text, tone });
    setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 3500);
  }, []);

  const loadList = useCallback(async () => {
    try {
      const data = await clientApi<DeskGuestsResponse>(`${base}/desk/guests`);
      setGuests(data.guests);
      setStats(data.stats);
    } catch {
      // Keep showing what we have; the next refresh will try again.
    }
  }, [base]);

  useEffect(() => {
    // Polling: other phones check guests in too.
    const first = setTimeout(loadList, 0);
    const list = setInterval(loadList, LIST_REFRESH_MS);
    const counts = setInterval(async () => {
      try {
        setStats((await clientApi<{ stats: DeskStats }>(`${base}/desk/stats`)).stats);
      } catch {}
    }, STATS_REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(list);
      clearInterval(counts);
    };
  }, [base, loadList]);

  const replaceGuest = useCallback((guest: DeskGuest) => {
    setGuests((list) => {
      if (!list) return [guest];
      return list.some((g) => g.id === guest.id) ? list.map((g) => (g.id === guest.id ? guest : g)) : [...list, guest];
    });
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      setStats((await clientApi<{ stats: DeskStats }>(`${base}/desk/stats`)).stats);
    } catch {}
  }, [base]);

  const results = useMemo(() => (guests ?? []).filter((g) => matches(g, query)).slice(0, MAX_RESULTS), [guests, query]);
  const selected = guests?.find((g) => g.id === selectedId) ?? null;

  async function onScan(text: string) {
    const token = tokenFromQr(text);
    const hash = token ? await hashToken(token) : null;
    const guest = hash ? guests?.find((g) => g.tokenHash === hash) : null;
    if (!guest) {
      flash(t.notFound, "error");
      return;
    }
    setScanning(false);
    setSelectedId(guest.id);
  }

  async function checkIn(guest: DeskGuest, peopleCount: number) {
    try {
      const res = await clientApi<{ guest: DeskGuest }>(`${base}/checkins`, {
        method: "POST",
        body: { guestId: guest.id, peopleCount, clientId: crypto.randomUUID(), checkedInAt: new Date().toISOString() },
      });
      replaceGuest(res.guest);
      setSelectedId(null);
      setQuery("");
      flash(`✓ ${guest.name}`);
    } catch (e) {
      if (e instanceof ClientApiError && e.status === 409 && e.body.guest) {
        replaceGuest(e.body.guest as DeskGuest);
        flash(e.message, "error");
      } else {
        flash(e instanceof ClientApiError ? e.message : t.error, "error");
      }
    }
    refreshStats();
  }

  async function undo(guest: DeskGuest) {
    try {
      replaceGuest((await clientApi<{ guest: DeskGuest }>(`${base}/checkins/${guest.id}`, { method: "DELETE" })).guest);
    } catch (e) {
      flash(e instanceof ClientApiError ? e.message : t.error, "error");
    }
    refreshStats();
  }

  async function addWalkIn(form: FormData) {
    const body = {
      name: String(form.get("name") ?? ""),
      side: String(form.get("side") ?? "BOTH"),
      phone: String(form.get("phone") ?? ""),
      peopleCount: Number(form.get("peopleCount") ?? 1),
      clientId: crypto.randomUUID(),
      checkedInAt: new Date().toISOString(),
    };
    try {
      const res = await clientApi<{ guest: DeskGuest }>(`${base}/desk/walk-ins`, { method: "POST", body });
      replaceGuest(res.guest);
      setWalkIn(false);
      setQuery("");
      flash(`✓ ${body.name}`);
    } catch (e) {
      flash(e instanceof ClientApiError ? e.message : t.error, "error");
    }
    refreshStats();
  }

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-accent p-3 text-white">
            <div className="text-xs opacity-80">{t.arrived}</div>
            <div className="text-3xl font-bold">
              {stats.checkedInPeople} <span className="text-base font-normal">{t.peopleShort}</span>
            </div>
            <div className="text-xs opacity-80">
              {stats.checkedInGuests} {t.guestsArrived}
            </div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="text-xs text-muted">{t.expected}</div>
            <div className="text-3xl font-bold">
              {stats.expectedPeople} <span className="text-base font-normal">{t.peopleShort}</span>
            </div>
          </div>
        </div>
      )}

      {notice && (
        <p className={`rounded-lg px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`} role="status">
          {notice.text}
        </p>
      )}

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-3 text-lg text-zinc-900 outline-none focus:border-accent dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button type="button" onClick={() => setScanning((s) => !s)} className="shrink-0 rounded-xl bg-accent px-4 font-semibold text-white">
          {scanning ? t.stopScan : t.scan}
        </button>
      </div>

      {scanning && <QrScanner onResult={onScan} hint={t.scanHint} errorText={t.cameraError} />}

      {guests === null ? (
        <p className="py-8 text-center text-muted">{t.loading}</p>
      ) : (
        <>
          {query && results.length === 0 && <p className="text-center text-sm text-muted">{t.noResults}</p>}
          {(query || !stats?.recent.length) && (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {results.map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => setSelectedId(g.id)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
                    <span>
                      <span className="block text-lg">{g.name}</span>
                      <span className="text-sm text-muted">
                        {[sides[g.side], g.group, g.nameAlt].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {g.checkin ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-sm text-emerald-800">✓ {g.checkin.peopleCount}</span>
                    ) : (
                      <span className="shrink-0 text-sm text-muted">{fill(t.invitedFor, { count: g.rsvpCount || g.invitedCount })}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!query && stats && stats.recent.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">{t.recent}</h2>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {stats.recent.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setSelectedId(r.guestId)} className="flex w-full justify-between gap-2 px-4 py-2.5 text-left">
                      <span>{r.name}</span>
                      <span className="text-sm text-muted">
                        {timeOf(r.checkedInAt)} · {r.peopleCount}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <button type="button" onClick={() => setWalkIn(true)} className="rounded-xl border border-dashed border-line px-4 py-3 text-muted">
            + {t.walkIn}
          </button>
        </>
      )}

      {selected && (
        <GuestSheet
          key={selected.id}
          guest={selected}
          t={t}
          sides={sides}
          rsvp={rsvp}
          onClose={() => setSelectedId(null)}
          onCheckIn={(n) => checkIn(selected, n)}
          onUndo={() => undo(selected)}
        />
      )}
      {walkIn && <WalkInSheet t={t} sides={sides} defaultName={query} onClose={() => setWalkIn(false)} onSubmit={addWalkIn} />}
    </div>
  );
}

function Sheet({ children, onClose, closeLabel }: { children: React.ReactNode; onClose: () => void; closeLabel: string }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-background p-5 pb-8 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {children}
        <button type="button" onClick={onClose} className="mt-4 w-full text-center text-sm text-muted underline">
          {closeLabel}
        </button>
      </div>
    </div>
  );
}

function GuestSheet({
  guest,
  t,
  sides,
  rsvp,
  onClose,
  onCheckIn,
  onUndo,
}: {
  guest: DeskGuest;
  t: Messages["desk"];
  sides: Messages["side"];
  rsvp: Messages["rsvp"];
  onClose: () => void;
  onCheckIn: (people: number) => Promise<void>;
  onUndo: () => Promise<void>;
}) {
  const [people, setPeople] = useState(guest.rsvpCount || guest.invitedCount);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose} closeLabel={t.close}>
      <h2 className="text-2xl font-semibold">{guest.name}</h2>
      {guest.nameAlt && <p className="text-muted">{guest.nameAlt}</p>}
      <p className="mt-1 text-sm text-muted">
        {[
          sides[guest.side],
          guest.group,
          fill(t.invitedFor, { count: guest.invitedCount }),
          fill(t.replied, { rsvp: rsvp[guest.rsvpStatus] + (guest.rsvpStatus === "ATTENDING" && guest.rsvpCount ? ` (${guest.rsvpCount})` : "") }),
          guest.tableNo && fill(t.table, { table: guest.tableNo }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {guest.checkin ? (
        <div className="mt-5 flex flex-col gap-3">
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">
            ✓ {fill(t.checkedInAt, { time: timeOf(guest.checkin.checkedInAt), by: guest.checkin.checkedInBy })} · {guest.checkin.peopleCount} {t.peopleShort}
          </p>
          <button type="button" disabled={busy} onClick={() => run(onUndo)} className="self-start text-sm text-red-700 underline">
            {t.undo}
          </button>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span>{t.howMany}</span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setPeople((n) => Math.max(1, n - 1))} className="size-12 rounded-full border border-line text-2xl">
                −
              </button>
              <span className="w-8 text-center text-2xl font-bold">{people}</span>
              <button type="button" onClick={() => setPeople((n) => Math.min(50, n + 1))} className="size-12 rounded-full border border-line text-2xl">
                +
              </button>
            </div>
          </div>
          <button type="button" disabled={busy} onClick={() => run(() => onCheckIn(people))} className="rounded-xl bg-accent py-4 text-xl font-semibold text-white disabled:opacity-50">
            {t.checkIn}
          </button>
        </div>
      )}
    </Sheet>
  );
}

function WalkInSheet({
  t,
  sides,
  defaultName,
  onClose,
  onSubmit,
}: {
  t: Messages["desk"];
  sides: Messages["side"];
  defaultName: string;
  onClose: () => void;
  onSubmit: (form: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";
  return (
    <Sheet onClose={onClose} closeLabel={t.close}>
      <h2 className="mb-4 text-xl font-semibold">{t.walkInTitle}</h2>
      <form
        action={async (form) => {
          setBusy(true);
          await onSubmit(form);
          setBusy(false);
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          {t.name2}
          <input name="name" required defaultValue={defaultName} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t.phoneOptional}
          <input name="phone" type="tel" inputMode="tel" className={input} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <select name="side" defaultValue="BOTH" className={input}>
            {(["GROOM", "BRIDE", "BOTH"] as const).map((s) => (
              <option key={s} value={s}>
                {sides[s]}
              </option>
            ))}
          </select>
          <input name="peopleCount" type="number" min={1} max={50} defaultValue={1} required className={input} aria-label={t.howMany} />
        </div>
        <button disabled={busy} className="rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-50">
          {t.add}
        </button>
      </form>
    </Sheet>
  );
}
