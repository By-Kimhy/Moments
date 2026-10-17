import { randomInt } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";

export const app = createApp();

/** A random Cambodian mobile number, e.g. "012 345 678" style but unique per test. */
export const randomPhone = () => `0${randomInt(10, 99)}${String(randomInt(0, 1_000_000)).padStart(6, "0")}`;

// Each caller gets its own address so rate limits per IP don't trip across tests.
export const randomIp = () => `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;

/** Signs in with a fresh phone number and returns a supertest agent that keeps the session cookie. */
export async function signIn(name = "Test Host", phone = randomPhone()) {
  const agent = request.agent(app);
  const ip = randomIp();
  const otp = await agent.post("/api/auth/otp/request").set("X-Forwarded-For", ip).send({ phone });
  if (otp.status !== 200) throw new Error(`otp request failed: ${otp.status} ${JSON.stringify(otp.body)}`);
  const res = await agent.post("/api/auth/otp/verify").set("X-Forwarded-For", ip).send({ phone, code: otp.body.devCode, name });
  if (res.status !== 200) throw new Error(`otp verify failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, phone: otp.body.phone as string, user: res.body.user as { id: string; name: string }, token: res.body.token as string };
}

export const sampleEvent = {
  titleKm: "ពិធីមង្គលការ",
  titleEn: "Test wedding",
  startsAt: "2026-12-20T00:00:00Z",
  schedule: [{ time: "07:00", titleKm: "ពិធីហែជំនូន" }],
};

/** A signed-in host with one new event. */
export async function hostWithEvent(name = "Test Host") {
  const host = await signIn(name);
  const res = await host.agent.post("/api/events").send(sampleEvent);
  if (res.status !== 201) throw new Error(`create event failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { ...host, event: res.body.event as { id: string; helperCode: string } };
}

/** Joins an event's desk as a helper and returns an agent carrying the desk cookie. */
export async function joinDesk(code: string, name = "Helper") {
  const agent = request.agent(app);
  const res = await agent.post("/api/desk/join").set("X-Forwarded-For", randomIp()).send({ code, name });
  if (res.status !== 201) throw new Error(`desk join failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, memberId: res.body.helper.memberId as string, token: res.body.token as string };
}
