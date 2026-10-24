# Build prompt

A phased spec for building the MVP with Claude Code (or any coding
assistant). **Give it one phase at a time.** Check each phase works before
starting the next.

Fill in the `[brackets]` using your research results. The stack matches
[`bidboard/`](../bidboard) in this repo (Next.js + raw-SQL Postgres + Vercel)
so you can reuse its patterns for migrations, tests and CI.

---

## Master prompt (paste first, then add the phase)

```text
Build an MVP of a WhatsApp-first appointment booking SaaS for small
businesses in India, in a new folder `booking-saas/app` of this repo.

## Product
- Niche: [salons] in [CITY]. Data model must still be generic enough for
  clinics/tutors later (no salon-specific columns).
- A business signs up, adds services, staff and opening hours, and gets a
  public booking link: /b/[business-slug].
- Customers book a slot from that link on their phone, with no account
  needed: name + mobile number.
- Customers get a WhatsApp confirmation immediately and a reminder before
  the appointment. Optional UPI advance payment.
- The owner manages everything from a mobile-first dashboard.
- Prices and times in INR and Asia/Kolkata. UI in English first, with all
  strings kept in one file so Hindi can be added later.

## Stack (follow the conventions in ./bidboard)
- Next.js 15 App Router, TypeScript, React 19.
- Postgres with the `pg` driver and plain SQL migrations in db/ run by a
  scripts/migrate.mjs, like bidboard. No ORM.
- Owner auth: phone-number OTP login (send OTP via the WhatsApp
  authentication template, with email magic link as a fallback). Sessions
  in an httpOnly cookie stored in a sessions table.
- WhatsApp: Meta WhatsApp Cloud API through a single `src/lib/whatsapp.ts`
  module behind an interface, so the provider can later be swapped for a
  BSP (Gupshup/Interakt) or a per-business number. In development, log
  messages to the console instead of sending them.
- Payments: Razorpay behind `src/lib/payments.ts`, also behind an
  interface. Also support a "manual UPI" mode: show a upi://pay link/QR for
  the business's own UPI ID and let the owner mark the booking paid.
- Scheduled jobs (reminders): a cron endpoint protected by a secret,
  triggered by Vercel Cron every 5 minutes, that sends due reminders from
  a messages table (outbox pattern, idempotent, retries with backoff).
- Tests: node:test, like bidboard. CI in .github/workflows like
  bidboard-ci.yml.
- Deploy target: Vercel + a managed Postgres (Neon or Supabase).

## Non-negotiable rules
- Never double-book. Prevent overlapping bookings for the same staff member
  with a Postgres exclusion constraint on a tstzrange
  (btree_gist), not just application checks.
- All times stored as timestamptz in UTC; displayed in Asia/Kolkata.
- Every WhatsApp send goes through the outbox table with a unique
  idempotency key, so retries and cron overlaps never send duplicates.
- Verify Razorpay and WhatsApp webhook signatures. Reject unsigned calls.
- Customer phone numbers are personal data (India DPDP Act): record consent
  to WhatsApp messages at booking, show a privacy notice, and give owners a
  "delete customer" action that actually deletes.
- Rate-limit public endpoints (booking, OTP) per IP and per phone number.
- Mobile-first: every screen must work on a 360px-wide Android phone.
- The app must refuse to start in production if required env vars are
  missing (as bidboard does).

Work only on the phase I give you below. At the end of the phase: run the
tests and the build, list what you built, and list anything you couldn't
finish or that I need to set up (accounts, keys, templates).
```

---

## Phase 1: data model and business setup

```text
PHASE 1 — Database and owner onboarding.

1. Migrations for these tables (add indexes and foreign keys):
   - businesses: id, slug (unique), name, category, phone, address, city,
     timezone (default Asia/Kolkata), upi_id, deposit_mode
     ('none' | 'manual_upi' | 'razorpay'), deposit_amount_paise,
     reminder_offset_minutes (default 120), plan, created_at.
   - owners (users): id, phone (unique), name, email, created_at;
     plus business_members (business_id, user_id, role: owner | staff).
   - staff: id, business_id, name, active.
   - services: id, business_id, name, duration_minutes, price_paise,
     active, sort_order.
   - staff_services: which staff can do which service.
   - working_hours: business_id, staff_id (nullable = whole business),
     weekday 0–6, start_time, end_time. Multiple rows per day allowed
     (for lunch breaks).
   - time_off: staff_id, starts_at, ends_at, reason.
   - customers: id, business_id, name, phone, whatsapp_consent_at,
     notes, created_at. Unique (business_id, phone).
   - sessions and otp_codes (hashed codes, expiry, attempt counter).
2. Owner sign-up and login with phone OTP (dev mode: print OTP to console).
3. Onboarding wizard (3 screens, finishable in under 5 minutes on a phone):
   business name + category + city → services (pre-filled suggestions for
   the chosen category, e.g. "Haircut 30 min ₹300") → opening hours
   (default Mon–Sat 10:00–20:00) → done, showing the booking link with
   "Share on WhatsApp" and "Copy" buttons.
4. Settings pages to edit business info, services, staff and hours.
5. Seed script with one demo salon, 3 staff, 6 services.

Tests: slug generation and uniqueness, OTP expiry and attempt limits,
working-hours validation (end after start, no overlaps per day).
```

