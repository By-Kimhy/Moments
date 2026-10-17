import type { HostEvent } from "@api/contract";
import { notFound } from "next/navigation";
import { updateEvent } from "@/app/actions/events";
import { EventForm } from "@/components/event-form";
import { getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { toInputs } from "@/lib/dates";
import { getTemplates } from "@/lib/templates";

export default async function EditEventPage({ params }: PageProps<"/events/[eventId]/edit">) {
  const { eventId } = await params;
  const [t, templates, data] = await Promise.all([
    getMessages(),
    getTemplates(),
    apiGet<{ event: HostEvent; role: string }>(`/events/${eventId}`),
  ]);
  if (data.role !== "OWNER") notFound();
  return (
    <div className="py-8">
      <h1 className="mb-6 text-2xl font-semibold">{t.eventForm.editTitle}</h1>
      <EventForm
        action={updateEvent.bind(null, eventId)}
        t={t.eventForm}
        status={t.status}
        templates={templates}
        event={data.event}
        dateTime={toInputs(data.event.startsAt)}
        submitLabel={t.common.save}
        paidTemplateLabel={data.event.features.allTemplates ? undefined : t.plans.paidTemplate}
      />
    </div>
  );
}
