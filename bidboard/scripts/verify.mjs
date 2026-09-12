/**
 * End-to-end checks against a running server (npm run dev).
 *
 * These exercise the properties that are easy to claim and hard to get right:
 * concurrent bids must not lose money, a replayed webhook must not
 * double-count, and — the point of ownership verification — money must not
 * buy a listing for an account you do not control.
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DB = process.env.DATABASE_URL ?? "postgres://bidboard:bidboard@localhost:5432/bidboard";
const MOCK_BIO = process.env.MOCK_BIO_FILE;

const client = new pg.Client({ connectionString: DB });
await client.connect();

let failures = 0;
const section = (s) => console.log(`\n${s}`);
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

/** Minimal cookie jar so each actor keeps its own session. */
function actor() {
  const jar = new Map();
  const call = async (method, path, body) => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, body: parsed, text, headers: res.headers };
  };
  return {
    get: (p) => call("GET", p),
    post: (p, b) => call("POST", p, b),
  };
}

const catId = (await client.query("SELECT id FROM categories ORDER BY sort_order LIMIT 1")).rows[0].id;
const total = async (platform, handle) => {
  const r = await client.query(
    "SELECT total_cents FROM listings WHERE platform=$1 AND handle=$2", [platform, handle]);
  return r.rows.length ? Number(r.rows[0].total_cents) : 0;
};
const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// ---------------------------------------------------------------- ownership
section("ownership gate");

const anon = actor();
const anonBid = await anon.post("/api/checkout", {
  platform: "x", handle: `stranger${uniq()}`, displayName: "Stranger",
  categoryId: catId, bid: "50",
});
check("an unverified visitor cannot bid", anonBid.status === 401, anonBid.body?.error);

const alice = actor();
const aliceHandle = `alice${uniq()}`;
const aliceAuth = await alice.get(`/api/auth/mock/start?platform=x&handle=${aliceHandle}`);
check("mock OAuth establishes a verified claim", aliceAuth.status === 200, aliceAuth.body?.error);

const aliceOwn = await alice.post("/api/checkout", {
  platform: "x", handle: aliceHandle, displayName: "Alice Studio",
  categoryId: catId, bid: "50",
});
check("a verified owner can bid on their own handle", aliceOwn.status === 200, aliceOwn.body?.error);
check("the bid landed", (await total("x", aliceHandle)) === 5000);

const victimHandle = `victim${uniq()}`;
const aliceOther = await alice.post("/api/checkout", {
  platform: "x", handle: victimHandle, displayName: "Not Mine",
  categoryId: catId, bid: "50",
});
check("a verified user cannot bid on someone else's handle",
  aliceOther.status === 403, aliceOther.body?.error);
check("no listing was created for the unowned handle",
  (await total("x", victimHandle)) === 0);

const mallory = actor();
const malloryGrab = await mallory.get(`/api/auth/mock/start?platform=x&handle=${aliceHandle}`);
check("a second user cannot claim an already-verified handle",
  malloryGrab.status === 409, malloryGrab.body?.error);

// ------------------------------------------------------------ bio challenge
section("bio-code verification");

if (!MOCK_BIO) {
  console.log("  SKIP  MOCK_BIO_FILE not set");
} else {
  const bob = actor();
  const bobHandle = `bob${uniq()}`;

  const ch = await bob.post("/api/verify/challenge", { platform: "instagram", handle: bobHandle });
  check("a challenge issues a code", ch.status === 200 && !!ch.body?.code, ch.body?.code);

  writeFileSync(MOCK_BIO, "just a normal bio, no code here");
  const tooEarly = await bob.post("/api/verify/check", { challengeId: ch.body.challengeId });
  check("checking before the code is published fails",
    tooEarly.status === 200 && tooEarly.body?.verified === false, tooEarly.body?.error);

  writeFileSync(MOCK_BIO, `Hospitality social.\n\n  ${ch.body.code.toUpperCase()}  \n`);
  const ok = await bob.post("/api/verify/check", { challengeId: ch.body.challengeId });
  check("publishing the code verifies the handle",
    ok.status === 200 && ok.body?.verified === true, ok.body?.error);

  const bobBid = await bob.post("/api/checkout", {
    platform: "instagram", handle: bobHandle, displayName: "Bob Social",
    categoryId: catId, bid: "60",
  });
  check("a code-verified owner can now bid", bobBid.status === 200, bobBid.body?.error);
  check("that bid landed", (await total("instagram", bobHandle)) === 6000);
}

