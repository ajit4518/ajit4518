-- Ownership verification.
--
-- The rule this enforces: you may only bid on a handle you have proven you
-- control. Listing a company's product without asking is free promo; listing
-- a person's social account on a public ranked board they never opted into is
-- a harassment and impersonation surface. That difference is why this exists.

CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Opaque random token, looked up server-side. Nothing is signed into the
-- cookie, so there is no signing key to leak or rotate.
CREATE TABLE IF NOT EXISTS sessions (
  token      text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

DO $$ BEGIN
  CREATE TYPE claim_method AS ENUM ('oauth', 'code', 'seed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A proven (platform, handle) -> user binding.
--
-- UNIQUE (platform, handle) is the important constraint: one owner per
-- handle, first proof wins. Without it two people could both "verify" the
-- same account and fight over the listing.
CREATE TABLE IF NOT EXISTS account_claims (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform            platform NOT NULL,
  handle              text NOT NULL,
  method              claim_method NOT NULL,
  provider_account_id text,
  verified_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_claims_platform_handle_key UNIQUE (platform, handle)
);

CREATE INDEX IF NOT EXISTS account_claims_user_idx ON account_claims (user_id);

DO $$ BEGIN
  CREATE TYPE challenge_status AS ENUM ('pending', 'verified', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fallback proof for platforms without usable OAuth: publish a one-time code
-- in the profile bio, then we read it back.
CREATE TABLE IF NOT EXISTS verification_challenges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   platform NOT NULL,
  handle     text NOT NULL,
  code       text NOT NULL,
  status     challenge_status NOT NULL DEFAULT 'pending',
  attempts   int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS challenges_lookup_idx
  ON verification_challenges (user_id, platform, handle, status);

-- Takedown path for listings created before verification existed, and for
-- anything that slips through.
CREATE TABLE IF NOT EXISTS removal_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  contact     text,
  resolved    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS removal_open_idx ON removal_requests (resolved, created_at DESC);

-- Bind listings to the account that proved ownership.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS listings_owner_idx ON listings (owner_user_id);
