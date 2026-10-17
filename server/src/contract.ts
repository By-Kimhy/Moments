// The API's response shapes, shared with the web app (imported there as @api/contract).
// Types only, so the web bundle never pulls in server code.
import type { deskView, hostView } from "./lib/events.js";
import type { guestView } from "./lib/guests.js";
import type { publicEventView, publicGuestView } from "./lib/invitations.js";
import type { deskGuestView } from "./routes/checkins.js";
import type { giftView } from "./routes/gifts.js";
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
export type EventsResponse = { events: (HostEvent & { guestCount: number })[] };
export type EventResponse = { event: HostEvent; role: "OWNER" } | { event: DeskEvent; role: "HELPER" };
export type MembersResponse = {
  members: { id: string; role: MemberRole; displayName: string; phone: string | null; viaOrganization: boolean; isCreator: boolean; revokedAt: Date | null; createdAt: Date }[];
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
  tableId?: string | null;
  tableName: string | null;
};
export type ImportPreview = {
  rows: { line: number; guest: GuestInput }[];
  errors: { line: number; messages: string[] }[];
  duplicates: number[];
};
export type BulkImportResponse = { created: number; skipped: number };

export type InvitationEvent = ReturnType<typeof publicEventView>;
export type InvitationGuest = ReturnType<typeof publicGuestView>;
export type GuestGift = { id: string; amount: number; currency: "USD" | "KHR"; status: "PENDING" | "CONFIRMED" | "REJECTED"; createdAt: Date };
export type InvitationResponse = { event: InvitationEvent; guest: InvitationGuest; gifts: GuestGift[]; thankYou: { km: string; en: string } | null; inviteUrl: string };

export type DeskGuest = ReturnType<typeof deskGuestView>;
export type DeskStats = {
  checkedInGuests: number;
  checkedInPeople: number;
  expectedPeople: number;
  invitedPeople: number;
  invitedGuests: number;
  walkIns: number;
  recent: { guestId: string; name: string; id: string; peopleCount: number; checkedInAt: Date; checkedInBy: string }[];
};
export type DeskGuestsResponse = { guests: DeskGuest[]; stats: DeskStats; at: Date };

export type GiftView = ReturnType<typeof giftView>;
export type GiftTotals = import("./lib/gifts.js").GiftTotals;
export type GiftsResponse = { gifts: GiftView[]; totals: GiftTotals };

export type ReportSummary = Omit<import("./reports/data.js").Report, "gifts">;

export type SeatingPlan = Awaited<ReturnType<typeof import("./routes/seating.js")["seatingPlanForContract"]>>;

type ThankYouRecord = { channel: "SHARE"; status: "QUEUED" | "SENT" | "FAILED"; sentAt: Date | null; error: string | null };
export type ThankYouResponse = {
  settings: { thankYouKm: string | null; thankYouEn: string | null; defaults: { KM: string; EN: string } };
  canSend: boolean;
  counts: { ALL: number; ATTENDED: number; GAVE: number };
  sent: { SHARE: number };
  guests: { id: string; name: string; phone: string | null; inviteUrl: string; attended: boolean; gift: string; text: string; shared: ThankYouRecord | null }[];
};

export type OrganizationSummary = { id: string; name: string; brandColor: string; logoKey: string | null; createdAt: Date };
export type OrganizationsResponse = { organizations: (OrganizationSummary & { role: "OWNER" | "STAFF"; eventCount: number })[] };
export type OrganizationResponse = {
  organization: OrganizationSummary;
  role: "OWNER" | "STAFF";
  members: { id: string; role: "OWNER" | "STAFF"; name: string; phone: string | null; isMe: boolean }[];
};
export type PlannerEvent = HostEvent & {
  guests: number;
  replyRate: number;
  attendingPeople: number;
  arrivedPeople: number;
  giftTotal: { USD: number; KHR: number };
  pendingGifts: number;
  upcoming: boolean;
};
export type PlannerEventsResponse = { organization: OrganizationSummary; upcoming: PlannerEvent[]; past: PlannerEvent[] };

