# Deploying

Nothing here needs me. It is roughly fifteen minutes end to end.

## Before you start

The app **refuses to boot** in production if it is misconfigured — see
`productionConfigProblems()` in `src/lib/config.ts`. That is deliberate: the
alternative is discovering the problem when someone takes the #1 spot for free.
It checks for a database URL, a live Stripe key, a webhook secret, an https base
URL, and that no dev flags leaked into production.

## 1. Database

Create a Postgres database (Neon, Supabase, or Railway all work) and copy the
connection string. Then, from your machine:

```bash
DATABASE_URL="postgres://…" npm run db:migrate
DATABASE_URL="postgres://…" node scripts/seed.mjs   # categories + cities; skip the demo rows if you prefer
```

The seed inserts demo listings. For a real launch, edit the `demo` array in
`scripts/seed.mjs` down to nothing and keep only `db/seed.sql` and
`db/seed_geo.sql`, which hold the categories and cities.

## 2. Hosting

Vercel is the path of least resistance for a Next.js app. Import the repo, set
the root directory to `bidboard`, and add these environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | your Postgres connection string |
| `APP_BASE_URL` | `https://yourdomain.com` — https, no trailing slash |
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | from step 3 |

**Do not set** `ALLOW_DEV_SIMULATE`, `ALLOW_MOCK_OAUTH`, or `MOCK_BIO_FILE`.
The boot check fails the deploy if any of them are present.

## 3. Stripe

1. Get your live secret key from the Stripe dashboard.
2. Add a webhook endpoint pointing at `https://yourdomain.com/api/stripe/webhook`,
   subscribed to `checkout.session.completed`.
3. Copy the signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.

Test the whole path once in test mode first:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

A bid is only credited by the webhook. If the webhook is misconfigured, people
are charged and nothing appears — so verify it before announcing anything.

## 4. Platform OAuth (optional)

Each provider stays disabled until both its variables are set, and the sign-in
button says "not configured". You can launch without any of them: the bio-code
fallback covers every platform.

| Provider | Where | Callback |
|---|---|---|
| X | developer.x.com, OAuth 2.0 + PKCE | `/api/auth/x/callback` |
| Google (YouTube) | console.cloud.google.com, YouTube Data API v3 | `/api/auth/google/callback` |
| TikTok | developers.tiktok.com, Login Kit | `/api/auth/tiktok/callback` |

## 5. Before you take real money

- Fill in the operator details in `/terms` and `/privacy`. Both are templates
  written to match what the code actually does; have them reviewed.
- Decide who handles removal requests and how fast. `removal_requests` has no
  admin UI yet — for now, query it directly.
- Point a domain at the deployment and confirm `APP_BASE_URL` matches
  it exactly, or Stripe redirects and OAuth callbacks will break.

## Still missing

Refund tooling, an admin view for removal requests and hidden listings, avatar
and profile-existence checks at submission, and a reserved-handle blocklist for
well-known accounts.
