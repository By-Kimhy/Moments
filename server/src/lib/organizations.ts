import type { Organization } from "@prisma/client";

export const organizationView = (o: Organization) => ({
  id: o.id,
  name: o.name,
  brandColor: o.brandColor,
  logoKey: o.logoKey,
  paidUntil: o.paidUntil,
  createdAt: o.createdAt,
});

/** What an invitation shows about the planner: "Planned by …" with their logo. */
export const plannerBranding = (o: Organization | null) => (o ? { name: o.name, brandColor: o.brandColor, logoKey: o.logoKey } : null);
