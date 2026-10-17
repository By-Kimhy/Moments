# Moments

A Khmer-first app for Cambodian weddings: digital invitations, RSVPs, guest check-in and the
gift book (chamnang dai), in cash or by KHQR. Guests need no app and no login.

The plan and the approved design (folder structure, database schema, build order) are in
[docs/PROPOSAL.md](docs/PROPOSAL.md).

| Part | Folder | Stack | Port |
| ---- | ------ | ----- | ---- |
| Web app | `src/` | Next.js 16 (App Router, TypeScript, Tailwind CSS) | 3000 |
| API | `server/` | Node.js, Express 5, TypeScript, Prisma 6, zod | 4000 |
| Database | `server/prisma/` | PostgreSQL 16 | 5432 |
| Codes, rate limits, queue | | Redis 7 | 6379 |

The web app never touches the database. Its pages and Server Actions call the API, passing
the visitor's session along (`src/lib/api.ts`).

## Running locally

Requirements: Node.js 22+, PostgreSQL 16 and Redis (or Docker).

```bash
docker compose up -d          # PostgreSQL + Redis (skip if you run them yourself)
cp .env.example .env          # then set SESSION_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate            # create the tables
npm run db:seed               # 3 templates + a demo wedding with 50 guests
npm run dev                   # API on :4000, web app on :3000
```

Open http://localhost:3000. Both parts read the one `.env` at the repository root.

### Demo data

`npm run db:seed` creates (outside production):

| Who | How to sign in |
| --- | -------------- |
| Host | Phone `012 345 678` |
| Co-host (bride's side) | Phone `098 765 432` |
| Helper | Go to `/desk`, helper code `123456`, any name |
| Concert door | Go to `/desk`, helper code `654321` |
| Ticket buyer | Open `/e/khmer-music-night` |
| Platform admin | The host above (`012 345 678`) is also an admin: `/admin` |
| Plans | The demo wedding is on Premium; new events start on Free |
| Vendor | Phone `077 777 777` (owns the demo listings at `/vendors`) |

Without a Telegram bot (`TELEGRAM_BOT_TOKEN` empty) and with `ALLOW_TEST_LOGIN=true` (never in
production; it is ignored there), the login page shows a test form instead: type one of the phone numbers above. With a bot, sign in with the
Telegram account whose phone number matches.

## How sign-in works

- **Hosts, planners and vendors sign in with Telegram only** — no passwords, no SMS. "Sign in
  with Telegram" opens the bot with a one-time token (`t.me/<bot>?start=login_<token>`, valid
  10 minutes). In Telegram they press Start, then "Share my phone number"; Telegram vouches for
  the number, and the bot accepts only the person's own contact. The bot warns people to share
  only if they pressed "Sign in" themselves, since a link someone sends them would sign the
  sender in. The login page asks every two
  seconds and signs in as soon as the bot has confirmed.
