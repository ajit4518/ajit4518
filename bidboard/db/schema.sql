-- BidBoard schema
-- Ranking is DERIVED, never stored. There is no rank column anywhere.
-- Rank = ORDER BY total_cents DESC, first_bid_at ASC.
--
-- That single rule is what makes the "race for #1" a non-problem: two bidders
-- who pay simultaneously cannot both "lose", because neither is competing for
-- a slot. They are sorted. See db/README notes in the project README.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE platform AS ENUM ('x', 'instagram', 'tiktok', 'youtube', 'linkedin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE listing_status AS ENUM ('active', 'hidden', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('pending', 'completed', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The vertical's sub-categories. Boards are filterable by category x platform.
CREATE TABLE IF NOT EXISTS categories (
  id          serial PRIMARY KEY,
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  sort_order  int  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS listings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform      platform NOT NULL,
  handle        text NOT NULL,               -- normalized: lowercase, no leading @
  display_name  text NOT NULL,
  profile_url   text NOT NULL,
  tagline       text,
  avatar_url    text,
  category_id   int NOT NULL REFERENCES categories(id),

  -- cumulative dollars. The one and only ranking key.
  total_cents   bigint NOT NULL DEFAULT 0 CHECK (total_cents >= 0),

  -- tie-breaker: on equal totals the OLDER bid stays higher.
  -- Set once on insert, never updated.
  first_bid_at  timestamptz,
  last_bid_at   timestamptz,

  owner_email   text,
  verified      boolean NOT NULL DEFAULT false,
  status        listing_status NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- one listing per handle per platform. This is the conflict target that
  -- makes the "raise" path atomic.
  CONSTRAINT listings_platform_handle_key UNIQUE (platform, handle)
);

-- Covering indexes for the three board views. All three share the same
-- ordering so Postgres can walk the index and stop at LIMIT.
CREATE INDEX IF NOT EXISTS listings_rank_idx
  ON listings (status, total_cents DESC, first_bid_at ASC);
CREATE INDEX IF NOT EXISTS listings_platform_rank_idx
  ON listings (status, platform, total_cents DESC, first_bid_at ASC);
CREATE INDEX IF NOT EXISTS listings_category_rank_idx
  ON listings (status, category_id, total_cents DESC, first_bid_at ASC);

-- Every individual payment. amount_cents is the DELTA paid in that
-- transaction, not the resulting total ("pay only the difference").
CREATE TABLE IF NOT EXISTS bids (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id               uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  amount_cents             bigint NOT NULL CHECK (amount_cents > 0),
  total_after_cents        bigint NOT NULL,
  payer_email              text,
  -- second idempotency guard: a payment intent can only ever apply once.
  stripe_payment_intent_id text UNIQUE,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bids_listing_idx ON bids (listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bids_created_idx ON bids (created_at DESC);

-- Intent captured BEFORE payment. The Stripe session only carries this id,
-- so no listing data is ever trusted from client-supplied metadata.
CREATE TABLE IF NOT EXISTS submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform          platform NOT NULL,
  handle            text NOT NULL,
  display_name      text NOT NULL,
  profile_url       text NOT NULL,
  tagline           text,
  category_id       int NOT NULL REFERENCES categories(id),
  amount_cents      bigint NOT NULL CHECK (amount_cents > 0),
  payer_email       text,
  stripe_session_id text,
  status            submission_status NOT NULL DEFAULT 'pending',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submissions_session_idx ON submissions (stripe_session_id);

-- Webhook idempotency. Primary guard: Stripe retries the same event id.
CREATE TABLE IF NOT EXISTS processed_events (
  stripe_event_id text PRIMARY KEY,
  processed_at    timestamptz NOT NULL DEFAULT now()
);

-- Click receipts. Without these, bidders cannot justify a second bid,
-- which is what turns a one-off novelty spike into repeat revenue.
CREATE TABLE IF NOT EXISTS clicks (
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day        date NOT NULL,
  count      bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (listing_id, day)
);
