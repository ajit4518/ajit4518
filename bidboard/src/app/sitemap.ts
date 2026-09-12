import type { MetadataRoute } from "next";
import { getPopulatedCities } from "@/lib/geo";
import { getCategories } from "@/lib/bids";
import { BASE_URL } from "@/lib/config";

// Must NOT be statically prerendered. It depends on APP_BASE_URL, which is
// read at run time, and on which cities currently have listings, which changes
// as they arrive. Prerendering bakes in the build machine's origin — that is
// how a sitemap ships full of localhost URLs.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

/**
 * Only cities that have listings, and only category pages for cities with
 * enough depth to be worth a page. Publishing an empty page per city x
 * category would be thousands of thin URLs, which is actively harmful.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [cities, categories] = await Promise.all([getPopulatedCities(1), getCategories()]);

  const staticPages = ["", "/directory", "/add", "/rules"].map((p) => ({
    url: `${BASE_URL}${p}`,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.6,
  }));

  const cityPages = cities.map((c) => ({
    url: `${BASE_URL}/in/${c.country_slug}/${c.city_slug}`,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  const deepCities = cities.filter((c) => Number(c.listings) >= 5);
  const categoryPages = deepCities.flatMap((c) =>
    categories.map((cat) => ({
      url: `${BASE_URL}/in/${c.country_slug}/${c.city_slug}?category=${cat.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  );

  return [...staticPages, ...cityPages, ...categoryPages];
}
