import Link from "next/link";
import AddListingForm from "@/components/AddListingForm";
import { getCategories } from "@/lib/bids";
import { getCities, getCountries } from "@/lib/geo";

export const dynamic = "force-dynamic";

export default async function Add() {
  const [categories, cities, countries] = await Promise.all([
    getCategories(), getCities(), getCountries(),
  ]);

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand"><h1>Add an account</h1></div>
        <p className="blurb">
          Paste a username or profile link. No account, no payment.
        </p>
        <nav className="top">
          <Link href="/">← Board</Link>
          <Link href="/directory">Browse cities</Link>
          <Link href="/submit">Bid to rank</Link>
        </nav>
      </header>
      <AddListingForm categories={categories} cities={cities} countries={countries} />
    </div>
  );
}
