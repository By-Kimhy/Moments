import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Battambang, Kantumruy_Pro, Moul } from "next/font/google";
import { LanguageToggle } from "@/components/language-toggle";
import { getLocale, getMessages } from "@/i18n";
import "./globals.css";

const kantumruy = Kantumruy_Pro({ variable: "--font-kantumruy", subsets: ["khmer", "latin"] });
const battambang = Battambang({ variable: "--font-battambang", subsets: ["khmer", "latin"], weight: ["400", "700"] });
const moul = Moul({ variable: "--font-moul", subsets: ["khmer", "latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Moments",
  description: "លិខិតអញ្ជើញ ការឆ្លើយតប និងសៀវភៅចំណងដៃ · Invitations, RSVPs and the gift book",
};

export const viewport: Viewport = { themeColor: "#9b2c2c", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, t] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html lang={locale} className={`${kantumruy.variable} ${battambang.variable} ${moul.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="border-b border-line print:hidden">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold text-accent">
              {t.app.name}
            </Link>
            <LanguageToggle label={t.common.language} />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-16">{children}</main>
      </body>
    </html>
  );
}
