import type { Platform } from "./rules";
import { profileUrlFor } from "./platforms";

export type ProfileFetcher = (platform: Platform, handle: string) => Promise<string>;

/**
 * Fetch a public profile page and return its visible text.
 *
 * Honest limitation: this reads server-rendered HTML. It works where the bio
 * is in the initial document and fails where the page is client-rendered or
 * gated behind a login wall, which is increasingly common. That is why OAuth
 * is the primary path and this is the fallback, not the reverse.
 */
export const httpProfileFetcher: ProfileFetcher = async (platform, handle) => {
  const res = await fetch(profileUrlFor(platform, handle), {
    headers: { "user-agent": "bidboard-verifier/1.0 (+https://example.com)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Could not read that profile (HTTP ${res.status}).`);

  const html = await res.text();
  // Strip scripts and tags; the code only ever needs to appear as visible text
  // or in a meta description.
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
};

/**
 * Dev-only seam. When MOCK_BIO_FILE points at a readable file, that file's
 * contents stand in for the fetched profile. This lets the bio-code flow be
 * exercised end to end without reaching a real platform, and works across
 * processes so a test runner can drive it.
 */
function mockFileFetcher(path: string): ProfileFetcher {
  return async () => {
    const { readFile } = await import("node:fs/promises");
    return readFile(path, "utf8");
  };
}

let override: ProfileFetcher | null = null;

/** Test seam: lets the verification flow be exercised without live network. */
export function setProfileFetcher(f: ProfileFetcher | null) {
  override = f;
}

export function getProfileFetcher(): ProfileFetcher {
  if (override) return override;
  const mockPath = process.env.MOCK_BIO_FILE;
  if (mockPath && process.env.ALLOW_MOCK_OAUTH === "1" && process.env.NODE_ENV !== "production") {
    return mockFileFetcher(mockPath);
  }
  return httpProfileFetcher;
}
