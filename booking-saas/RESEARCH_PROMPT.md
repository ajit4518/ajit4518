# Research prompt

Two parts:

- **Part A: desk research.** Paste it into a research-capable AI (for
  example Claude with web search or deep research). Takes about an hour.
- **Part B: field research.** A script for talking to 15–20 real business
  owners. This matters more than Part A. Do it in person over one week.

Fill in the `[brackets]` before using either part.

---

## Part A: desk research prompt (copy everything inside the box)

```text
You are a market researcher helping a solo founder in India decide whether
and how to build a SaaS product. Research the web thoroughly, cite a source
URL for every factual claim, prefer sources from the last 12 months, and say
clearly when something is your estimate rather than a sourced fact.

## The product
A booking tool for small appointment-based businesses in India (salons,
clinics, physiotherapists, tutors, gyms, spas, car service centres). The
business shares a booking link. Customers pick a slot and optionally pay a
small UPI advance (₹50–100). Customers then get an automatic WhatsApp
confirmation and a reminder before the appointment. The owner sees today's
appointments on a simple mobile dashboard. Target price: ₹299–499/month.

## Founder context
- Solo, technical (can build Next.js + Postgres), based in [CITY].
- Will sell in person at first, in one niche and one city.
- Budget: [BUDGET] for the first 6 months.

## Answer these questions

### 1. Choosing a niche
Compare salons/barbershops, dental and general clinics, physiotherapy,
tuition/coaching, gyms/yoga studios, spas, pet grooming, and car service. For
each, estimate:
- Number of businesses in India and in Tier-1 vs Tier-2 cities (cite
  sources, e.g. industry reports, government MSME data).
- Typical appointments per day and average ticket size.
- Whether customers book ahead or walk in.
- How bookings and reminders are handled today.
- Typical software spend, if any.
Then rank the niches for a solo founder and justify the top 2.

### 2. Competitors
List every product that does booking + WhatsApp reminders for Indian small
businesses. Cover at least: Fresha, Happoin, Zoho Bookings, Picktime,
Setmore, SimplyBook.me, Practo, Salonist, Zenoti, Dingg, Interakt, AiSensy,
Wati, and any Indian startups you find. For each give:
- Pricing in ₹ (or $) and what each tier includes.
- Whether WhatsApp messages are sent from the business's own number or a
  shared one, and whether reminders are automatic.
- Whether UPI payments/deposits are supported.
- Target customers and cities.
- Visible weaknesses from app store reviews, Reddit, G2, Capterra or
  Google Play reviews (quote real complaints with links).
Finish with a table, then the 3 biggest gaps a new product could fill.

### 3. WhatsApp Business Platform (verify current rules)
- Current per-message prices in India for utility, marketing,
  authentication and service messages, including the change Meta made on
  1 October 2026 and any free tiers.
- The ways a SaaS can send on behalf of many businesses: one shared number
  vs Tech Provider + Embedded Signup vs going through a Solution Partner/BSP
  (Gupshup, Interakt, Twilio, 360dialog, etc.). For each: setup steps,
  verification needed, onboarding limits, who pays Meta, BSP markups, and
  "coexistence" with the WhatsApp Business app.
- Template approval rules for appointment confirmations and reminders, and
  what gets a template classed as marketing instead of utility.
- Meta policy on AI chatbots on WhatsApp in 2026, if a booking chatbot is
  added later.
- Messaging limits and quality ratings for new numbers.

### 4. Payments
- Costs and requirements for collecting UPI advances on Razorpay, Cashfree,
  PhonePe PG and Paytm PG: fees (including GST), KYC, settlement time, and
  current offers for new merchants.
- How to route each payment to the business's own account (Razorpay Route,
  Cashfree Easy Split, etc.) without the platform holding funds. Any RBI
  payment-aggregator rules that apply.
- How to bill the SaaS subscription itself: UPI Autopay / e-mandate
  recurring payments, failure rates, and fees.
- GST: when a SaaS founder must register, and how to invoice businesses.

### 5. Customer behaviour
- Evidence on no-show rates for salons/clinics in India and how much
  reminders reduce them (separate independent studies from vendor claims).
- Evidence on whether Indian customers accept paying advance deposits.
- How small business owners in India discover and buy software (WhatsApp
  groups, distributors, Google, YouTube, word of mouth), and typical
  willingness to pay.

### 6. Legal and compliance
- What India's Digital Personal Data Protection Act 2023 and its rules
  require of a booking app storing customer names and phone numbers
  (consent, notices, deletion, breach reporting), and when obligations
  take effect.
- Consent rules for WhatsApp messaging (opt-in requirements).
- Any special rules for clinics handling health data.

### 7. Go-to-market for a solo founder
- 3 realistic ways to get the first 50 paying businesses in [CITY].
- Partnerships worth trying (salon product distributors, beauty academies,
  medical associations, POS/billing software vendors).
- Examples of Indian SMB SaaS that grew this way, with sources.

## Output format
1. One-page executive summary with a clear GO / NO-GO / PIVOT
   recommendation and the recommended first niche.
2. A section for each of the 7 topics above, with tables where useful.
3. A risk list: top 5 risks and how to reduce each.
4. Recommended MVP feature list (must-have vs later) and pricing tiers in ₹.
5. A list of every source used.
```

