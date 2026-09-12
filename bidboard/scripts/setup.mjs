import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

/**
 * First-run setup for a real deployment: schema, categories and cities only.
 *
 * Deliberately does NOT insert the demo listings that `npm run db:seed` adds.
 * Launching with fake agencies on the board would be the fastest way to lose
 * the trust of the first real visitor.
 */
const here = dirname(fileURLToPath(import.meta.url));
const dbDir = join(here, "..", "db");
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
});
await client.connect();

const migrations = ["schema.sql", ...readdirSync(dbDir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()];
for (const f of migrations) {
  await client.query(readFileSync(join(dbDir, f), "utf8"));
  console.log(`applied ${f}`);
}

for (const f of ["seed.sql", "seed_geo.sql"]) {
  await client.query(readFileSync(join(dbDir, f), "utf8"));
  console.log(`applied ${f}`);
}

const counts = await client.query(
  `SELECT (SELECT COUNT(*) FROM categories)::int AS categories,
          (SELECT COUNT(*) FROM countries)::int  AS countries,
          (SELECT COUNT(*) FROM cities)::int     AS cities,
          (SELECT COUNT(*) FROM listings)::int   AS listings`,
);
const c = counts.rows[0];
console.log(
  `\nready: ${c.categories} categories, ${c.countries} countries, ${c.cities} cities, ${c.listings} listings`,
);
if (c.listings > 0) {
  console.log("note: this database already has listings. setup is idempotent and left them alone.");
}
await client.end();
