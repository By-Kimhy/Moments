# Moments – MVP proposal (step 1: structure and schema)

Status: **draft, waiting for approval**. No application code has been written yet.

Scope is the wedding MVP from the product plan: invitations, RSVP, guest list, check-in,
gift book (cash + KHQR), reports, Telegram alerts. Ticketing, seating, thank-you
messages and the planner dashboard are phase 2 and are only kept *possible* by this
design, not built.

## 1. Stack

| Layer | Choice | Note |
|---|---|---|
| Web | Next.js (App Router) + TypeScript + Tailwind, PWA | Same setup as `rentSystem` |
| API | Express 5 + zod + Prisma, in `server/` workspace | Same split as `rentSystem` (only the API touches the DB). NestJS is the alternative if you prefer it |
| DB | PostgreSQL 16 | Money as integers, `SUM` returns `bigint` |
| Queue / cache | Redis + BullMQ | Telegram notifications, OTP codes (TTL), rate limits |
| Storage | S3-compatible (MinIO locally, R2/S3 in prod) | Photos, KHQR image |
| Offline | IndexedDB (via `idb`) + an outbox synced on reconnect | Gift desk and check-in |
| i18n | `next-intl`, `messages/km.json` (default) + `messages/en.json` | Fonts: Kantumruy Pro (UI), Battambang / Moul (headings on templates) |
| Exports | `exceljs` (xlsx), PDF rendered from HTML with Playwright Chromium so Khmer shaping is correct | pdfkit/jsPDF break Khmer ligatures |
| Tests | Vitest + Supertest | |
| Local dev | Docker Compose: postgres, redis, minio | |

## 2. Folder structure

```
Moments/
├─ docker-compose.yml           # postgres, redis, minio
├─ .env.example
├─ package.json                 # npm workspaces: server, root = web
├─ README.md
├─ messages/                    # i18n: km.json (default), en.json
├─ public/
│  ├─ manifest.webmanifest
│  └─ fonts/                    # Kantumruy Pro, Battambang (self-hosted)
├─ src/                         # Next.js web app (port 3000)
│  ├─ app/
│  │  ├─ [locale]/
│  │  │  ├─ login/              # phone OTP + Telegram Login
│  │  │  ├─ dashboard/          # host: list of events
│  │  │  ├─ events/new/
│  │  │  └─ events/[eventId]/
│  │  │     ├─ page.tsx         # overview: RSVP + gift totals
│  │  │     ├─ edit/            # event editor, template, photos, KHQR
│  │  │     ├─ guests/          # guest list, import CSV/XLSX, share links
│  │  │     ├─ gifts/           # gift book + pending KHQR gifts to confirm
│  │  │     ├─ helpers/         # helper code, helper list
│  │  │     └─ reports/         # totals + export
│  │  ├─ i/[token]/             # public invitation per guest (no login), OG image
│  │  └─ desk/                  # helper: join with code, check-in, gift desk (offline)
│  ├─ components/
│  │  ├─ templates/             # traditional, modern, minimal
│  │  └─ ui/
│  ├─ lib/                      # api client, session, money formatting
│  └─ offline/                  # IndexedDB store, outbox, sync worker
└─ server/                      # Express API (port 4000)
   ├─ prisma/
   │  ├─ schema.prisma
   │  ├─ migrations/
   │  └─ seed.ts                # 1 wedding, 50 guests, gifts, 3 templates
   ├─ src/
   │  ├─ app.ts / index.ts / config.ts / db.ts / errors.ts
   │  ├─ auth/                  # OTP (SmsProvider interface + mock), Telegram login, JWT
   │  ├─ access.ts              # requireEventRole(eventId, ["OWNER","HELPER"])
   │  ├─ contract.ts            # response types shared with web
   │  ├─ lib/                   # business rules, pure and unit-tested
   │  │  ├─ money.ts            # parse/format USD cents and KHR riel
   │  │  ├─ gifts.ts            # totals by currency / side / group
   │  │  ├─ rsvp.ts
   │  │  ├─ audit.ts            # writes audit_logs inside the same transaction
   │  │  └─ guest-import.ts     # CSV/XLSX → rows + per-row errors
   │  ├─ providers/
   │  │  ├─ sms.ts              # SmsProvider + MockSmsProvider
   │  │  ├─ payment.ts          # PaymentProvider + ManualProvider (host confirms)
   │  │  ├─ storage.ts          # S3 client
   │  │  └─ telegram.ts         # bot sendMessage
   │  ├─ jobs/                  # BullMQ queues + worker (notifications)
   │  └─ routes/                # auth, events, guests, rsvp(public), checkins,
   │                            # gifts, reports, helpers, templates, uploads, sync
   └─ test/                     # gift totals, RSVP, permissions, sync idempotency
```

