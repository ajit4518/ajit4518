import Link from "next/link";
import { getBoard, getCategories, getStats } from "@/lib/bids";
import { PLATFORMS, isPlatform, platformLabel } from "@/lib/platforms";
import { centsToUsd } from "@/lib/rules";
import { VERTICAL, SIMULATED_PAYMENTS } from "@/lib/config";

export const dynamic = "force-dynamic";

// The board is identical for every visitor, so it caches trivially at the
// edge. A short revalidate window is what lets one Postgres row-store serve
// a traffic spike: the DB is only touched on bids, not on reads.
export const revalidate = 5;

type SP = Promise<{ platform?: string; category?: string; window?: string }>;

function chip(href: string, label: string, on: boolean) {
  return (
    <Link key={href + label} className="chip" data-on={on} href={href}>
      {label}
    </Link>
  );
}

export default async function Home({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const platform = isPlatform(sp.platform) ? sp.platform : null;
  const categorySlug = sp.category ?? null;
  const window = sp.window === "today" ? "today" : "all";

  const [rows, categories, stats] = await Promise.all([
    getBoard({ platform, categorySlug, window }),
    getCategories(),
    getStats(),
  ]);

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { platform, category: categorySlug, window: window === "all" ? null : window, ...patch };
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
          <div className="stat">
            <div className="n">{centsToUsd(stats.totalCents)}</div>
            <div className="l">Total bid</div>
          </div>
          <div className="stat">
            <div className="n">{stats.listings}</div>
            <div className="l">Listings</div>
          </div>
          <div className="stat">
            <div className="n">{centsToUsd(stats.topCents)}</div>
            <div className="l">Top spot</div>
          </div>
        </div>
        <nav className="top">
          <Link href="/submit">Get listed →</Link>
          <Link href="/rules">Rules</Link>
        </nav>
      </header>

      {SIMULATED_PAYMENTS && (
        <div className="notice">
          <strong>Simulated payment mode.</strong> No <code>STRIPE_SECRET_KEY</code> is set, so
          checkout is stubbed and bids apply instantly. Add Stripe test keys to{" "}
          <code>.env</code> to exercise the real webhook path.
        </div>
      )}

      <div className="filters">
        <div className="filterrow">
          <span className="lbl">Board</span>
          {chip(qs({ window: null }), "All-time", window === "all")}
          {chip(qs({ window: "today" }), "Today", window === "today")}
        </div>
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

      <div className="board">
        {rows.length === 0 && (
          <div className="empty">
            Nothing on this board yet. <Link href="/submit">Be first for $5 →</Link>
          </div>
        )}
        {rows.map((r, i) => (
          <a className="row" data-top={i === 0} key={r.id} href={`/go/${r.id}`} rel="nofollow noopener">
            <div className="rank">{i + 1}</div>
            <div className="who">
              <div className="name">{r.display_name}</div>
              <div className="meta">
                {platformLabel(r.platform)} · @{r.handle} · {r.category_name}
              </div>
              {r.tagline && <div className="tagline">{r.tagline}</div>}
            </div>
            <div className="amt">
              <div className="v">{centsToUsd(Number(r.total_cents))}</div>
              <div className="c">
                {Number(r.clicks).toLocaleString()} {Number(r.clicks) === 1 ? "click" : "clicks"}
              </div>
            </div>
          </a>
        ))}
      </div>

      <footer>
        Rank is set by cumulative dollars paid, nothing else. Ties keep their original
        order — the older bid stays higher.
      </footer>
    </div>
  );
}
