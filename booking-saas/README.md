# WhatsApp booking tool for local businesses (planning)

Online booking + WhatsApp confirmations/reminders + UPI advance payments for
salons, clinics, tutors and other appointment-based businesses in India.

This folder holds the plan, not the code yet:

| File | What it is | How to use it |
|---|---|---|
| [`RESEARCH_PROMPT.md`](./RESEARCH_PROMPT.md) | A deep-research prompt (desk research) plus a field-interview script (talking to shop owners) | Paste Part A into a research-capable AI. Use Part B when you visit businesses. |
| [`BUILD_PROMPT.md`](./BUILD_PROMPT.md) | A phased build spec for the MVP | Paste it into Claude Code one phase at a time, after research says "go". |

Do the research first. The build prompt has placeholders (niche, city,
pricing) that the research should fill in.

---

## What desk research already found (October 2026)

Verify these before relying on them. Prices and policies change often.

### 1. WhatsApp costs: small per message, and no longer free inside the window

- Meta charges **per delivered template message**. In India, billing is in
  INR, with **utility templates (confirmations, reminders) at about ₹0.115
  each** and **marketing templates at about ₹0.86 each**, roughly 7x more.
  ([Meta pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing),
  [Wati 2026 guide](https://www.wati.io/en/blog/whatsapp-api-pricing-guide/))
- **Change from 1 October 2026:** utility templates sent *inside* the
  24-hour customer service window, and free-form service replies, are now
  charged too. There is a free tier of about **1,000 service messages per
  phone number per month**.
  ([SleekFlow summary](https://sleekflow.io/en-us/blog/whatsapp-business-price))
- **What this means for us:** a busy salon with 300 bookings × 2 messages
  costs about ₹70/month in Meta fees. That's fine on a ₹299–499 plan. But
  "we miss you" win-back messages count as **marketing**, so they must be a
  metered add-on, not unlimited.

### 2. Sending "from the business's own number" is possible, with limits

- To send from each business's own WhatsApp number, you become a Meta
  **Tech Provider** and onboard businesses through **Embedded Signup**.
  ([Meta: Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers),
  [Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview))
- Problems for a solo founder:
  - You must complete **Meta business verification** first.
  - The default limit is **10 new businesses per rolling 7 days**.
  - Under the Tech Provider model, **each business must add its own payment
    method** to Meta. That's a big hurdle for a salon owner.
- "Coexistence" onboarding lets a business keep using the WhatsApp Business
  app on the same number. That matters, because owners won't give up the app.
- **MVP decision:** start with **one shared number that you own** (for
  example "YourApp Bookings") that sends for all businesses, with the
  business name in every message. Move to own-number sending later, either as
  a Tech Provider or through a Solution Partner (BSP) such as Gupshup or
  Interakt, who handles billing.

### 3. UPI payments: the gateway fee is real, though UPI MDR is zero

- **Razorpay's standard rate is 2% + 18% GST (about 2.36%) on UPI too.**
  UPI MDR is zero by RBI mandate, but the gateway charges a "platform fee."
  New merchants get **0% for 90 days or ₹5 lakh GMV**, whichever comes first.
  ([Razorpay pricing](https://razorpay.com/pricing/),
  [fee explainer](https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/))
- On a ₹100 deposit that's about ₹2.36, which is acceptable.
- **The money must go to the business, not sit with you.** Use Razorpay Route
  (split payments to linked accounts) or have each business connect its own
  gateway account. Holding other people's money yourself creates compliance
  problems.
- **Cheapest MVP option:** a `upi://pay` link or QR code to the **business's
  own UPI ID**. It costs nothing and needs no KYC. The downside is that
  payment isn't verified automatically, so the owner taps "paid" by hand.
  Good enough for testing.

### 4. Competitors: the idea is validated, and others are building it

| Player | What they do | Gap we can use |
|---|---|---|
| **Fresha** | Free salon software, global marketplace | Reminders by email/SMS, **no automated WhatsApp**; charges a fee for marketplace clients ([pricing](https://www.fresha.com/pricing)) |
| **Happoin** | WhatsApp-first salon booking from the business's own number, AI chatbot | Payments via **Stripe**, not UPI; Europe-focused pricing ([site](https://happoin.com/en-gb/salon-booking-software)) |
| **Zoho Bookings, Picktime, Setmore** | General scheduling | Built around email and calendars, not WhatsApp-native |
| **Practo** (clinics) | Doctor discovery + booking | Marketplace; the clinic doesn't own the customer relationship |
| **Interakt, AiSensy, Wati** | WhatsApp API platforms | General-purpose; too complex for a single shop to set up |
| **Indie founders** | Several people posting the same idea ([r/StartUpIndia](https://www.reddit.com/r/StartUpIndia/comments/1w414r1/building_a_whatsappbased_appointment_booking_tool/)) | Proves demand; also means **speed and one niche** matter |

**Our wedge:** WhatsApp + **UPI** + ₹ pricing + 10-minute setup on a phone,
for **one niche in one city**, sold in person.

### 5. No-shows: the pain is real, but measure it yourself

Vendor articles claim salon no-show rates of **15–30%**, falling to about 5%
with automated reminders
([example](https://vocalyai.com/blog/salon-spa-appointment-booking-reduce-no-shows)).
These numbers come from companies selling reminder software, so treat them
as a hypothesis. **Ask the owners you interview** (Part B of the research
prompt).

---

## Open questions the research must answer

1. Which niche first: salons, clinics/physio, tutors, or something else? (The
   one with the most bookings and no-shows, and the most willingness to pay.)
2. Will owners pay **₹299–499/month**? Monthly or yearly?
3. Is a shared sender number acceptable, or do customers only trust the
   shop's own number?
4. Will customers pay a ₹50–100 UPI advance, or does it scare them off?
5. Who uses it: the owner, or the receptionist/staff?
