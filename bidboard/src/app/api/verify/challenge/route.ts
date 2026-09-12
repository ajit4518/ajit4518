import { NextResponse } from "next/server";
import { createSession, currentUser, setSessionCookie, upsertUser } from "@/lib/auth";
import { claimOwner, createChallenge, CHALLENGE_TTL_MINUTES } from "@/lib/verification";
import { isPlatform } from "@/lib/platforms";
import { normalizeHandle } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { platform, handle: rawHandle } = await req.json().catch(() => ({}) as any);

  if (!isPlatform(platform)) {
    return NextResponse.json({ error: "Pick a platform." }, { status: 400 });
  }
  const handle = normalizeHandle(String(rawHandle ?? ""));
  if (!handle) return NextResponse.json({ error: "That handle doesn't look valid." }, { status: 400 });

  // Starting a challenge is what establishes an identity, so an anonymous
  // visitor gets a user row here rather than being bounced to a signup form.
  let user = await currentUser();
  if (!user) {
    const id = await upsertUser(null);
    await setSessionCookie(await createSession(id));
    user = { id, email: null };
  }

  const owner = await claimOwner(platform, handle);
  if (owner && owner !== user.id) {
    return NextResponse.json(
      { error: "That account has already been verified by someone else." },
      { status: 409 },
    );
  }

  const challenge = await createChallenge({ userId: user.id, platform, handle });
  return NextResponse.json({
    challengeId: challenge.id,
    code: challenge.code,
    expiresAt: challenge.expiresAt,
    ttlMinutes: CHALLENGE_TTL_MINUTES,
    instructions: `Add this code anywhere in your ${platform} bio, then press Check. You can remove it afterwards.`,
  });
}
