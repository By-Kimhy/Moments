import { describe, expect, it } from "vitest";
import { backupDate, backupName, expiredBackups, pgConnection } from "../src/lib/backups.js";

const at = (iso: string) => backupName(new Date(iso));

describe("backup names", () => {
  it("round-trips the time a backup was taken", () => {
    const name = backupName(new Date("2026-11-24T02:00:05.123Z"));
    expect(name).toBe("moments-2026-11-24T02-00-05Z.dump");
    expect(backupDate(name)?.toISOString()).toBe("2026-11-24T02:00:05.000Z");
    expect(backupDate(`db/${name}`)?.toISOString()).toBe("2026-11-24T02:00:05.000Z");
  });

  it("ignores files that are not backups", () => {
    expect(backupDate("notes.txt")).toBeNull();
    expect(backupDate("moments-2026-13-45T99-00-00Z.dump")).toBeNull();
  });
});

describe("expiredBackups", () => {
  const now = new Date("2026-11-24T03:00:00Z");
  const keep = { keepDays: 14, keepMonths: 12 };

  it("keeps the last two weeks and the first backup of each recent month", () => {
    const daily = Array.from({ length: 90 }, (_, i) => at(new Date(now.getTime() - i * 86_400_000 - 3_600_000).toISOString()));
    const expired = new Set(expiredBackups(daily, now, keep));
    const kept = daily.filter((n) => !expired.has(n));
    // 14 days back from 03:00 on the 24th reaches 03:00 on the 10th: the 10th's 02:00 backup is out.
    expect(kept).toContain(at("2026-11-11T02:00:00Z"));
    expect(kept).not.toContain(at("2026-11-09T02:00:00Z"));
    // The oldest backup of each month stays (the first backup in this list is from late August).
    expect(kept).toContain(at("2026-11-01T02:00:00Z"));
    expect(kept).toContain(at("2026-10-01T02:00:00Z"));
    expect(kept).toContain(at("2026-09-01T02:00:00Z"));
    expect(kept).toContain(daily[daily.length - 1]);
    expect(kept).not.toContain(at("2026-10-15T02:00:00Z"));
    expect(kept.length).toBe(14 + 4);
  });

  it("drops monthly backups older than keepMonths", () => {
    const names = [at("2025-10-01T02:00:00Z"), at("2025-12-01T02:00:00Z"), at("2026-11-23T02:00:00Z")];
    expect(expiredBackups(names, now, keep)).toEqual([at("2025-10-01T02:00:00Z")]);
  });

  it("always keeps the newest backup, even if it is old", () => {
    const names = [at("2024-01-05T02:00:00Z"), at("2024-01-06T02:00:00Z")];
    expect(expiredBackups(names, now, { keepDays: 0, keepMonths: 0 })).toEqual([at("2024-01-05T02:00:00Z")]);
  });

  it("never touches other files", () => {
    expect(expiredBackups(["notes.txt", "moments-latest.dump"], now, { keepDays: 0, keepMonths: 0 })).toEqual([]);
  });
});

describe("pgConnection", () => {
  it("drops Prisma-only parameters and moves the password out of the URL", () => {
    const { url, password } = pgConnection("postgresql://moments:p%40ss@db.example:5432/moments?schema=public&sslmode=require&connection_limit=5");
    expect(password).toBe("p@ss");
    expect(url).toBe("postgresql://moments@db.example:5432/moments?sslmode=require");
  });

  it("works without a password", () => {
    expect(pgConnection("postgresql://localhost/moments")).toEqual({ url: "postgresql://localhost/moments", password: null });
  });
});
