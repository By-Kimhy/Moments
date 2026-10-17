import "server-only";
import { cookies } from "next/headers";
import { DESK_COOKIE, DESK_MAX_AGE, SESSION_COOKIE, SESSION_MAX_AGE } from "./cookies";

// The API signs the tokens; the web app keeps them in httpOnly cookies and sends them back
// to the API on every call (see api.ts).
async function set(name: string, token: string, maxAge: number) {
  (await cookies()).set(name, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export const createSession = (token: string) => set(SESSION_COOKIE, token, SESSION_MAX_AGE);
export const createDeskSession = (token: string) => set(DESK_COOKIE, token, DESK_MAX_AGE);

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function deleteDeskSession() {
  (await cookies()).delete(DESK_COOKIE);
}
