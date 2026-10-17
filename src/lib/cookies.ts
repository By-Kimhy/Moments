// Cookie names shared by pages, Server Actions and proxy.ts. No server-only imports here.
export const SESSION_COOKIE = "session";
export const DESK_COOKIE = "desk";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // matches the API's user session
export const DESK_MAX_AGE = 60 * 60 * 24 * 7; // matches the API's helper session