- Accounts are found by Telegram id, then by phone number, so someone added by phone (a
  co-host, planner staff, a planner's client) finds their events the first time they sign in.
  Their Telegram name is used for a new account.
- **Helpers** need no account. The host shares the event's 6-digit helper code; a helper
  enters it with their name at `/desk` and gets a session for that one event. Hosts can
  remove a helper or make a new code.
- **Co-hosts:** a host adds another host by phone number (e.g. the other family). They sign
  in with that number and see the event.

- **My account** (`/account`): change the name and the language of Telegram messages, or
  delete the account (type DELETE). Deleting wipes the name, phone number and Telegram link
  and ends every session at once; the records others rely on stay (gift books, guest lists,
  reviews, the audit log). Events nobody else hosts are archived, vendor pages are taken down,
  and the last owner of an organization with staff must hand it over first.

The API signs sessions as JWTs (`SESSION_SECRET`): the host session in the `session`
cookie (or `Authorization: Bearer`), the helper session in the `desk` cookie (or
`X-Desk-Token`).

## Access rules

- Every event route is under `/api/events/:eventId` and goes through `eventAccess`
  (`server/src/access.ts`), which finds the caller's membership in that event. Anyone else
  gets 404, as if the event didn't exist.
- Owners (hosts and co-hosts) can do everything; helpers only get the desk. The person who
  created the event can't be removed.
- Every change to events and members is written to `audit_logs` in the same transaction.

## Language

Khmer is the default; the button in the header switches to English (a `lang` cookie). Web
text lives in `src/i18n/km.ts` and `src/i18n/en.ts`. The API writes its error messages in
English and translates them to Khmer (`server/src/messages.ts`) when the request sends
`Accept-Language: km`, which the web app does for Khmer visitors. Fonts: Kantumruy Pro,
Battambang and Moul.

## Photos and KHQR

Owners upload up to 12 couple photos (the first is the invitation's cover) and the family's
KHQR image on the event page. The API re-encodes every upload with sharp: photos become WebP
of at most 1600 px, the KHQR stays lossless PNG so it scans, and phone metadata such as GPS
location is removed. Files get unguessable keys and are served at `/api/files/<key>` (the web
app forwards `/api/*` to the API).

Without `S3_BUCKET` the files go to `UPLOAD_DIR` (default `./uploads`). For production set
`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_ENDPOINT` for
Cloudflare R2 or MinIO. The S3 code path has not yet been run against a real bucket.

## Guests

At `/events/<id>/guests` owners see totals (guests, people invited, coming, not coming, no
reply, opened), search by name or phone, filter by side, reply and group, and add or edit
guests. Each guest has a personal invitation link (`/i/<token>`) with copy and Telegram share
buttons; "Make a new link" stops the old one working.

**Import:** upload a CSV or Excel (.xlsx) file whose first row is headings. Recognised
columns, in English or Khmer: Name / ឈ្មោះ, Latin name / ឈ្មោះឡាតាំង, Phone / លេខទូរស័ព្ទ,
Side / ខាង (bride, groom, ខាងស្រី, ខាងប្រុស, …), Group / ក្រុម, People / ចំនួន,
Table / លេខតុ. Khmer digits work. The preview lists rows with problems and phone numbers
already on the list (those are skipped); nothing is saved until you confirm. A sample file is
at `/guests-sample.csv`.

**Export:** "Download CSV" gives the whole list with invitation links, readable by Excel.

A guest with a gift or check-in recorded can't be deleted, so money records always keep
their guest.

## Invitations and RSVP

Each guest's link opens `/i/<token>`: no app, no login. The page shows the couple, the guest's
own name, date and time in Phnom Penh time (Khmer digits in Khmer), venue with a map button,
the day's schedule, photos, the family's KHQR (with "save image" for banking apps on the same
phone) and the guest's personal entry QR for check-in. A button switches Khmer/English
(`?lang=en`).

- **Templates:** traditional (red and gold, Moul headings), modern (soft rose, arched cover
  photo) and minimal (white). Colours and fonts come from each template's `config`.
- **RSVP:** one tap for coming or not, how many people (up to the number invited, default all
  of them) and an optional wish. Guests can change their reply until the event starts; replies
  close when the event starts or is archived. Every reply is in the audit log.
- **Opened:** the page tells the API when a guest opens it, from the browser only, so
  Telegram/Facebook link previews and hosts' own visits don't count.
- **Link previews:** Telegram and Facebook show the event title, "សូមគោរពអញ្ជើញ <name>", the
  date and venue, and the cover photo as a 1200×630 JPEG (`/api/files/<key>/og.jpg`), or
  `public/og-default.png` when there is no photo. Links are marked noindex.
- **Drafts:** guests can't open links of a draft event (they see "invitation not found").
  Hosts publish from the event page and can preview the invitation at any time
  (`/events/<id>/preview`).

## Guest desk (check-in)

Helpers use `/desk` after joining with the helper code; hosts use the "Guest desk" tab
(`/events/<id>/checkin`). Same screen for both:

- **Live count** of people and guests arrived against people expected (RSVP "coming"),
  refreshed every 10 seconds, and the last arrivals.
- **Find a guest** by typing part of a name (Khmer or Latin, spaces ignored) or phone number.
  The whole guest list is loaded once onto the phone, so search is instant.
- **Scan QR:** the back camera reads the QR on the guest's invitation (jsQR, works on Android
  and iPhone; needs https). The desk never receives invitation tokens, only a short hash of
  each, which it compares with the hash of the scanned code.
- **Check in** with the number of people who actually came (defaults to their reply, or the
  number invited). A second phone checking the same guest is told who already did it and
  when. Mistakes can be undone. Every check-in and undo is in the audit log.
- **Walk-ins:** someone not on the list is added (marked as a walk-in) and checked in at once.
- Every write carries an id made on the phone, so a request sent twice is saved once.

## Gift book (chamnang dai)

- **At the desk:** in a guest's panel, a helper enters the amount (quick buttons for common
  amounts like $50 or 100,000៛; Khmer digits work), USD or riel, cash or KHQR, and a note. The
  panel warns when the guest already gave, so an envelope isn't recorded twice. "Gift from
  someone not on the list" records a giver by name only.
