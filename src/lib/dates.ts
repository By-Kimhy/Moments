// Events happen in Cambodia: times are entered and shown in Phnom Penh time (UTC+7, no DST).
const TZ = "Asia/Phnom_Penh";
const OFFSET = "+07:00";

/** "2026-12-20" + "07:00" in Phnom Penh → ISO string in UTC. */
export function toIso(date: string, time: string) {
  if (!date) return "";
  return new Date(`${date}T${time || "00:00"}:00${OFFSET}`).toISOString();
}

/** The date and time parts of a Date, in Phnom Penh, for <input type="date|time">. */
export function toInputs(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function formatDateTime(d: Date, locale: "km" | "en") {
  return new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", {
    timeZone: TZ,
    dateStyle: "full",
    timeStyle: "short",
  }).format(d);
}

/** The parts of an invitation date: "ថ្ងៃអាទិត្យ ២០ ធ្នូ ២០២៦" and "០៧:០០" in Khmer, with Khmer digits. */
export function invitationDate(d: Date, locale: "km" | "en") {
  const tag = locale === "km" ? "km-KH-u-nu-khmr" : "en-GB";
  const date = new Intl.DateTimeFormat(tag, { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat(tag, { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date: locale === "km" ? `ថ្ងៃ${date}` : date, time };
}

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";
/** "07:00" → "០៧:០០" for Khmer text. */
export const localDigits = (s: string, locale: "km" | "en") =>
  locale === "km" ? s.replace(/\d/g, (d) => KHMER_DIGITS[Number(d)]) : s;
