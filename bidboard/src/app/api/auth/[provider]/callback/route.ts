import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PROVIDERS, providerConfigured, providerCreds } from "@/lib/oauth/providers";
import { safeEqual } from "@/lib/oauth/pkce";
import { createSession, setSessionCookie, upsertUser } from "@/lib/auth";
import { upsertClaim } from "@/lib/verification";
import { normalizeHandle } from "@/lib/rules";
import { BASE_URL } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fail = (msg: string) =>
  NextResponse.redirect(`${BASE_URL}/verify?error=${encodeURIComponent(msg)}`);

export async function GET(req: Request, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const config = PROVIDERS[provider];
  if (!config || !providerConfigured(provider)) return fail("Unknown or unconfigured provider.");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return fail(url.searchParams.get("error")!);
  if (!code || !state) return fail("Missing code or state.");

  const jar = await cookies();
  const expected = jar.get(`bb_state_${provider}`)?.value;
  // CSRF guard: the state must match the one we planted before redirecting.
  if (!expected || !safeEqual(expected, state)) return fail("Invalid state. Start again.");
  jar.delete(`bb_state_${provider}`);

  const { clientId, clientSecret } = providerCreds(provider);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${BASE_URL}/api/auth/${provider}/callback`,
    client_id: clientId,
  });

  if (config.usePkce) {
    const verifier = jar.get(`bb_pkce_${provider}`)?.value;
    if (!verifier) return fail("Verifier expired. Start again.");
    body.set("code_verifier", verifier);
    jar.delete(`bb_pkce_${provider}`);
  }

  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (config.basicAuth) {
    headers.authorization =
      "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  } else {
    body.set("client_secret", clientSecret);
  }

  let profile;
  try {
    const tokenRes = await fetch(config.tokenUrl, { method: "POST", headers, body });
    if (!tokenRes.ok) return fail(`Token exchange failed (${tokenRes.status}).`);
    const token = await tokenRes.json();
    profile = await config.fetchProfile(token.access_token);
  } catch (err) {
    return fail((err as Error).message);
  }

  const handle = normalizeHandle(profile.handle);
  if (!handle) return fail("That account has no usable handle to list.");

  const userId = await upsertUser(null);
  const claim = await upsertClaim({
    userId,
    platform: config.platform,
    handle,
    method: "oauth",
    providerAccountId: profile.id,
  });
  if (!claim.ok) return fail("That account is already verified by another user.");

  await setSessionCookie(await createSession(userId));
  return NextResponse.redirect(`${BASE_URL}/verify?verified=${encodeURIComponent(handle)}`);
}