## 3. Key design decisions

1. **Tenant = event.** Every event-owned row has `eventId`; every API route under
   `/events/:eventId/...` goes through `requireEventRole`, and every query filters by
   that `eventId` (never by a bare record id). Tests cover cross-event access.
2. **Helpers do not need an account.** The host shares a 6-digit helper code. A helper
   enters the code and their name, which creates an `EventMember` (role `HELPER`,
   `userId` empty) and returns a token scoped to that one event. The host can revoke a
   helper or rotate the code. Gifts and check-ins record the *member* who did it, so
   both owners and helpers are covered.
3. **Money:** `amount Int` in the minor unit (USD cents, KHR riel) + `currency` enum.
   Totals are always per currency, never converted.
4. **Gifts are never hard-deleted or silently edited.** Edits and voids go through the
   API, which writes an `AuditLog` row with before/after JSON in the same transaction.
   A voided gift keeps `voidedAt`, `voidedById`, `voidReason`.
5. **Guest KHQR gifts are pending until the host confirms.** A guest's submitted
   amount + wish creates a gift with `status = PENDING`; only `CONFIRMED` gifts count
   in totals (pending is shown separately). Automatic bank confirmation later plugs in
   via `PaymentProvider` and the `payments` table.
6. **Offline sync is idempotent.** The desk creates gifts and check-ins with a
   client-generated UUID (`clientId`, unique per event). The outbox replays them to
   `POST /events/:id/sync`; replays are no-ops. Walk-in guests not on the list can be
   created at the desk (also by `clientId`).
7. **Invitation links** are `/i/{inviteToken}` with a random 22-char token; the
   personal check-in QR encodes the same token.
8. **OTP codes live in Redis** (5 min TTL, attempt limits), so there is no OTP table.
   Sessions are JWT in an httpOnly cookie, as in `rentSystem`.

## 4. Database schema (Prisma, draft)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Language     { KM EN }
enum EventType    { WEDDING TICKETED }
enum EventStatus  { DRAFT PUBLISHED ARCHIVED }
enum MemberRole   { OWNER HELPER }
enum Side         { BRIDE GROOM BOTH }
enum RsvpStatus   { PENDING ATTENDING DECLINED }
enum Currency     { USD KHR }
enum GiftMethod   { CASH KHQR }
enum GiftStatus   { PENDING CONFIRMED REJECTED }
enum GiftSource   { DESK GUEST HOST }
enum PaymentStatus { PENDING PAID FAILED EXPIRED }
enum TemplateStyle { TRADITIONAL MODERN MINIMAL }

model User {
  id         String   @id @default(uuid()) @db.Uuid
  name       String   @db.VarChar(120)
  phone      String?  @unique @db.VarChar(20)   // E.164, e.g. +85512345678
  telegramId BigInt?  @unique
  language   Language @default(KM)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  ownedEvents Event[]       @relation("EventOwner")
  memberships EventMember[]
}

