import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";
import { BASE_URL } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await signOut();
  return NextResponse.json({ ok: true });
}

export async function GET() {
  await signOut();
  return NextResponse.redirect(`${BASE_URL}/verify`);
}
