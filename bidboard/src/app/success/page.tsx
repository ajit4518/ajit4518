import Link from "next/link";

export default async function Success({
  searchParams,
}: { searchParams: Promise<{ total?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="brand"><h1>You&rsquo;re on the board</h1></div>
      </header>
      <div className="panel">
        {sp.total && <p>Your listing now sits at <strong>${Number(sp.total).toLocaleString()}</strong>.</p>}
        <p className="rules">
          Clicks to your profile are counted from now on and shown next to your listing.
          Come back and raise any time — you only ever pay the difference.
        </p>
        <p style={{ marginTop: 20 }}><Link className="cta" href="/">View the board</Link></p>
      </div>
    </div>
  );
}
