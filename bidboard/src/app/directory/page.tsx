import Link from "next/link";
import { getPopulatedCities } from "@/lib/geo";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export const metadata = {
  title: "Browse by city",
  description: "Cities with listed brand social accounts.",
};

export default async function Directory() {
  const cities = await getPopulatedCities(1);

  const byCountry = new Map<string, typeof cities>();
  for (const c of cities) {
    if (!byCountry.has(c.country_name)) byCountry.set(c.country_name, []);
    byCountry.get(c.country_name)!.push(c);
  }

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand"><h1>Browse by city</h1></div>
        <p className="blurb">
          Only cities that actually have listings appear here. Empty cities are hidden
          rather than published as blank pages.
        </p>
        <nav className="top">
          <Link href="/">← Board</Link>
          <Link href="/add">Add an account</Link>
        </nav>
      </header>

      {byCountry.size === 0 && (
        <div className="board"><div className="empty">
          No cities have listings yet. <Link href="/add">Add the first →</Link>
        </div></div>
      )}

      {[...byCountry].map(([country, list]) => (
        <div key={country} style={{ marginBottom: 22 }}>
          <div className="lbl" style={{ marginBottom: 8 }}>{country}</div>
          <div className="filterrow">
            {list.map((c) => (
              <Link key={c.city_slug} className="chip" href={`/in/${c.country_slug}/${c.city_slug}`}>
                {c.city_name} <span style={{ opacity: 0.55 }}>{c.listings}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