---

## Part B: field research (talk to 15–20 owners in one week)

The goal is to learn whether they'll **pay**, not whether they like the idea.
People are polite. Listen for real problems and real money.

### Who to talk to
- 10–15 businesses in your top niche, plus 5 in the second niche.
- A mix: small single-chair shops, mid-size shops with staff, and one or two
  chains.
- Visit at quiet hours (usually weekday early afternoon), not at peak time.

### Opening (30 seconds)
> "Hi, I'm building a simple tool for [salons] in [area]. I'm not selling
> anything today. Can I ask you 5 minutes of questions about how you handle
> appointments?"

### Questions. Ask about the past, not the future.

**How they work today**
1. How do customers book with you now: walk-in, phone call, WhatsApp,
   Instagram, an app?
2. Roughly how many appointments do you have on a normal day? On a weekend?
3. Who handles bookings: you, a receptionist, staff?
4. Where do you write them down? (Ask to see the notebook/register/app if
   they're comfortable showing it.)

**The pain**
5. In the last week, how many people booked and didn't show up?
6. What did that cost you? (Average bill amount?)
7. Do you send reminders now? How? How long does it take?
8. Have you ever double-booked a slot? What happened?
9. How many booking messages or calls do you get while you're busy with a
   customer?

**What they've tried**
10. Have you tried any booking app or software? Which one? Why did you stop
    or keep using it?
11. What do you pay for software today (billing, POS, Instagram ads, etc.)?

**Willingness to pay** (ask only after the questions above)
12. Show a simple mock-up or describe it in one sentence: *"Customers book
    from a link, pay ₹50 advance by UPI, and get a WhatsApp reminder
    automatically."*
    Then ask: **"Would you pay ₹299 a month for this?"** If yes: "Can I set
    it up for you free for one month, and then you pay?"
13. Would your customers be OK paying a ₹50–100 advance?
14. Would a reminder from a "[YourApp] Bookings" WhatsApp number be OK, or
    does it need to come from your own number?
15. Who else should I talk to? (Other owners, a distributor, an association.)

### Record every interview in this table

| # | Business | Niche | Appts/day | No-shows/week | Avg bill ₹ | Current tool | Pays for software? | Would pay ₹299? | Free trial yes? | Own number needed? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | |

### Decision rule after one week
- **GO:** at least 5 of 15 owners say yes to the free one-month trial *and*
  report 3+ no-shows per week. Build the MVP for that niche.
- **PIVOT:** strong pain but a different need (for example billing, or
  customer win-back rather than booking). Change the product, keep the
  niche.
- **NO-GO:** fewer than 3 interested. Try the second niche or the creator
  link-in-bio idea.

Signs of real interest: they ask "when can I start?", "how much?", give you
their number unprompted, or introduce you to another owner. Saying "nice
idea" doesn't count.
