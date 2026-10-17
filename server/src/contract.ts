// The API's response shapes, shared with the web app (imported there as @api/contract).
// Types only, so the web bundle never pulls in server code.
import type { deskView, hostView } from "./lib/events.js";
import type { guestView } from "./lib/guests.js";
import type { CurrentUser } from "./auth.js";

export type { CurrentUser };
export type { ScheduleItem, Photo } from "./lib/events.js";
export type MemberRole = "OWNER" | "HELPER";
export type Language = "KM" | "EN";

/** Dates travel as ISO strings; the web app's API client turns them back into Dates. */
export type HostEvent = ReturnType<typeof hostView>;
export type DeskEvent = ReturnType<typeof deskView>;

export type ApiErrorBody = { error: string; fieldErrors?: Record<string, string[] | undefined> };

export type AuthResponse = { user: CurrentUser; token: string };
export type OtpRequestResponse = { phone: string; expiresIn: number; devCode?: string };
export type EventsResponse = { events: (HostEvent & { guestCount: number })[] };
export type EventResponse = { event: HostEvent; role: "OWNER" } | { event: DeskEvent; role: "HELPER" };
export type MembersResponse = {
  members: { id: string; role: MemberRole; displayName: string; phone: string | null; isCreator: boolean; revokedAt: Date | null; createdAt: Date }[];
};
export type DeskJoinResponse = { helper: { memberId: string; displayName: string }; event: DeskEvent; token: string };
export type DeskMeResponse = { helper: { memberId: string; displayName: string }; event: DeskEvent };

export type GuestView = ReturnType<typeof guestView>;
export type Side = GuestView["side"];
export type RsvpStatus = GuestView["rsvpStatus"];
export type GuestsResponse = {
  guests: GuestView[];
  summary: { guests: number; invitedPeople: number; attendingPeople: number; attending: number; declined: number; pending: number; opened: number };
  groups: string[];
};
export type GuestInput = {
  name: string;
  nameAlt: string | null;
  phone: string | null;
  side: Side;
  group: string | null;
  invitedCount: number;
  tableNo: string | null;
};
export type ImportPreview = {
  rows: { line: number; guest: GuestInput }[];
  errors: { line: number; messages: string[] }[];
  duplicates: number[];
};
export type BulkImportResponse = { created: number; skipped: number };
