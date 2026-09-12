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
  l.first_bid_at, c.name AS category_name, c.slug AS category_slug,
  COALESCE(cl.clicks, 0) AS clicks
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
  window?: "all" | "today";
  limit?: number;
}): Promise<BoardRow[]> {
  const { platform = null, categorySlug = null, window = "all", limit = 100 } = opts;

  if (window === "today") {
    return query<BoardRow>(
      `SELECT ${BOARD_SELECT}, t.today_cents AS total_cents
       FROM listings l
       JOIN categories c ON c.id = l.category_id
       JOIN (
         SELECT listing_id, SUM(amount_cents) AS today_cents, MIN(created_at) AS first_today
         FROM bids WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'utc')
         GROUP BY listing_id
       ) t ON t.listing_id = l.id
       ${CLICKS_JOIN}
       WHERE l.status = 'active'
         AND ($1::platform IS NULL OR l.platform = $1)
         AND ($2::text IS NULL OR c.slug = $2)
       ORDER BY t.today_cents DESC, t.first_today ASC
       LIMIT $3`,
      [platform, categorySlug, limit],
    );
  }

  return query<BoardRow>(
    `SELECT ${BOARD_SELECT}, l.total_cents
     FROM listings l
     JOIN categories c ON c.id = l.category_id
     ${CLICKS_JOIN}
     WHERE l.status = 'active'
       AND ($1::platform IS NULL OR l.platform = $1)
       AND ($2::text IS NULL OR c.slug = $2)
     ORDER BY l.total_cents DESC, l.first_bid_at ASC
     LIMIT $3`,
    [platform, categorySlug, limit],
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
