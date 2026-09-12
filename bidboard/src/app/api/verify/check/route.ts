import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import {
  bioContainsCode, bumpAttempts, getPendingChallenge, markChallengeVerified,
  upsertClaim, MAX_CHALLENGE_ATTEMPTS,
} from "@/lib/verification";
import { getProfileFetcher } from "@/lib/profileFetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Start a challenge first." }, { status: 401 });

  const { challengeId } = await req.json().catch(() => ({}) as any);
  if (!challengeId) return NextResponse.json({ error: "challengeId required" }, { status: 400 });

  const challenge = await getPendingChallenge(challengeId, user.id);
  if (!challenge) {
    return NextResponse.json({ error: "That challenge has expired. Start a new one." }, { status: 404 });
  }

  // Bound the work: each check is an outbound fetch, so this is both an
  // abuse limit and a politeness limit toward the platform being read.
  const attempts = await bumpAttempts(challenge.id);
  if (attempts > MAX_CHALLENGE_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many attempts on this challenge. Start a new one." },
      { status: 429 },
    );
  }

  let bio: string;
  try {
    bio = await getProfileFetcher()(challenge.platform, challenge.handle);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  if (!bioContainsCode(bio, challenge.code)) {
    return NextResponse.json(
      { verified: false, error: "Code not found on that profile yet.", attemptsLeft: MAX_CHALLENGE_ATTEMPTS - attempts },
      { status: 200 },
    );
  }

  const claim = await upsertClaim({
    userId: user.id,
    platform: challenge.platform,
    handle: challenge.handle,
    method: "code",
  });
  if (!claim.ok) {
    return NextResponse.json({ error: "That account is already verified by someone else." }, { status: 409 });
  }

  await markChallengeVerified(challenge.id);
  return NextResponse.json({ verified: true, platform: challenge.platform, handle: challenge.handle });
}