// --------------------------------------------------------------- validation
section("bid validation");

const carol = actor();
const carolHandle = `carol${uniq()}`;
await carol.get(`/api/auth/mock/start?platform=x&handle=${carolHandle}`);

const low = await carol.post("/api/checkout", {
  platform: "x", handle: carolHandle, displayName: "Carol", categoryId: catId, bid: "4",
});
check("a $4 bid is refused", low.status === 400, low.body?.error);

const topRow = await client.query("SELECT MAX(total_cents) m FROM listings WHERE status='active'");
const topDollars = Math.round(Number(topRow.rows[0].m ?? 0) / 100);
const edge = await carol.post("/api/checkout", {
  platform: "x", handle: carolHandle, displayName: "Carol",
  categoryId: catId, bid: String(topDollars + 1),
});
check("$1 over the leader is refused", edge.status === 400, edge.body?.error);

// -------------------------------------------------------------- concurrency
section("concurrency: two simultaneous bids on one handle");

const dave = actor();
const daveHandle = `dave${uniq()}`;
await dave.get(`/api/auth/mock/start?platform=x&handle=${daveHandle}`);

const before = await total("x", daveHandle);
const [r1, r2] = await Promise.all([
  dave.post("/api/checkout", { platform: "x", handle: daveHandle, displayName: "Dave", categoryId: catId, bid: "50" }),
  dave.post("/api/checkout", { platform: "x", handle: daveHandle, displayName: "Dave", categoryId: catId, bid: "50" }),
]);
const after = await total("x", daveHandle);
check("both requests were accepted", r1.status === 200 && r2.status === 200);
check("both payments counted, none lost", after - before === 10000, `${before} -> ${after} cents`);

// -------------------------------------------------------------- idempotency
section("idempotency: one webhook event delivered twice");

const rh = `replay${uniq()}`;
const sub = await client.query(
  `INSERT INTO submissions (platform, handle, display_name, profile_url, category_id, amount_cents)
   VALUES ('x', $1, 'Replay Test', 'https://x.com/' || $1, $2, 7700) RETURNING id`,
  [rh, catId],
);
const evt = `evt_replay_${uniq()}`;
const sim = actor();
const first = await sim.post("/api/dev/simulate", { submissionId: sub.rows[0].id, eventId: evt });
const t1 = await total("x", rh);
const second = await sim.post("/api/dev/simulate", { submissionId: sub.rows[0].id, eventId: evt });
const t2 = await total("x", rh);

check("first delivery applied", first.body?.applied === true);
check("replayed delivery was a no-op", second.body?.applied === false);
check("total did not move on replay", t1 === t2 && t1 === 7700, `${t1} -> ${t2} cents`);

// ------------------------------------------------------------------ takedown
section("takedown");

const lid = (await client.query("SELECT id FROM listings WHERE handle=$1", [rh])).rows[0].id;
const rep = await actor().post("/api/listings/report", {
  listingId: lid, reason: "This is my account and I did not list it.", contact: "me@example.com",
});
const hidden = await client.query("SELECT status FROM listings WHERE id=$1", [lid]);
check("a report is accepted", rep.status === 200, rep.body?.error);
check("an unverified listing is hidden immediately", hidden.rows[0].status === "hidden");
check("it leaves the board",
  !(await (await fetch(`${BASE}/`)).text()).includes(rh));

// --------------------------------------------------------------------- clicks
section("click tracking");

const seedListing = (await client.query(
  "SELECT id, handle FROM listings WHERE verified = true AND status='active' ORDER BY total_cents DESC LIMIT 1")).rows[0];
const c0 = await client.query("SELECT COALESCE(SUM(count),0) n FROM clicks WHERE listing_id=$1", [seedListing.id]);
const redirect = await fetch(`${BASE}/go/${seedListing.id}`, { redirect: "manual" });
const c1 = await client.query("SELECT COALESCE(SUM(count),0) n FROM clicks WHERE listing_id=$1", [seedListing.id]);
check("redirect is a 302", redirect.status === 302, `got ${redirect.status}`);
check("outbound URL is clean", (redirect.headers.get("location") ?? "").endsWith(`/${seedListing.handle}`));
check("click was counted", Number(c1.rows[0].n) === Number(c0.rows[0].n) + 1);

