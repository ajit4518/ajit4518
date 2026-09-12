import Link from "next/link";
import {
  MIN_NEW_BID_CENTS, MIN_RAISE_DELTA_CENTS, TOP_MARGIN_CENTS, MAX_BID_CENTS, centsToUsd,
} from "@/lib/rules";

export default function Rules() {
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand"><h1>Rules</h1></div>
        <nav className="top"><Link href="/">← Board</Link><Link href="/submit">Get listed</Link></nav>
      </header>
      <ul className="rules">
        <li>Rank is your cumulative bid. Nothing else affects it.</li>
        <li>A new listing starts at {centsToUsd(MIN_NEW_BID_CENTS)}. The maximum is {centsToUsd(MAX_BID_CENTS)}.</li>
        <li>Bids are whole US dollars.</li>
        <li>
          To climb, submit the same handle with a higher figure. You pay only the
          difference — minimum {centsToUsd(MIN_RAISE_DELTA_CENTS)} per step.
        </li>
        <li>Taking #1 requires clearing the current leader by {centsToUsd(TOP_MARGIN_CENTS)}.</li>
        <li>Equal bids keep their original order. The older bid stays higher.</li>
        <li>Positions do not expire. Only a larger bid moves you down.</li>
        <li>One payment counts on both the All-time and Today boards.</li>
        <li>
          List only an account you own or are authorised to represent. Anything else is
          removed on request, without refund.
        </li>
        <li>No link shorteners, chat or invite links, or sexual content.</li>
        <li>Clicks go to the submitted profile with no query parameters attached.</li>
      </ul>
    </div>
  );
}
