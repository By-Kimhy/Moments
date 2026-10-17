// Paid plans: what each plan costs and allows. Prices are in US cents, per event. Plain data
// and pure functions, so the web app can import this (as @api/lib/plans) for the plan page.

export type Plan = "FREE" | "STANDARD" | "PREMIUM";
export type EffectivePlan = Plan | "PLANNER";

export type PlanFeatures = {
  maxGuests: number;
  allTemplates: boolean; // FREE: the traditional template only
  seating: boolean;
  photoWall: boolean; // guests send photos from their invitation link
  branding: boolean; // the "Moments" credit at the foot of invitations
};

export const PLANS: Record<Plan, { price: number } & PlanFeatures> = {
  FREE: { price: 0, maxGuests: 100, allTemplates: false, seating: false, photoWall: false, branding: true },
  STANDARD: { price: 2000, maxGuests: 1000, allTemplates: true, seating: false, photoWall: false, branding: false },
  PREMIUM: { price: 5000, maxGuests: 5000, allTemplates: true, seating: true, photoWall: true, branding: false },
};
export const PLAN_ORDER: Plan[] = ["FREE", "STANDARD", "PREMIUM"];
export const FREE_TEMPLATE = "traditional";

type EventPlanFields = { plan: Plan; organizationId: string | null; type: "WEDDING" | "TICKETED" };

/**
 * The plan an event runs on. Planner organizations' events get Premium features; ticketed
 * events pay a fee per ticket instead, so they get them too.
 */
export function effectivePlan(e: EventPlanFields): EffectivePlan {
  if (e.organizationId) return "PLANNER";
  if (e.type === "TICKETED") return "PREMIUM";
  return e.plan;
}

export function featuresOf(e: EventPlanFields): PlanFeatures {
  const plan = effectivePlan(e);
  const p = PLANS[plan === "PLANNER" ? "PREMIUM" : plan];
  return { maxGuests: p.maxGuests, allTemplates: p.allTemplates, seating: p.seating, photoWall: p.photoWall, branding: p.branding };
}

/** What moving from the current plan to a higher one costs: the difference in price. */
export function upgradePrice(from: Plan, to: Plan): number | null {
  if (PLAN_ORDER.indexOf(to) <= PLAN_ORDER.indexOf(from)) return null;
  return PLANS[to].price - PLANS[from].price;
}

// Other things the platform sells, paid the same way as plans (platform KHQR, admin confirms).

/** A vendor listed first in the directory, for this many days. */
export const FEATURED_PACKAGES = [
  { units: 30, price: 1500 },
  { units: 90, price: 4000 },
];

/** A planner organization's subscription, for this many months. New organizations get a trial. */
export const PLANNER_PACKAGES = [
  { units: 1, price: 3000 },
  { units: 12, price: 30000 },
];
export const PLANNER_TRIAL_DAYS = 30;

/** Adds calendar months, keeping the day where it can (31 January + 1 month = 28/29 February). */
export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
