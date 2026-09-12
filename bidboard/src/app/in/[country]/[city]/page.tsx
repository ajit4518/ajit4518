import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Board from "@/components/Board";
import { getBoard, getCategories } from "@/lib/bids";
import { findCity } from "@/lib/geo";
import { VERTICAL } from "@/lib/config";

export const dynamic = "force-dynamic";
export const revalidate = 60;

type Params = Promise<{ country: string; city: string }>;
type SP = Promise<{ category?: string }>;

/**
 * The SEO surface. A directory's distribution is long-tail search — "social
 * media agencies in mumbai" and thousands of queries like it — not virality.
 * One real ranked page per city beats a generated stub, which is why the
 * sitemap only lists cities that actually have listings.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { country, city } = await params;
  const found = await findCity(country, city);
  if (!found) return { title: "Not found" };
  return {
    title: `Top brand social accounts in ${found.name} — ${VERTICAL.name}`,
    description: `Ranked directory of brand and agency social media accounts in ${found.name}, ${found.country_name}.`,
    alternates: { canonical: `/in/${country}/${city}` },
  };
}

export default async function CityPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { country, city } = await params;
  const sp = await searchParams;

  const found = await findCity(country, city);
  if (!found) notFound();

  const [rows, categories] = await Promise.all([
    getBoard({ countrySlug: country, citySlug: city, categorySlug: sp.category ?? null, limit: 100 }),
    getCategories(),
  ]);

  const qs = (cat: string | null) =>
    cat ? `/in/${country}/${city}?category=${cat}` : `/in/${country}/${city}`;

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">
          <h1>{found.name}</h1>
          <span className="tag">{found.country_name}</span>
        </div>
        <p className="blurb">
          Brand and agency social accounts in {found.name}, ranked by what they have paid.
          Free listings follow the paid ones.
        </p>
        <nav className="top">
          <Link href="/">← All cities</Link>
          <Link href="/directory">Browse cities</Link>
          <Link href="/add">Add an account</Link>
        </nav>
      </header>

      <div className="filters">
        <div className="filterrow">
          <span className="lbl">Category</span>
          <Link className="chip" data-on={!sp.category} href={qs(null)}>All</Link>
          {categories.map((c) => (
            <Link key={c.slug} className="chip" data-on={sp.category === c.slug} href={qs(c.slug)}>
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      <Board rows={rows} />
    </div>
  );
}