- **Cash box:** each helper sees the gifts they recorded and their total, to count against
  the cash in their box. Hosts see every gift.
- **Gift book page** (hosts, "ចំណងដៃ" tab): totals in USD and KHR (never converted), by side
  and by method; search and filters; add a gift by hand; each gift has a page with edit,
  cancel (with a reason) and its full history.
- **KHQR gifts from guests:** under the KHQR on the invitation, a guest can say how much they
  sent. It waits as "pending" and is not counted until a host checks their bank app and taps
  "Received" (or "Not received"). The guest's page shows the status. Confirmation goes through
  a `PaymentProvider` (`server/src/providers/payment.ts`); today that is the manual one, which
  records a `payments` row. An automatic Bakong/bank provider can replace it later.
- **Nothing is lost or silently changed:** gifts can't be deleted. Edits keep the before and
  after, cancelled gifts stay in the book crossed out, and confirm/reject are logged. Helpers can
  only correct or cancel their own entries.
- **Money** is stored in cents (USD) or riel (KHR) as whole numbers (`server/src/lib/money.ts`,
  shared with the web app).

## Reports

The "របាយការណ៍" tab shows totals, attendance, totals by group and every giver, for both
sides or one side's book (families often keep separate books for the bride's and the groom's
side). Downloads, in Khmer or English:

- **Excel** (`gift-book[-side]-<date>.xlsx`): a summary, gifts by guest (one row per giver,
  amounts as numbers with a total formula), every gift including cancelled ones with who
  recorded them, and the guest list with replies and arrivals. The font is Khmer OS Battambang.
- **PDF**: the summary and the gifts-by-guest table on A4, printed by Chromium with Kantumruy
  Pro and Moul embedded, so Khmer renders correctly (PDF libraries without a text-shaping
  engine break Khmer). Set `CHROMIUM_PATH` to a Chromium/Chrome binary on the API server;
  without one the PDF download answers 503 (Excel still works). In Docker, install the
  `chromium` package and set `CHROMIUM_PATH=/usr/bin/chromium`.

Only confirmed gifts are counted; cancelled and rejected gifts appear only in the "every gift"
sheet, and KHQR gifts still waiting are shown separately.

## Seating plan

The "ប្លង់តុ" tab:

- **Tables:** add many at once ("20 tables of 10 seats", numbered after the highest number),
  rename (e.g. "តុកិត្តិយស"), change seats, delete (its guests just lose their table).
- **Seats per guest:** people confirmed if they said yes, people invited if no reply yet, none
  if they said no. Tables over capacity are shown in red (allowed, not blocked).
- **Arrange automatically:** seats everyone without a table, keeping each side together, then
  each group, and never splitting a family across tables. "Re-arrange everyone" starts over.
  Guests who don't fit are reported so you can add tables.
- **By hand:** tick guests without a table and seat them at a table; remove a guest from a table.
- **Print:** a PDF with an alphabetical "find your table" list for the entrance and one card per
  table for the venue.
- The guest's table shows on their invitation, at the desk, in the guest list, in the Excel
  report, and the guest spreadsheet's Table column fills tables on import (created if needed).

## Thank-you messages

The "អរគុណ" tab, after the wedding:

- **Text** in Khmer and English with `{name}`, `{gift}` (their confirmed gifts, e.g.
  "$៥០.០០ + ១០០,០០០៛"), `{couple}` and `{link}`; a default text is used when left empty.
- **Who:** every guest except those who said no, those who came, or those who gave a gift.
  Each guest's own text is shown before sending.
- **Sending:** "Send on Telegram" next to each guest opens Telegram with the guest's text and
  link to send in a chat with them, and marks the guest as thanked. Moments sends no SMS.
- **The invitation link** turns into a thank-you card 12 hours after the start (or when the
  event is finished): the reply and entry QR are replaced by the guest's thank-you.

## Wishes

- Each invitation has a "ពាក្យជូនពរ" box: guests write a wish for the couple (up to 5), also
  after the day, until the event is archived.
- Hosts see every wish on the "ពាក្យជូនពរ" tab, together with the messages guests wrote with
  their reply or their gift, and can hide a wish.
- "Download the wish book" prints them all as a PDF, one card per wish, to keep or print.

## Photo wall (Premium)

- From 12 hours before the start until 7 days after, each guest's invitation shows a photo
  wall: they send up to 30 photos from their phone (resized, location data removed) and see
  everyone's, refreshed every 30 seconds.
