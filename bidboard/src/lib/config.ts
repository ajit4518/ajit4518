/**
 * The vertical this board is scoped to.
 *
 * Picking a narrow vertical is the whole strategy: the accounts listed here
 * are revenue-generating assets, so a bid has an ROI argument behind it.
 * A general "rank any creator" board has no such argument and tops out at
 * novelty spend.
 */
export const VERTICAL = {
  name: "AgencyBoard",
  tagline: "The agencies and operators paying to be seen.",
  blurb:
    "Rank is set by one number: what you have paid, in total. No algorithm, no editorial, no ads. Bid more, rank higher.",
};

export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

/** Simulated mode: no Stripe key configured, so payments are stubbed. */
export const SIMULATED_PAYMENTS = !process.env.STRIPE_SECRET_KEY;

export const ALLOW_DEV_SIMULATE = process.env.ALLOW_DEV_SIMULATE === "1";
