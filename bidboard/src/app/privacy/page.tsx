import Link from "next/link";

export const metadata = { title: "Privacy policy" };

export default function Privacy() {
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand"><h1>Privacy policy</h1></div>
        <nav className="top"><Link href="/">← Board</Link><Link href="/terms">Terms</Link></nav>
      </header>

      <div className="notice">
        <strong>Template, not legal advice.</strong> It describes what the software
        actually collects, which is the useful part. A lawyer should review it against
        your jurisdiction before launch.
      </div>

      <div className="rules">
        <p><strong>Controller:</strong> [legal entity name, address, contact email]</p>

        <h3>What we collect</h3>
        <ul>
          <li><strong>Listing data</strong> — platform, handle, display name, tagline, category, city. Submitted by you or by a third party adding a public account to the directory.</li>
          <li><strong>Verification data</strong> — when you prove ownership, the platform account id returned by the provider, or the fact that a one-time code was found on your profile. We do not store platform access tokens after verification.</li>
          <li><strong>Payment data</strong> — handled by Stripe. We store the payment intent id and the amount, never card details.</li>
          <li><strong>Email</strong> — only if you supply one for a receipt.</li>
          <li><strong>Click counts</strong> — aggregate per listing per day. We do not log individual visitors or store visitor IPs against clicks.</li>
          <li><strong>Rate limiting</strong> — a truncated SHA-256 hash of your IP address, with a counter. The IP itself is never stored.</li>
        </ul>

        <h3>Lawful basis</h3>
        <p>
          For business and brand listings: legitimate interest in operating a public
          commercial directory. For paid listings: performance of a contract. For any
          listing naming an individual: we rely on your submission, and we honour removal
          requests immediately on request.
        </p>

        <h3>Individuals</h3>
        <p>
          Listings marked as a person are excluded from search engine indexing. If an
          account naming you has been listed and you want it gone, use the report link on
          the listing or contact us; unverified listings are hidden as soon as they are
          reported.
        </p>

        <h3>Your rights</h3>
        <p>
          Access, correction, erasure, restriction, objection, and portability, where
          applicable law grants them. Contact [email]. We aim to respond within 30 days.
        </p>

        <h3>Retention</h3>
        <p>
          Listings are kept while public. Payment records are kept as long as tax and
          accounting law requires. Sessions expire after 30 days. Rate-limit rows are
          transient.
        </p>

        <h3>Processors</h3>
        <p>Stripe (payments), [hosting provider], [database provider].</p>
      </div>
    </div>
  );
}