## Phase 2: public booking page and slot engine

```text
PHASE 2 — Customer booking flow.

1. Slot engine in src/lib/slots.ts (pure functions, heavily unit-tested):
   given a service, a date, staff working hours, time off and existing
   bookings, return available start times at 15-minute steps. Handle:
   "any staff" vs a chosen staff member, lunch breaks, the service ending
   after closing time, same-day bookings needing a minimum notice
   (default 30 min), max booking window (default 30 days), and Indian
   time zone.
2. bookings table: id, business_id, customer_id, staff_id, service_id,
   starts_at, ends_at, status ('pending_payment' | 'confirmed' |
   'completed' | 'no_show' | 'cancelled'), price_paise, deposit_paise,
   deposit_status, source ('link' | 'owner'), cancel_token, created_at.
   Exclusion constraint so one staff member cannot have overlapping
   confirmed/pending bookings.
3. Public page /b/[slug]: business name and address, list of services with
   price and duration → pick staff (or "anyone") → pick date (next 14 days
   as a horizontal strip) → pick time → name + mobile + WhatsApp consent
   checkbox → confirm. Fast on a cheap Android phone: server-rendered,
   minimal JavaScript, no heavy UI libraries.
4. If two customers grab the same slot at once, the second one gets a
   friendly "just taken, pick another time" message (catch the constraint
   violation).
5. Booking success page with an "Add to calendar" (.ics) link and a
   cancel/reschedule link using cancel_token.
6. Customer cancel and reschedule pages (allowed until X hours before,
   configurable).

Tests: the slot engine edge cases above, the double-booking race (two
concurrent inserts, exactly one succeeds), cancel-token access control.
```

## Phase 3: WhatsApp confirmations and reminders

```text
PHASE 3 — WhatsApp messaging.

1. messages table (outbox): id, business_id, booking_id, to_phone,
   template_name, variables (jsonb), category ('utility' | 'marketing' |
   'authentication'), status ('queued' | 'sent' | 'delivered' | 'read' |
   'failed'), idempotency_key (unique), send_after, attempts,
   provider_message_id, error, created_at.
2. src/lib/whatsapp.ts with an interface { sendTemplate(...) } and two
   implementations: ConsoleProvider (dev) and MetaCloudProvider (Cloud API).
3. Templates (write the exact text for Meta approval, as utility
   templates, in English and Hindi, and add a doc explaining how to submit
   them):
   - booking_confirmed: business name, service, date, time, address, a
     manage-booking link.
   - booking_reminder: same details, sent reminder_offset_minutes before.
   - booking_cancelled and booking_rescheduled.
   - otp_login (authentication template).
   Use the business name inside the message because the MVP sends from
   one shared number.
4. Enqueue confirmation on booking; enqueue reminder with
   send_after = starts_at - offset. Cancel or reschedule removes/replaces
   queued reminders.
5. /api/cron/send-messages: protected by CRON_SECRET, picks due queued
   messages with SELECT ... FOR UPDATE SKIP LOCKED, sends, records
   result, retries failures with backoff up to 3 times.
6. /api/webhooks/whatsapp: verify the signature, update delivery status,
   and handle customer replies. If a customer replies "cancel" or taps a
   Cancel quick-reply button, cancel the booking and notify the owner.
7. Track message counts per business per month (for plan limits and
   costs). Show "messages used this month" in the dashboard.

Tests: idempotency (running cron twice sends once), reminder rescheduling,
webhook signature rejection, quiet hours (don't send reminders between
22:00 and 08:00; send the evening before instead).
```

## Phase 4: owner dashboard

