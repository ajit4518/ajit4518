/**
 * The vertical this board is scoped to.
 *
 * Picking a narrow vertical is the whole strategy: the accounts listed here
 * are revenue-generating assets, so a bid has an ROI argument behind it.
 */
export const VERTICAL = {
  name: "AgencyBoard",
  tagline: "The agencies and operators paying to be seen.",
  blurb:
    "Rank is set by one number: what you have paid, in total. No algorithm, no editorial, no ads. Bid more, rank higher.",
};

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Public origin, used for Stripe redirects, OAuth callbacks, the sitemap and
 * robots.txt — all server-side.
 *
 * Deliberately NOT a NEXT_PUBLIC_ variable. Those are inlined into the bundle
 * at BUILD time, so a value supplied only at run time is silently ignored and
 * the deploy keeps whatever the build machine had — which is how you end up
 * sending live customers to a localhost Stripe redirect. Read at run time
 * instead; NEXT_PUBLIC_BASE_URL is honoured as a fallback for older setups.
 */
export const BASE_URL =
  process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

/**
 * Simulated payments: bids apply instantly with no money changing hands.
 *
 * This MUST fail closed in production. Deriving it from "no Stripe key" alone
 * means a production deploy with a missing or mistyped key silently hands out
 * the #1 position for free — the single most damaging way this app can be
 * misconfigured, and the most likely one on a first deploy.
 *
 * In production the absence of a key is a fault, not a mode: SIMULATED_PAYMENTS
 * stays false and the checkout route refuses instead.
 */
export const SIMULATED_PAYMENTS = !IS_PRODUCTION && !process.env.STRIPE_SECRET_KEY;

export const STRIPE_CONFIGURED = !!process.env.STRIPE_SECRET_KEY;

/** Dev-only escape hatches. Hard-disabled in production regardless of value. */
export const ALLOW_DEV_SIMULATE = !IS_PRODUCTION && process.env.ALLOW_DEV_SIMULATE === "1";
export const ALLOW_MOCK_OAUTH = !IS_PRODUCTION && process.env.ALLOW_MOCK_OAUTH === "1";

export type ConfigProblem = { key: string; problem: string };

/**
 * Refuse to run misconfigured in production. Called from instrumentation.ts,
 * so a bad deploy fails at boot with a readable list rather than at the first
 * payment.
 */
export function productionConfigProblems(): ConfigProblem[] {
  if (!IS_PRODUCTION) return [];
  const problems: ConfigProblem[] = [];

  if (!process.env.DATABASE_URL) {
    problems.push({ key: "DATABASE_URL", problem: "not set" });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    problems.push({ key: "STRIPE_SECRET_KEY", problem: "not set — bidding will be refused" });
  } else if (process.env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    problems.push({ key: "STRIPE_SECRET_KEY", problem: "is a TEST key in production" });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    problems.push({
      key: "STRIPE_WEBHOOK_SECRET",
      problem: "not set — payments would never be credited",
    });
  }
  const base = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL;
  if (!base) {
    problems.push({ key: "APP_BASE_URL", problem: "not set" });
  } else if (base.includes("localhost") || base.startsWith("http://")) {
    problems.push({ key: "APP_BASE_URL", problem: `must be a public https URL (got ${base})` });
  }
  for (const flag of ["ALLOW_DEV_SIMULATE", "ALLOW_MOCK_OAUTH", "MOCK_BIO_FILE"]) {
    if (process.env[flag]) {
      problems.push({ key: flag, problem: "set in production — remove it" });
    }
  }
  return problems;
}
