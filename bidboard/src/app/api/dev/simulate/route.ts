import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { applyPaidBid } from "@/lib/bids";
import { ALLOW_DEV_SIMULATE } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Test hook: apply a settled payment without Stripe, and optionally replay a
 * specific event id to prove the idempotency guard holds.
 */
export async function POST(req: Request) {
  if (!ALLOW_DEV_SIMULATE) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const { submissionId, eventId } = await req.json().catch(() => ({}) as any);
  if (!submissionId) return NextResponse.json({ error: "submissionId required" }, { status: 400 });

  const result = await applyPaidBid({
    eventId: eventId ?? `sim_${randomUUID()}`,
    submissionId,
    paymentIntentId: `sim_pi_${randomUUID()}`,
    payerEmail: null,
  });

  return NextResponse.json(result);
}
