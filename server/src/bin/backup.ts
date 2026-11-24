// Backs up the database: `npm run db:backup` (or `node dist/bin/backup.js` on a server).
//
// 1. pg_dump writes a compressed custom-format dump to a temporary file.
// 2. pg_restore --list reads it back, so a broken dump is caught now and not on restore day.
// 3. The file goes to BACKUP_S3_BUCKET (S3, R2 or MinIO, with the S3_* credentials), or to
//    BACKUP_DIR when no bucket is set.
// 4. Old backups there are deleted: see expiredBackups for what is kept.
//
// It exits 1 on any failure and reports it to Sentry when SENTRY_DSN is set, so run it from cron
// or a scheduler that alerts on a failed run. See "Backups" in the README.
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { backupName, expiredBackups, pgConnection, type Retention } from "../lib/backups.js";
import { flushMonitoring, initMonitoring, reportError } from "../monitoring.js";

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

interface Destination {
  describe: string;
  save(file: string, name: string): Promise<void>;
  list(): Promise<string[]>;
  remove(name: string): Promise<void>;
}

function s3Destination(bucket: string): Destination {
  const prefix = (process.env.BACKUP_S3_PREFIX ?? "db/").replace(/^\/+/, "");
  const client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  return {
    describe: `s3://${bucket}/${prefix}`,
    async save(file, name) {
      const { size } = await stat(file);
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: prefix + name, Body: createReadStream(file), ContentLength: size, ContentType: "application/octet-stream" }),
      );
    },
    async list() {
      const names: string[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const item of page.Contents ?? []) if (item.Key) names.push(item.Key.slice(prefix.length));
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return names;
    },
    async remove(name) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: prefix + name }));
    },
  };
}

function diskDestination(dir: string): Destination {
  return {
    describe: dir + path.sep,
    async save(file, name) {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await copyFile(file, path.join(dir, name));
      await chmod(path.join(dir, name), 0o600); // guests' names and phone numbers
    },
    list: () => readdir(dir).catch(() => []),
    remove: (name) => rm(path.join(dir, name), { force: true }),
  };
}

function retention(): Retention {
  const num = (name: string, fallback: number) => {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a whole number of 0 or more`);
    return value;
  };
  return { keepDays: num("BACKUP_KEEP_DAYS", 14), keepMonths: num("BACKUP_KEEP_MONTHS", 12) };
}

async function main() {
  initMonitoring();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  const keep = retention();
  const bucket = process.env.BACKUP_S3_BUCKET;
  const destination = bucket ? s3Destination(bucket) : diskDestination(path.resolve(repoRoot, process.env.BACKUP_DIR || "./backups"));
  if (!bucket && process.env.NODE_ENV === "production") {
    console.warn("BACKUP_S3_BUCKET is not set: the backup stays on this server and is lost with it.");
  }

  const work = await mkdtemp(path.join(tmpdir(), "moments-backup-"));
  try {
    const name = backupName(new Date());
    const file = path.join(work, name);
    const { url, password } = pgConnection(databaseUrl);
    const env = { ...process.env, ...(password ? { PGPASSWORD: password } : {}) };
    const started = Date.now();
    await run("pg_dump", ["--format=custom", "--compress=9", "--no-owner", "--no-privileges", `--file=${file}`, `--dbname=${url}`], { env });
    const { stdout } = await run("pg_restore", ["--list", file], { maxBuffer: 64 * 1024 * 1024 });
    const tables = stdout.split("\n").filter((line) => / TABLE DATA /.test(line)).length;
    if (tables === 0) throw new Error("The dump has no table data; refusing to keep it");
    const { size } = await stat(file);
    await destination.save(file, name);
    console.log(`Backed up ${tables} tables (${(size / 1024 / 1024).toFixed(1)} MB) to ${destination.describe}${name} in ${((Date.now() - started) / 1000).toFixed(1)} s`);

    const expired = expiredBackups(await destination.list(), new Date(), keep);
    for (const old of expired) await destination.remove(old);
    if (expired.length) console.log(`Deleted ${expired.length} old backup(s)`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().then(
  () => process.exit(0),
  async (e) => {
    reportError(e, { where: "backup" });
    await flushMonitoring();
    process.exit(1);
  },
);
