import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyPaidBid } from "@/lib/bids";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The only trusted way a bid becomes real.
 *
 * Never create a listing on the browser's return from Stripe: the user can
 * close the tab, and they can also just visit /success directly. Money is
 * only recognised here, against a signed event.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");

  if (!secret || !signature) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  // Signature verification needs the raw body, not the parsed JSON.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    return NextResponse.json({ error: `Invalid signature: ${(err as Error).message}` }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, ignored: "unpaid" });
  }

  const submissionId = session.metadata?.submission_id;
  if (!submissionId) {
    return NextResponse.json({ error: "Missing submission_id." }, { status: 400 });
  }

  const result = await applyPaidBid({
    eventId: event.id,
    submissionId,
    paymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    payerEmail: session.customer_details?.email ?? null,
  });

  // `applied: false` means a duplicate delivery, which is a success, not an
  // error. Returning 200 stops Stripe retrying forever.
  return NextResponse.json({ received: true, ...result });
}
