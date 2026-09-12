import { randomBytes } from "node:crypto";

// Pure verification helpers. No database import, so these are unit-testable
// in isolation (see tests/verification.test.mjs).

export const CHALLENGE_TTL_MINUTES = 30;
export const MAX_CHALLENGE_ATTEMPTS = 10;

/** Short enough to paste into a bio, unguessable enough to be proof. */
export function makeChallengeCode(): string {
  return `bidboard-verify-${randomBytes(5).toString("hex")}`;
}

export function isChallengeCode(s: string): boolean {
  return /^bidboard-verify-[0-9a-f]{10}$/.test(s);
}

/**
 * Does the fetched profile text contain the challenge code?
 *
 * Deliberately lenient about case, whitespace and zero-width characters,
 * because bios get mangled: platforms autocapitalise, collapse newlines, and
 * inject invisible characters. Strict equality would fail honest users.
 * It is not lenient about the code itself, which must appear in full.
 */
export function bioContainsCode(bioText: string, code: string): boolean {
  if (!bioText || !code) return false;
  const normalise = (s: string) =>
    s.toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ");
  return normalise(bioText).includes(normalise(code));
}
