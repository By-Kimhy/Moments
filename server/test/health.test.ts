import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db.js";
import { routeLabel } from "../src/errors.js";
import { scrubEvent } from "../src/monitoring.js";
import { app } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("health checks", () => {
  it("answers liveness without touching dependencies", async () => {
    const spy = vi.spyOn(prisma, "$queryRaw");
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(spy).not.toHaveBeenCalled();
  });

  it("is ready when the database answers", async () => {
    const res = await request(app).get("/api/health/ready");
    expect(res.status).toBe(200);
    // Tests use the in-memory store instead of Redis.
    expect(res.body).toEqual({ ok: true, checks: { database: "ok", redis: "not configured" } });
  });

  it("answers 503 without details when the database is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432 password=secret"));
    const res = await request(app).get("/api/health/ready");
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, checks: { database: "down", redis: "not configured" } });
    expect(JSON.stringify(res.body)).not.toContain("secret");
  });
});

describe("error reporting", () => {
  it("labels routes without ids or tokens", () => {
    const req = { baseUrl: "/api/events/cm3x9k2ab0001qz8f7h6g5d4", route: { path: "/gifts/:giftId" }, path: "/gifts/cm3x9k2ab0002" };
    expect(routeLabel(req as never)).toBe("/api/events/:id/gifts/:giftId");
    expect(routeLabel({ baseUrl: "", route: undefined, path: "/api/invitations/aB3dE5fG7hJ9" } as never)).toBe("/api/invitations/:id");
  });

  it("sends no request, user or breadcrumb data", () => {
    const event = scrubEvent({
      type: undefined,
      message: "boom",
      request: { url: "/api/events/1/guests", data: { phone: "+85512345678" }, cookies: { session: "x" } },
      user: { ip_address: "1.2.3.4" },
      breadcrumbs: [{ message: "guest Dara" }],
      extra: { body: "x" },
      tags: { where: "api" },
    });
    expect(event).toEqual({ type: undefined, message: "boom", tags: { where: "api" } });
  });
});
