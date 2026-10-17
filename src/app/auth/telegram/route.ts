// The Telegram Login Widget redirects here with the signed login data as query parameters.
import { type NextRequest, NextResponse } from "next/server";
import type { AuthResponse } from "@api/contract";
import { ApiError, api } from "@/lib/api";
import { createSession } from "@/lib/session";

const FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date", "hash"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const body = Object.fromEntries(FIELDS.filter((k) => params.has(k)).map((k) => [k, params.get(k)!]));
  try {
    const { token } = await api.post<AuthResponse>("/auth/telegram", body);
    await createSession(token);
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.redirect(new URL("/login?error=telegram", request.url));
    throw e;
  }
}
