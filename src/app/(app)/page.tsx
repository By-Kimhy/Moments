import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, secondaryButtonClass } from "@/components/form";
import { getMessages } from "@/i18n";
import { getOptionalUser } from "@/lib/dal";

export default async function Home() {
  if (await getOptionalUser()) redirect("/dashboard");
  const t = await getMessages();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-16 text-center">
      <h1 className="font-moul text-3xl text-accent">{t.app.name}</h1>
      <p className="max-w-md text-lg text-muted">{t.app.tagline}</p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Link href="/login" className={buttonClass}>
          {t.home.hostCta}
        </Link>
        <Link href="/desk" className={secondaryButtonClass}>
          {t.home.helperCta}
        </Link>
        <Link href="/vendors" className="text-sm text-muted underline">
          {t.vendors.find}
        </Link>
      </div>
    </div>
  );
}
