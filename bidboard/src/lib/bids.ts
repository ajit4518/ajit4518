import { query, withTransaction } from "./db";
import type { Platform } from "./rules";

export type BoardRow = {
  id: string;
  platform: Platform;
  handle: string;
  display_name: string;
  tagline: string | null;
  profile_url: string;
  total_cents: string | number;
  first_bid_at: string | null;
  category_name: string;
  category_slug: string;
  city_name: string | null;
  city_slug: string | null;
  country_name: string | null;
  country_slug: string | null;
  entity_type: "brand" | "person";
  verified: boolean;
  clicks: string | number;
};

export type Category = { id: number; slug: string; name: string };

export async function getCategories(): Promise<Category[]> {
  return query<Category>("SELECT id, slug, name FROM categories ORDER BY sort_order, name");
}

/** The current #1 total across the whole board. Used only for the +$5 rule. */
export async function getTopTotalCents(): Promise<number> {
  const rows = await query<{ total_cents: string }>(
    "SELECT total_cents FROM listings WHERE status = 'active' ORDER BY total_cents DESC LIMIT 1",
  );
  return rows.length ? Number(rows[0].total_cents) : 0;
}

export async function getListing(platform: Platform, handle: string) {
  const rows = await query<{ id: string; total_cents: string; display_name: string }>(
    "SELECT id, total_cents, display_name FROM listings WHERE platform = $1 AND handle = $2",
    [platform, handle],
  );
  return rows[0] ?? null;
}

const BOARD_SELECT = `
  l.id, l.platform, l.handle, l.display_name, l.tagline, l.profile_url,
  l.first_bid_at, l.entity_type, l.verified,
  c.name AS category_name, c.slug AS category_slug,
  ci.name AS city_name, ci.slug AS city_slug,
  co.name AS country_name, co.slug AS country_slug,
  COALESCE(cl.clicks, 0) AS clicks
`;

// Geography is optional on a listing, so these must be LEFT joins or every
// listing without a city silently disappears from the board.
const GEO_JOIN = `
  LEFT JOIN cities ci ON ci.id = l.city_id
  LEFT JOIN countries co ON co.code = ci.country_code
`;

const CLICKS_JOIN = `
  LEFT JOIN (
    SELECT listing_id, SUM(count) AS clicks FROM clicks GROUP BY listing_id
  ) cl ON cl.listing_id = l.id
`;

/**
 * The board. `window` picks all-time or today; one payment counts on both,
 * which is what keeps a "Today" race alive after the all-time board settles.
 */
export async function getBoard(opts: {
  platform?: Platform | null;
  categorySlug?: string | null;
  countrySlug?: string | null;
  citySlug?: string | null;
  entityType?: "brand" | "person" | null;
  window?: "all" | "today";
  limit?: number;
}): Promise<BoardRow[]> {
  const {
    platform = null, categorySlug = null, countrySlug = null, citySlug = null,
    entityType = null, window = "all", limit = 100,
  } = opts;

  const filters = `
    l.status = 'active'
    AND ($1::platform IS NULL OR l.platform = $1)
    AND ($2::text IS NULL OR c.slug = $2)
    AND ($3::text IS NULL OR co.slug = $3)
    AND ($4::text IS NULL OR ci.slug = $4)
    AND ($5::entity_type IS NULL OR l.entity_type = $5)
  `;
  const params = [platform, categorySlug, countrySlug, citySlug, entityType, limit];

  if (window === "today") {
    return query<BoardRow>(
      `SELECT ${BOARD_SELECT}, t.today_cents AS total_cents
       FROM listings l
       JOIN categories c ON c.id = l.category_id
       ${GEO_JOIN}
       JOIN (
         SELECT listing_id, SUM(amount_cents) AS today_cents, MIN(created_at) AS first_today
         FROM bids WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc')
         GROUP BY listing_id
       ) t ON t.listing_id = l.id
       ${CLICKS_JOIN}
       WHERE ${filters}
       ORDER BY t.today_cents DESC, t.first_today ASC
       LIMIT $6`,
      params,
    );
  }

  // Paid always outranks free, because total_cents leads. Within the free
  // tier (total_cents = 0) the fallback to created_at gives a stable,
  // first-come order rather than an arbitrary one.
  return query<BoardRow>(
    `SELECT ${BOARD_SELECT}, l.total_cents
     FROM listings l
     JOIN categories c ON c.id = l.category_id
     ${GEO_JOIN}
     ${CLICKS_JOIN}
     WHERE ${filters}
     ORDER BY l.total_cents DESC, COALESCE(l.first_bid_at, l.created_at) ASC
     LIMIT $6`,
    params,
  );
}

export async function getStats() {
  const rows = await query<{ listings: string; total_cents: string; top_cents: string }>(
    `SELECT COUNT(*)::text AS listings,
            COALESCE(SUM(total_cents), 0)::text AS total_cents,
            COALESCE(MAX(total_cents), 0)::text AS top_cents
     FROM listings WHERE status = 'active'`,
  );
  const r = rows[0];
  return {
    listings: Number(r.listings),
    totalCents: Number(r.total_cents),
    topCents: Number(r.top_cents),
  };
}

export async function createSubmission(input: {
  platform: Platform;
  handle: string;
  displayName: string;
  profileUrl: string;
  tagline: string | null;
  categoryId: number;
  chargeCents: number;
  payerEmail: string | null;
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO submissions
       (platform, handle, display_name, profile_url, tagline, category_id, amount_cents, payer_email)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      input.platform, input.handle, input.displayName, input.profileUrl,
      input.tagline, input.categoryId, input.chargeCents, input.payerEmail,
    ],
  );
  return rows[0].id;
}

