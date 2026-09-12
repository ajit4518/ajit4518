import Link from "next/link";
import Board from "@/components/Board";
import { getBoard, getCategories, getStats } from "@/lib/bids";
import { getCities, getCountries } from "@/lib/geo";
import { PLATFORMS, isPlatform } from "@/lib/platforms";
import { centsToUsd } from "@/lib/rules";
import { VERTICAL, SIMULATED_PAYMENTS } from "@/lib/config";

export const dynamic = "force-dynamic";
export const revalidate = 5;

type SP = Promise<{
  platform?: string; category?: string; country?: string;
  city?: string; type?: string; window?: string;
}>;

function chip(href: string, label: string, on: boolean) {
  return <Link key={href + label} className="chip" data-on={on} href={href}>{label}</Link>;
}

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const platform = isPlatform(sp.platform) ? sp.platform : null;
  const categorySlug = sp.category ?? null;
  const countrySlug = sp.country ?? null;
  const citySlug = sp.city ?? null;
  const entityType = sp.type === "person" ? "person" : sp.type === "brand" ? "brand" : null;
  const window = sp.window === "today" ? "today" : "all";

  const [rows, categories, countries, stats] = await Promise.all([
    getBoard({ platform, categorySlug, countrySlug, citySlug, entityType, window }),
    getCategories(),
    getCountries(),
    getStats(),
  ]);

  const selectedCountry = countries.find((c) => c.slug === countrySlug) ?? null;
  const cities = selectedCountry ? await getCities(selectedCountry.code) : [];

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = {
      platform, category: categorySlug, country: countrySlug, city: citySlug,
      type: entityType, window: window === "all" ? null : window, ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand">
          <h1>{VERTICAL.name}</h1>
          <span className="tag">{VERTICAL.tagline}</span>
        </div>
        <p className="blurb">{VERTICAL.blurb}</p>
        <div className="statbar">
          <div className="stat"><div className="n">{centsToUsd(stats.totalCents)}</div><div className="l">Total bid</div></div>
          <div className="stat"><div className="n">{stats.listings}</div><div className="l">Listings</div></div>
          <div className="stat"><div className="n">{centsToUsd(stats.topCents)}</div><div className="l">Top spot</div></div>
        </div>
        <nav className="top">
          <Link href="/add">Add an account →</Link>
          <Link href="/directory">Browse cities</Link>
          <Link href="/submit">Bid to rank</Link>
          <Link href="/rules">Rules</Link>
        </nav>
      </header>

      {SIMULATED_PAYMENTS && (
        <div className="notice">
          <strong>Simulated payment mode.</strong> No <code>STRIPE_SECRET_KEY</code> is set, so
          checkout is stubbed and bids apply instantly.
        </div>
      )}

      <div className="filters">
        <div className="filterrow">
          <span className="lbl">Board</span>
          {chip(qs({ window: null }), "All-time", window === "all")}
          {chip(qs({ window: "today" }), "Today", window === "today")}
        </div>
        <div className="filterrow">
          <span className="lbl">Type</span>
          {chip(qs({ type: null }), "All", !entityType)}
          {chip(qs({ type: "brand" }), "Brands", entityType === "brand")}
          {chip(qs({ type: "person" }), "People", entityType === "person")}
        </div>
        <div className="filterrow">
          <span className="lbl">Country</span>
          {chip(qs({ country: null, city: null }), "All", !countrySlug)}
          {countries.map((c) => chip(qs({ country: c.slug, city: null }), c.name, countrySlug === c.slug))}
        </div>
        {cities.length > 0 && (
          <div className="filterrow">
            <span className="lbl">City</span>
            {chip(qs({ city: null }), "All", !citySlug)}
            {cities.map((c) => chip(qs({ city: c.slug }), c.name, citySlug === c.slug))}
          </div>
        )}
        <div className="filterrow">
          <span className="lbl">Platform</span>
          {chip(qs({ platform: null }), "All", !platform)}
          {PLATFORMS.map((p) => chip(qs({ platform: p.id }), p.label, platform === p.id))}
        </div>
        <div className="filterrow">
          <span className="lbl">Category</span>
          {chip(qs({ category: null }), "All", !categorySlug)}
          {categories.map((c) => chip(qs({ category: c.slug }), c.name, categorySlug === c.slug))}
        </div>
      </div>

      <Board rows={rows} />

      <footer>
        Paid listings rank above free ones, by cumulative dollars paid. Free listings
        follow, oldest first. Anyone can <Link href="/add">add an account</Link>; only a
        verified owner can bid.
      </footer>
    </div>
  );
}
