import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const dbDir = join(here, "..", "db");
const url = process.env.DATABASE_URL ?? "postgres://bidboard:bidboard@localhost:5432/bidboard";
const reset = process.argv.includes("--reset");

const client = new pg.Client({ connectionString: url });
await client.connect();

if (reset) {
  await client.query(`
    DROP TABLE IF EXISTS removal_requests, verification_challenges, account_claims,
      sessions, users, clicks, bids, processed_events, submissions, listings, categories CASCADE;
    DROP TYPE IF EXISTS platform, listing_status, submission_status,
      claim_method, challenge_status CASCADE;
  `);
  console.log("dropped existing objects");
}

const files = ["schema.sql", ...readdirSync(dbDir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()];
for (const f of files) {
  await client.query(readFileSync(join(dbDir, f), "utf8"));
  console.log(`applied ${f}`);
}

await client.end();
