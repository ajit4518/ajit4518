"use client";

import { useState } from "react";
import { PLATFORMS } from "@/lib/platforms";

type Category = { id: number; slug: string; name: string };
type City = { id: number; name: string; country_code: string };
type Country = { code: string; name: string };

export default function AddListingForm({
  categories, cities, countries,
}: { categories: Category[]; cities: City[]; countries: Country[] }) {
  const [country, setCountry] = useState(countries[0]?.code ?? "");
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visibleCities = cities.filter((c) => c.country_code === country);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null); setDone(null); setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/listings/add", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fd.entries())),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(data.error);
    setDone(data.message);
    (e.target as HTMLFormElement).reset();
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      {err && <div className="err">{err}</div>}
      {done && <div className="notice">{done} <a href="/">See the board →</a></div>}

      <div className="grid2">
        <div className="field">
          <label htmlFor="platform">Platform</label>
          <select id="platform" name="platform" defaultValue="instagram">
            {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="handle">Username or profile link</label>
          <input id="handle" name="handle" placeholder="@handle or paste the URL" required />
        </div>
      </div>

      <div className="field">
        <label htmlFor="displayName">Name</label>
        <input id="displayName" name="displayName" placeholder="Brand or person name" required />
      </div>

      <div className="field">
        <label htmlFor="tagline">Tagline <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input id="tagline" name="tagline" maxLength={120} placeholder="One line" />
      </div>

      <div className="grid2">
        <div className="field">
          <label htmlFor="entityType">Type</label>
          <select id="entityType" name="entityType" defaultValue="brand">
            <option value="brand">Brand or business</option>
            <option value="person">Person</option>
          </select>
          <div className="hint">Person listings are excluded from search engines.</div>
        </div>
        <div className="field">
          <label htmlFor="categoryId">Category</label>
          <select id="categoryId" name="categoryId" defaultValue={categories[0]?.id}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid2">
        <div className="field">
          <label htmlFor="country">Country</label>
          <select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cityId">City</label>
          <select id="cityId" name="cityId" defaultValue="">
            <option value="">— none —</option>
            {visibleCities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <button className="cta" disabled={busy}>{busy ? "Adding…" : "Add to directory"}</button>
      <p className="rules" style={{ marginTop: 14, marginBottom: 0 }}>
        Free, no account. Listing someone else? They can have it removed in one click.
        To rank above the free tier you verify the account and bid.
      </p>
    </form>
  );
}
