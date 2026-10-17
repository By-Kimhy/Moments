// Paid plans: what each plan costs and allows. Prices are in US cents, per event. Plain data
// and pure functions, so the web app can import this (as @api/lib/plans) for the plan page.

export type Plan = "FREE" | "STANDARD" | "PREMIUM";
export type EffectivePlan = Plan | "PLANNER";

export type PlanFeatures = {
  maxGuests: number;
  allTemplates: boolean; // FREE: the traditional template only
  seating: boolean;
  thankYouSms: boolean;
  branding: boolean; // the "Moments" credit at the foot of invitations
};

export const PLANS: Record<Plan, { price: number } & PlanFeatures> = {
  FREE: { price: 0, maxGuests: 100, allTemplates: false, seating: false, thankYouSms: false, branding: true },
  STANDARD: { price: 2000, maxGuests: 1000, allTemplates: true, seating: false, thankYouSms: false, branding: false },
  PREMIUM: { price: 5000, maxGuests: 5000, allTemplates: true, seating: true, thankYouSms: true, branding: false },
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
  return { maxGuests: p.maxGuests, allTemplates: p.allTemplates, seating: p.seating, thankYouSms: p.thankYouSms, branding: p.branding };
}

/** What moving from the current plan to a higher one costs: the difference in price. */
export function upgradePrice(from: Plan, to: Plan): number | null {
  if (PLAN_ORDER.indexOf(to) <= PLAN_ORDER.indexOf(from)) return null;
  return PLANS[to].price - PLANS[from].price;
}
