import test from "node:test";
import assert from "node:assert/strict";
import {
  makeChallengeCode, isChallengeCode, bioContainsCode,
} from "../src/lib/verifyRules.ts";
import { makeVerifier, challengeFor, makeState, safeEqual } from "../src/lib/oauth/pkce.ts";

test("challenge codes are well formed and unique", () => {
  const a = makeChallengeCode();
  const b = makeChallengeCode();
  assert.ok(isChallengeCode(a), a);
  assert.notEqual(a, b);
  assert.equal(isChallengeCode("bidboard-verify-xyz"), false);
  assert.equal(isChallengeCode("nope"), false);
});

test("a bio containing the code verifies", () => {
  const code = "bidboard-verify-abc123def0";
  assert.equal(bioContainsCode(`UGC studio. ${code}`, code), true);
  assert.equal(bioContainsCode(code, code), true);
});

test("verification tolerates how platforms mangle bios", () => {
  const code = "bidboard-verify-abc123def0";
  assert.equal(bioContainsCode("BIDBOARD-VERIFY-ABC123DEF0", code), true, "autocapitalised");
  assert.equal(bioContainsCode(`line one\n\n  ${code}  \nline three`, code), true, "wrapped");
  assert.equal(bioContainsCode(`​bio​ ${code}`, code), true, "zero-width chars");
});

test("a bio without the code, or with a near-miss, does not verify", () => {
  const code = "bidboard-verify-abc123def0";
  assert.equal(bioContainsCode("just a normal bio", code), false);
  assert.equal(bioContainsCode("bidboard-verify-abc123def", code), false, "truncated");
  assert.equal(bioContainsCode("bidboard-verify-abc123deff", code), false, "last char differs");
  assert.equal(bioContainsCode("", code), false);
  assert.equal(bioContainsCode("anything", ""), false);
});

test("someone else's code does not verify your handle", () => {
  assert.equal(
    bioContainsCode("bidboard-verify-1111111111", "bidboard-verify-2222222222"),
    false,
  );
});

test("PKCE verifier and challenge meet RFC 7636 shape", () => {
  const v = makeVerifier();
  assert.ok(v.length >= 43 && v.length <= 128, `length ${v.length}`);
  assert.match(v, /^[A-Za-z0-9\-._~]+$/, "unreserved characters only");

  const c = challengeFor(v);
  assert.match(c, /^[A-Za-z0-9\-_]+$/, "base64url, no padding");
  assert.equal(challengeFor(v), c, "deterministic");
  assert.notEqual(challengeFor(makeVerifier()), c, "verifier-specific");
});

test("state tokens are unique and compared safely", () => {
  const a = makeState();
  assert.notEqual(a, makeState());
  assert.equal(safeEqual(a, a), true);
  assert.equal(safeEqual(a, a.slice(0, -1) + "x"), false);
  assert.equal(safeEqual(a, a.slice(0, -1)), false, "length mismatch");
  assert.equal(safeEqual("", ""), true);
});
