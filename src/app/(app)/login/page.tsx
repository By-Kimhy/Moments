import { redirect } from "next/navigation";
import { getMessages } from "@/i18n";
import { getOptionalUser } from "@/lib/dal";
import { LoginForm } from "./login-form";
import { TelegramButton } from "./telegram-button";

export const metadata = { title: "Sign in · Moments" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getOptionalUser()) redirect("/dashboard");
  const [t, { next, error }] = await Promise.all([getMessages(), searchParams]);
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  return (
    <div className="mx-auto w-full max-w-sm py-12">
      <h1 className="mb-6 text-2xl font-semibold">{t.login.title}</h1>
      {error === "telegram" && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t.login.telegramFailed}</p>}
      <LoginForm t={t.login} next={typeof next === "string" ? next : "/dashboard"} />
      {bot && (
        <>
          <p className="my-6 text-center text-sm text-muted">{t.login.or}</p>
          <TelegramButton bot={bot} />
        </>
      )}
    </div>
  );
}
