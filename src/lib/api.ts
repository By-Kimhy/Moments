// The web app's only route to data: every page and Server Action calls the Express API in
// server/, passing the visitor's session (host) and desk (helper) tokens along.
import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ApiErrorBody } from "@api/contract";
import { LOCALE_COOKIE } from "@/i18n";
import { DESK_COOKIE, SESSION_COOKIE } from "./cookies";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

// Dates arrive as ISO strings; turn them back into Date objects.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const revive = (_key: string, value: unknown) =>
  typeof value === "string" && ISO_DATETIME.test(value) ? new Date(value) : value;

type Body = Record<string, unknown> | FormData;

async function call<T>(method: string, path: string, body?: Body): Promise<T> {
  const jar = await cookies();
  const session = jar.get(SESSION_COOKIE)?.value;
  const desk = jar.get(DESK_COOKIE)?.value;
  const headers: Record<string, string> = {
    Accept: "application/json",
    // The API answers errors in this language.
    "Accept-Language": jar.get(LOCALE_COOKIE)?.value === "en" ? "en" : "km",
  };
  if (session) headers.Authorization = `Bearer ${session}`;
  if (desk) headers["X-Desk-Token"] = desk;
  if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text, revive) : undefined;
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody>;
    throw new ApiError(res.status, err.error ?? `API request failed (${res.status})`, err.fieldErrors);
  }
  return data as T;
}

/**
 * For pages: reads data, sending a signed-out visitor to /login and a missing record to the
 * 404 page.
 */
export async function apiGet<T>(path: string, { onUnauthorized = "/login" } = {}): Promise<T> {
  try {
    return await call<T>("GET", path);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect(onUnauthorized);
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
}

/** For Server Actions: changes data. Failures throw ApiError for the action to show. */
export const api = {
  get: <T>(path: string) => call<T>("GET", path),
  post: <T = unknown>(path: string, body: Body = {}) => call<T>("POST", path, body),
  put: <T = unknown>(path: string, body: Body) => call<T>("PUT", path, body),
  patch: <T = unknown>(path: string, body: Body) => call<T>("PATCH", path, body),
  delete: (path: string) => call<void>("DELETE", path),
};

export type FormState =
  | {
      errors?: Record<string, string[] | undefined>;
      message?: string;
      values?: Record<string, string>;
      done?: boolean;
    }
  | undefined;

/**
 * Runs an API call from a Server Action and turns validation and rule failures into the
 * { errors, message } the forms display. Anything else (a 500, a lost session) is rethrown.
 */
export async function attempt<T>(
  fn: () => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; state: NonNullable<FormState> }> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ApiError && [400, 409, 429].includes(e.status)) {
      return { ok: false, state: { errors: e.fieldErrors, message: e.fieldErrors ? undefined : e.message } };
    }
    if (e instanceof ApiError && e.status === 401) redirect("/login");
    throw e;
  }
}

export const field = (formData: FormData, key: string) => String(formData.get(key) ?? "");
