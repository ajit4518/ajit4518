import Link from "next/link";
import SubmitForm from "@/components/SubmitForm";
import { getCategories, getTopTotalCents } from "@/lib/bids";
import { currentUser } from "@/lib/auth";
import { getClaims } from "@/lib/verification";
import { MIN_NEW_BID_CENTS, TOP_MARGIN_CENTS, centsToUsd } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default async function Submit() {
  const [categories, topCents, user] = await Promise.all([
    getCategories(),
    getTopTotalCents(),
    currentUser(),
  ]);
  const claims = user ? await getClaims(user.id) : [];
  const toTakeFirst = topCents + TOP_MARGIN_CENTS;

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand"><h1>Get listed</h1></div>
        <p className="blurb">
          {centsToUsd(MIN_NEW_BID_CENTS)} puts you on the board. {centsToUsd(toTakeFirst)} puts
          you at #1 right now.
        </p>
        <nav className="top">
          <Link href="/">← Board</Link>
          <Link href="/verify">Verified accounts</Link>
          <Link href="/rules">Rules</Link>
        </nav>
      </header>

      {claims.length === 0 ? (
        <div className="panel">
          <strong>Verify an account first</strong>
          <p className="rules" style={{ marginTop: 8 }}>
            You can only bid on an account you control. It takes about a minute — sign in
            with the platform, or publish a one-time code in your bio.
          </p>
          <p style={{ marginBottom: 0 }}>
            <Link className="cta" href="/verify">Verify an account →</Link>
          </p>
        </div>
      ) : (
        <SubmitForm categories={categories} claims={claims} suggestedBid={MIN_NEW_BID_CENTS / 100} />
      )}
    </div>
  );
}
