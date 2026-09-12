"use client";

import { useState } from "react";
import { PLATFORMS } from "@/lib/platforms";

type Category = { id: number; slug: string; name: string };

export default function SubmitForm({
  categories,
  suggestedBid,
}: {
  categories: Category[];
  suggestedBid: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());

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

      <div className="grid2">
        <div className="field">
          <label htmlFor="platform">Platform</label>
          <select id="platform" name="platform" defaultValue="x">
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="handle">Handle</label>
          <input id="handle" name="handle" placeholder="@yourhandle" required />
          <div className="hint">Paste the @handle or the profile URL.</div>
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
          <div className="hint">
            Already listed? Enter your new total — you pay only the difference.
          </div>
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
