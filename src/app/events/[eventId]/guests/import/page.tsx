import Link from "next/link";
import { getMessages } from "@/i18n";
import { apiGet } from "@/lib/api";
import { ImportFlow } from "./import-flow";

export default async function ImportPage({ params }: PageProps<"/events/[eventId]/guests/import">) {
  const { eventId } = await params;
  // Checks the visitor is an owner of this event before showing the form.
  const [t] = await Promise.all([getMessages(), apiGet(`/events/${eventId}/guests/groups`)]);
  return (
    <div className="flex flex-col gap-6 py-8">
      <div>
        <Link href={`/events/${eventId}/guests`} className="text-sm text-muted">
          ← {t.guests.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t.importer.title}</h1>
      </div>
      <p className="text-sm text-muted">{t.importer.hint}</p>
      <a href="/guests-sample.csv" download className="self-start text-sm underline">
        {t.importer.sample}
      </a>
      <ImportFlow eventId={eventId} t={t.importer} sides={t.side} back={t.guests.title} />
    </div>
  );
}
