"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DoorTicket, DoorTicketsResponse } from "@api/contract";
import { warmOfflineCache } from "@/components/pwa";
import type { Messages } from "@/i18n/km";
import { fill } from "@/i18n/format";
import { ClientApiError, clientApi, hashToken } from "@/lib/client-api";
import { type OutboxOp, enqueue, flush, loadSnapshot, pendingOps, saveSnapshot } from "@/lib/offline/outbox";
import { QrScanner } from "./qr-scanner";

type Result = { tone: "ok" | "used" | "invalid"; title: string; detail?: string };
type LocalTicket = DoorTicket & { pending?: boolean };

const timeOf = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Phnom_Penh", hour: "2-digit", minute: "2-digit" }).format(d);
const squash = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s​-‍]/g, "");

/**
 * The door of a ticketed event: scan each ticket's QR (or let someone in from the list).
 * Works offline like the guest desk: the ticket list is kept on the phone, entries are queued
 * and sent in order, and a ticket already used on another phone is reported when it syncs.
 */
export function DoorApp({ eventId, memberName, t, desk }: { eventId: string; memberName: string; t: Messages["door"]; desk: Messages["desk"] }) {
  const [server, setServer] = useState<DoorTicketsResponse | null>(null);
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [online, setOnline] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [query, setQuery] = useState("");
  const base = `/events/${eventId}`;
  const key = `door:${eventId}`;

  const refreshOps = useCallback(async () => setOps((await pendingOps(eventId)).filter((o) => o.kind === "scan")), [eventId]);
  const load = useCallback(async () => {
    try {
      const data = await clientApi<DoorTicketsResponse>(`${base}/door/tickets`);
      setServer(data);
      setOnline(true);
      await saveSnapshot(key, data);
    } catch (e) {
      if (!(e instanceof ClientApiError)) setOnline(false);
      const saved = await loadSnapshot<DoorTicketsResponse>(key);
      setServer((current) => current ?? saved);
    }
  }, [base, key]);
  const sync = useCallback(async () => {
    const r = await flush(eventId);
    setOnline(!r.offline);
    for (const c of r.conflicts) setResult({ tone: "used", title: t.used, detail: c.message });
    await refreshOps();
    if (r.sent || r.conflicts.length) await load();
  }, [eventId, load, refreshOps, t.used]);

  useEffect(() => warmOfflineCache(), []);
  useEffect(() => {
    const first = setTimeout(async () => {
      await refreshOps();
      await load();
      await sync();
    }, 0);
    const list = setInterval(load, 60_000);
    const pump = setInterval(sync, 10_000);
    window.addEventListener("online", sync);
    return () => {
      clearTimeout(first);
      clearInterval(list);
      clearInterval(pump);
      window.removeEventListener("online", sync);
    };
  }, [load, refreshOps, sync]);

  // Tickets with this phone's unsent entries laid over them.
  const tickets = useMemo<LocalTicket[] | null>(() => {
    if (!server) return null;
    const entered = new Map(ops.map((o) => [String(o.body.hash ?? o.body.ticketId), o]));
    return server.tickets.map((tk) => {
      const op = entered.get(tk.hash) ?? entered.get(tk.id);
      return !tk.checkedInAt && op ? { ...tk, checkedInAt: new Date(op.createdAt), checkedInBy: memberName, pending: true } : tk;
    });
  }, [server, ops, memberName]);

  const show = (r: Result) => {
    setResult(r);
    navigator.vibrate?.(r.tone === "ok" ? 80 : [80, 60, 80]);
  };

  async function enter(ticket: LocalTicket, body: Record<string, unknown>, path: string) {
    if (ticket.checkedInAt) {
      show({ tone: "used", title: t.used, detail: fill(t.usedAt, { time: timeOf(ticket.checkedInAt), by: ticket.checkedInBy ?? "" }) });
      return;
    }
    const clientId = crypto.randomUUID();
    await enqueue({ clientId, eventId, kind: "scan", path, body: { ...body, clientId, hash: ticket.hash, name: ticket.buyerName, scannedAt: new Date().toISOString() }, createdAt: Date.now() });
    await refreshOps();
    show({ tone: "ok", title: t.welcome, detail: `${ticket.type} · ${ticket.buyerName}` });
    sync();
  }

  async function onScan(text: string) {
    const code = text.trim().replace(/^MOMENTS-TICKET:/, "");
    const hash = /^[\w-]{16,32}$/.test(code) ? await hashToken(code) : null;
    const ticket = hash ? tickets?.find((tk) => tk.hash === hash) : null;
    if (!ticket) {
      show({ tone: "invalid", title: t.invalid });
      return;
    }
    await enter(ticket, { code }, `${base}/door/scan`);
  }

  const results = useMemo(() => {
    const q = squash(query);
    if (!q || !tickets) return [];
    return tickets.filter((tk) => squash(tk.buyerName).includes(q) || tk.reference.toLowerCase().includes(q)).slice(0, 30);
  }, [tickets, query]);
  const entered = tickets?.filter((tk) => tk.checkedInAt).length ?? 0;
  const unsent = ops.filter((o) => !o.error).length;
  const toneClass = { ok: "bg-emerald-600", used: "bg-amber-500", invalid: "bg-red-600" } as const;

  return (
    <div className="flex flex-col gap-4">
      <div className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs ${online ? "bg-black/5 text-muted" : "bg-amber-100 text-amber-900"}`} data-testid="sync-bar">
        <span>{online ? desk.online : desk.offline}</span>
        <span>{unsent ? fill(desk.waiting, { count: unsent }) : desk.synced}</span>
      </div>
      {tickets === null ? (
        <p className="py-8 text-center text-muted">{t.loading}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-accent p-3 text-white">
            <div className="text-xs opacity-80">{t.entered}</div>
            <div className="text-3xl font-bold" data-testid="entered">
              {entered}
            </div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="text-xs text-muted">{t.sold}</div>
            <div className="text-3xl font-bold">{tickets.length}</div>
          </div>
        </div>
      )}

      {result && (
        <button type="button" onClick={() => setResult(null)} className={`rounded-2xl px-4 py-6 text-center text-white ${toneClass[result.tone]}`} data-testid="door-result">
          <span className="block text-2xl font-bold">{result.title}</span>
          {result.detail && <span className="mt-1 block text-lg">{result.detail}</span>}
        </button>
      )}

      <button type="button" onClick={() => setScanning((s) => !s)} className="rounded-xl bg-accent py-4 text-lg font-semibold text-white">
        {scanning ? t.stop : t.scan}
      </button>
      {scanning && <QrScanner onResult={onScan} hint={t.hint} errorText={desk.cameraError} />}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.search}
        className="rounded-xl border border-line bg-white px-4 py-3 text-base text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
      />
      {results.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {results.map((tk) => (
            <li key={tk.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span>
                {tk.buyerName}
                <span className="block text-xs text-muted">
                  {tk.type} · {tk.reference}
                </span>
              </span>
              {tk.checkedInAt ? (
                <span className={`text-sm ${tk.pending ? "text-amber-700" : "text-emerald-700"}`}>✓ {timeOf(tk.checkedInAt)}</span>
              ) : (
                <button type="button" className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white" onClick={() => enter(tk, { ticketId: tk.id }, `${base}/door/admit`)}>
                  {t.admit}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
