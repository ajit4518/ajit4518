# BidBoard

A geographic directory of brand social accounts with a pay-to-rank layer on
top. Browse by country and city, filter by platform and category, and rank by
what you have paid.

Two tiers:

- **Free** — anyone adds an account by pasting a username or profile link. No
  login, no payment.
- **Paid** — the *verified owner* bids to rank above the free tier.

That split is the whole design. Gating submission starves a directory's supply
side, but letting anyone pay to position an account they do not own is exactly
the abuse the ownership gate exists to stop. So submission is open and only
*ranking* is gated.

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
npm test                 # 21 unit tests: bidding rules, challenge codes, PKCE
node scripts/verify.mjs  # 46 end-to-end checks against a running server
```

The end-to-end suite covers the ownership gate (an unverified visitor cannot
bid; a verified user cannot bid on someone else's handle; a handle cannot be
claimed twice), the free-listing path (open submission, no self-set bid
amount, no duplicates, no implied right to bid), geography (city pages,
filters, paid-above-free ordering, sitemap and robots), the bio-code flow, bid
validation, settlement concurrency, webhook replay, takedown, rate limiting,
and click counting.

### What the concurrency checks actually prove

The no-lost-update property lives in **settlement**, not checkout. The suite
applies two payments to the same listing simultaneously and asserts the total
is their sum, so neither overwrites the other.

Separately it asserts the property that removes the "race for #1": two bidders
paying the *same* amount for different handles both succeed and are ordered by
age. Nobody is competing for a slot, so nobody needs refunding.

Two identical bids on the *same* listing is not that race — it is a no-op
raise, and the second is correctly refused rather than charged twice. The
suite asserts that too.

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

Note what this does *not* mean: two identical bids on the **same** listing are
not a race at all. That is a no-op raise, and the second is refused by the
`+$1` rule rather than charged twice.

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

## Geography

Listings carry an optional country and city. Three surfaces use it:

- `/` — country, city, platform, category and brand/person filters
- `/in/<country>/<city>` — a real ranked page per city, the SEO surface
- `/directory` — index of cities, **populated ones only**

A directory's distribution is long-tail search ("social media agencies in
mumbai"), not virality. That only works if the pages are real: the sitemap
lists a city only once it has listings, and category pages only once a city has
five or more. Publishing a page per city x category upfront would be thousands
of thin URLs, which hurts rather than helps.

Cities are a curated list ordered by `sort_order`, so the strongest markets
surface first rather than alphabetically.

### Ranking across the two tiers

```sql
ORDER BY total_cents DESC, COALESCE(first_bid_at, created_at) ASC
```

Paid always outranks free because `total_cents` leads. Within the free tier
every row is 0, so the fallback to `created_at` gives a stable first-come
order instead of an arbitrary one.

### Keeping the open path safe

Submission is deliberately unauthenticated, so the protections sit elsewhere:

- Nothing on the free path can set a bid amount. Money only ever moves through
  `applyPaidBid()`.
- Every listing is one-click reportable, and an unverified one is hidden
  immediately.
- Person listings are excluded from indexing via `robots.txt`, so the site does
  not drift into being a people-search surface.
- The submit endpoint is rate limited per client, keyed on a **hash** of the IP
  so the table holds no directly identifying data.
- Re-adding an existing handle returns the existing listing rather than
  duplicating it, and a removed listing cannot be re-added.

## Ownership verification

**You can only bid on an account you control.** This is enforced server-side in
`/api/checkout`, not just in the UI — the form only offers verified handles, but
the API re-checks the claim on every request regardless.

Two ways to prove it:

**Sign in with the platform (preferred).** OAuth 2.0 with PKCE for X, YouTube
(via Google) and TikTok. The platform tells us who you are, so nothing has to be
published or read back. Each provider is inert until its client id and secret are
set, and the sign-in button says so.

**Publish a one-time code (fallback).** We issue `bidboard-verify-<10 hex>`, you
put it anywhere in your bio, we read it back. Matching tolerates the ways
platforms mangle bios — case, whitespace, zero-width characters — but requires
the full code.

Instagram and LinkedIn are code-only on purpose. Instagram handle verification
needs the Facebook Graph API against a Business account, behind App Review and
business verification. LinkedIn *company page* control needs `r_organization_admin`,
which is partner-gated; plain sign-in only proves who the person is. Neither is
something a new project can self-serve, so the fallback carries them.

`UNIQUE (platform, handle)` on `account_claims` means one owner per handle and
first proof wins — a second person proving control of the same account is
rejected rather than silently taking over the listing.

Verifying also adopts any existing listing for that handle, so accounts listed
before verification existed can be claimed by their real owner.

### Takedown

`POST /api/listings/report` files a removal request and **immediately hides**
any listing that is not owner-verified. Unverified listings of someone else's
account get taken down first and adjudicated second.

### Sessions

An opaque 32-byte token in an httpOnly cookie, looked up in `sessions`. Nothing
is signed into the cookie, so there is no signing key to leak or rotate.

## Local testing without any platform credentials

Two dev-only seams, both gated on `ALLOW_MOCK_OAUTH=1` and refused when
`NODE_ENV=production`:

- `GET /api/auth/mock/start?platform=x&handle=foo` creates a verified claim.
  It calls the same `upsertClaim()` the real callback uses, so exercising it
  tests the production path rather than a stub.
- `MOCK_BIO_FILE=/path/to/file` makes the bio fetcher read that file instead of
  the live profile, which is how the code-challenge flow is tested end to end.

## Production safety

The app **refuses to serve** if it is misconfigured in production
(`productionConfigProblems()` in `src/lib/config.ts`, invoked from
`instrumentation.ts` at boot). It checks for a database URL, a live Stripe key
and webhook secret, an https origin, and that no dev flag leaked into the
deploy. A bad deploy fails loudly at start rather than quietly at the first
payment.

Three hazards this closes, all found by actually running a production build:

- **Simulated payments must fail closed.** `SIMULATED_PAYMENTS` used to be
  derived from "no Stripe key", so a production deploy with a missing or
  mistyped key would have handed out the #1 position for free. In production it
  is now always false and checkout returns 503 instead.
- **`APP_BASE_URL`, not `NEXT_PUBLIC_BASE_URL`.** `NEXT_PUBLIC_*` values are
  inlined at *build* time, so an origin supplied only at run time is silently
  ignored and the deploy keeps the build machine's — which sends live customers
  to a localhost Stripe redirect. Only server code needs the origin, so it is
  read at run time.
- **`sitemap.xml` and `robots.txt` are dynamic.** Prerendered, they baked in the
  build origin; the sitemap also depends on which cities have listings, which
  changes as they arrive.

See `DEPLOY.md`.

## Not built yet

- Rate limiting on checkout and challenge creation beyond the per-challenge
  attempt cap.
- Refund tooling and an admin view for `removal_requests` and hidden listings.
- Avatar fetching and profile-existence checks at submission time.
- Reserved-handle blocklist for well-known accounts.
- Terms of service and privacy policy — required before taking real money.
