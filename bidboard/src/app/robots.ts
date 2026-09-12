import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/config";

// Reads APP_BASE_URL at run time; prerendering would bake in the build origin.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /go/ is click tracking, not content. Person listings are reachable
        // only through the filtered board, which is excluded so the site does
        // not become an indexable people-search surface.
        disallow: ["/go/", "/api/", "/?type=person", "/success", "/verify"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
