# BidBoard

A pay-to-rank leaderboard for social accounts, in the shape of
[outbid.lol](https://outbid.lol) but scoped to a **single commercial vertical**
with **per-platform boards**.

Rank is set by one number: cumulative dollars paid. No algorithm, no editorial,
no ads.

## Why a vertical instead of a general board

outbid.lol already accepts X handles, and 300+ general clones appeared within
days of its launch — nearly all of them with negligible traffic. A general
"rank any creator" board has no ROI argument behind a bid, so it tops out at
novelty spend.

This is scoped to accounts that are **revenue-generating assets** (agencies,
studios, newsletter and course operators). For them an inbound lead is worth
four figures, so a four-figure bid has arithmetic behind it rather than ego.
Change `src/lib/config.ts` and `db/seed.sql` to retarget the vertical.

## Running it

```bash
cp .env.example .env          # defaults work against a local Postgres
npm install
npm run db:reset              # apply schema + seed demo listings
npm run dev                   # http://localhost:3000
```

With no `STRIPE_SECRET_KEY` set it runs in **simulated payment mode**: checkout
is stubbed and bids apply instantly through the exact code path the webhook
uses. Add Stripe test keys to exercise the real flow:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Checks

```bash
npm test                 # 14 unit tests over the pure bidding rules
node scripts/verify.mjs  # end-to-end: validation, concurrency, idempotency, clicks
```

## The rules

| Rule | Value |
|---|---|
| New listing floor | $5 |
| Minimum climb | $1 above your current total |
| To take #1 | $5 above the current leader |
| Maximum | $999,999 |
| Ties | older bid stays higher |
| Expiry | none — only a bigger bid moves you down |

Raising charges **only the difference**: going from $12,000 to $13,005 costs
$1,005. One payment counts on both the All-time and Today boards.

## Design notes

Four decisions carry most of the weight.

**Rank is derived, never stored.** There is no `rank` column. The board is
`ORDER BY total_cents DESC, first_bid_at ASC`, backed by three covering
indexes. Rank cannot drift because it is not a fact anyone writes down.

**That also deletes the concurrency problem.** Two bidders paying $1,005 at the
same instant look like a race for one slot, and the naive version has a loser
who paid and must be refunded. Because rank is a pure function of the amount,
nobody is competing for a slot — they are sorted, both keep their money, and
`applyPaidBid()` has **no rejection path**. It deliberately does not re-check
"is this still enough for #1" at settlement time. The `planBid()` check at
checkout is advisory only.

**Money is added, never assigned.** The webhook adds the delta that was
charged; it never sets a total computed at checkout time. Two concurrent
raises on the same listing therefore both count instead of one overwriting the
other. This is enforced in SQL:

```sql
ON CONFLICT (platform, handle) DO UPDATE
  SET total_cents = listings.total_cents + EXCLUDED.total_cents
```

**Nothing user-controlled crosses Stripe.** The checkout session carries only a
`submission_id`. Listing data is read back from our own table in the webhook.
The outbound profile URL is *derived* from platform + handle rather than
accepted as a field, which removes open-redirect and link-laundering abuse
outright.

Two idempotency guards: `processed_events` on the Stripe event id (primary,
since Stripe retries) and a unique index on `bids.stripe_payment_intent_id`
(backstop).

### Scale

The board is one identical query for every visitor, so it caches at the edge
(`revalidate = 5`). The database is only touched on a bid. That is why a
three-hour project survived a million visitors — the read path barely exists.

### Click receipts

Outbound clicks route through `/go/:id`, are counted per listing per day, and
are shown on the board. This is not decoration: outbid.lol's repeat five-figure
bids happened because bidders could point at trials and signups. Without
receipts you get one round of novelty money and then silence.

## Not built yet

Deliberately out of scope for a prototype, and all of it matters before launch:

- **Ownership verification.** Anyone can currently list any handle. Listing a
  *person's* account on a public ranked board they never opted into is a real
  moderation and legal problem, unlike listing a product. Platform OAuth or a
  claim/takedown flow is required, not optional.
- Refund and removal tooling, plus an admin view for `hidden` / `removed`.
- Avatar fetching and profile-existence checks at submission time.
- Rate limiting on checkout creation.
- Reserved-handle blocklist for well-known accounts.
