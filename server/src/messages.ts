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
  "Upload a JPEG, PNG or WebP image.": "សូមផ្ទុករូបភាព JPEG, PNG ឬ WebP។",
  "The file is too large.": "ឯកសារធំពេក។",
  "Too many files at once.": "ឯកសារច្រើនពេកក្នុងពេលតែមួយ។",
  "The upload could not be read.": "មិនអាចអានឯកសារដែលបានផ្ទុកបានទេ។",
  "Choose at least one photo.": "សូមជ្រើសរើសរូបថតយ៉ាងហោចណាស់មួយ។",
  "An event can have up to 12 photos.": "កម្មវិធីមួយអាចមានរូបថតបានច្រើនបំផុត ១២។",
  "Photo not found.": "រកមិនឃើញរូបថត។",
  "Choose your KHQR image.": "សូមជ្រើសរើសរូបភាព KHQR របស់អ្នក។",
  "Guest not found.": "រកមិនឃើញភ្ញៀវ។",
  "Enter the guest's name.": "សូមបញ្ចូលឈ្មោះភ្ញៀវ។",
  "Choose the bride's or groom's side.": "សូមជ្រើសរើសខាងកូនក្រមុំ ឬខាងកូនកំលោះ។",
  "Enter how many people are invited.": "សូមបញ្ចូលចំនួនមនុស្សដែលបានអញ្ជើញ។",
  "Enter a whole number.": "សូមបញ្ចូលចំនួនគត់។",
  "At least 1 person.": "យ៉ាងហោចណាស់ ១ នាក់។",
  "At most 50 people per invitation.": "យ៉ាងច្រើន ៥០ នាក់ក្នុងលិខិតអញ្ជើញមួយ។",
  "Choose a CSV or Excel file.": "សូមជ្រើសរើសឯកសារ CSV ឬ Excel។",
  "Choose a CSV or Excel (.xlsx) file.": "សូមជ្រើសរើសឯកសារ CSV ឬ Excel (.xlsx)។",
  "The first row must have column headings, including a Name column.": "ជួរទីមួយត្រូវមានចំណងជើងជួរឈរ រួមទាំងជួរឈរ «ឈ្មោះ»។",
  "Import at most 2000 guests at a time.": "នាំចូលបានច្រើនបំផុត ២០០០ នាក់ក្នុងមួយលើក។",
  "There are no guests to add.": "មិនមានភ្ញៀវត្រូវបន្ថែមទេ។",
  "Some guests have problems. Fix them and try again.": "ភ្ញៀវខ្លះមានបញ្ហា។ សូមកែ ហើយព្យាយាមម្តងទៀត។",
  "This guest has gifts or a check-in recorded, so they can't be deleted.": "ភ្ញៀវនេះមានចំណងដៃ ឬបានចុះឈ្មោះចូលរួចហើយ ដូច្នេះមិនអាចលុបបានទេ។",
  "This invitation link is not valid.": "តំណលិខិតអញ្ជើញនេះមិនត្រឹមត្រូវទេ។",
  "Too many replies. Try again later.": "ឆ្លើយតបច្រើនដងពេក។ សូមព្យាយាមពេលក្រោយ។",
  "Replies for this event are closed.": "ការឆ្លើយតបសម្រាប់កម្មវិធីនេះបានបិទហើយ។",
  "Choose whether you are coming.": "សូមជ្រើសរើសថាអ្នកនឹងមក ឬមិនមក។",
  "Keep the message under 500 characters.": "សារត្រូវតិចជាង ៥០០ តួអក្សរ។",
  "Already checked in.": "បានចុះឈ្មោះចូលរួចហើយ។",
  "Enter how many people arrived.": "សូមបញ្ចូលចំនួនមនុស្សដែលបានមកដល់។",
  "Choose a guest.": "សូមជ្រើសរើសភ្ញៀវ។",
  "That time is not valid.": "ពេលវេលានោះមិនត្រឹមត្រូវ។",
  "Gift not found.": "រកមិនឃើញចំណងដៃ។",
  "Enter the amount.": "សូមបញ្ចូលចំនួនទឹកប្រាក់។",
  "Enter the amount in cents or riel.": "ចំនួនទឹកប្រាក់មិនត្រឹមត្រូវ។",
  "The amount must be more than 0.": "ចំនួនទឹកប្រាក់ត្រូវតែធំជាង ០។",
  "Choose USD or KHR.": "សូមជ្រើសរើស ដុល្លារ ឬ រៀល។",
  "That amount is too large.": "ចំនួនទឹកប្រាក់ធំពេក។",
  "Choose a guest or enter the giver's name.": "សូមជ្រើសរើសភ្ញៀវ ឬបញ្ចូលឈ្មោះអ្នកជូន។",
  "Give a reason.": "សូមបញ្ជាក់មូលហេតុ។",
  "This gift was cancelled and can't be changed.": "ចំណងដៃនេះត្រូវបានលុបចោល ហើយមិនអាចកែប្រែបានទេ។",
  "Only gifts waiting for confirmation can be confirmed.": "អាចបញ្ជាក់បានតែចំណងដៃដែលកំពុងរង់ចាំប៉ុណ្ណោះ។",
  "Only gifts waiting for confirmation can be rejected.": "អាចបដិសេធបានតែចំណងដៃដែលកំពុងរង់ចាំប៉ុណ្ណោះ។",
  "Too many gifts sent. Try again later.": "បានផ្ញើច្រើនដងពេក។ សូមព្យាយាមពេលក្រោយ។",
  "This event no longer accepts gifts here.": "កម្មវិធីនេះលែងទទួលចំណងដៃតាមទីនេះទៀតហើយ។",
  "PDF export is not set up on this server.": "ការនាំចេញ PDF មិនទាន់បានរៀបចំនៅលើម៉ាស៊ីនមេនេះទេ។",
  "Telegram is not set up on this server.": "Telegram មិនទាន់បានរៀបចំនៅលើម៉ាស៊ីនមេនេះទេ។",
  "Connect a Telegram chat first.": "សូមភ្ជាប់ Telegram ជាមុនសិន។",
};

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";
const khmerNumber = (n: string) => n.replace(/\d/g, (d) => KHMER_DIGITS[Number(d)]);

// Messages with a number in them.
const kmPatterns: [RegExp, (n: string) => string][] = [
  [/^This invitation is for up to (\d+) people\.$/, (n) => `លិខិតអញ្ជើញនេះសម្រាប់មនុស្សយ៉ាងច្រើន ${khmerNumber(n)} នាក់។`],
];

export function translate(message: string, language: string | false) {
  if (language !== "km") return message;
  if (km[message]) return km[message];
  for (const [pattern, render] of kmPatterns) {
    const match = message.match(pattern);
    if (match) return render(match[1]);
  }
  return message;
}

export function translateFields(fields: Record<string, string[] | undefined> | undefined, language: string | false) {
  if (!fields || language !== "km") return fields;
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.map((m) => translate(m, language))]));
}