export async function attachSessionId(submissionId: string, sessionId: string) {
  await query("UPDATE submissions SET stripe_session_id = $2 WHERE id = $1", [
    submissionId,
    sessionId,
  ]);
}

/**
 * Apply a settled payment. This is the only place a listing total ever moves.
 *
 * Three properties matter here:
 *
 * 1. IDEMPOTENT. Stripe retries webhooks. `processed_events` is the primary
 *    guard and the unique index on bids.stripe_payment_intent_id is the
 *    backstop, so a replayed event is a no-op rather than a double charge.
 *
 * 2. ADDITIVE, NEVER ABSOLUTE. We add the delta that was charged; we never
 *    set the total to a number computed at checkout time. If the same listing
 *    was raised again while this payment was in flight, both payments count.
 *
 * 3. NO REJECTION PATH. We deliberately do NOT re-check "is this still enough
 *    to be #1". If someone outbid them mid-flight, the bidder simply lands at
 *    whatever rank the money buys. That is why this system never needs to
 *    refund a losing race - there is no race to lose.
 */
export async function applyPaidBid(params: {
  eventId: string;
  submissionId: string;
  paymentIntentId: string | null;
  payerEmail: string | null;
}): Promise<{ applied: boolean; listingId?: string; totalCents?: number }> {
  return withTransaction(async (c) => {
    const seen = await c.query(
      "INSERT INTO processed_events (stripe_event_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [params.eventId],
    );
    if (seen.rowCount === 0) return { applied: false };

    const sub = await c.query(
      "SELECT * FROM submissions WHERE id = $1 FOR UPDATE",
      [params.submissionId],
    );
    if (sub.rowCount === 0) return { applied: false };
    const s = sub.rows[0];
    if (s.status === "completed") return { applied: false };

    const charge = Number(s.amount_cents);

    const listing = await c.query(
      `INSERT INTO listings
         (platform, handle, display_name, profile_url, tagline, category_id,
          total_cents, first_bid_at, last_bid_at, owner_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now(), $8)
       ON CONFLICT (platform, handle) DO UPDATE
         SET total_cents = listings.total_cents + EXCLUDED.total_cents,
             last_bid_at = now()
       RETURNING id, total_cents`,
      [
        s.platform, s.handle, s.display_name, s.profile_url, s.tagline,
        s.category_id, charge, params.payerEmail ?? s.payer_email,
      ],
    );

    const listingId = listing.rows[0].id as string;
    const totalCents = Number(listing.rows[0].total_cents);

    await c.query(
      `INSERT INTO bids
         (listing_id, amount_cents, total_after_cents, payer_email, stripe_payment_intent_id)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (stripe_payment_intent_id) DO NOTHING`,
      [listingId, charge, totalCents, params.payerEmail ?? s.payer_email, params.paymentIntentId],
    );

    await c.query("UPDATE submissions SET status = 'completed' WHERE id = $1", [params.submissionId]);

    return { applied: true, listingId, totalCents };
  });
}

export async function recordClickAndGetTarget(listingId: string): Promise<string | null> {
  const rows = await query<{ profile_url: string }>(
    "SELECT profile_url FROM listings WHERE id = $1 AND status = 'active'",
    [listingId],
  );
  if (!rows.length) return null;

  await query(
    `INSERT INTO clicks (listing_id, day, count) VALUES ($1, (now() AT TIME ZONE 'utc')::date, 1)
     ON CONFLICT (listing_id, day) DO UPDATE SET count = clicks.count + 1`,
    [listingId],
  );
  return rows[0].profile_url;
}

export type FreeListingResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: string };

/**
 * Add a listing with no payment and no account.
 *
 * This is the directory's supply side, so it must stay frictionless. It
 * cannot set total_cents: money only ever moves through applyPaidBid(), and
 * a free listing that could seed a balance would be a way to rank for free.
 */
export async function createFreeListing(input: {
  platform: Platform;
  handle: string;
  displayName: string;
  profileUrl: string;
  tagline: string | null;
  categoryId: number;
  cityId: number | null;
  entityType: "brand" | "person";
}): Promise<FreeListingResult> {
  const existing = await query<{ id: string; status: string }>(
    "SELECT id, status FROM listings WHERE platform = $1 AND handle = $2",
    [input.platform, input.handle],
  );

  if (existing.length) {
    if (existing[0].status !== "active") {
      return { ok: false, error: "That account was removed and cannot be re-listed here." };
    }
    return { ok: true, id: existing[0].id, created: false };
  }

  const rows = await query<{ id: string }>(
    `INSERT INTO listings
       (platform, handle, display_name, profile_url, tagline, category_id,
        city_id, entity_type, total_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, 0)
     ON CONFLICT (platform, handle) DO NOTHING
     RETURNING id`,
    [
      input.platform, input.handle, input.displayName, input.profileUrl,
      input.tagline, input.categoryId, input.cityId, input.entityType,
    ],
  );

  if (!rows.length) {
    const again = await query<{ id: string }>(
      "SELECT id FROM listings WHERE platform = $1 AND handle = $2",
      [input.platform, input.handle],
    );
    return { ok: true, id: again[0].id, created: false };
  }
  return { ok: true, id: rows[0].id, created: true };
}
