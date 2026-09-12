import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PROVIDERS, providerConfigured, providerCreds } from "@/lib/oauth/providers";
import { makeState, makeVerifier, challengeFor } from "@/lib/oauth/pkce";
import { createSession, setSessionCookie, upsertUser } from "@/lib/auth";
import { upsertClaim } from "@/lib/verification";
import { isPlatform } from "@/lib/platforms";
import { normalizeHandle } from "@/lib/rules";
import { BASE_URL, ALLOW_MOCK_OAUTH } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);

  // Dev-only shortcut. It deliberately calls the SAME upsertClaim() the real
  // callback uses, so exercising it proves the production path, not a stub.
  if (provider === "mock") {
    if (!ALLOW_MOCK_OAUTH) {
      return NextResponse.json({ error: "Not available." }, { status: 404 });
    }
    const platform = url.searchParams.get("platform");
    const handle = normalizeHandle(url.searchParams.get("handle") ?? "");
    if (!isPlatform(platform) || !handle) {
      return NextResponse.json({ error: "platform and handle required" }, { status: 400 });
    }

    const userId = await upsertUser(url.searchParams.get("email"));
    const claim = await upsertClaim({ userId, platform, handle, method: "oauth", providerAccountId: `mock_${handle}` });
    if (!claim.ok) {
      return NextResponse.json({ error: "That account is already verified by someone else." }, { status: 409 });
    }
    await setSessionCookie(await createSession(userId));
    return NextResponse.json({ ok: true, platform, handle, userId });
  }

  const config = PROVIDERS[provider];
  if (!config) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });
  if (!providerConfigured(provider)) {
    return NextResponse.json(
      { error: `${config.label} sign-in is not configured on this deployment.` },
      { status: 503 },
    );
  }

  const { clientId } = providerCreds(provider);
  const state = makeState();
  const jar = await cookies();
  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  };
  jar.set(`bb_state_${provider}`, state, cookieOpts);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${BASE_URL}/api/auth/${provider}/callback`,
    scope: config.scopes.join(" "),
    state,
  });

  if (config.usePkce) {
    const verifier = makeVerifier();
    jar.set(`bb_pkce_${provider}`, verifier, cookieOpts);
    params.set("code_challenge", challengeFor(verifier));
    params.set("code_challenge_method", "S256");
  }

  return NextResponse.redirect(`${config.authorizeUrl}?${params}`);
}
