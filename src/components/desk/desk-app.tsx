"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DeskGuest, DeskGuestsResponse, DeskStats, GiftsResponse, Side } from "@api/contract";
import { type Currency, formatAmount, parseAmount } from "@api/lib/money";
import type { Messages } from "@/i18n/km";
import { fill, tableLabel } from "@/i18n/format";
import { ClientApiError, clientApi, hashToken, tokenFromQr } from "@/lib/client-api";
import { type OutboxOp, enqueue, flush, loadSnapshot, pendingOps, removeOp, saveSnapshot } from "@/lib/offline/outbox";
import { warmOfflineCache } from "@/components/pwa";
import { QrScanner } from "./qr-scanner";

type Props = {
  eventId: string;
  memberName: string;
  canSeeAllGifts: boolean;
  t: Messages["desk"];
  sides: Messages["side"];
  rsvp: Messages["rsvp"];
};

type DeskGift = DeskGuest["gifts"][number] & { pending?: boolean };
/** A guest with the phone's not-yet-sent changes laid over what the API last said. */
type LocalGuest = Omit<DeskGuest, "checkin" | "gifts"> & {
  local?: boolean;
  checkin: (NonNullable<DeskGuest["checkin"]> & { pending?: boolean }) | null;
  gifts: DeskGift[];
};

const LIST_REFRESH_MS = 60_000;
const SYNC_MS = 10_000;
const MAX_RESULTS = 60;
const QUICK = { USD: ["20", "30", "50", "100"], KHR: ["50000", "100000", "200000"] } as const;

// Khmer text often carries zero-width spaces; people type names with or without spaces.
const squash = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s​-‍.\-()]/g, "");
const digitsOf = (s: string) => s.replace(/\D/g, "");

function matches(guest: LocalGuest, query: string) {
  const q = squash(query);
  if (!q) return true;
  if (squash(guest.name).includes(q) || (guest.nameAlt && squash(guest.nameAlt).includes(q))) return true;
  const digits = digitsOf(query).replace(/^0/, "");
  return digits.length >= 3 && Boolean(guest.phone && digitsOf(guest.phone).includes(digits));
}

const timeOf = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", minute: "2-digit" }).format(d);

/** Lays the queued (unsent) writes over the guest list, so the desk shows them at once. */
function overlay(guests: DeskGuest[], ops: OutboxOp[], me: string): LocalGuest[] {
  const list: LocalGuest[] = guests.map((g) => ({ ...g }));
  const byId = new Map(list.map((g) => [g.id, g]));
  for (const op of ops) {
    const b = op.body as Record<string, string & number>;
    const at = new Date(op.createdAt);
    if (op.kind === "walkin") {
      const guest: LocalGuest = {
        id: op.clientId,
        name: b.name,
        nameAlt: null,
        phone: b.phone || null,
        side: b.side as Side,
        group: null,
        invitedCount: b.peopleCount,
        rsvpStatus: "PENDING",
        rsvpCount: null,
        tableName: null,
        walkIn: true,
        tokenHash: "",
        local: true,
        checkin: { id: op.clientId, peopleCount: b.peopleCount, checkedInAt: at, checkedInBy: me, pending: true },
        gifts: [],
      };
      list.push(guest);
      byId.set(guest.id, guest);
    } else if (op.kind === "checkin") {
      const guest = byId.get(b.guestId);
      if (guest && !guest.checkin) guest.checkin = { id: op.clientId, peopleCount: b.peopleCount, checkedInAt: at, checkedInBy: me, pending: true };
    } else if (op.kind === "gift") {
      const guest = byId.get(b.guestId ?? b.guestClientId);
      if (guest && !guest.gifts.some((g) => g.id === op.clientId)) {
        guest.gifts = [...guest.gifts, { id: op.clientId, amount: b.amount, currency: b.currency as Currency, method: b.method as "CASH" | "KHQR", status: "CONFIRMED", pending: true }];
      }
    }
  }
  return list;
}

/**
 * The guest desk: find a guest by name or QR, check them in, record their gift, add walk-ins.
 * Works without internet: everything is saved on the phone first and sent when it can be.
 */
