import { NextResponse } from "next/server";
import { createFreeListing, getCategories } from "@/lib/bids";
import { getCities } from "@/lib/geo";
import { isPlatform, profileUrlFor } from "@/lib/platforms";
import { normalizeHandle } from "@/lib/rules";
import { rateLimit, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Free listing. No account, no payment — paste a handle or profile link.
 *
 * Deliberately open: gating this would starve the directory. The protections
 * are on the other side instead — nothing here can set a bid amount, every
 * listing is one-click reportable, and person listings are excluded from
 * indexing.
 */
export async function POST(req: Request) {
  const limit = await rateLimit({ key: `add:${clientKey(req)}`, limit: 20, windowMinutes: 60 });
  if (!limit.ok) return bad("Too many submissions from here. Try again later.", 429);

  const body = await req.json().catch(() => null);
  if (!body) return bad("Malformed request.");

  const { platform, handle: rawHandle, displayName, tagline, categoryId, cityId, entityType } = body;

  if (!isPlatform(platform)) return bad("Pick a platform.");

  const handle = normalizeHandle(String(rawHandle ?? ""));
  if (!handle) return bad("That handle or profile link doesn't look valid.");

  const name = String(displayName ?? "").trim().slice(0, 80);
  if (name.length < 2) return bad("Add a name.");

  const kind = entityType === "person" ? "person" : "brand";

  const categories = await getCategories();
  const category = categories.find((c) => c.id === Number(categoryId));
  if (!category) return bad("Pick a category.");

  let city = null;
  if (cityId) {
    const cities = await getCities();
    city = cities.find((c) => c.id === Number(cityId)) ?? null;
    if (!city) return bad("Unknown city.");
  }

  const result = await createFreeListing({
    platform,
    handle,
    displayName: name,
    profileUrl: profileUrlFor(platform, handle),
    tagline: String(tagline ?? "").trim().slice(0, 120) || null,
    categoryId: category.id,
    cityId: city?.id ?? null,
    entityType: kind,
  });

  if (!result.ok) return bad(result.error, 409);
  return NextResponse.json({
    ok: true,
    id: result.id,
    created: result.created,
    message: result.created ? "Added to the directory." : "That account is already listed.",
  });
}
