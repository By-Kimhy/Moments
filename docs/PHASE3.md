# Moments – Phase 3 design

Builds on the MVP and phase 2. Two parts: the vendor marketplace, then paid plans.

## 1. Vendor marketplace

Photographers, video, decoration, venues, makeup, attire, catering, music, MCs and invitation
printing, across Cambodia's provinces.

- **Platform admins:** `User.isAdmin` (set from `ADMIN_PHONES` at sign-in, or by the seed).
  Admins review vendors, feature them, and hide reviews.
- **Vendor profile** (`Vendor`): owner account, unique `slug`, name, category, province,
  description (Khmer/English), "price from" with currency, phone, Telegram username, Facebook
  link, logo and up to 12 photos. Status DRAFT → PENDING_REVIEW → PUBLISHED (or SUSPENDED).
  Only published vendors appear publicly. `featuredUntil` puts paying vendors first.
- **Directory** `/vendors` (public, server-rendered for search engines): filter by category and
  province, search by name; featured first, then by rating. **Profile** `/vendors/<slug>` with
  photos, contact buttons, reviews and "send an enquiry".
- **Enquiries** (`VendorEnquiry`): a signed-in host sends name, phone, event date and a message,
  optionally from one of their events. The vendor sees them in their inbox and gets an SMS. Each
  enquiry is a referral the platform can count (and later bill).
- **Reviews** (`VendorReview`): one per host per vendor, rating 1–5 and text, only from hosts
  who sent that vendor an enquiry (so reviews come from real customers). The vendor can reply
  once; admins can hide a review. The vendor's rating is the average of visible reviews.
- **Event shortlist** (`EventVendor`): hosts save vendors to an event as "considering" or
  "booked", with a note; shown on the event page.

## 2. Paid plans

Prices are the plan's starting assumptions and live in one place (`server/src/lib/plans.ts`).

| Plan | Who | Limits and features |
| ---- | --- | ------------------- |
| FREE | default for a new event | up to 100 guests, the traditional template only, Moments branding, no seating plan, no thank-you SMS |
| STANDARD | $20 per event | up to 1,000 guests, all templates, gift book, check-in, reports |
| PREMIUM | $50 per event | everything, including seating plan and thank-you messages, more guests |
| PLANNER | organizations | events of a planner organization get Premium features |

- `Event.plan` (default FREE). Limits are checked in the API: adding or importing guests past
  the limit, choosing a template, the seating and thank-you routes.
- **Upgrading:** the host picks a plan on the event's "Plan" page; an `Upgrade` order is created
  with the price and a short reference, and the page shows the **platform's** KHQR
  (`PLATFORM_KHQR_IMAGE`). A platform admin confirms the payment in `/admin`, which applies the
  plan (recorded in `payments` and the audit log). Ticket sales keep their per-ticket fee instead.
- Existing events at the time of the migration become STANDARD, so nothing that already works
  is taken away.
