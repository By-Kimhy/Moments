// Database backups: names and the retention rule. The script that runs pg_dump and stores the
// files is bin/backup.ts; this part has no side effects so it can be tested on its own.

const PREFIX = "moments-";
const SUFFIX = ".dump";

/** e.g. "moments-2026-11-24T02-00-00Z.dump" (UTC, sortable, no colons for file systems). */
export function backupName(at: Date) {
  return `${PREFIX}${at.toISOString().slice(0, 19).replace(/:/g, "-")}Z${SUFFIX}`;
}

/** The time a backup was taken, from its name (a path or S3 key works too), or null if it isn't one. */
export function backupDate(name: string): Date | null {
  const base = name.slice(name.lastIndexOf("/") + 1);
  const m = /^moments-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.dump$/.exec(base);
  if (!m) return null;
  const date = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type Retention = { keepDays: number; keepMonths: number };

/**
 * Which backups to delete. Kept: every backup from the last `keepDays` days, the first backup of
 * each of the last `keepMonths` calendar months (UTC), and always the newest one. Names that are
 * not backups are never touched.
 */
export function expiredBackups(names: string[], now: Date, { keepDays, keepMonths }: Retention): string[] {
  const backups = names
    .map((name) => ({ name, at: backupDate(name) }))
    .filter((b): b is { name: string; at: Date } => b.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (backups.length === 0) return [];

  const keep = new Set<string>([backups[backups.length - 1].name]);
  const dayCutoff = now.getTime() - keepDays * 86_400_000;
  const monthIndex = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  const oldestMonth = monthIndex(now) - keepMonths + 1;
  const firstOfMonth = new Set<number>();
  for (const b of backups) {
    if (b.at.getTime() >= dayCutoff) keep.add(b.name);
    const month = monthIndex(b.at);
    if (!firstOfMonth.has(month)) {
      firstOfMonth.add(month);
      if (keepMonths > 0 && month >= oldestMonth) keep.add(b.name);
    }
  }
  return backups.filter((b) => !keep.has(b.name)).map((b) => b.name);
}

/**
 * pg_dump's connection settings from a Prisma DATABASE_URL: Prisma-only query parameters are
 * dropped (pg_dump rejects them), and the password moves to PGPASSWORD so it never shows in `ps`.
 */
export function pgConnection(databaseUrl: string): { url: string; password: string | null } {
  const url = new URL(databaseUrl);
  for (const param of ["schema", "connection_limit", "pool_timeout", "pgbouncer", "statement_cache_size", "socket_timeout", "connect_timeout"]) {
    url.searchParams.delete(param);
  }
  const password = url.password ? decodeURIComponent(url.password) : null;
  url.password = "";
  return { url: url.toString(), password };
}
