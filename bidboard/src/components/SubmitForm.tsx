"use client";

import { useState } from "react";

type Category = { id: number; slug: string; name: string };
type Claim = { id: string; platform: string; handle: string };

export default function SubmitForm({
  categories,
  claims,
  suggestedBid,
}: {
  categories: Category[];
  claims: Claim[];
  suggestedBid: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(`${claims[0]?.platform}:${claims[0]?.handle}`);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const fd = new FormData(e.currentTarget);
    const [platform, handle] = String(fd.get("account")).split(":");
    const payload = { ...Object.fromEntries(fd.entries()), platform, handle };

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={onSubmit}>
      {error && <div className="err">{error}</div>}

      <div className="field">
        <label htmlFor="account">Account</label>
        {/* Only verified accounts appear here. The server re-checks the claim
            regardless, so this select is convenience, not the control. */}
        <select id="account" name="account" value={selected}
                onChange={(e) => setSelected(e.target.value)}>
          {claims.map((c) => (
            <option key={c.id} value={`${c.platform}:${c.handle}`}>
              {c.platform} · @{c.handle}
            </option>
          ))}
        </select>
        <div className="hint">
          Only verified accounts are listed. <a href="/verify">Verify another →</a>
        </div>
      </div>

      <div className="field">
        <label htmlFor="displayName">Display name</label>
        <input id="displayName" name="displayName" placeholder="Your agency or studio" required />
      </div>

      <div className="field">
        <label htmlFor="tagline">Tagline <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input id="tagline" name="tagline" maxLength={120} placeholder="What you do, in one line" />
      </div>

      <div className="grid2">
        <div className="field">
          <label htmlFor="categoryId">Category</label>
          <select id="categoryId" name="categoryId" defaultValue={categories[0]?.id}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="bid">Your bid (USD)</label>
          <input id="bid" name="bid" inputMode="numeric" defaultValue={String(suggestedBid)} required />
          <div className="hint">Already listed? Enter your new total — you pay only the difference.</div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="email">Email <span style={{ fontWeight: 400 }}>(for the receipt)</span></label>
        <input id="email" name="email" type="email" placeholder="you@agency.com" />
      </div>

      <button className="cta" type="submit" disabled={busy}>
        {busy ? "Working…" : "Continue to payment"}
      </button>
    </form>
  );
}
