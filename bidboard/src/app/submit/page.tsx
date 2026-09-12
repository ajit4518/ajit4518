import Link from "next/link";
import SubmitForm from "@/components/SubmitForm";
import { getCategories, getTopTotalCents } from "@/lib/bids";
import { MIN_NEW_BID_CENTS, TOP_MARGIN_CENTS, centsToUsd } from "@/lib/rules";

export const dynamic = "force-dynamic";

export default async function Submit() {
  const [categories, topCents] = await Promise.all([getCategories(), getTopTotalCents()]);
  const toTakeFirst = topCents + TOP_MARGIN_CENTS;

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand"><h1>Get listed</h1></div>
        <p className="blurb">
          {centsToUsd(MIN_NEW_BID_CENTS)} puts you on the board. {centsToUsd(toTakeFirst)} puts
          you at #1 right now.
        </p>
        <nav className="top"><Link href="/">← Board</Link><Link href="/rules">Rules</Link></nav>
      </header>

      <div className="notice">
        List only an account you own or represent. Listings for accounts that did not opt in
        are removed on request.
      </div>

      <SubmitForm categories={categories} suggestedBid={MIN_NEW_BID_CENTS / 100} />
    </div>
  );
}
