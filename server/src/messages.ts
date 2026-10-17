// Khmer versions of the API's error messages. The API writes messages in English; the error
// handler swaps in the Khmer text when the request prefers Khmer (Accept-Language: km).
// A message missing here is shown in English.
const km: Record<string, string> = {
  "Something went wrong.": "មានបញ្ហាអ្វីមួយ។ សូមព្យាយាមម្តងទៀត។",
  "Some fields are invalid.": "ព័ត៌មានខ្លះមិនត្រឹមត្រូវ។",
  "Not found.": "រកមិនឃើញ។",
  "Request body is not valid JSON.": "ទិន្នន័យមិនត្រឹមត្រូវ។",
  "Sign in first.": "សូមចូលគណនីជាមុនសិន។",
  "Only the hosts can do this.": "មានតែម្ចាស់កម្មវិធីទេដែលអាចធ្វើបាន។",
  "Event not found.": "រកមិនឃើញកម្មវិធី។",
  "Member not found.": "រកមិនឃើញសមាជិក។",
  "Enter your phone number.": "សូមបញ្ចូលលេខទូរស័ព្ទ។",
  "Enter a valid phone number.": "លេខទូរស័ព្ទមិនត្រឹមត្រូវ។",
  "Enter the 6-digit code.": "សូមបញ្ចូលលេខកូដ ៦ ខ្ទង់។",
  "Enter your name.": "សូមបញ្ចូលឈ្មោះរបស់អ្នក។",
  "Enter your name to create your account.": "សូមបញ្ចូលឈ្មោះ ដើម្បីបង្កើតគណនី។",
  "The code has expired. Ask for a new one.": "លេខកូដផុតកំណត់ហើយ។ សូមស្នើលេខកូដថ្មី។",
  "That code is not correct.": "លេខកូដមិនត្រឹមត្រូវ។",
  "Too many codes requested. Try again in a few minutes.": "ស្នើលេខកូដច្រើនពេក។ សូមរង់ចាំប៉ុន្មាននាទី។",
  "Too many codes requested. Try again later.": "ស្នើលេខកូដច្រើនពេក។ សូមព្យាយាមពេលក្រោយ។",
  "Telegram login is not set up.": "ការចូលតាម Telegram មិនទាន់បានរៀបចំទេ។",
  "Telegram login could not be verified.": "មិនអាចផ្ទៀងផ្ទាត់ការចូលតាម Telegram បានទេ។",
  "Enter a title in Khmer.": "សូមបញ្ចូលចំណងជើងជាភាសាខ្មែរ។",
  "Choose the date and time.": "សូមជ្រើសរើសកាលបរិច្ឆេទ និងម៉ោង។",
  "Paste a link that starts with https://": "សូមដាក់តំណដែលចាប់ផ្តើមដោយ https://",
  "Use a time like 07:30.": "សូមសរសេរម៉ោងដូចជា 07:30។",
  "Describe this part of the day.": "សូមពិពណ៌នាកម្មវិធីនេះ។",
  "Choose a template.": "សូមជ្រើសរើសគំរូ។",
  "Enter their name.": "សូមបញ្ចូលឈ្មោះ។",
  "This person is already a host.": "អ្នកនេះជាម្ចាស់កម្មវិធីរួចហើយ។",
  "The person who created the event can't be removed.": "មិនអាចដកអ្នកបង្កើតកម្មវិធីចេញបានទេ។",
  "Enter the 6-digit helper code.": "សូមបញ្ចូលលេខកូដជំនួយការ ៦ ខ្ទង់។",
  "That helper code is not correct.": "លេខកូដជំនួយការមិនត្រឹមត្រូវ។",
  "Too many tries. Wait a few minutes and try again.": "ព្យាយាមច្រើនដងពេក។ សូមរង់ចាំប៉ុន្មាននាទី។",
  "Join with the helper code first.": "សូមចូលដោយលេខកូដជំនួយការជាមុនសិន។",
};

export function translate(message: string, language: string | false) {
  return language === "km" ? (km[message] ?? message) : message;
}

export function translateFields(fields: Record<string, string[] | undefined> | undefined, language: string | false) {
  if (!fields || language !== "km") return fields;
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.map((m) => translate(m, language))]));
}
