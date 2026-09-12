/**
 * End-to-end checks against a running server (npm run dev).
 *
 * These exercise the two properties that are easy to claim and hard to get
 * right: concurrent bids must not lose money, and a replayed webhook must
 * not double-count.
 */
import pg from "pg";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DATABASE_URL ?? "postgres://bidboard:bidboard@localhost:5432/bidboard";

const client = new pg.Client({ connectionString: DB });
await client.connect();

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const catId = (await client.query("SELECT id FROM categories ORDER BY sort_order LIMIT 1")).rows[0].id;
const total = async (handle) => {
  const r = await client.query("SELECT total_cents FROM listings WHERE platform='x' AND handle=$1", [handle]);
  return r.rows.length ? Number(r.rows[0].total_cents) : 0;
};

console.log("\nvalidation");
const tooLow = await post("/api/checkout", {
  platform: "x", handle: "@floorcheck", displayName: "Floor Check", categoryId: catId, bid: "4",
});
check("a $4 bid is refused", tooLow.status === 400, tooLow.body.error);

const topRow = await client.query("SELECT MAX(total_cents) m FROM listings WHERE status='active'");
const topDollars = Math.round(Number(topRow.rows[0].m ?? 0) / 100);
const edge = await post("/api/checkout", {
  platform: "x", handle: "@edgecase", displayName: "Edge Case", categoryId: catId,
  bid: String(topDollars + 1),
});
check("$1 over the leader is refused", edge.status === 400, edge.body.error);

console.log("\nconcurrency: two simultaneous bids on the same new handle");
const H = `race${Date.now().toString().slice(-7)}`;
const before = await total(H);
const [a, b] = await Promise.all([
  post("/api/checkout", { platform: "x", handle: H, displayName: "Race A", categoryId: catId, bid: "50" }),
  post("/api/checkout", { platform: "x", handle: H, displayName: "Race A", categoryId: catId, bid: "50" }),
]);
const after = await total(H);
check("both requests were accepted", a.status === 200 && b.status === 200);
check("both payments counted, none lost", after - before === 10000, `total moved ${before} -> ${after} cents`);

console.log("\nidempotency: the same webhook event delivered twice");
const sub = await client.query(
  `INSERT INTO submissions (platform, handle, display_name, profile_url, category_id, amount_cents)
   VALUES ('x', $1, 'Replay Test', 'https://x.com/' || $1, $2, 7700) RETURNING id`,
  [`replay${Date.now().toString().slice(-7)}`, catId],
);
const subId = sub.rows[0].id;
const handleRow = await client.query("SELECT handle FROM submissions WHERE id=$1", [subId]);
const RH = handleRow.rows[0].handle;
const evt = `evt_replay_${Date.now()}`;

const first = await post("/api/dev/simulate", { submissionId: subId, eventId: evt });
const t1 = await total(RH);
const second = await post("/api/dev/simulate", { submissionId: subId, eventId: evt });
const t2 = await total(RH);

check("first delivery applied", first.body.applied === true);
check("replayed delivery was a no-op", second.body.applied === false);
check("total did not move on replay", t1 === t2 && t1 === 7700, `${t1} -> ${t2} cents`);

console.log("\nclick tracking");
const lid = (await client.query("SELECT id FROM listings WHERE handle=$1", [RH])).rows[0].id;
const c0 = await client.query("SELECT COALESCE(SUM(count),0) n FROM clicks WHERE listing_id=$1", [lid]);
const redirect = await fetch(`${BASE}/go/${lid}`, { redirect: "manual" });
const c1 = await client.query("SELECT COALESCE(SUM(count),0) n FROM clicks WHERE listing_id=$1", [lid]);
check("redirect is a 302", redirect.status === 302, `got ${redirect.status}`);
check("outbound URL is clean", (redirect.headers.get("location") ?? "").endsWith(`/${RH}`));
check("click was counted", Number(c1.rows[0].n) === Number(c0.rows[0].n) + 1);

console.log(failures === 0 ? "\nall checks passed\n" : `\n${failures} check(s) failed\n`);
await client.end();
process.exit(failures === 0 ? 0 : 1);
