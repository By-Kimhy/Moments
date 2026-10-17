import Link from "next/link";
import { getMessages } from "@/i18n";
import { requireUser } from "@/lib/dal";
import { AccountForm, DeleteAccountForm } from "./forms";

export default async function AccountPage() {
  const [user, t] = await Promise.all([requireUser(), getMessages()]);
  return (
    <div className="flex flex-col gap-8 py-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted">
          ← {t.dashboard.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t.account.title}</h1>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line p-4 text-sm">
        <div>
          <dt className="text-muted">{t.account.phone}</dt>
          <dd>{user.phone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted">{t.account.telegram}</dt>
          <dd>{user.telegramId ? "✓" : "—"}</dd>
        </div>
      </dl>
      <AccountForm name={user.name} language={user.language} t={t.account} />
      <section className="flex flex-col gap-3 rounded-xl border border-red-200 p-4">
        <h2 className="font-semibold text-red-800">{t.account.deleteTitle}</h2>
        <p className="text-sm text-muted">{t.account.deleteHint}</p>
        <DeleteAccountForm t={t.account} />
      </section>
    </div>
  );
}