model Event {
  id          String      @id @default(uuid()) @db.Uuid
  ownerId     String      @db.Uuid
  type        EventType   @default(WEDDING)
  status      EventStatus @default(DRAFT)
  titleKm     String      @db.VarChar(200)
  titleEn     String?     @db.VarChar(200)
  brideNameKm String?     @db.VarChar(120)
  brideNameEn String?     @db.VarChar(120)
  groomNameKm String?     @db.VarChar(120)
  groomNameEn String?     @db.VarChar(120)
  startsAt    DateTime                         // stored UTC, shown Asia/Phnom_Penh
  venueKm     String?     @db.VarChar(300)
  venueEn     String?     @db.VarChar(300)
  mapUrl      String?     @db.VarChar(500)
  schedule    Json        @default("[]")       // [{time, titleKm, titleEn}] validated by zod
  photos      Json        @default("[]")       // [{key, order}] S3 keys
  khqrImageKey String?    @db.VarChar(300)
  khqrAccountName String? @db.VarChar(120)
  templateId  String?     @db.Uuid
  helperCode  String      @unique @db.VarChar(6)
  telegramChatId BigInt?                       // where host alerts go
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  owner    User         @relation("EventOwner", fields: [ownerId], references: [id])
  template Template?    @relation(fields: [templateId], references: [id])
  members  EventMember[]
  guests   Guest[]
  gifts    Gift[]
  payments Payment[]
  checkins Checkin[]
  auditLogs AuditLog[]

  @@index([ownerId])
}

model EventMember {
  id          String     @id @default(uuid()) @db.Uuid
  eventId     String     @db.Uuid
  userId      String?    @db.Uuid               // null for code-only helpers
  role        MemberRole
  displayName String     @db.VarChar(120)
  revokedAt   DateTime?
  createdAt   DateTime   @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User? @relation(fields: [userId], references: [id])
  giftsRecorded Gift[]    @relation("GiftRecordedBy")
  giftsVoided   Gift[]    @relation("GiftVoidedBy")
  checkins      Checkin[]
  auditLogs     AuditLog[]

  @@unique([eventId, userId])
  @@index([eventId])
}

model Guest {
  id          String     @id @default(uuid()) @db.Uuid
  eventId     String     @db.Uuid
  clientId    String?    @db.Uuid               // set when created offline at the desk
  name        String     @db.VarChar(160)       // Khmer or Latin, as the host typed it
  nameAlt     String?    @db.VarChar(160)       // optional other script, helps search
  phone       String?    @db.VarChar(20)
  side        Side       @default(BOTH)
  group       String?    @db.VarChar(80)        // "Family", "Work", "Mother's friends"...
  invitedCount Int       @default(1)            // party size the host expects
  inviteToken String     @unique @db.VarChar(32)
  rsvpStatus  RsvpStatus @default(PENDING)
  rsvpCount   Int?                              // people confirmed by the guest
  rsvpMessage String?    @db.VarChar(500)
  rsvpAt      DateTime?
  openedAt    DateTime?                         // first time the invite was opened
  tableNo     String?    @db.VarChar(20)        // phase 2 seating
  walkIn      Boolean    @default(false)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  event    Event     @relation(fields: [eventId], references: [id], onDelete: Cascade)
  gifts    Gift[]
  checkins Checkin[]

  @@unique([eventId, clientId])
  @@index([eventId, side])
  @@index([eventId, name])
}

model Gift {
  id           String     @id @default(uuid()) @db.Uuid
  eventId      String     @db.Uuid
  clientId     String?    @db.Uuid              // idempotency key from the offline desk
  guestId      String?    @db.Uuid              // null = unmatched (e.g. name only)
  giverName    String?    @db.VarChar(160)      // when no guest match
  amount       Int                              // USD cents or KHR riel, > 0
  currency     Currency
  method       GiftMethod
  status       GiftStatus @default(CONFIRMED)   // guest KHQR submissions start PENDING
  source       GiftSource
  note         String?    @db.VarChar(500)      // wish or desk note
  recordedById String?    @db.Uuid              // null when submitted by a guest
  recordedAt   DateTime   @default(now())       // device time at the desk
  confirmedAt  DateTime?
  voidedAt     DateTime?
  voidedById   String?    @db.Uuid
  voidReason   String?    @db.VarChar(300)
  paymentId    String?    @unique @db.Uuid
  createdAt    DateTime   @default(now())       // server time
  updatedAt    DateTime   @updatedAt

  event      Event        @relation(fields: [eventId], references: [id], onDelete: Cascade)
  guest      Guest?       @relation(fields: [guestId], references: [id])
  recordedBy EventMember? @relation("GiftRecordedBy", fields: [recordedById], references: [id])
  voidedBy   EventMember? @relation("GiftVoidedBy", fields: [voidedById], references: [id])
  payment    Payment?     @relation(fields: [paymentId], references: [id])

  @@unique([eventId, clientId])
  @@index([eventId, status])
  @@index([eventId, guestId])
}

