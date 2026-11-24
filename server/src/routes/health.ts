// Health checks for the host and uptime monitors.
//   GET /api/health        liveness: the process is up (no dependencies checked).
//   GET /api/health/ready  readiness: the database and Redis answer; 503 when either doesn't.
// The answers name each check and say ok or down, nothing more, since anyone can call them.
import { Router } from "express";
import { prisma } from "../db.js";
import { reportError } from "../monitoring.js";
import { store } from "../store.js";

type Status = "ok" | "down" | "not configured";

const TIMEOUT_MS = 3000;

async function check(name: string, run: () => Promise<unknown>): Promise<Status> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${name} did not answer within ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
      }),
    ]);
    return "ok";
  } catch (e) {
    reportError(e, { where: "health", check: name });
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.set("Cache-Control", "no-store").json({ ok: true });
});

healthRouter.get("/ready", async (_req, res) => {
  const [database, redis] = await Promise.all([
    check("database", () => prisma.$queryRaw`SELECT 1`),
    store.kind === "redis" ? check("redis", () => store.ping()) : Promise.resolve<Status>("not configured"),
  ]);
  const ok = database === "ok" && redis !== "down";
  res.status(ok ? 200 : 503).set("Cache-Control", "no-store").json({ ok, checks: { database, redis } });
});
