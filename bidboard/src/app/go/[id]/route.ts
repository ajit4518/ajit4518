import { NextResponse } from "next/server";
import { recordClickAndGetTarget } from "@/lib/bids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Click receipts. Bidders need proof the spend did something, otherwise the
 * board gets exactly one round of novelty money and then goes quiet.
 * The outbound URL is sent clean, with no tracking parameters appended.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"));
  }

  const target = await recordClickAndGetTarget(id);
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  return NextResponse.redirect(target ?? new URL("/", base).toString(), { status: 302 });
}
