// Error monitoring. Every unexpected error goes through reportError: it is always written to the
// log, and also sent to Sentry when SENTRY_DSN is set. Events carry no request data (bodies,
// cookies, headers, query strings, IP addresses), because they hold guests' names, phone numbers
// and gift amounts; only the method, the route pattern and the tags passed here are sent.
import * as Sentry from "@sentry/node";
import { config } from "./config.js";

let enabled = false;

export function initMonitoring() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || config.test) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || (config.production ? "production" : "development"),
    release: process.env.SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
    beforeBreadcrumb: (crumb) => (crumb.category === "http" || crumb.category === "console" ? null : crumb),
  });
  enabled = true;
}

export function monitoringEnabled() {
  return enabled;
}

type Context = { where: string } & Record<string, string | number | undefined>;

/** Logs an unexpected error and sends it to Sentry when monitoring is on. */
export function reportError(err: unknown, context: Context) {
  const { where, ...tags } = context;
  console.error(`[${where}]`, ...Object.entries(tags).map(([k, v]) => `${k}=${v}`), err);
  if (!enabled) return;
  Sentry.withScope((scope) => {
    scope.setTag("where", where);
    for (const [key, value] of Object.entries(tags)) if (value !== undefined) scope.setTag(key, String(value));
    Sentry.captureException(err);
  });
}

/** Removes anything that could identify a guest or a session before an event leaves the server. */
export function scrubEvent<E extends Sentry.ErrorEvent>(event: E): E {
  delete event.request;
  delete event.user;
  delete event.breadcrumbs;
  if (event.extra) delete event.extra;
  return event;
}

/** Sends queued events before the process exits (on shutdown or a fatal error). */
export async function flushMonitoring(timeoutMs = 2000) {
  if (enabled) await Sentry.flush(timeoutMs);
}
