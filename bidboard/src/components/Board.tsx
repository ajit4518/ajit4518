import { platformLabel } from "@/lib/platforms";
import { centsToUsd } from "@/lib/rules";
import type { BoardRow } from "@/lib/bids";

export default function Board({ rows, emptyHref = "/add" }: { rows: BoardRow[]; emptyHref?: string }) {
  if (rows.length === 0) {
    return (
      <div className="board">
        <div className="empty">
          Nothing here yet. <a href={emptyHref}>Add the first account →</a>
        </div>
      </div>
    );
  }

  return (
    <div className="board">
      {rows.map((r, i) => {
        const cents = Number(r.total_cents);
        return (
          <a className="row" data-top={i === 0 && cents > 0} key={r.id}
             href={`/go/${r.id}`} rel="nofollow noopener">
            <div className="rank">{i + 1}</div>
            <div className="who">
              <div className="name">
                {r.display_name}
                {r.verified && <span title="Owner verified" style={{ color: "var(--accent)" }}> ✓</span>}
              </div>
              <div className="meta">
                {platformLabel(r.platform)} · @{r.handle} · {r.category_name}
                {r.city_name ? ` · ${r.city_name}` : ""}
              </div>
              {r.tagline && <div className="tagline">{r.tagline}</div>}
            </div>
            <div className="amt">
              {cents > 0
                ? <div className="v">{centsToUsd(cents)}</div>
                : <div className="c" style={{ fontSize: 12 }}>free listing</div>}
              <div className="c">
                {Number(r.clicks).toLocaleString()} {Number(r.clicks) === 1 ? "click" : "clicks"}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