- Hosts see all of them on the "រូបថតភ្ញៀវ" tab, and can hide (or delete) any photo.
- "Show on a screen" opens a full-screen slideshow of the newest photos for a projector or TV
  at the venue; it picks up new photos every 15 seconds.

## Planner dashboard

For wedding planners and venues ("សម្រាប់អ្នករៀបចំមង្គលការ" on the dashboard):

- **Organization** with a name, brand colour and logo; **owners** manage it and its team,
  **staff** work on its events. Staff are added by phone number.
- **Every event of the organization** is open to all its staff as hosts, without adding them one
  by one; their actions are logged under their own name. Leaving the organization ends that
  access everywhere. On the event, they are shown as "via planner" and can only be removed in
  the organization.
- **New event for a client** from the dashboard; the client (couple or parent) is added as a
  co-host by phone and signs in to see their own wedding. Planners can also move one of their
  own events into the organization.
- **Dashboard:** upcoming and past events with date, status, guests, reply rate, people coming,
  arrivals, gift totals and KHQR gifts waiting.
- **Branding:** invitations of the organization's events end with its logo and
  "រៀបចំដោយ <name>" instead of the Moments footer.

## Ticketed events (concerts, seminars, workshops)

Create an event and choose "Ticketed event"; give it a link name (`slug`) and a description,
upload your KHQR on the overview page, add ticket types on the "សំបុត្រ" tab and publish.
The event then has its own tabs: overview, tickets and door.

- **Ticket page** `/e/<slug>` (Khmer/English, link preview with the cover photo): ticket types
  with price, what's left and sales windows; buyers choose quantities (one currency per order,
  a maximum per order per type) and give a name and phone number — no account.
- **Hold and stock:** an order holds its tickets for 30 minutes. Stock is checked with the
  ticket types locked in the database transaction, so tickets are never oversold, even when
  buyers race for the last ones. Expired holds go back on sale.
- **Paying:** the buyer's order page `/o/<token>` shows the amount, the organizer's KHQR and a
  short reference (e.g. `FHXS9C`, no look-alike characters) to write in the payment note. The
  organizer sees the order waiting, checks the bank app and taps "Received", which issues the
  tickets (a late payment on an expired hold is accepted if tickets are left). The page updates
  by itself and shows one QR per ticket. Buyers keep their order link (it is
  shown after ordering); the organizer gets a Telegram alert for each new order.
- **Fee:** `PLATFORM_FEE_PERCENT` (default 4) of each order is recorded; the tickets tab shows
  revenue and fees per currency.
- **Door:** the organizer ("ច្រកចូល" tab) and helpers with the event's helper code (at `/desk`)
  scan tickets. Each ticket lets one person in once; a second scan shows when and by whom it was
  used; cancelled orders' tickets are refused. Someone can also be let in from the list by name
  or reference. Like the guest desk it works offline (ticket list kept on the phone, entries
  queued and synced; the scanner only receives hashes of ticket codes).
- **Cancel** an order (unpaid, or refunded): its tickets stop working.

The seed adds a demo concert at `/e/khmer-music-night` (door helper code `654321`).

## Vendor marketplace

- **Directory** `/vendors` (public, server-rendered): photographers, video, decoration, venues,
  makeup, attire, catering, music, MCs, invitation printing and more, filtered by category and
  province (all 25) and searched by name. Featured vendors come first, then the best rated.
- **Profile** `/vendors/<slug>`: photos, description (Khmer/English), "price from", call,
  Telegram and Facebook buttons, and reviews.
- **Vendors** sign in like hosts and create their page at `/vendor`: details, logo, up to 12
  photos, then "send for review". A platform admin approves it (or sends it back with a note,
  or suspends it); only published listings are public.
- **Enquiries:** a signed-in host sends their name, phone, event date and a message, optionally
  for one of their events. The vendor gets a Telegram message from the bot and sees it in their inbox. Each enquiry is
  kept, so referrals can be counted.
- **Reviews:** one per host per vendor (sending again edits it), 1–5 stars, only from hosts who
  sent that vendor an enquiry. The vendor can reply; admins can hide a review. The rating is
  the average of visible reviews.
- **Event shortlist:** "Save to an event" on a profile adds the vendor to the event's
  "អ្នកផ្តល់សេវា" tab as considering or booked, with a note and their contact details.
- **Reports:** signed-in people can report a vendor or a review (fake, inappropriate, spam,
  other, with a note), once until it is dealt with. Admins see them oldest first in
  `/admin/reports` and resolve them, hide the review or suspend the vendor from there.
