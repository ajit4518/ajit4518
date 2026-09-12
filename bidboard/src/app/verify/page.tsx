import Link from "next/link";
import VerifyPanel from "@/components/VerifyPanel";
import { currentUser } from "@/lib/auth";
import { getClaims } from "@/lib/verification";
import { PROVIDERS, providerConfigured, CODE_ONLY_PLATFORMS } from "@/lib/oauth/providers";
import { platformLabel } from "@/lib/platforms";

export const dynamic = "force-dynamic";

export default async function Verify({
  searchParams,
}: { searchParams: Promise<{ error?: string; verified?: string }> }) {
  const sp = await searchParams;
  const user = await currentUser();
  const claims = user ? await getClaims(user.id) : [];

  const oauthProviders = Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    platform: p.platform,
    configured: providerConfigured(p.id),
  }));

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand"><h1>Verify your account</h1></div>
        <p className="blurb">
          You can only bid on an account you control. Prove it once, then bid as often
          as you like.
        </p>
        <nav className="top">
          <Link href="/">← Board</Link>
          <Link href="/submit">Get listed</Link>
          {user && <Link href="/api/auth/signout">Sign out</Link>}
        </nav>
      </header>

      {sp.error && <div className="err">{sp.error}</div>}
      {sp.verified && <div className="notice">Verified @{sp.verified}.</div>}

      <VerifyPanel
        claims={claims}
        codeOnly={CODE_ONLY_PLATFORMS.map(platformLabel)}
        oauthProviders={oauthProviders}
      />
    </div>
  );
}
