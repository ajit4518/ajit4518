// Pure bidding rules. No database, no framework, no I/O.
// Everything in here is directly unit-testable (see tests/rules.test.mjs).

export const MIN_NEW_BID_CENTS = 500;        // $5 to get on the board
export const MIN_RAISE_DELTA_CENTS = 100;    // $1 minimum step when climbing
export const TOP_MARGIN_CENTS = 500;         // must clear the leader by $5
export const MAX_BID_CENTS = 99_999_900;     // $999,999

export type Platform = "x" | "instagram" | "tiktok" | "youtube" | "linkedin";

export type BidPlan = {
  ok: true;
  /** What the card is actually charged, in cents. Never the full total. */
  chargeCents: number;
  /** What the listing total becomes if this payment lands right now. */
  projectedTotalCents: number;
  isRaise: boolean;
};

export type BidError = { ok: false; error: string };

/**
 * Decide what a bid costs and whether it is legal.
 *
 * `bidCents` is the total the bidder wants DISPLAYED, not the amount charged.
 * For an existing listing they pay only the difference, which is what makes
 * climbing from $12,000 to $13,005 cost $1,005 instead of $13,005.
 *
 * IMPORTANT: this runs at checkout-creation time only. It is advisory.
 * By the time the payment settles the leader may have moved, and that is
 * fine - see applyPaidBid() in bids.ts for why nobody needs a refund.
 */
export function planBid(input: {
  bidCents: number;
  currentTotalCents: number; // 0 for a brand new listing
  topTotalCents: number;     // current #1 on the board this listing competes on
}): BidPlan | BidError {
  const { bidCents, currentTotalCents, topTotalCents } = input;

  if (!Number.isInteger(bidCents)) {
    return { ok: false, error: "Bid must be a whole number of dollars." };
  }
  if (bidCents < MIN_NEW_BID_CENTS) {
    return { ok: false, error: `Minimum bid is $${MIN_NEW_BID_CENTS / 100}.` };
  }
  if (bidCents > MAX_BID_CENTS) {
    return { ok: false, error: `Maximum bid is $${(MAX_BID_CENTS / 100).toLocaleString()}.` };
  }

  const isRaise = currentTotalCents > 0;
  const chargeCents = bidCents - currentTotalCents;

  if (isRaise && chargeCents < MIN_RAISE_DELTA_CENTS) {
    return {
      ok: false,
      error: `To climb you must bid at least $${MIN_RAISE_DELTA_CENTS / 100} above your current $${currentTotalCents / 100}.`,
    };
  }

  // The anti-penny-war rule. Ties are allowed (you slot in below the
  // incumbent), but you cannot edge past the leader by $1.
  if (bidCents > topTotalCents && bidCents < topTotalCents + TOP_MARGIN_CENTS) {
    return {
      ok: false,
      error: `Taking #1 requires at least $${(topTotalCents + TOP_MARGIN_CENTS) / 100} (the leader is at $${topTotalCents / 100}).`,
    };
  }

  return { ok: true, chargeCents, projectedTotalCents: bidCents, isRaise };
}

/**
 * The whole ranking algorithm.
 *
 * Rank is a pure function of (total, age). It is never stored, so it can
 * never drift, and two simultaneous payments cannot collide over a slot.
 */
export function rankRows<T extends { totalCents: number; firstBidAt: Date | string | null }>(
  rows: T[],
): (T & { rank: number })[] {
  const ts = (v: Date | string | null) => (v == null ? Infinity : new Date(v).getTime());
  return [...rows]
    .sort((a, b) => b.totalCents - a.totalCents || ts(a.firstBidAt) - ts(b.firstBidAt))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

const HANDLE_RE = /^[a-z0-9._-]{1,64}$/;

/** Lowercase, strip a leading @, and pull the handle out of a pasted URL. */
export function normalizeHandle(raw: string): string | null {
  let s = (raw ?? "").trim();
  if (!s) return null;

  if (/^https?:\/\//i.test(s) || s.includes("/")) {
    const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    try {
      const segments = new URL(withScheme).pathname.split("/").filter(Boolean);
      // youtube.com/@name, tiktok.com/@name, linkedin.com/company/name
      s = segments.find((p) => p.startsWith("@")) ?? segments[segments.length - 1] ?? "";
    } catch {
      return null;
    }
  }

  s = s.replace(/^@+/, "").toLowerCase();
  return HANDLE_RE.test(s) ? s : null;
}

// Blocked because they defeat the point of a public, inspectable board:
// you cannot see where a shortened or invite link actually goes.
const BLOCKED_HOSTS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "buff.ly",
  "is.gd", "rebrand.ly", "cutt.ly", "shorturl.at", "lnkd.in",
  "discord.gg", "t.me", "chat.whatsapp.com", "join.skype.com",
];

export function isBlockedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return BLOCKED_HOSTS.includes(host);
  } catch {
    return true;
  }
}

export function centsToUsd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** Parse a user-typed dollar figure ("1,200" / "$1200" / "1200") to cents. */
export function usdToCents(raw: string): number | null {
  const cleaned = (raw ?? "").replace(/[$,\s]/g, "");
  if (!/^\d{1,7}$/.test(cleaned)) return null;
  return Number(cleaned) * 100;
}