model Payment {                                   // filled by a real PaymentProvider later
  id              String        @id @default(uuid()) @db.Uuid
  eventId         String        @db.Uuid
  provider        String        @db.VarChar(40)   // "manual", "bakong", ...
  reference       String        @db.VarChar(120)  // bank / Bakong transaction ref or md5
  amount          Int
  currency        Currency
  status          PaymentStatus @default(PENDING)
  providerPayload Json?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  gift  Gift?

  @@unique([provider, reference])
  @@index([eventId, status])
}

model Checkin {
  id            String   @id @default(uuid()) @db.Uuid
  eventId       String   @db.Uuid
  guestId       String   @db.Uuid
  clientId      String?  @db.Uuid
  peopleCount   Int      @default(1)
  checkedInById String   @db.Uuid
  checkedInAt   DateTime @default(now())

  event       Event       @relation(fields: [eventId], references: [id], onDelete: Cascade)
  guest       Guest       @relation(fields: [guestId], references: [id], onDelete: Cascade)
  checkedInBy EventMember @relation(fields: [checkedInById], references: [id])

  @@unique([eventId, guestId])                    // one check-in per guest
  @@unique([eventId, clientId])
}

model Template {
  id         String        @id @default(uuid()) @db.Uuid
  slug       String        @unique @db.VarChar(60)
  name       String        @db.VarChar(120)
  style      TemplateStyle
  previewUrl String?       @db.VarChar(500)
  config     Json                                 // colors, fonts, layout options
  isActive   Boolean       @default(true)

  events Event[]
}

model AuditLog {
  id         String   @id @default(uuid()) @db.Uuid
  eventId    String   @db.Uuid
  entity     String   @db.VarChar(40)             // "gift", "guest", "checkin", "event"
  entityId   String   @db.Uuid
  action     String   @db.VarChar(40)             // create, update, void, confirm, reject
  before     Json?
  after      Json?
  actorId    String?  @db.Uuid                    // EventMember; null = guest/system
  createdAt  DateTime @default(now())

  event Event        @relation(fields: [eventId], references: [id], onDelete: Cascade)
  actor EventMember? @relation(fields: [actorId], references: [id])

  @@index([eventId, entity, entityId])
}
```

Differences from the plan's table list, and why:

- `audit_logs.user_id` becomes `actorId` → `EventMember`, because code-only helpers have no `User`.
- `gifts` gains `status`, `source`, `clientId`, void fields and `giverName` (pending KHQR
  gifts, offline idempotency, no hard deletes, gifts from people not on the list).
- `guests` splits `party_size` into `invitedCount` (host) and `rsvpCount` (guest), and
  adds `openedAt` to measure the "70% open the invitation" metric.
- `events.helperCode` lives on the event (one code per event, rotatable) instead of on
  each `event_members` row.

## 5. Build order (one module at a time, tests before moving on)

1. Scaffold: workspaces, Docker Compose, Prisma schema + migration + seed, i18n, fonts.
2. Auth: OTP with mock SMS provider, Telegram Login, sessions, `requireEventRole` + permission tests.
3. Events: create/edit, photos and KHQR upload, templates.
4. Guests: CRUD, CSV/XLSX import, share links.
5. Invitation page `/i/[token]` + RSVP + OG image + RSVP tests.
6. Helper desk: join with code, check-in (QR scan + search), live count.
7. Gift book: desk entry, offline outbox + sync, audit log, guest KHQR submit + host confirm, totals tests.
8. Reports: totals by currency/side/group, XLSX and PDF export.
9. Telegram notifications via BullMQ.
10. PWA polish (manifest, service worker, install prompt).

## 6. Questions before I start

1. Repo: build in `Moments` (currently empty)? 
2. Backend: Express + Prisma like `rentSystem` (recommended), or NestJS?
3. Helpers join with code + name, no account — OK?
4. Should an event allow more than one owner (e.g. both the bride's and groom's families
   managing it)? The schema supports it via `EventMember.role = OWNER`; the MVP UI would
   only need an "invite co-host" button.
