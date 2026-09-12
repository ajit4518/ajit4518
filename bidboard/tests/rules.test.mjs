import test from "node:test";
import assert from "node:assert/strict";
import {
  planBid, rankRows, normalizeHandle, usdToCents, isBlockedUrl, centsToUsd,
  MIN_NEW_BID_CENTS, TOP_MARGIN_CENTS,
} from "../src/lib/rules.ts";

const plan = (bid, current = 0, top = 0) =>
  planBid({ bidCents: bid * 100, currentTotalCents: current * 100, topTotalCents: top * 100 });

test("a new listing must clear the $5 floor", () => {
  assert.equal(plan(4).ok, false);
  assert.equal(plan(5).ok, true);
  assert.equal(MIN_NEW_BID_CENTS, 500);
});

test("a new listing is charged its full bid", () => {
  const p = plan(500, 0, 100);
  assert.equal(p.ok, true);
  assert.equal(p.chargeCents, 50000);
  assert.equal(p.isRaise, false);
});

test("a raise charges only the difference", () => {
  // the outbid.lol mechanic: 12,000 -> 13,005 costs 1,005, not 13,005
  const p = plan(13005, 12000, 12000);
  assert.equal(p.ok, true);
  assert.equal(p.chargeCents, 100500);
  assert.equal(p.projectedTotalCents, 1300500);
  assert.equal(p.isRaise, true);
});

test("a raise must move at least $1", () => {
  assert.equal(plan(1000, 1000, 5000).ok, false);
  assert.equal(plan(1001, 1000, 5000).ok, true);
});

test("taking #1 requires clearing the leader by $5", () => {
  assert.equal(plan(1001, 0, 1000).ok, false, "$1 over the leader is refused");
  assert.equal(plan(1004, 0, 1000).ok, false, "$4 over the leader is refused");
  assert.equal(plan(1005, 0, 1000).ok, true, "$5 over the leader is accepted");
  assert.equal(TOP_MARGIN_CENTS, 500);
});

test("matching the leader exactly is allowed and slots in below", () => {
  // ties are legal; the tie-break puts the newcomer second
  assert.equal(plan(1000, 0, 1000).ok, true);
});

test("bids are capped", () => {
  assert.equal(plan(999_999).ok, true);
  assert.equal(plan(1_000_000).ok, false);
});

test("rank is total desc, then oldest first on a tie", () => {
  const ranked = rankRows([
    { id: "new-tie", totalCents: 1000, firstBidAt: "2026-02-01T00:00:00Z" },
    { id: "top", totalCents: 5000, firstBidAt: "2026-03-01T00:00:00Z" },
    { id: "old-tie", totalCents: 1000, firstBidAt: "2026-01-01T00:00:00Z" },
  ]);
  assert.deepEqual(ranked.map((r) => r.id), ["top", "old-tie", "new-tie"]);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});

test("rankRows does not mutate its input", () => {
  const input = [
    { totalCents: 100, firstBidAt: null },
    { totalCents: 900, firstBidAt: null },
  ];
  rankRows(input);
  assert.equal(input[0].totalCents, 100);
});

test("handles normalise from @, bare text, and pasted URLs", () => {
  assert.equal(normalizeHandle("@GrainStudio"), "grainstudio");
  assert.equal(normalizeHandle("  grainstudio "), "grainstudio");
  assert.equal(normalizeHandle("https://x.com/GrainStudio"), "grainstudio");
  assert.equal(normalizeHandle("tiktok.com/@sixthgear"), "sixthgear");
  assert.equal(normalizeHandle("https://linkedin.com/company/northlane-b2b"), "northlane-b2b");
  assert.equal(normalizeHandle("https://youtube.com/@deepcuts"), "deepcuts");
});

test("handles reject injection-shaped input", () => {
  assert.equal(normalizeHandle(""), null);
  assert.equal(normalizeHandle("a b"), null);
  assert.equal(normalizeHandle("<script>"), null);
  assert.equal(normalizeHandle("x".repeat(65)), null);
});

test("dollar parsing accepts formatted input and rejects junk", () => {
  assert.equal(usdToCents("1200"), 120000);
  assert.equal(usdToCents("$1,200"), 120000);
  assert.equal(usdToCents("12.50"), null, "cents are not accepted");
  assert.equal(usdToCents("-5"), null);
  assert.equal(usdToCents("abc"), null);
});

test("shorteners and invite links are blocked", () => {
  assert.equal(isBlockedUrl("https://bit.ly/xyz"), true);
  assert.equal(isBlockedUrl("https://discord.gg/xyz"), true);
  assert.equal(isBlockedUrl("https://www.t.co/xyz"), true);
  assert.equal(isBlockedUrl("https://x.com/grainstudio"), false);
  assert.equal(isBlockedUrl("not a url"), true);
});

test("money formats without cents", () => {
  assert.equal(centsToUsd(1300500), "$13,005");
  assert.equal(centsToUsd(500), "$5");
});
