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

With `SMS_PROVIDER="mock"` (the default) no SMS is sent: the code is printed in the API log
and shown on the login screen.

## How sign-in works

- **Hosts** sign in with their phone number and a 6-digit code, or with Telegram. Codes are
  kept in Redis for 5 minutes and burn after 5 wrong tries; requests are rate-limited per
  number and per IP. A new number is asked for a name on first sign-in.
- **Telegram:** set `TELEGRAM_BOT_TOKEN` and `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, and set the
  bot's domain with @BotFather (`/setdomain`). The widget sends people to `/auth/telegram`,
  and the API checks the signature.
- **Helpers** need no account. The host shares the event's 6-digit helper code; a helper
  enters it with their name at `/desk` and gets a session for that one event. Hosts can
  remove a helper or make a new code.
- **Co-hosts:** a host adds another host by phone number (e.g. the other family). They sign
  in with that number and see the event.

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

## Telegram

One bot does both the hosts' Telegram login and their alerts.

1. Create a bot with [@BotFather](https://t.me/BotFather); put its token in `TELEGRAM_BOT_TOKEN` and its
   username in `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
2. For the login button, send `/setdomain` to BotFather with your site's domain.
3. For alerts, Telegram must reach the API. In production set `TELEGRAM_WEBHOOK_SECRET` and
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
- Opening the desk page itself without internet needs the PWA service worker (module 10); a
  desk that is already open keeps working.

## API

| Method | Path | Who |
| ------ | ---- | --- |
| POST | `/api/auth/otp/request` `{ phone }` | anyone |
| POST | `/api/auth/otp/verify` `{ phone, code, name? }` | anyone |
| POST | `/api/auth/telegram` (widget fields) | anyone |
| GET, PATCH | `/api/auth/me` | host |
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
| GET, DELETE | `/api/events/:eventId/telegram` | owner |
| POST | `/api/events/:eventId/telegram/link` | owner |
| POST | `/api/events/:eventId/telegram/test` | owner |
| POST | `/api/telegram/webhook` (header `X-Telegram-Bot-Api-Secret-Token`) | Telegram |

## Tests

`npm test` runs the API tests (Vitest + Supertest) against the database in `DATABASE_URL`.
Each test signs in with fresh random phone numbers, so tests don't disturb other data.
`npm run typecheck` and `npm run lint` check both parts.

## Status

Built: project setup, schema and seed, sign-in (phone code, Telegram), helpers and
co-hosts, access control, event create/edit, photo and KHQR uploads, guest list with
CSV/Excel import and export, invitation page with three templates, RSVP and link previews, guest desk with QR check-in, gift book with KHQR confirmation, offline desk, Excel and PDF reports, Telegram alerts.

Next: PWA (installable app, desk opens without internet).
