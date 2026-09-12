import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL ?? "postgres://bidboard:bidboard@localhost:5432/bidboard";

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(readFileSync(join(here, "..", "db", "seed.sql"), "utf8"));
await client.query(readFileSync(join(here, "..", "db", "seed_geo.sql"), "utf8"));

// A few listings so the board isn't empty on first run. Each goes through the
// same two-step path a real payment takes: submission row, then applied bid.
// platform, handle, name, category, tagline, cents, [countryCode, citySlug]
// A cents value of 0 seeds a FREE listing: no bid, ranks below every paid one.
const demo = [
  ["x", "grainstudio", "Grain Studio", "video-ugc", "UGC ads for DTC brands", 480000, ["US","new-york"]],
  ["linkedin", "northlane-b2b", "Northlane", "paid-ads", "B2B paid acquisition", 320000, ["GB","london"]],
  ["x", "flintseo", "Flint SEO", "seo-content", "Programmatic SEO for SaaS", 275000, ["IN","bengaluru"]],
  ["instagram", "casa.social", "Casa Social", "social-agencies", "Hospitality social", 90000, ["AE","dubai"]],
  ["youtube", "deepcuts", "Deep Cuts", "courses", "Editing cohorts", 42000, ["US","los-angeles"]],
  ["x", "paperroute", "Paper Route", "newsletters", "B2B newsletter ops", 15000, ["IN","mumbai"]],
  ["tiktok", "sixthgear", "Sixth Gear", "video-ugc", "Short-form for auto", 2500, ["IN","mumbai"]],
  ["instagram", "bloomandbrick", "Bloom & Brick", "social-agencies", null, 500, ["IN","mumbai"]],
  // free tier, added by the public with no account
  ["instagram", "tilework.co", "Tilework", "social-agencies", "Interiors content", 0, ["IN","mumbai"]],
  ["instagram", "saltandsienna", "Salt & Sienna", "video-ugc", "Food UGC", 0, ["IN","mumbai"]],
  ["x", "meridiangrowth", "Meridian Growth", "seo-content", null, 0, ["IN","bengaluru"]],
  ["linkedin", "harborhq", "Harbor HQ", "paid-ads", "B2B demand gen", 0, ["GB","london"]],
];

const urlFor = {
  x: (h) => `https://x.com/${h}`,
  instagram: (h) => `https://instagram.com/${h}`,
  tiktok: (h) => `https://tiktok.com/@${h}`,
  youtube: (h) => `https://youtube.com/@${h}`,
  linkedin: (h) => `https://linkedin.com/company/${h}`,
};

for (const [platform, handle, name, cat, tagline, cents, geo] of demo) {
  const { rows } = await client.query("SELECT id FROM categories WHERE slug = $1", [cat]);
  if (!rows.length) continue;

  let cityId = null;
  if (geo) {
    const c = await client.query(
      "SELECT id FROM cities WHERE country_code = $1 AND slug = $2", geo);
    cityId = c.rows[0]?.id ?? null;
  }

  // Free listing: straight insert, no submission, no bid, no owner.
  if (cents === 0) {
    await client.query(
      `INSERT INTO listings (platform, handle, display_name, profile_url, tagline,
                             category_id, city_id, total_cents)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0) ON CONFLICT (platform, handle) DO NOTHING`,
      [platform, handle, name, urlFor[platform](handle), tagline, rows[0].id, cityId],
    );
    continue;
  }

  const sub = await client.query(
    `INSERT INTO submissions (platform, handle, display_name, profile_url, tagline, category_id, amount_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [platform, handle, name, urlFor[platform](handle), tagline, rows[0].id, cents],
  );

  const listing = await client.query(
    `INSERT INTO listings (platform, handle, display_name, profile_url, tagline, category_id,
                           city_id, total_cents, first_bid_at, last_bid_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now(), now())
     ON CONFLICT (platform, handle) DO UPDATE
       SET total_cents = listings.total_cents + EXCLUDED.total_cents, last_bid_at = now()
     RETURNING id, total_cents`,
    [platform, handle, name, urlFor[platform](handle), tagline, rows[0].id, cityId, cents],
  );

  await client.query(
    `INSERT INTO bids (listing_id, amount_cents, total_after_cents, stripe_payment_intent_id)
     VALUES ($1,$2,$3,$4)`,
    [listing.rows[0].id, cents, listing.rows[0].total_cents, `seed_${platform}_${handle}`],
  );

  await client.query("UPDATE submissions SET status = 'completed' WHERE id = $1", [sub.rows[0].id]);

  await client.query(
    `INSERT INTO clicks (listing_id, day, count)
     VALUES ($1, (now() AT TIME ZONE 'utc')::date, $2)
     ON CONFLICT (listing_id, day) DO UPDATE SET count = EXCLUDED.count`,
    [listing.rows[0].id, Math.round(cents / 350)],
  );
}

// Give every demo listing a verified owner, so the seeded board reflects the
// rule the app now enforces: nothing is listed without proven ownership.
const demoUser = await client.query(
  "INSERT INTO users (email) VALUES ('demo@bidboard.local') RETURNING id",
);
const ownerId = demoUser.rows[0].id;

for (const [platform, handle, , , , cents] of demo) {
  if (cents === 0) continue;   // free listings have no proven owner
  await client.query(
    `INSERT INTO account_claims (user_id, platform, handle, method)
     VALUES ($1,$2,$3,'seed') ON CONFLICT (platform, handle) DO NOTHING`,
    [ownerId, platform, handle],
  );
  await client.query(
    "UPDATE listings SET owner_user_id = $1, verified = true WHERE platform = $2 AND handle = $3",
    [ownerId, platform, handle],
  );
}

const paid = demo.filter(([, , , , , c]) => c > 0).length;
console.log(`seeded ${demo.length} listings: ${paid} paid + owner-verified, ${demo.length - paid} free`);
await client.end();
