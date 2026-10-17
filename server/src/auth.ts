// Two kinds of session, both signed JWTs:
// - user:   a host who signed in with a phone code or Telegram (cookie "session" or Bearer token)
// - helper: someone who joined one event's desk with its helper code (cookie "desk" or X-Desk-Token)
// The API re-reads the user or helper from the database on every request.
import type { NextFunction, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { Language, MemberRole } from "@prisma/client";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { HttpError } from "./errors.js";

export const SESSION_COOKIE = "session";
export const DESK_COOKIE = "desk";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds
export const DESK_MAX_AGE = 60 * 60 * 24 * 7; // a wedding weekend, with room to spare

export type CurrentUser = { id: string; name: string; phone: string | null; telegramId: string | null; language: Language; isAdmin: boolean };
export type CurrentHelper = { memberId: string; eventId: string; displayName: string };
export type CurrentMember = { id: string; eventId: string; role: MemberRole; displayName: string };

type UserClaims = { kind: "user"; sub: string };
type HelperClaims = { kind: "helper"; sub: string; eventId: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: CurrentUser;
      helper?: CurrentHelper;
      member?: CurrentMember;
    }
  }
}

const key = () => new TextEncoder().encode(config.sessionSecret());

function sign(claims: Record<string, string>, maxAge: number) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(key());
}

export const signUserSession = (userId: string) => sign({ kind: "user", sub: userId }, SESSION_MAX_AGE);
export const signHelperSession = (memberId: string, eventId: string) =>
  sign({ kind: "helper", sub: memberId, eventId }, DESK_MAX_AGE);

async function verify<T extends { kind: string }>(token: string | undefined, kind: T["kind"]): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.kind === kind && typeof payload.sub === "string" ? (payload as unknown as T) : null;
  } catch {
    return null;
  }
}

function setCookie(res: Response, name: string, token: string, maxAge: number) {
  res.cookie(name, token, {
    httpOnly: true,
    secure: config.production,
    sameSite: "lax",
    path: "/",
    maxAge: maxAge * 1000,
  });
}

export const setSessionCookie = (res: Response, token: string) => setCookie(res, SESSION_COOKIE, token, SESSION_MAX_AGE);
export const setDeskCookie = (res: Response, token: string) => setCookie(res, DESK_COOKIE, token, DESK_MAX_AGE);
export const clearSessionCookie = (res: Response) => res.clearCookie(SESSION_COOKIE, { path: "/" });
export const clearDeskCookie = (res: Response) => res.clearCookie(DESK_COOKIE, { path: "/" });

function userToken(req: Request) {
  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.[SESSION_COOKIE] as string | undefined;
}

const deskToken = (req: Request) => req.get("x-desk-token") ?? (req.cookies?.[DESK_COOKIE] as string | undefined);

export const toCurrentUser = (u: {
  id: string;
  name: string;
  phone: string | null;
  telegramId: bigint | null;
  language: Language;
  isAdmin: boolean;
}): CurrentUser => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  telegramId: u.telegramId?.toString() ?? null,
  language: u.language,
  // Platform admins: marked in the database, or listed by phone in ADMIN_PHONES.
  isAdmin: u.isAdmin || (u.phone !== null && config.adminPhones().includes(u.phone)),
});

/** Loads the signed-in user and/or desk helper onto the request. */
export async function loadAuth(req: Request, _res: Response, next: NextFunction) {
  const [userClaims, helperClaims] = await Promise.all([
    verify<UserClaims>(userToken(req), "user"),
    verify<HelperClaims>(deskToken(req), "helper"),
  ]);
  if (userClaims) {
    const user = await prisma.user.findUnique({ where: { id: userClaims.sub } });
    // A deleted account's sessions stop working at once.
    if (user && !user.deletedAt) req.user = toCurrentUser(user);
  }
  if (helperClaims) {
    const member = await prisma.eventMember.findFirst({
      where: { id: helperClaims.sub, eventId: helperClaims.eventId, role: "HELPER", revokedAt: null },
      select: { id: true, eventId: true, displayName: true },
    });
    if (member) req.helper = { memberId: member.id, eventId: member.eventId, displayName: member.displayName };
  }
  next();
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, "Sign in first.");
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw new HttpError(401, "Sign in first.");
  if (!req.user.isAdmin) throw new HttpError(404, "Not found.");
  next();
}

/** For use after requireUser: the signed-in user. */
export function currentUser(req: Request) {
  if (!req.user) throw new HttpError(401, "Sign in first.");
  return req.user;
}
