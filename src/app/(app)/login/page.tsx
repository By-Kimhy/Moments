import { redirect } from "next/navigation";
import { getMessages } from "@/i18n";
import { getOptionalUser } from "@/lib/dal";
import { TelegramLogin } from "./telegram-login";

export const metadata = { title: "Sign in · Moments" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getOptionalUser()) redirect("/dashboard");
  const [t, { next }] = await Promise.all([getMessages(), searchParams]);
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 py-12">
      <h1 className="text-2xl font-semibold">{t.login.title}</h1>
      <p className="text-muted">{t.login.intro}</p>
      <TelegramLogin t={t.login} next={typeof next === "string" ? next : "/dashboard"} />
    </div>
  );
}
