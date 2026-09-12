import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL ?? "postgres://bidboard:bidboard@localhost:5432/bidboard";

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(readFileSync(join(here, "..", "db", "seed.sql"), "utf8"));

// A few listings so the board isn't empty on first run. Each goes through the
// same two-step path a real payment takes: submission row, then applied bid.
const demo = [
  ["x", "grainstudio", "Grain Studio", "video-ugc", "UGC ads for DTC brands", 480000],
  ["linkedin", "northlane-b2b", "Northlane", "paid-ads", "B2B paid acquisition", 320000],
  ["x", "flintseo", "Flint SEO", "seo-content", "Programmatic SEO for SaaS", 275000],
  ["instagram", "casa.social", "Casa Social", "social-agencies", "Hospitality social", 90000],
  ["youtube", "deepcuts", "Deep Cuts", "courses", "Editing cohorts", 42000],
  ["x", "paperroute", "Paper Route", "newsletters", "B2B newsletter ops", 15000],
  ["tiktok", "sixthgear", "Sixth Gear", "video-ugc", "Short-form for auto", 2500],
  ["instagram", "bloomandbrick", "Bloom & Brick", "social-agencies", null, 500],
];

const urlFor = {
  x: (h) => `https://x.com/${h}`,
  instagram: (h) => `https://instagram.com/${h}`,
  tiktok: (h) => `https://tiktok.com/@${h}`,
  youtube: (h) => `https://youtube.com/@${h}`,
  linkedin: (h) => `https://linkedin.com/company/${h}`,
};

for (const [platform, handle, name, cat, tagline, cents] of demo) {
  const { rows } = await client.query("SELECT id FROM categories WHERE slug = $1", [cat]);
  if (!rows.length) continue;

  const sub = await client.query(
    `INSERT INTO submissions (platform, handle, display_name, profile_url, tagline, category_id, amount_cents)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [platform, handle, name, urlFor[platform](handle), tagline, rows[0].id, cents],
  );

  const listing = await client.query(
    `INSERT INTO listings (platform, handle, display_name, profile_url, tagline, category_id,
                           total_cents, first_bid_at, last_bid_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
     ON CONFLICT (platform, handle) DO UPDATE
       SET total_cents = listings.total_cents + EXCLUDED.total_cents, last_bid_at = now()
     RETURNING id, total_cents`,
    [platform, handle, name, urlFor[platform](handle), tagline, rows[0].id, cents],
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

console.log(`seeded ${demo.length} listings`);
await client.end();