export type Currency = "USD" | "KHR";
export type TicketTypeRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: Currency;
  quantity: number;
  maxPerOrder: number;
  salesStart: Date | null;
  salesEnd: Date | null;
  active: boolean;
  sold: number;
  held: number;
  available: number;
  onSale: boolean;
};
export type OrderStatus = "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "EXPIRED";
export type OrderRow = ReturnType<typeof import("./lib/orders.js")["orderView"]>;
export type OrdersResponse = {
  orders: OrderRow[];
  summary: { paidOrders: number; ticketsSold: number; revenue: { USD: number; KHR: number }; fees: { USD: number; KHR: number }; waiting: number };
};
export type DoorTicket = { id: string; hash: string; type: string; buyerName: string; reference: string; checkedInAt: Date | null; checkedInBy: string | null };
export type DoorTicketsResponse = { tickets: DoorTicket[]; stats: { sold: number; entered: number } };
type Planner = { name: string; brandColor: string; logoKey: string | null } | null;
export type PublicTicketEvent = {
  event: {
    slug: string;
    titleKm: string;
    titleEn: string | null;
    descriptionKm: string | null;
    descriptionEn: string | null;
    startsAt: Date;
    venueKm: string | null;
    venueEn: string | null;
    mapUrl: string | null;
    photos: { key: string }[];
    planner: Planner;
  };
  ticketTypes: { id: string; name: string; description: string | null; price: number; currency: Currency; maxPerOrder: number; available: number; onSale: boolean }[];
};
export type OrderPage = {
  order: {
    reference: string;
    buyerName: string;
    status: OrderStatus;
    total: number;
    currency: Currency;
    expiresAt: Date;
    paidAt: Date | null;
    items: { name: string; quantity: number; unitPrice: number }[];
    tickets: { code: string; type: string; used: boolean }[];
  };
  event: {
    slug: string | null;
    titleKm: string;
    titleEn: string | null;
    startsAt: Date;
    venueKm: string | null;
    venueEn: string | null;
    mapUrl: string | null;
    khqrImageKey: string | null;
    khqrAccountName: string | null;
    planner: Planner;
  };
};

export type VendorCategory = import("./lib/vendor-catalog.js").VendorCategory;
export type VendorStatus = "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "SUSPENDED";
export type VendorCard = ReturnType<typeof import("./lib/vendors.js")["vendorCard"]>;
export type VendorProfile = ReturnType<typeof import("./lib/vendors.js")["vendorProfile"]>;
export type OwnVendor = ReturnType<typeof import("./lib/vendors.js")["ownerVendorView"]>;
export type VendorReview = { id: string; rating: number; text: string | null; reply: string | null; repliedAt: Date | null; author: string; hidden: boolean; createdAt: Date };
export type VendorDirectoryResponse = { vendors: VendorCard[]; total: number; page: number; pageSize: number };
export type VendorPageResponse = {
  vendor: VendorProfile;
  reviews: VendorReview[];
  viewer: { isOwner: boolean; enquired: boolean; canReview: boolean; myReview: { rating: number; text: string | null } | null } | null;
};
export type MyVendorsResponse = { vendors: (OwnVendor & { unreadEnquiries: number })[] };
export type MyVendorResponse = { vendor: OwnVendor; reviews: VendorReview[] };
export type VendorEnquiriesResponse = { enquiries: { id: string; name: string; phone: string; eventDate: Date | null; message: string; read: boolean; createdAt: Date }[] };
export type AdminVendor = OwnVendor & { owner: { name: string; phone: string | null }; enquiries: number };
export type AdminVendorsResponse = { vendors: AdminVendor[]; counts: Partial<Record<VendorStatus, number>> };
export type AdminReviewsResponse = {
  reviews: { id: string; rating: number; text: string | null; author: string; vendor: { name: string; slug: string }; hidden: boolean; createdAt: Date }[];
};
export type EventVendorsResponse = {
  vendors: { vendorId: string; status: "CONSIDERING" | "BOOKED"; note: string | null; listed: boolean; vendor: VendorCard & { phone: string | null; telegram: string | null } }[];
};

export type Plan = import("./lib/plans.js").Plan;
export type PlanOrderView = ReturnType<typeof import("./routes/plans.js")["planOrderView"]>;
export type PlanResponse = {
  plan: Plan;
  effectivePlan: import("./lib/plans.js").EffectivePlan;
  features: import("./lib/plans.js").PlanFeatures;
  guests: number;
  plans: ({ plan: Plan; price: number; upgradePrice: number | null } & import("./lib/plans.js").PlanFeatures)[];
  pending: PlanOrderView | null;
  orders: PlanOrderView[];
  platformKhqr: boolean;
};
export type AdminPlanOrdersResponse = {
  orders: (PlanOrderView & { event: { id: string; titleKm: string; titleEn: string | null; plan: Plan }; owner: { name: string; phone: string | null } })[];
};

export type AdminStats = Awaited<ReturnType<typeof import("./lib/admin-stats.js")["adminStats"]>>;
