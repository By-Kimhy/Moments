import Link from "next/link";
import { LanguageToggle } from "@/components/language-toggle";
import { getMessages } from "@/i18n";

// Pages for hosts and helpers. Invitations (/i/...) have their own full-screen layout.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const t = await getMessages();
  return (
    <>
      <header className="border-b border-line print:hidden">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-semibold text-accent">
            {t.app.name}
          </Link>
          <LanguageToggle label={t.common.language} />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-16">{children}</main>
    </>
  );
}
