import { query } from "./db";

export type Country = { code: string; name: string; slug: string };
export type City = { id: number; name: string; slug: string; country_code: string; country_name?: string };

export async function getCountries(): Promise<Country[]> {
  return query<Country>("SELECT code, name, slug FROM countries ORDER BY name");
}

export async function getCities(countryCode?: string | null): Promise<City[]> {
  if (countryCode) {
    return query<City>(
      `SELECT id, name, slug, country_code FROM cities
       WHERE country_code = $1 ORDER BY sort_order, name`,
      [countryCode],
    );
  }
  return query<City>(
    "SELECT id, name, slug, country_code FROM cities ORDER BY country_code, sort_order, name",
  );
}

export async function findCity(countrySlug: string, citySlug: string): Promise<City | null> {
  const rows = await query<City>(
    `SELECT ci.id, ci.name, ci.slug, ci.country_code, co.name AS country_name
     FROM cities ci JOIN countries co ON co.code = ci.country_code
     WHERE co.slug = $1 AND ci.slug = $2`,
    [countrySlug, citySlug],
  );
  return rows[0] ?? null;
}

/**
 * Only cities that actually have listings.
 *
 * Used for the directory index and the sitemap: generating a page for every
 * city in the table would publish thousands of empty pages, which search
 * engines read as thin content and which make the site look abandoned.
 */
export async function getPopulatedCities(minListings = 1) {
  return query<{
    country_slug: string; country_name: string;
    city_slug: string; city_name: string; listings: string;
  }>(
    `SELECT co.slug AS country_slug, co.name AS country_name,
            ci.slug AS city_slug, ci.name AS city_name,
            COUNT(l.id)::text AS listings
     FROM cities ci
     JOIN countries co ON co.code = ci.country_code
     JOIN listings l ON l.city_id = ci.id AND l.status = 'active'
     GROUP BY co.slug, co.name, ci.slug, ci.name, ci.sort_order
     HAVING COUNT(l.id) >= $1
     ORDER BY COUNT(l.id) DESC, ci.sort_order`,
    [minListings],
  );
}
