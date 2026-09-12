import { createHash, randomBytes } from "node:crypto";

export function makeVerifier(): string {
  return randomBytes(48).toString("base64url"); // 64 chars, inside the 43-128 range
}

export function challengeFor(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function makeState(): string {
  return randomBytes(24).toString("base64url");
}

/** Constant-time compare so a mismatched state can't be probed byte by byte. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