- **Leads report** (`/admin/leads`): enquiries per vendor for each month, with a CSV download,
  for charging vendors per lead.
- **Admins** (`User.isAdmin`, or phone numbers in `ADMIN_PHONES`) use `/admin`: the review
  queue by status, approve, send back, suspend, feature for a number of days, hide reviews.

## Plans

Prices and limits live in `server/src/lib/plans.ts` (US cents, per event):

| Plan | Price | Guests | Templates | Seating plan | Moments credit on invitations |
| ---- | ----- | ------ | --------- | ------------ | ----------------------------- |
| Free | – | 100 | traditional | – | yes |
| Standard | $20 | 1,000 | all | – | no |
| Premium | $50 | 5,000 | all | yes (and the photo wall) | no |

- New weddings start on Free; events that existed before plans became Standard. Events of a
  planner organization ("Planner") and ticketed events (which pay a fee per ticket) get every
  feature.
- The API enforces the limits and answers 402 with the reason: adding or importing guests past
  the limit (walk-ins at the desk are never refused), choosing another template, arranging
  tables. The web app shows an "upgrade" notice where it applies.
- **Upgrading:** the event's "Plan" page (from the overview) lists the plans; choosing one
  creates an order for the difference in price with a short reference, and shows the platform's
  KHQR (`PLATFORM_KHQR_IMAGE`). A platform admin checks the bank and taps "Money received" in
  `/admin`, which records the payment, moves the event up (never down) and writes the audit log.
  Hosts can cancel a waiting order; a new one replaces it.
- **Vendors pay to be featured** on their page at `/vendor/<id>` (30 days $15, 90 days $40),
  once their listing is published. Confirmed days add on to a placement that is still running.
- **Planner subscription** ($30 a month or $300 a year, on the planner dashboard; owners pay).
  A new organization gets a 30-day trial; organizations that existed before got 30 days. Without
  an active subscription, planners can't add or attach client events (402); events they already
  run keep every feature.
- All of these are paid the same way and confirmed in `/admin/payments`; prices are in
  `server/src/lib/plans.ts`.
