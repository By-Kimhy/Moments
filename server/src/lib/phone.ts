// Phone numbers are stored in E.164 form. People type Cambodian numbers many ways:
// "012 345 678", "012-345-678", "+855 12 345 678", "855 12345678".

const CAMBODIA = "855";

/** Returns the number as +<country><number>, or null if it doesn't look like a phone number. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;

  let national: string;
  if (digits.startsWith("+")) {
    if (!digits.startsWith(`+${CAMBODIA}`)) {
      // Another country: keep it as typed if it has a plausible length.
      return digits.length >= 9 && digits.length <= 16 ? digits : null;
    }
    national = digits.slice(1 + CAMBODIA.length);
  } else if (digits.startsWith(CAMBODIA) && digits.length >= 11) {
    national = digits.slice(CAMBODIA.length);
  } else if (digits.startsWith("0")) {
    national = digits.slice(1);
  } else {
    national = digits;
  }
  national = national.replace(/^0/, "");
  // Cambodian mobile and landline numbers have 8 or 9 digits after the leading 0.
  if (!/^[1-9]\d{7,8}$/.test(national)) return null;
  return `+${CAMBODIA}${national}`;
}