export function DeskApp({ eventId, memberName, canSeeAllGifts, t, sides, rsvp }: Props) {
  const [server, setServer] = useState<DeskGuestsResponse | null>(null);
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [online, setOnline] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [sheet, setSheet] = useState<"walkin" | "loose" | "gifts" | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const base = `/events/${eventId}`;

  const flash = useCallback((text: string, tone: "ok" | "error" = "ok") => {
    setNotice({ text, tone });
    setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 3500);
  }, []);

  const refreshOps = useCallback(async () => setOps(await pendingOps(eventId)), [eventId]);

  const loadList = useCallback(async () => {
    try {
      const data = await clientApi<DeskGuestsResponse>(`${base}/desk/guests`);
      setServer(data);
      setOnline(true);
      await saveSnapshot(eventId, data);
    } catch (e) {
      if (!(e instanceof ClientApiError)) setOnline(false);
      // No connection: open with the list saved last time.
      const saved = await loadSnapshot(eventId);
      setServer((current) => current ?? saved);
    }
  }, [base, eventId]);

  /** Sends what's queued; afterwards the list is reloaded so it matches the API exactly. */
  const sync = useCallback(async () => {
    const result = await flush(eventId);
    setOnline(!result.offline);
    for (const c of result.conflicts) flash(fill(t.conflict, { name: String(c.op.body.name ?? c.message) }), "error");
    await refreshOps();
    if (result.sent || result.conflicts.length) await loadList();
  }, [eventId, flash, loadList, refreshOps, t.conflict]);

  // Keep this page on the phone so the desk opens even if the venue wifi is down.
  useEffect(() => warmOfflineCache(), []);

  useEffect(() => {
    const first = setTimeout(async () => {
      await refreshOps();
      await loadList();
      await sync();
    }, 0);
    const list = setInterval(loadList, LIST_REFRESH_MS);
    const pump = setInterval(sync, SYNC_MS);
    const wake = () => sync();
    window.addEventListener("online", wake);
    return () => {
      clearTimeout(first);
      clearInterval(list);
      clearInterval(pump);
      window.removeEventListener("online", wake);
    };
  }, [loadList, refreshOps, sync]);

  const guests = useMemo(() => (server ? overlay(server.guests, ops, memberName) : null), [server, ops, memberName]);
  const stats: DeskStats | null = server?.stats ?? null;
  const unsent = ops.filter((o) => !o.error);
  const failed = ops.filter((o) => o.error);
  const queuedPeople = unsent.reduce((sum, o) => sum + (o.kind === "gift" ? 0 : Number(o.body.peopleCount ?? 0)), 0);
  const results = useMemo(() => (guests ?? []).filter((g) => matches(g, query)).slice(0, MAX_RESULTS), [guests, query]);
  const selected = guests?.find((g) => g.id === selectedId) ?? null;

  async function queue(kind: OutboxOp["kind"], path: string, body: Record<string, unknown>) {
    const clientId = crypto.randomUUID();
    await enqueue({ clientId, eventId, kind, path, body: { ...body, clientId }, createdAt: Date.now() });
    await refreshOps();
    sync();
    return clientId;
  }

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

  async function checkIn(guest: LocalGuest, peopleCount: number) {
    await queue("checkin", `${base}/checkins`, { guestId: guest.id, peopleCount, checkedInAt: new Date().toISOString() });
    flash(`✓ ${guest.name}`);
  }

  async function undo(guest: LocalGuest) {
    if (guest.checkin?.pending) {
      // Not sent yet: just take it out of the queue.
      const op = guest.local ? ops.find((o) => o.clientId === guest.id) : ops.find((o) => o.kind === "checkin" && o.body.guestId === guest.id);
      if (op) await removeOp(op.clientId);
      await refreshOps();
      return;
    }
    try {
      await clientApi(`${base}/checkins/${guest.id}`, { method: "DELETE" });
      await loadList();
    } catch (e) {
      flash(e instanceof ClientApiError ? e.message : t.offline, "error");
    }
  }

  async function recordGift(guest: LocalGuest | null, gift: { amount: number; currency: Currency; method: "CASH" | "KHQR"; note: string; giverName?: string }) {
    const who = guest ? (guest.local ? { guestClientId: guest.id } : { guestId: guest.id }) : { giverName: gift.giverName };
    await queue("gift", `${base}/gifts`, { ...who, amount: gift.amount, currency: gift.currency, method: gift.method, note: gift.note, recordedAt: new Date().toISOString() });
    flash(fill(t.giftSaved, { amount: formatAmount(gift.amount, gift.currency), name: guest?.name ?? gift.giverName ?? "" }));
  }

  async function addWalkIn(form: FormData) {
    const name = String(form.get("name") ?? "");
    const clientId = await queue("walkin", `${base}/desk/walk-ins`, {
      name,
      side: String(form.get("side") ?? "BOTH"),
      phone: String(form.get("phone") ?? ""),
      peopleCount: Number(form.get("peopleCount") ?? 1),
      checkedInAt: new Date().toISOString(),
    });
    setSheet(null);
    setQuery("");
    setSelectedId(clientId); // straight on to their gift
    flash(`✓ ${name}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <SyncBar online={online} unsent={unsent.length} failed={failed} t={t} onDiscard={async (id) => (await removeOp(id), refreshOps())} />

      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-accent p-3 text-white">
            <div className="text-xs opacity-80">{t.arrived}</div>
            <div className="text-3xl font-bold" data-testid="arrived">
              {stats.checkedInPeople + queuedPeople} <span className="text-base font-normal">{t.peopleShort}</span>
            </div>
            <div className="text-xs opacity-80">
              {stats.checkedInGuests + unsent.filter((o) => o.kind !== "gift").length} {t.guestsArrived}
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
                      <span className="text-sm text-muted">{[sides[g.side], g.group, g.nameAlt].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {g.checkin ? (
                        <span className={`rounded-full px-2 py-0.5 text-sm ${g.checkin.pending ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                          ✓ {g.checkin.peopleCount}
                        </span>
                      ) : (
                        <span className="text-sm text-muted">{fill(t.invitedFor, { count: g.rsvpCount || g.invitedCount })}</span>
                      )}
                      {g.gifts.length > 0 && <span className="text-xs text-muted">🎁 {g.gifts.length}</span>}
                    </span>
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
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setSheet("walkin")} className="rounded-xl border border-dashed border-line px-4 py-3 text-muted">
              + {t.walkIn}
            </button>
            <button type="button" onClick={() => setSheet("loose")} className="rounded-xl border border-dashed border-line px-4 py-3 text-muted">
              + {t.looseGift}
            </button>
          </div>
          <button type="button" onClick={() => setSheet("gifts")} className="text-sm underline">
            {canSeeAllGifts ? t.allGifts : t.myGifts}
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
          onGift={(gift) => recordGift(selected, gift)}
        />
      )}
      {sheet === "walkin" && <WalkInSheet t={t} sides={sides} defaultName={query} onClose={() => setSheet(null)} onSubmit={addWalkIn} />}
      {sheet === "loose" && (
        <Sheet onClose={() => setSheet(null)} closeLabel={t.close}>
          <h2 className="mb-4 text-xl font-semibold">{t.looseGift}</h2>
          <GiftForm t={t} askName onSave={async (gift) => (await recordGift(null, gift), setSheet(null))} />
        </Sheet>
      )}
      {sheet === "gifts" && <GiftsSheet base={base} t={t} title={canSeeAllGifts ? t.allGifts : t.myGifts} unsent={unsent.filter((o) => o.kind === "gift")} onClose={() => setSheet(null)} />}
    </div>
  );
}

