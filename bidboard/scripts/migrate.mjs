import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL ?? "postgres://bidboard:bidboard@localhost:5432/bidboard";
const reset = process.argv.includes("--reset");

const client = new pg.Client({ connectionString: url });
await client.connect();

if (reset) {
  await client.query(`
    DROP TABLE IF EXISTS clicks, bids, processed_events, submissions, listings, categories CASCADE;
    DROP TYPE IF EXISTS platform, listing_status, submission_status CASCADE;
  `);
  console.log("dropped existing objects");
}

await client.query(readFileSync(join(here, "..", "db", "schema.sql"), "utf8"));
console.log("schema applied");
await client.end();
