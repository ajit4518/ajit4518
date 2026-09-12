import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  applyPaidBid, attachSessionId, createSubmission, getCategories, getListing, getTopTotalCents,
} from "@/lib/bids";
import { isPlatform, platformLabel, profileUrlFor } from "@/lib/platforms";
import { normalizeHandle, planBid, usdToCents, centsToUsd } from "@/lib/rules";
import { BASE_URL, SIMULATED_PAYMENTS, STRIPE_CONFIGURED } from "@/lib/config";
import { currentUser } from "@/lib/auth";
import { hasClaim, claimOwner } from "@/lib/verification";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return bad("Malformed request.");

  const { platform, handle: rawHandle, displayName, tagline, categoryId, bid, email } = body;

  if (!isPlatform(platform)) return bad("Pick a platform.");

  const handle = normalizeHandle(String(rawHandle ?? ""));
  if (!handle) return bad("That handle doesn't look valid.");

  // OWNERSHIP GATE.
  //
  // Everything below spends money on a handle, so this is the line that has
  // to hold: a bid is only accepted from the user who has proven control of
  // that account. Without it, $5 buys a stranger a public ranked listing of
  // someone else's profile, which is the whole consent problem.
  const user = await currentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Verify the account first.", needsVerification: true },
      { status: 401 },
    );
  }
  if (!(await hasClaim(user.id, platform, handle))) {
    const owner = await claimOwner(platform, handle);
    return NextResponse.json(
      {
        error: owner
          ? "That account is verified by a different user."
          : `You haven't verified @${handle} on ${platform} yet.`,
        needsVerification: true,
      },
      { status: 403 },
    );
  }

  const name = String(displayName ?? "").trim().slice(0, 80);
  if (name.length < 2) return bad("Add a display name.");

  const categories = await getCategories();
  const category = categories.find((c) => c.id === Number(categoryId));
  if (!category) return bad("Pick a category.");

  const bidCents = usdToCents(String(bid ?? ""));
  if (bidCents == null) return bad("Enter a whole dollar amount.");

  // The profile URL is DERIVED from platform + handle, never taken from the
  // client. That removes open-redirect and link-laundering abuse entirely,
  // which is why there is no URL field on the form.
  const profileUrl = profileUrlFor(platform, handle);

  const existing = await getListing(platform, handle);
  const currentTotalCents = existing ? Number(existing.total_cents) : 0;
  const topTotalCents = await getTopTotalCents();

  const plan = planBid({ bidCents, currentTotalCents, topTotalCents });
  if (!plan.ok) return bad(plan.error);

  const submissionId = await createSubmission({
    platform,
    handle,
    displayName: name,
    profileUrl,
    tagline: (String(tagline ?? "").trim().slice(0, 120)) || null,
    categoryId: category.id,
    chargeCents: plan.chargeCents,
    payerEmail: String(email ?? "").trim() || null,
  });

  // Fail closed. In production SIMULATED_PAYMENTS is always false, so a
  // deploy with a missing Stripe key refuses to take bids rather than
  // handing out rank for nothing.
  if (!SIMULATED_PAYMENTS && !STRIPE_CONFIGURED) {
    return NextResponse.json(
      { error: "Payments are not configured on this deployment." },
      { status: 503 },
    );
  }

  // Development only: stub the payment so the engine can be exercised end to
  // end. The code path below is identical to the webhook's.
  if (SIMULATED_PAYMENTS) {
    const result = await applyPaidBid({
      eventId: `sim_${randomUUID()}`,
      submissionId,
      paymentIntentId: `sim_pi_${randomUUID()}`,
      payerEmail: String(email ?? "").trim() || null,
    });
    return NextResponse.json({
      url: `/success?total=${Math.round((result.totalCents ?? 0) / 100)}`,
      simulated: true,
    });
  }

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: plan.chargeCents,
          product_data: {
            name: plan.isRaise
              ? `Raise ${platformLabel(platform)} @${handle} to ${centsToUsd(bidCents)}`
              : `List ${platformLabel(platform)} @${handle} at ${centsToUsd(bidCents)}`,
            description: plan.isRaise
              ? `Difference between ${centsToUsd(currentTotalCents)} and ${centsToUsd(bidCents)}.`
              : category.name,
          },
        },
      },
    ],
    customer_email: String(email ?? "").trim() || undefined,
    // The session carries ONLY the submission id. Listing data is read back
    // from our own table in the webhook, so nothing user-controlled in the
    // Stripe payload can influence what gets written.
    metadata: { submission_id: submissionId },
    success_url: `${BASE_URL}/success`,
    cancel_url: `${BASE_URL}/submit`,
  });

  await attachSessionId(submissionId, session.id);
  return NextResponse.json({ url: session.url });
}
