// The text of Telegram messages to hosts, in the language of the event's creator.
// Plain text (no Markdown/HTML), so names with symbols can't break the formatting.
import { formatAmount, type Currency } from "./money.js";

type Lang = "KM" | "EN";
type Money = { USD: number; KHR: number };

const both = (m: Money, lang: Lang) =>
  [m.USD && formatAmount(m.USD, "USD", lang === "KM"), m.KHR && formatAmount(m.KHR, "KHR", lang === "KM")].filter(Boolean).join(" + ") || "0";
const n = (value: number, lang: Lang) => (lang === "KM" ? String(value).replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)]) : String(value));

export function rsvpMessage(lang: Lang, e: { title: string; guest: string; status: "ATTENDING" | "DECLINED"; count: number; message: string | null; attendingPeople: number }) {
  const lines =
    lang === "KM"
      ? [
          e.status === "ATTENDING" ? `✅ ${e.guest} នឹងមក (${n(e.count, lang)} នាក់)` : `❌ ${e.guest} មិនអាចមកបានទេ`,
          e.message ? `💬 "${e.message}"` : null,
          `សរុបនឹងមក៖ ${n(e.attendingPeople, lang)} នាក់`,
          `— ${e.title}`,
        ]
      : [
          e.status === "ATTENDING" ? `✅ ${e.guest} is coming (${e.count} people)` : `❌ ${e.guest} can't come`,
          e.message ? `💬 "${e.message}"` : null,
          `Coming in total: ${e.attendingPeople} people`,
          `— ${e.title}`,
        ];
  return lines.filter(Boolean).join("\n");
}

export function guestGiftMessage(lang: Lang, e: { title: string; guest: string; amount: number; currency: Currency; note: string | null; link: string }) {
  const amount = formatAmount(e.amount, e.currency, lang === "KM");
  const lines =
    lang === "KM"
      ? [
          `🎁 ${e.guest} បានប្រាប់ថាបានផ្ញើ ${amount} តាម KHQR។`,
          e.note ? `💬 "${e.note}"` : null,
          `សូមពិនិត្យកម្មវិធីធនាគាររបស់អ្នក រួចបញ្ជាក់៖ ${e.link}`,
          `— ${e.title}`,
        ]
      : [`🎁 ${e.guest} says they sent ${amount} by KHQR.`, e.note ? `💬 "${e.note}"` : null, `Check your banking app, then confirm: ${e.link}`, `— ${e.title}`];
  return lines.filter(Boolean).join("\n");
}

export function digestMessage(lang: Lang, e: { title: string; count: number; window: Money; total: Money; totalCount: number; minutes: number }) {
  return lang === "KM"
    ? [
        `📒 ចំណងដៃថ្មី ${n(e.count, lang)} ក្នុងរយៈពេល ${n(e.minutes, lang)} នាទីចុងក្រោយ៖ ${both(e.window, lang)}`,
        `សរុបរហូតមកដល់ពេលនេះ៖ ${both(e.total, lang)} (${n(e.totalCount, lang)} ចំណងដៃ)`,
        `— ${e.title}`,
      ].join("\n")
    : [`📒 ${e.count} new gifts in the last ${e.minutes} minutes: ${both(e.window, lang)}`, `Total so far: ${both(e.total, lang)} (${e.totalCount} gifts)`, `— ${e.title}`].join(
        "\n",
      );
}

export const linkedMessage = (lang: Lang, title: string) =>
  lang === "KM" ? `✅ បានភ្ជាប់ជាមួយ «${title}»។ អ្នកនឹងទទួលបានដំណឹងពីការឆ្លើយតប និងចំណងដៃនៅទីនេះ។` : `✅ Connected to "${title}". RSVPs and gifts will be posted here.`;

export const testMessage = (lang: Lang, title: string) =>
  lang === "KM" ? `👋 នេះជាសារសាកល្បងពី Moments សម្រាប់ «${title}»។` : `👋 Test message from Moments for "${title}".`;

export const startHelp =
  "សួស្តី! នេះជា bot របស់ Moments។ ដើម្បីទទួលដំណឹង សូមចុចប៊ូតុង «ភ្ជាប់ Telegram» នៅលើទំព័រកម្មវិធីរបស់អ្នក។\n\nHello! This is the Moments bot. To get alerts, use “Connect Telegram” on your event page.";

export const badCodeMessage =
  "លេខកូដនេះមិនត្រឹមត្រូវ ឬផុតកំណត់ហើយ។ សូមបង្កើតលេខកូដថ្មីនៅលើទំព័រកម្មវិធី។\n\nThis code is wrong or expired. Make a new one on the event page.";

export const loginAskContact =
  "សូមចុចប៊ូតុង «ចែករំលែកលេខទូរស័ព្ទ» ខាងក្រោម ដើម្បីចូល Moments។\n⚠️ ធ្វើបែបនេះ លុះត្រាតែអ្នកទើបតែចុច «ចូលតាម Telegram» ដោយខ្លួនឯង។ បើនរណាម្នាក់ផ្ញើតំណនេះមកអ្នក កុំចែករំលែក — ពួកគេនឹងចូលគណនីរបស់អ្នក។\n\nPress “Share my phone number” below to sign in to Moments.\n⚠️ Only do this if you just pressed “Sign in with Telegram” yourself. If someone sent you this link, don't share — they would get into your account.";
export const loginShareButton = "📱 ចែករំលែកលេខទូរស័ព្ទ · Share my phone number";
export const loginDone = "✅ បានចូលហើយ! សូមត្រឡប់ទៅកម្មវិធីរុករកវិញ។\n\nSigned in! Go back to your browser.";
export const loginExpired =
  "តំណចូលនេះផុតកំណត់ហើយ។ សូមចុច «ចូលតាម Telegram» ម្តងទៀតនៅលើទំព័រ Moments។\n\nThis sign-in link has expired. Press “Sign in with Telegram” again on the Moments page.";
export const loginNotYourContact = "សូមចែករំលែកលេខទូរស័ព្ទរបស់អ្នកផ្ទាល់ ដោយប្រើប៊ូតុងខាងក្រោម។\n\nPlease share your own number with the button below.";