```text
PHASE 4 — Mobile dashboard for the owner.

1. Home = "Today": timeline of today's appointments by staff, each with
   customer name, service, time, deposit status, and one-tap buttons:
   Call, WhatsApp chat (wa.me link), Mark completed, Mark no-show, Cancel.
2. Add a booking manually (for phone and walk-in customers) using the
   same slot engine, with an option to send the WhatsApp confirmation.
3. Week view calendar.
4. Customers list with search, visit history, total spend, no-show count,
   notes. Delete-customer action (DPDP).
5. Simple stats: bookings this month, no-show rate this month vs last
   month, revenue booked, deposits collected, messages sent.
6. Add to Home Screen (PWA manifest + icons) so it feels like an app.
7. Staff role: staff see only their own appointments and can't see
   settings or stats.

Tests: role permissions (staff can't access another business or settings),
no-show rate calculation.
```

## Phase 5: UPI deposits and subscription billing

```text
PHASE 5 — Payments.

1. Deposit mode 'manual_upi': on the booking page show a upi://pay deep
   link (pa = business UPI ID, pn = business name, am = deposit, tn =
   booking reference) and a QR code. Booking stays 'pending_payment'
   until the owner taps "Mark paid", or auto-confirms if the owner chose
   "confirm without waiting".
2. Deposit mode 'razorpay': create a Razorpay order, verify payment with
   the webhook (signature checked), then confirm the booking. Unpaid
   pending bookings expire after 15 minutes and free the slot. Design
   this so funds settle to the business (Razorpay Route linked account),
   never held by the platform; document the onboarding steps.
3. Refund rules: deposit is adjusted against the bill; on cancellation
   more than X hours before, show the owner a "refund" reminder (manual
   for MVP).
4. SaaS subscription for the business itself, plans from research:
   Free ([30] bookings/month, branding on messages), Pro ([₹399]/month:
   unlimited bookings, deposits, no branding), Business ([₹999]/month:
   multiple staff calendars, win-back messages metered).
   Use Razorpay Subscriptions (UPI Autopay). 30-day free trial without
   a card. Enforce limits gracefully: never block a customer's booking
   mid-flow; warn the owner and pause new bookings only after a grace
   period.
5. GST-ready invoices (business name, GSTIN optional) as downloadable
   PDFs or HTML.

Tests: webhook signature, expiry of unpaid bookings, plan limit
enforcement, upi:// link encoding.
```

## Phase 6: launch readiness

```text
PHASE 6 — Production hardening and launch.

1. Landing page at / in plain language: problem (no-shows, WhatsApp
   chaos), how it works in 3 steps, pricing in ₹, a "Book a free setup"
   button that opens WhatsApp chat with me, FAQ, and a demo booking page.
2. Privacy policy and terms pages covering the DPDP Act basics (what data,
   why, retention, deletion, contact).
3. Error monitoring (Sentry or similar), structured logs, and an admin
   page for me: all businesses, plan, bookings and messages this month,
   failed messages.
4. Backups: document Postgres point-in-time recovery for the chosen host.
5. Security pass: auth on every API route, tenant isolation (every query
   filtered by business_id; add a test that tries cross-business access
   on each route), rate limits, secrets only in env vars.
6. DEPLOY.md like bidboard's: create Meta app + WhatsApp number, submit
   templates, Razorpay keys and webhooks, Vercel cron, env var list.
7. CI workflow: tests, build and migrations against a Postgres service.
```

---

## After the MVP (don't build yet)

Add these only when paying customers ask for them:

- Send from the **business's own WhatsApp number** (Tech Provider +
  Embedded Signup with coexistence, or through a BSP).
- **Win-back campaigns** ("We miss you! 10% off this week") as metered
  marketing messages.
- Google review requests after an appointment.
- Book by chatting on WhatsApp (a bot that books slots). Check Meta's
  2026 chatbot policy first.
- Multi-branch businesses, packages/memberships, Hindi and regional
  languages, Google Maps "Book" button integration.

## Launch checklist (non-code)

- [ ] Meta Business verification done; WhatsApp number registered; templates approved
- [ ] Razorpay account KYC done (new-merchant 0% offer applies for 90 days / ₹5L GMV)
- [ ] Domain bought; privacy policy and terms live
- [ ] 5 businesses from field research set up personally, free for one month
- [ ] Weekly check-in with each: no-shows before vs after, what's annoying
- [ ] Convert to paid at the end of the trial; target 10 paying businesses before adding features
