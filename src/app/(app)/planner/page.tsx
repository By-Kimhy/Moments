import { redirect } from "next/navigation";
import type { OrganizationsResponse } from "@api/contract";
import { getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { requireUser } from "@/lib/dal";
import { CreateOrganization } from "./forms";

// Planners land on their organization; others can create one.
export default async function PlannerHome() {
  await requireUser();
  const [t, { organizations }] = await Promise.all([getMessages(), apiGet<OrganizationsResponse>("/organizations")]);
  if (organizations.length === 1) redirect(`/planner/${organizations[0].id}`);
  return (
    <div className="flex flex-col gap-6 py-8">
      <h1 className="text-2xl font-semibold">{t.planner.title}</h1>
      {organizations.length > 0 && (
        <ul className="flex flex-col gap-2">
          {organizations.map((o) => (
            <li key={o.id}>
              <a href={`/planner/${o.id}`} className="block rounded-xl border border-line p-4 hover:bg-black/5">
                <span className="font-semibold">{o.name}</span> <span className="text-sm text-muted">· {t.planner.roles[o.role]}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <section className="flex flex-col gap-3 rounded-xl border border-line p-4">
        <p className="text-sm text-muted">{t.planner.intro}</p>
        <CreateOrganization t={t.planner} />
      </section>
    </div>
  );
}
