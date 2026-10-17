import { createEvent } from "@/app/actions/events";
import { EventForm } from "@/components/event-form";
import { getMessages } from "@/i18n";
import { requireUser } from "@/lib/dal";
import { getTemplates } from "@/lib/templates";

export default async function NewEventPage() {
  await requireUser();
  const [t, templates] = await Promise.all([getMessages(), getTemplates()]);
  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.eventForm.newTitle}</h1>
      <EventForm action={createEvent} t={t.eventForm} templates={templates} submitLabel={t.eventForm.create} paidTemplateLabel={t.plans.paidTemplate} />
    </div>
  );
}