- **Automatic confirmation with Bakong** (optional): set `BAKONG_TOKEN` (from registering with
  the NBC's Bakong Open API) and the platform's `BAKONG_ACCOUNT_ID` (e.g. `moments@aba`). Each
  order then gets its own KHQR with the amount and reference built in; the API asks Bakong
  every 30 seconds whether that QR was paid (by its MD5), and the payer's page checks every
  5 seconds, so the plan, featured days or subscription switch on by themselves once the full
  amount arrives. The payment is recorded with Bakong's transaction hash. Admins can still
  confirm by hand. Ticket orders, paid to each organizer's own KHQR, stay manual.

## Telegram

One bot does both sign-in and the hosts' alerts. Sign-in needs the bot, so set it up first.

1. Create a bot with [@BotFather](https://t.me/BotFather); put its token in `TELEGRAM_BOT_TOKEN` and its
   username in `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
2. Telegram must reach the API (for sign-in and alerts). In production set `TELEGRAM_WEBHOOK_SECRET` and
   register the webhook once:
   ```bash
   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
     -d url=https://your-domain/api/telegram/webhook -d secret_token=$TELEGRAM_WEBHOOK_SECRET
   ```
   In development, set `TELEGRAM_POLLING=true` instead (no public URL needed).

**Connecting an event:** on the event page, "ភ្ជាប់ Telegram" gives a one-time code (30 minutes).
Open the bot link and tap Start for private alerts, or add the bot to the family's Telegram
group and send `/link <code>` there. The bot replies when the chat is connected; "Send a test
message" checks it any time. If the bot is removed from the group, the event is unlinked
(and logged) instead of retrying forever.

**What is sent** (in the event creator's language):

- every RSVP, with the guest's wish and the running number of people coming;
- every KHQR gift a guest reports, with a link to confirm it;
- gifts recorded at the desk, as one summary per 15 minutes (count, amount in that window,
  and the running total), so a busy desk doesn't flood the chat.

**Reminders** (published weddings; each sent once):

- 3 days before: who hasn't replied yet (up to 10 names) and how many are coming, with a link to
  send invitations again;
- the day before: the guest desk checklist — helper code, how many helpers joined, whether the
  KHQR is uploaded;
- the day after: arrivals and gift totals, with a link to send thank-yous.

They go to the event's linked chat, or to each host privately if none is linked (hosts sign in
through the bot). The API checks every 15 minutes.

With Redis, alerts go through a BullMQ queue (`notifications`) and are retried with backoff
when Telegram fails; the worker runs inside the API process. Without Redis they are sent in the
background directly.

## Offline desk

Venue wifi is often weak, so the desk saves everything on the phone first (IndexedDB,
`src/lib/offline/outbox.ts`) and sends it when it can:

- The guest list is kept from the last download, so search and QR matching work without
  internet.
- Check-ins, walk-ins and gifts go into an outbox, show at once (marked "waiting to send"),
  and are sent in order every 10 seconds and when the connection comes back. A walk-in added
  offline and a gift for them sync correctly: the gift finds the guest by the id the phone gave
  them.
- The bar at the top shows online/offline and how many items are waiting. If the API refuses
  an item (not a network problem), it stays on the phone with the reason until someone discards
  it; it is never dropped silently. A check-in another phone already made is dropped with a
  message.
- The desk page itself opens without internet too (see "Install as an app").

## Install as an app (PWA)

Moments can be installed from the browser (Android/desktop Chrome: "Install the app" on the
dashboard or desk; iPhone: Share → Add to Home Screen). `src/app/manifest.ts` describes the app
and `public/sw.js` is the service worker (registered only in production builds):

- app files, icons and uploaded images are cached the first time they load;
- the desk pages (`/desk`, `/events/<id>/checkin`) are saved on each visit, so a helper can
  reload or reopen the desk at a venue with no internet; the desk's data comes from IndexedDB;
- other pages need the internet and show a small offline page when there is none.

Signing out or leaving the desk clears the guest list, unsent items (after a warning) and the
saved pages from the phone, because phones get passed around at weddings. After changing
`public/sw.js`, bump `VERSION` in it so phones drop the old caches.

## API

| Method | Path | Who |
| ------ | ---- | --- |
| POST | `/api/auth/telegram/start` | anyone |
| POST | `/api/auth/telegram/poll` `{ token }` (202 while waiting) | anyone with the token |
| POST | `/api/auth/telegram/dev-confirm` `{ token, phone, name? }` | development without a bot |
| GET, PATCH | `/api/auth/me` | host |
| POST | `/api/auth/me/delete` `{ confirm: "DELETE" }` | host |
| POST | `/api/auth/logout` | anyone |
| POST | `/api/desk/join` `{ code, name }` | anyone |
| GET | `/api/desk/me` | helper |
| POST | `/api/desk/leave` | anyone |
| GET | `/api/templates` | anyone |
| GET, POST | `/api/events` | host |
| GET | `/api/events/:eventId` | owner (full) or helper (desk view) |
| PATCH | `/api/events/:eventId` | owner |
| POST | `/api/events/:eventId/helper-code` | owner (new code) |
| GET | `/api/events/:eventId/members` | owner |
| POST | `/api/events/:eventId/cohosts` `{ phone, name }` | owner |
| DELETE | `/api/events/:eventId/members/:memberId` | owner |
| POST | `/api/events/:eventId/photos` (multipart `photos`) | owner |
| DELETE | `/api/events/:eventId/photos/:key` | owner |
| POST | `/api/events/:eventId/photos/:key/cover` | owner |
| PUT, DELETE | `/api/events/:eventId/khqr` (multipart `image`) | owner |
| GET | `/api/files/:key` | anyone |
| GET, POST | `/api/events/:eventId/guests` (`?q=&side=&rsvp=&group=`) | owner |
| GET | `/api/events/:eventId/guests/groups` | owner |
| GET | `/api/events/:eventId/guests/export.csv` | owner |
| POST | `/api/events/:eventId/guests/import/parse` (multipart `file`) | owner |
| POST | `/api/events/:eventId/guests/bulk` `{ guests: [...] }` | owner |
| GET, PATCH, DELETE | `/api/events/:eventId/guests/:guestId` | owner |
| POST | `/api/events/:eventId/guests/:guestId/new-link` | owner |
| GET | `/api/events/:eventId/preview` | owner |
| GET | `/api/files/:key/og.jpg` | anyone |
| GET | `/api/invitations/:token` | anyone with the link (owners also for drafts) |
| POST | `/api/invitations/:token/open` | anyone with the link |
| POST | `/api/invitations/:token/rsvp` `{ status, count?, message? }` | anyone with the link |
| GET | `/api/invitations/:token/qr.svg` | anyone with the link |
| GET | `/api/events/:eventId/desk/guests` | owner, helper |
| GET | `/api/events/:eventId/desk/stats` | owner, helper |
| POST | `/api/events/:eventId/checkins` `{ guestId, peopleCount, clientId?, checkedInAt? }` | owner, helper |
| DELETE | `/api/events/:eventId/checkins/:guestId` | owner, helper |
| POST | `/api/events/:eventId/desk/walk-ins` `{ name, side, phone?, peopleCount, clientId }` | owner, helper |
| GET | `/api/events/:eventId/gifts` (`?q=&status=&currency=&method=`) | owner (all), helper (own) |
| POST | `/api/events/:eventId/gifts` `{ guestId \| guestClientId \| giverName, amount, currency, method, note?, clientId, recordedAt? }` | owner, helper |
| PATCH | `/api/events/:eventId/gifts/:giftId` | owner, helper (own) |
| POST | `/api/events/:eventId/gifts/:giftId/void` `{ reason }` | owner, helper (own) |
| POST | `/api/events/:eventId/gifts/:giftId/confirm`, `/reject` | owner |
| GET | `/api/events/:eventId/gifts/:giftId/history` | owner |
| POST | `/api/invitations/:token/gift` `{ amount, currency, note? }` | anyone with the link |
| GET | `/api/events/:eventId/reports/summary` (`?side=`) | owner |
| GET | `/api/events/:eventId/reports/gift-book.xlsx` (`?side=&lang=`) | owner |
| GET | `/api/events/:eventId/reports/gift-book.pdf` (`?side=&lang=`) | owner |
| GET | `/api/events/:eventId/seating` | owner |
| POST | `/api/events/:eventId/tables` `{ name, capacity?, note? }`, `/tables/bulk` `{ count, capacity? }` | owner |
| PATCH, DELETE | `/api/events/:eventId/tables/:tableId` | owner |
| POST | `/api/events/:eventId/seating/assign` `{ guestIds, tableId \| null }` | owner |
| POST | `/api/events/:eventId/seating/auto` `{ mode: "unassigned" \| "all" }` | owner |
| GET | `/api/events/:eventId/seating/plan.pdf` (`?lang=`) | owner |
| GET | `/api/events/:eventId/thank-you` (`?audience=ALL\|ATTENDED\|GAVE&language=KM\|EN`) | owner |
| PUT | `/api/events/:eventId/thank-you/settings` `{ thankYouKm, thankYouEn }` | owner |
| POST | `/api/events/:eventId/thank-you/:guestId/shared` `{ language }` | owner |
| GET, POST | `/api/organizations` | signed in |
| GET, PATCH | `/api/organizations/:orgId` | org member (PATCH: org owner) |
| PUT | `/api/organizations/:orgId/logo` (multipart `image`) | org owner |
| POST, DELETE | `/api/organizations/:orgId/members[/:memberId]` | org owner |
| GET, POST | `/api/organizations/:orgId/events` | org member |
| POST | `/api/organizations/:orgId/events/:eventId/attach` | org member who owns the event |
| GET, POST | `/api/events/:eventId/ticket-types` | owner |
| PATCH, DELETE | `/api/events/:eventId/ticket-types/:typeId` | owner |
| GET | `/api/events/:eventId/orders` (`?status=&q=`) | owner |
| POST | `/api/events/:eventId/orders/:orderId/confirm`, `/cancel` `{ reason }` | owner |
| GET | `/api/events/:eventId/door/tickets` | owner, helper |
| POST | `/api/events/:eventId/door/scan` `{ code, clientId, scannedAt? }`, `/door/admit` `{ ticketId, clientId }` | owner, helper |
| GET | `/api/public/events/:slug` | anyone |
| POST | `/api/public/events/:slug/orders` `{ buyerName, buyerPhone, items }` | anyone |
| GET | `/api/orders/:token`, `/api/orders/:token/tickets/:code/qr.svg` | anyone with the order link |
| GET | `/api/vendors` (`?category=&province=&q=&page=`), `/api/vendors/:slug` | anyone |
| POST | `/api/vendors/:slug/enquiries` `{ name, phone, eventDate?, message, eventId? }` | signed in |
| PUT | `/api/vendors/:slug/reviews` `{ rating, text }` | signed in, after an enquiry |
| GET, POST | `/api/vendors/mine` | signed in |
| GET, PATCH | `/api/vendors/mine/:vendorId` | vendor owner |
| POST, DELETE | `/api/vendors/mine/:vendorId/photos[/:key]`; PUT `/logo` | vendor owner |
| POST | `/api/vendors/mine/:vendorId/submit` | vendor owner |
| GET | `/api/vendors/mine/:vendorId/enquiries`; POST `/enquiries/read` | vendor owner |
| PUT | `/api/vendors/mine/:vendorId/reviews/:reviewId/reply` `{ reply }` | vendor owner |
| GET | `/api/events/:eventId/plan` | owner |
| POST | `/api/events/:eventId/plan/orders` `{ plan }`, `/plan/orders/:orderId/cancel` | owner |
| GET | `/api/platform/khqr` | anyone |
| GET | `/api/platform/orders/:orderId/khqr.svg` | anyone (the order's own QR, with Bakong) |
| POST | `/api/platform/orders/:orderId/check` | the payer |
| GET | `/api/admin/plan-orders` (`?status=`) | platform admin |
| POST | `/api/admin/plan-orders/:orderId/confirm`, `/cancel` | platform admin |
| GET | `/api/admin/stats` | platform admin |
| GET | `/api/admin/leads` (`?month=YYYY-MM&format=csv`) | platform admin |
| GET | `/api/vendors/mine/:vendorId/featured` | vendor owner |
| POST | `/api/vendors/mine/:vendorId/featured/orders` `{ days }`, `/featured/orders/:orderId/cancel` | vendor owner |
| GET | `/api/organizations/:orgId/subscription` | org member |
| POST | `/api/organizations/:orgId/subscription/orders` `{ months }`, `/subscription/orders/:orderId/cancel` | org owner |
| GET, POST | `/api/invitations/:token/photos` (multipart `photos`) | anyone with the link |
| GET, POST | `/api/invitations/:token/wishes` `{ text }` | anyone with the link |
| GET | `/api/events/:eventId/wishes`, `/wishes/book.pdf`; POST `/wishes/:wishId/hide`, `/show` | owner |
| GET | `/api/events/:eventId/photo-wall`; POST `/:photoId/hide`, `/show`; DELETE `/:photoId` | owner |
| GET | `/api/events/:eventId/vendors` | owner |
| PUT, DELETE | `/api/events/:eventId/vendors/:vendorId` `{ status, note }` | owner |
| GET | `/api/admin/vendors` (`?status=`), `/api/admin/reviews` | platform admin |
| POST | `/api/admin/vendors/:vendorId/approve`, `/return`, `/suspend` `{ note }`, `/feature` `{ days }` | platform admin |
| POST | `/api/admin/reviews/:reviewId/hide`, `/show` | platform admin |
| POST | `/api/vendors/:slug/reports` `{ reason, note?, reviewId? }` | signed in |
| GET | `/api/admin/reports` (`?resolved=true`); POST `/api/admin/reports/:reportId/resolve` | platform admin |
| GET, DELETE | `/api/events/:eventId/telegram` | owner |
| POST | `/api/events/:eventId/telegram/link` | owner |
| POST | `/api/events/:eventId/telegram/test` | owner |
| POST | `/api/telegram/webhook` (header `X-Telegram-Bot-Api-Secret-Token`) | Telegram |

## Tests

`npm test` runs the API tests (Vitest + Supertest) against the database in `DATABASE_URL`.
Each test signs in with fresh random phone numbers, so tests don't disturb other data.
`npm run typecheck` and `npm run lint` check both parts.

`npm run e2e` runs browser tests of the main journeys on a phone-sized screen (Playwright, in
`e2e/`): signing in, a guest replying and being checked in with a gift at the desk, buying
concert tickets, the vendor directory and an enquiry, upgrading a plan, and a guest's wish. They need the
seeded database and the built app running without a Telegram bot, so the login page offers
its test form:

```bash
npm run db:seed
npm run build && TELEGRAM_BOT_TOKEN= ALLOW_TEST_LOGIN=true npm start   # in another terminal
npm run e2e
```

## Status

Built: project setup, schema and seed, sign-in (phone code, Telegram), helpers and
co-hosts, access control, event create/edit, photo and KHQR uploads, guest list with
CSV/Excel import and export, invitation page with three templates, RSVP and link previews, guest desk with QR check-in, gift book with KHQR confirmation, offline desk, Excel and PDF reports, Telegram alerts, installable PWA. This completes the
MVP in `docs/PROPOSAL.md`.

Phase 2 (`docs/PHASE2.md`) is done too: seating plan, thank-you messages, planner dashboard
and ticketing. Phase 3 (`docs/PHASE3.md`) is done: the vendor marketplace and paid plans.

Before a real wedding: set up the Telegram bot (sign-in needs it), S3/R2 storage and Chromium on the server, and run the app over https (the camera
scanner and the service worker need it).
