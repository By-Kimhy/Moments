import { getMessages } from "@/i18n";

export default async function InvitationNotFound() {
  const t = await getMessages();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-moul text-2xl text-accent">{t.app.name}</p>
      <p className="text-muted">{t.notFound.invitation}</p>
    </div>
  );
}