function SyncBar({ online, unsent, failed, t, onDiscard }: { online: boolean; unsent: number; failed: OutboxOp[]; t: Messages["desk"]; onDiscard: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${online ? "bg-black/5 text-muted" : "bg-amber-100 text-amber-900"}`} data-testid="sync-bar">
        <span>
          <span className={`mr-1.5 inline-block size-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`} />
          {online ? t.online : t.offline}
        </span>
        <span>{unsent ? fill(t.waiting, { count: unsent }) : t.synced}</span>
      </div>
      {failed.length > 0 && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          <p>{fill(t.failedOps, { count: failed.length })}</p>
          <ul>
            {failed.map((op) => (
              <li key={op.clientId} className="flex items-center justify-between gap-2">
                <span>
                  {String(op.body.name ?? op.body.giverName ?? "")} {op.kind === "gift" ? formatAmount(Number(op.body.amount), op.body.currency as Currency) : ""} — {op.error}
                </span>
                <button type="button" className="underline" onClick={() => onDiscard(op.clientId)}>
                  {t.discard}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Sheet({ children, onClose, closeLabel }: { children: React.ReactNode; onClose: () => void; closeLabel: string }) {
  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background p-5 pb-8 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
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
  onGift,
}: {
  guest: LocalGuest;
  t: Messages["desk"];
  sides: Messages["side"];
  rsvp: Messages["rsvp"];
  onClose: () => void;
  onCheckIn: (people: number) => Promise<void>;
  onUndo: () => Promise<void>;
  onGift: (gift: { amount: number; currency: Currency; method: "CASH" | "KHQR"; note: string }) => Promise<void>;
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
          guest.tableName && tableLabel(t.table, guest.tableName),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {guest.checkin ? (
        <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800">
          <span>
            ✓ {fill(t.checkedInAt, { time: timeOf(guest.checkin.checkedInAt), by: guest.checkin.checkedInBy })} · {guest.checkin.peopleCount} {t.peopleShort}
            {guest.checkin.pending && <span className="ml-1 text-amber-700">({t.pending})</span>}
          </span>
          <button type="button" disabled={busy} onClick={() => run(onUndo)} className="shrink-0 text-sm text-red-700 underline">
            {t.undo}
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
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

      <section className="mt-6 border-t border-line pt-4">
        <h3 className="mb-2 font-semibold">{t.gift}</h3>
        {guest.gifts.length > 0 && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t.alreadyGave}{" "}
            {guest.gifts.map((g) => `${formatAmount(g.amount, g.currency)}${g.pending ? ` (${t.pending})` : ""}`).join(", ")}
          </p>
        )}
        <GiftForm t={t} onSave={onGift} />
      </section>
    </Sheet>
  );
}

/** Amount (with quick buttons), currency, cash or KHQR, and a note. */
function GiftForm({
  t,
  askName = false,
  onSave,
}: {
  t: Messages["desk"];
  askName?: boolean;
  onSave: (gift: { amount: number; currency: Currency; method: "CASH" | "KHQR"; note: string; giverName?: string }) => Promise<void>;
}) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const [method, setMethod] = useState<"CASH" | "KHQR">("CASH");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [giverName, setGiverName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";
  const toggle = (on: boolean) => `flex-1 rounded-lg border px-3 py-2 text-sm ${on ? "border-accent bg-accent text-white" : "border-line"}`;

  async function save() {
    const minor = parseAmount(amount, currency);
    if (!minor || (askName && !giverName.trim())) {
      setError(t.badAmount);
      return;
    }
    setBusy(true);
    await onSave({ amount: minor, currency, method, note: note.trim(), giverName: giverName.trim() || undefined });
    setAmount("");
    setNote("");
    setGiverName("");
    setError(null);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {askName && <input value={giverName} onChange={(e) => setGiverName(e.target.value)} placeholder={t.giverName} className={input} />}
      <div className="flex gap-2">
        <button type="button" className={toggle(currency === "USD")} onClick={() => setCurrency("USD")}>
          {t.usd}
        </button>
        <button type="button" className={toggle(currency === "KHR")} onClick={() => setCurrency("KHR")}>
          {t.khr}
        </button>
      </div>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode={currency === "USD" ? "decimal" : "numeric"}
        placeholder={t.giftAmount}
        aria-label={t.giftAmount}
        className={`${input} text-2xl font-semibold`}
      />
      <div className="flex flex-wrap gap-2">
        {QUICK[currency].map((q) => (
          <button key={q} type="button" onClick={() => setAmount(q)} className="rounded-full border border-line px-3 py-1 text-sm">
            {formatAmount(parseAmount(q, currency)!, currency)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" className={toggle(method === "CASH")} onClick={() => setMethod("CASH")}>
          {t.cash}
        </button>
        <button type="button" className={toggle(method === "KHQR")} onClick={() => setMethod("KHQR")}>
          {t.khqr}
        </button>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.giftNote} className={input} />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button type="button" disabled={busy} onClick={save} className="rounded-xl bg-accent py-3 font-semibold text-white disabled:opacity-50">
        {t.saveGift}
      </button>
    </div>
  );
}

/** The gifts this person recorded (all gifts for hosts), with the cash-box total. Needs internet. */
function GiftsSheet({ base, t, title, unsent, onClose }: { base: string; t: Messages["desk"]; title: string; unsent: OutboxOp[]; onClose: () => void }) {
  const [data, setData] = useState<GiftsResponse | null | "offline">(null);
  const load = useCallback(async () => {
    try {
      setData(await clientApi<GiftsResponse>(`${base}/gifts`));
    } catch {
      setData("offline");
    }
  }, [base]);
  useEffect(() => {
    const first = setTimeout(load, 0);
    return () => clearTimeout(first);
  }, [load]);

  async function cancel(giftId: string) {
    const reason = window.prompt(t.cancelReason);
    if (!reason?.trim()) return;
    try {
      await clientApi(`${base}/gifts/${giftId}/void`, { method: "POST", body: { reason } });
    } catch (e) {
      window.alert(e instanceof ClientApiError ? e.message : t.offlineList);
    }
    load();
  }

  return (
    <Sheet onClose={onClose} closeLabel={t.close}>
      <h2 className="mb-3 text-xl font-semibold">{title}</h2>
      {unsent.length > 0 && (
        <ul className="mb-3 text-sm text-amber-800">
          {unsent.map((op) => (
            <li key={op.clientId}>
              {formatAmount(Number(op.body.amount), op.body.currency as Currency)} · {t.pending}
            </li>
          ))}
        </ul>
      )}
      {data === null && <p className="text-muted">{t.loading}</p>}
      {data === "offline" && <p className="text-muted">{t.offlineList}</p>}
      {data && data !== "offline" && (
        <>
          <div className="mb-3 rounded-xl bg-black/5 p-3">
            <div className="text-xs text-muted">{t.cashBox}</div>
            <div className="text-xl font-bold">
              {formatAmount(data.totals.total.USD, "USD")} · {formatAmount(data.totals.total.KHR, "KHR")}
            </div>
          </div>
          {data.gifts.length === 0 ? (
            <p className="text-muted">{t.noGifts}</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.gifts.map((g) => (
                <li key={g.id} className={`flex items-center justify-between gap-2 py-2 ${g.voidedAt ? "text-muted line-through" : ""}`}>
                  <span>
                    {g.guestName}
                    <span className="block text-xs text-muted">
                      {timeOf(g.recordedAt)} · {g.method === "CASH" ? t.cash : t.khqr}
                      {g.recordedBy ? ` · ${g.recordedBy}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-semibold">{formatAmount(g.amount, g.currency)}</span>
                    {g.voidedAt ? (
                      <span className="text-xs no-underline">{t.cancelled}</span>
                    ) : (
                      <button type="button" onClick={() => cancel(g.id)} className="text-xs text-red-700 underline">
                        {t.cancelGift}
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
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
  const input = "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-base text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100";
  return (
    <Sheet onClose={onClose} closeLabel={t.close}>
      <h2 className="mb-4 text-xl font-semibold">{t.walkInTitle}</h2>
      <form action={onSubmit} className="flex flex-col gap-3">
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
        <button className="rounded-xl bg-accent py-3 font-semibold text-white">{t.add}</button>
      </form>
    </Sheet>
  );
}
