import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Takedown path. Listings created before verification was required are not
 * retroactively provable, so there has to be a way for the actual account
 * holder to get one removed.
 */
export async function POST(req: Request) {
  const { listingId, reason, contact } = await req.json().catch(() => ({}) as any);

  if (!listingId || !/^[0-9a-f-]{36}$/i.test(String(listingId))) {
    return NextResponse.json({ error: "Valid listingId required." }, { status: 400 });
  }
  const text = String(reason ?? "").trim().slice(0, 1000);
  if (text.length < 5) return NextResponse.json({ error: "Tell us why." }, { status: 400 });

  const exists = await query("SELECT 1 FROM listings WHERE id = $1", [listingId]);
  if (!exists.length) return NextResponse.json({ error: "No such listing." }, { status: 404 });

  await query(
    "INSERT INTO removal_requests (listing_id, reason, contact) VALUES ($1,$2,$3)",
    [listingId, text, String(contact ?? "").trim().slice(0, 200) || null],
  );

  // Hide immediately, review afterwards. An unverified listing of someone
  // else's account is the kind of thing you take down first and adjudicate
  // second.
  await query(
    "UPDATE listings SET status = 'hidden' WHERE id = $1 AND verified = false",
    [listingId],
  );

  return NextResponse.json({ ok: true });
}
