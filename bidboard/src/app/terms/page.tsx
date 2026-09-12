import Link from "next/link";
import { VERTICAL } from "@/lib/config";

export const metadata = { title: "Terms of service" };

export default function Terms() {
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand"><h1>Terms of service</h1></div>
        <nav className="top"><Link href="/">← Board</Link><Link href="/privacy">Privacy</Link></nav>
      </header>

      <div className="notice">
        <strong>Template, not legal advice.</strong> This is a starting point drafted to
        match what the software actually does. Have a lawyer review it before you take
        real money, and fill in the operator details below.
      </div>

      <div className="rules">
        <p><strong>Operator:</strong> [legal entity name, address, contact email]</p>

        <h3>What this service is</h3>
        <p>
          {VERTICAL.name} is a public directory of social media accounts. Listings can be
          added free of charge by anyone. A verified account owner may pay to rank their
          listing higher. Position is determined solely by cumulative amount paid; free
          listings rank below all paid listings.
        </p>

        <h3>Listings and payment</h3>
        <ul>
          <li>Paid position is not advertising placement, endorsement, or a guarantee of traffic, clicks, or business outcomes.</li>
          <li>Payments are final. Position does not expire, but it can be displaced at any time by another party paying more.</li>
          <li>Amounts paid are non-refundable except where required by law, or where we remove your listing for a reason not caused by you.</li>
          <li>We may change the ranking rules, categories, or fee structure. Changes are not applied retroactively to amounts already paid.</li>
        </ul>

        <h3>Who may bid</h3>
        <p>
          Only a verified owner of an account may pay to rank it. Attempting to pay to
          position an account you do not control is a breach of these terms, and we may
          remove the listing without refund.
        </p>

        <h3>Acceptable content</h3>
        <p>
          No link shorteners, chat or invite links, sexual content, illegal content, or
          impersonation. We may remove any listing at our discretion.
        </p>

        <h3>Removal</h3>
        <p>
          If your account has been listed and you did not list it, you may request removal
          and we will action it. Unverified listings are hidden immediately on report.
        </p>

        <h3>Liability</h3>
        <p>
          The service is provided as is. To the extent permitted by law, our total
          liability is limited to the amount you paid us in the twelve months before the
          claim. We are not responsible for the content of linked profiles.
        </p>

        <h3>Governing law</h3>
        <p>[Jurisdiction]. Disputes are subject to the courts of [jurisdiction].</p>
      </div>
    </div>
  );
}
