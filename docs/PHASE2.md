# Moments – Phase 2 design

Builds on the MVP (`docs/PROPOSAL.md`). Same rules: every event-owned row carries `eventId`,
money is integer minor units with a currency, changes to money and attendance are audited.

Order of work: seating plan → thank-you messages → planner dashboard → ticketing.

## 1. Seating plan

- New `DiningTable` (`eventId`, `name`, `capacity`, `sortOrder`, `note`). `Guest.tableNo` (free
  text) is replaced by `Guest.tableId`; the migration turns existing table numbers into tables.
- Seats used by a guest = people confirmed (RSVP count) if they replied yes, else people invited.
  Tables over capacity are flagged, not blocked.
- Hosts create tables in bulk ("20 tables of 10"), rename, resize, delete (guests become
  unassigned), assign guests from a phone-friendly list, and can **auto-arrange**: keep each
  side together, then each group together, filling tables in order; families (one guest row)
  are never split.
- Import: the guest spreadsheet's Table column finds or creates the table by name.
- Output: table cards PDF (one block per table with the names, for the venue) and a sheet in the
  Excel report. The desk and the guest's invitation show the table name.

## 2. Thank-you messages

- Per event: a thank-you text in Khmer and English with `{name}` (and optional `{gift}`), and
  who to thank (everyone invited / those who came / those who gave).
- The guest's link (`/i/<token>`) turns into a thank-you card after the event.
- Sending: by SMS to guests with a phone number (through the SMS provider interface, queued and
  rate-limited, with a status per guest), and a per-guest "send on Telegram" share button for
  manual sending that is marked as sent. Table `ThankYou` (`guestId`, `channel`, `status`,
  `sentAt`, `error`) keeps the record so nobody is thanked twice.

## 3. Planner dashboard

- `Organization` (`name`, `logoKey`, `brandColor`) and `OrganizationMember` (`role` OWNER/STAFF).
  `Event.organizationId` is optional.
- Staff of an organization have host access to all its events; the couple is added as a
  co-host as before. Planners create events for clients from their dashboard.
- Branding: the organization's name and logo on invitations ("Planned by …") instead of the
  Moments footer.
- Dashboard: all the organization's events with date, status, guests, RSVP rate, arrivals and
  gift totals; upcoming first. Per-client summary export reuses the reports.

## 4. Ticketing (concerts, seminars, workshops)

- An event of type `TICKETED` has `TicketType`s (`name`, `price`, `currency`, `quantity`,
  sales window, `maxPerOrder`), a public page `/e/<slug>` and checkout without an account.
- `Order` (buyer name and phone, items, total, platform fee, status
  PENDING_PAYMENT → PAID / CANCELLED / EXPIRED, short payment reference, expiry) holds the
  tickets for 30 minutes; stock is checked in a transaction so tickets can't be oversold.
- Payment: the organizer's KHQR with the amount and reference; the organizer confirms payment
  (manual `PaymentProvider`), which issues `Ticket`s with unguessable QR codes. A Bakong/bank
  provider can confirm automatically later through the same interface.
- The buyer's order page `/o/<token>` shows the QR e-tickets. Door scanning reuses the desk's
  scanner and offline queue; each ticket enters once.
- Platform fee (`PLATFORM_FEE_PERCENT`, default 4%) is recorded per order for billing.
