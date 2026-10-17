import type { Metadata, Viewport } from "next";
import { Battambang, Kantumruy_Pro, Moul } from "next/font/google";
import { getLocale } from "@/i18n";
import "./globals.css";

const kantumruy = Kantumruy_Pro({ variable: "--font-kantumruy", subsets: ["khmer", "latin"] });
const battambang = Battambang({ variable: "--font-battambang", subsets: ["khmer", "latin"], weight: ["400", "700"] });
const moul = Moul({ variable: "--font-moul", subsets: ["khmer", "latin"], weight: "400" });

export const metadata: Metadata = {
  title: "Moments",
  description: "លិខិតអញ្ជើញ ការឆ្លើយតប និងសៀវភៅចំណងដៃ · Invitations, RSVPs and the gift book",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
};

export const viewport: Viewport = { themeColor: "#9b2c2c", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${kantumruy.variable} ${battambang.variable} ${moul.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
