-- Geography + free, no-login listings.
--
-- Two listing tiers now coexist:
--   free  - anyone can add an account, no account needed, total_cents = 0
--   paid  - the verified owner bids to rank above the free tier
--
-- That split is deliberate. A directory dies of an empty supply side if you
-- gate submission, but letting anyone PAY to position an account they do not
-- own reintroduces exactly the abuse the ownership gate exists to stop.

CREATE TABLE IF NOT EXISTS countries (
  code text PRIMARY KEY,            -- ISO 3166-1 alpha-2
  name text NOT NULL,
  slug text UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS cities (
  id           serial PRIMARY KEY,
  country_code text NOT NULL REFERENCES countries(code),
  name         text NOT NULL,
  slug         text NOT NULL,
  -- Curated ordering, so "top performing cities" surface first instead of
  -- alphabetically. Lower sorts earlier.
  sort_order   int NOT NULL DEFAULT 100,
  CONSTRAINT cities_country_slug_key UNIQUE (country_code, slug)
);

CREATE INDEX IF NOT EXISTS cities_country_idx ON cities (country_code, sort_order);

DO $$ BEGIN
  CREATE TYPE entity_type AS ENUM ('brand', 'person');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE listings ADD COLUMN IF NOT EXISTS city_id int REFERENCES cities(id);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS entity_type entity_type NOT NULL DEFAULT 'brand';

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS city_id int REFERENCES cities(id);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS entity_type entity_type NOT NULL DEFAULT 'brand';

-- Free listings have no first_bid_at, so ordering falls back to created_at.
-- Paid always outranks free because total_cents leads the sort.
CREATE INDEX IF NOT EXISTS listings_geo_rank_idx
  ON listings (status, city_id, total_cents DESC, COALESCE(first_bid_at, created_at) ASC);

CREATE INDEX IF NOT EXISTS listings_rank2_idx
  ON listings (status, total_cents DESC, COALESCE(first_bid_at, created_at) ASC);

-- Coarse rate limiting for the no-login submit path. Keyed by a hash of the
-- client IP, never the IP itself, so the table holds no directly identifying
-- data and still stops one source flooding the directory.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       text NOT NULL,
  window_start timestamptz NOT NULL,
  count        int NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);