// ----------------------------------------------------------- free listings
section("free listing (no account)");

const anonAdd = actor();
const freeHandle = `free${uniq()}`;
const mumbai = (await client.query(
  "SELECT id FROM cities WHERE country_code='IN' AND slug='mumbai'")).rows[0].id;

const added = await anonAdd.post("/api/listings/add", {
  platform: "instagram", handle: freeHandle, displayName: "Free Co",
  categoryId: catId, cityId: mumbai, entityType: "brand",
});
check("anyone can add a listing with no account", added.status === 200, added.body?.error);
check("it is created at zero", (await total("instagram", freeHandle)) === 0);

const dupe = await anonAdd.post("/api/listings/add", {
  platform: "instagram", handle: freeHandle, displayName: "Free Co Again",
  categoryId: catId, cityId: mumbai, entityType: "brand",
});
const dupeCount = await client.query(
  "SELECT COUNT(*)::int n FROM listings WHERE platform='instagram' AND handle=$1", [freeHandle]);
check("re-adding does not duplicate", dupe.status === 200 && dupeCount.rows[0].n === 1);

// A free submission must not be able to seed a balance and rank for free.
const bribe = await anonAdd.post("/api/listings/add", {
  platform: "instagram", handle: `bribe${uniq()}`, displayName: "Bribe Co",
  categoryId: catId, cityId: mumbai, entityType: "brand",
  total_cents: 999999, totalCents: 999999, bid: "9999",
});
const bribed = await client.query(
  "SELECT total_cents FROM listings WHERE display_name='Bribe Co' ORDER BY created_at DESC LIMIT 1");
check("a free submission cannot set its own bid amount",
  bribe.status === 200 && Number(bribed.rows[0].total_cents) === 0,
  `total_cents=${bribed.rows[0]?.total_cents}`);

const unverifiedBid = await anonAdd.post("/api/checkout", {
  platform: "instagram", handle: freeHandle, displayName: "Free Co",
  categoryId: catId, bid: "500",
});
check("adding for free does not grant the right to bid", unverifiedBid.status === 401);

// -------------------------------------------------------------- geo surface
section("geography");

const cityPage = await fetch(`${BASE}/in/india/mumbai`);
const cityHtml = await cityPage.text();
check("a populated city page renders", cityPage.status === 200);
check("it shows that city's listings", cityHtml.includes("Paper Route"));
check("it excludes other cities", !cityHtml.includes("Northlane"));

const paidFirst = cityHtml.indexOf("Paper Route");
const freeLater = cityHtml.indexOf("Tilework");
check("paid listings rank above free ones",
  paidFirst > -1 && freeLater > -1 && paidFirst < freeLater);

const unknownCity = await fetch(`${BASE}/in/india/atlantis`);
check("an unknown city 404s", unknownCity.status === 404, `got ${unknownCity.status}`);

const filtered = await (await fetch(`${BASE}/?country=india&city=mumbai`)).text();
check("board country+city filter works",
  filtered.includes("Paper Route") && !filtered.includes("Northlane"));

const dir = await (await fetch(`${BASE}/directory`)).text();
check("directory lists populated cities", dir.includes("Mumbai") && dir.includes("London"));
check("directory hides empty cities", !dir.includes("Ahmedabad"));

const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
check("sitemap includes a populated city", sitemap.includes("/in/india/mumbai"));
check("sitemap omits empty cities", !sitemap.includes("/in/india/ahmedabad"));

const robots = await (await fetch(`${BASE}/robots.txt`)).text();
check("robots keeps person listings out of the index", robots.includes("type=person"));

// ------------------------------------------------------------- rate limiting
section("rate limiting the open submit path");

const flood = actor();
let blocked = false;
for (let i = 0; i < 24; i++) {
  const r = await flood.post("/api/listings/add", {
    platform: "x", handle: `flood${uniq()}${i}`, displayName: `Flood ${i}`,
    categoryId: catId, entityType: "brand",
  });
  if (r.status === 429) { blocked = true; break; }
}
check("a flood of submissions is cut off", blocked);

console.log(failures === 0 ? "\nall checks passed\n" : `\n${failures} check(s) failed\n`);
await client.end();
process.exit(failures === 0 ? 0 : 1);
