import { query } from "./db";
import type { Platform } from "./rules";
import { makeChallengeCode, CHALLENGE_TTL_MINUTES } from "./verifyRules";

export {
  makeChallengeCode, bioContainsCode, isChallengeCode,
  CHALLENGE_TTL_MINUTES, MAX_CHALLENGE_ATTEMPTS,
} from "./verifyRules";

export type Claim = {
  id: string;
  platform: Platform;
  handle: string;
  method: "oauth" | "code" | "seed";
  verified_at: string;
};

export async function getClaims(userId: string): Promise<Claim[]> {
  return query<Claim>(
    `SELECT id, platform, handle, method, verified_at
     FROM account_claims WHERE user_id = $1
     ORDER BY verified_at DESC`,
    [userId],
  );
}

export async function hasClaim(
  userId: string,
  platform: Platform,
  handle: string,
): Promise<boolean> {
  const rows = await query(
    "SELECT 1 FROM account_claims WHERE user_id = $1 AND platform = $2 AND handle = $3",
    [userId, platform, handle],
  );
  return rows.length > 0;
}

/** Who, if anyone, already owns this handle. */
export async function claimOwner(platform: Platform, handle: string): Promise<string | null> {
  const rows = await query<{ user_id: string }>(
    "SELECT user_id FROM account_claims WHERE platform = $1 AND handle = $2",
    [platform, handle],
  );
  return rows[0]?.user_id ?? null;
}

export type ClaimResult =
  | { ok: true; claimId: string }
  | { ok: false; error: "taken" };

/**
 * Record proven ownership. First proof wins: the UNIQUE (platform, handle)
 * constraint means a second person proving control of the same account is
 * rejected rather than silently reassigning the listing.
 */
export async function upsertClaim(input: {
  userId: string;
  platform: Platform;
  handle: string;
  method: "oauth" | "code" | "seed";
  providerAccountId?: string | null;
}): Promise<ClaimResult> {
  const existing = await claimOwner(input.platform, input.handle);
  if (existing && existing !== input.userId) return { ok: false, error: "taken" };

  const rows = await query<{ id: string }>(
    `INSERT INTO account_claims (user_id, platform, handle, method, provider_account_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (platform, handle) DO UPDATE
       SET method = EXCLUDED.method,
           provider_account_id = COALESCE(EXCLUDED.provider_account_id, account_claims.provider_account_id)
     RETURNING id`,
    [input.userId, input.platform, input.handle, input.method, input.providerAccountId ?? null],
  );

  // Adopt any pre-existing listing for this handle, including ones created
  // before verification was required.
  await query(
    `UPDATE listings SET owner_user_id = $1, verified = true
     WHERE platform = $2 AND handle = $3`,
    [input.userId, input.platform, input.handle],
  );

  return { ok: true, claimId: rows[0].id };
}

export async function createChallenge(input: {
  userId: string;
  platform: Platform;
  handle: string;
}): Promise<{ id: string; code: string; expiresAt: string }> {
  await query(
    `UPDATE verification_challenges SET status = 'expired'
     WHERE user_id = $1 AND platform = $2 AND handle = $3 AND status = 'pending'`,
    [input.userId, input.platform, input.handle],
  );

  const code = makeChallengeCode();
  const rows = await query<{ id: string; expires_at: string }>(
    `INSERT INTO verification_challenges (user_id, platform, handle, code, expires_at)
     VALUES ($1,$2,$3,$4, now() + ($5 || ' minutes')::interval)
     RETURNING id, expires_at`,
    [input.userId, input.platform, input.handle, code, String(CHALLENGE_TTL_MINUTES)],
  );
  return { id: rows[0].id, code, expiresAt: rows[0].expires_at };
}

export async function getPendingChallenge(id: string, userId: string) {
  const rows = await query<{
    id: string; platform: Platform; handle: string; code: string; attempts: number;
  }>(
    `SELECT id, platform, handle, code, attempts
     FROM verification_challenges
     WHERE id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > now()`,
    [id, userId],
  );
  return rows[0] ?? null;
}

export async function bumpAttempts(id: string): Promise<number> {
  const rows = await query<{ attempts: number }>(
    "UPDATE verification_challenges SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts",
    [id],
  );
  return rows[0]?.attempts ?? 0;
}

export async function markChallengeVerified(id: string) {
  await query("UPDATE verification_challenges SET status = 'verified' WHERE id = $1", [id]);
}
