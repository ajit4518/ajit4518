"use client";

import { useState } from "react";
import { PLATFORMS } from "@/lib/platforms";

type Claim = { id: string; platform: string; handle: string; method: string };

export default function VerifyPanel({
  claims,
  codeOnly,
  oauthProviders,
}: {
  claims: Claim[];
  codeOnly: string[];
  oauthProviders: { id: string; label: string; platform: string; configured: boolean }[];
}) {
  const [platform, setPlatform] = useState("instagram");
  const [handle, setHandle] = useState("");
  const [challenge, setChallenge] = useState<{ challengeId: string; code: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const post = async (path: string, body: unknown) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json() };
  };

  async function startChallenge(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    const { ok, data } = await post("/api/verify/challenge", { platform, handle });
    setBusy(false);
    if (!ok) return setErr(data.error);
    setChallenge({ challengeId: data.challengeId, code: data.code });
  }

  async function check() {
    if (!challenge) return;
    setErr(null); setMsg(null); setBusy(true);
    const { ok, data } = await post("/api/verify/check", { challengeId: challenge.challengeId });
    setBusy(false);
    if (!ok) return setErr(data.error);
    if (!data.verified) return setErr(data.error ?? "Not found yet.");
    setMsg(`Verified @${data.handle}. You can remove the code from your bio now.`);
    setChallenge(null);
    setTimeout(() => window.location.reload(), 1200);
  }

  return (
    <>
      {claims.length > 0 && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <strong style={{ fontSize: 14 }}>Verified accounts</strong>
          <div style={{ marginTop: 10 }}>
            {claims.map((c) => (
              <div key={c.id} className="meta" style={{ padding: "5px 0" }}>
                ✓ {c.platform} · @{c.handle}{" "}
                <span style={{ opacity: 0.6 }}>({c.method})</span>
              </div>
            ))}
          </div>
          <p style={{ marginBottom: 0, marginTop: 12 }}>
            <a className="cta" href="/submit">Bid with a verified account →</a>
          </p>
        </div>
      )}

      {err && <div className="err">{err}</div>}
      {msg && <div className="notice">{msg}</div>}

      <div className="panel" style={{ marginBottom: 20 }}>
        <strong style={{ fontSize: 14 }}>Sign in with the platform</strong>
        <p className="rules" style={{ marginTop: 6 }}>
          The strongest proof: the platform tells us who you are, so nothing has to be
          published or read back.
        </p>
        <div className="filterrow" style={{ marginTop: 12 }}>
          {oauthProviders.map((p) => (
            <a
              key={p.id}
              className="chip"
              href={p.configured ? `/api/auth/${p.id}/start` : undefined}
              style={p.configured ? undefined : { opacity: 0.45, cursor: "not-allowed" }}
              title={p.configured ? "" : "Not configured on this deployment"}
            >
              {p.label}{p.configured ? "" : " (not configured)"}
            </a>
          ))}
        </div>
      </div>

      <div className="panel">
        <strong style={{ fontSize: 14 }}>Or prove it with a code in your bio</strong>
        <p className="rules" style={{ marginTop: 6 }}>
          Required for {codeOnly.join(" and ")}, where self-serve OAuth is not available.
        </p>

        {!challenge ? (
          <form onSubmit={startChallenge} style={{ marginTop: 14 }}>
            <div className="grid2">
              <div className="field">
                <label htmlFor="vp">Platform</label>
                <select id="vp" value={platform} onChange={(e) => setPlatform(e.target.value)}>
                  {PLATFORMS.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="vh">Handle</label>
                <input id="vh" value={handle} onChange={(e) => setHandle(e.target.value)}
                       placeholder="@yourhandle" required />
              </div>
            </div>
            <button className="cta" disabled={busy}>{busy ? "Working…" : "Get my code"}</button>
          </form>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div className="field">
              <label>Add this anywhere in your bio</label>
              <input readOnly value={challenge.code} onFocus={(e) => e.currentTarget.select()} />
              <div className="hint">You can delete it once verification succeeds.</div>
            </div>
            <button className="cta" onClick={check} disabled={busy}>
              {busy ? "Checking…" : "Check now"}
            </button>{" "}
            <button className="chip" onClick={() => setChallenge(null)} style={{ cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </>
  );
}
