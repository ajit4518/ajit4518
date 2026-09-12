import type { Platform } from "../rules";

export type OAuthProfile = { id: string; handle: string; displayName: string };

export type Provider = {
  id: string;
  platform: Platform;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  usePkce: boolean;
  /** Providers that need HTTP Basic auth on the token endpoint (X does). */
  basicAuth?: boolean;
  fetchProfile: (accessToken: string) => Promise<OAuthProfile>;
};

const json = async (res: Response, what: string) => {
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
  return res.json();
};

export const PROVIDERS: Record<string, Provider> = {
  x: {
    id: "x",
    platform: "x",
    label: "X",
    authorizeUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scopes: ["users.read", "tweet.read"],
    usePkce: true,
    basicAuth: true,
    async fetchProfile(token) {
      const data = await json(
        await fetch("https://api.x.com/2/users/me", {
          headers: { authorization: `Bearer ${token}` },
        }),
        "x profile",
      );
      return { id: data.data.id, handle: data.data.username, displayName: data.data.name };
    },
  },

  google: {
    id: "google",
    platform: "youtube",
    label: "YouTube",
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    usePkce: true,
    async fetchProfile(token) {
      const data = await json(
        await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
          headers: { authorization: `Bearer ${token}` },
        }),
        "youtube profile",
      );
      const ch = data.items?.[0];
      if (!ch) throw new Error("No YouTube channel on this Google account");
      return {
        id: ch.id,
        handle: String(ch.snippet.customUrl ?? "").replace(/^@/, ""),
        displayName: ch.snippet.title,
      };
    },
  },

  tiktok: {
    id: "tiktok",
    platform: "tiktok",
    label: "TikTok",
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "user.info.profile"],
    usePkce: true,
    async fetchProfile(token) {
      const data = await json(
        await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name", {
          headers: { authorization: `Bearer ${token}` },
        }),
        "tiktok profile",
      );
      const u = data.data.user;
      return { id: u.open_id, handle: u.username, displayName: u.display_name };
    },
  },
};

export function providerConfigured(id: string): boolean {
  return !!(process.env[`${id.toUpperCase()}_CLIENT_ID`] && process.env[`${id.toUpperCase()}_CLIENT_SECRET`]);
}

export function providerCreds(id: string) {
  return {
    clientId: process.env[`${id.toUpperCase()}_CLIENT_ID`] ?? "",
    clientSecret: process.env[`${id.toUpperCase()}_CLIENT_SECRET`] ?? "",
  };
}

/**
 * Why two platforms have no OAuth entry above.
 *
 * Instagram: verifying a handle requires the Facebook Graph API against a
 * Business or Creator account, behind App Review and business verification.
 * LinkedIn: proving control of a *company page* needs r_organization_admin,
 * which is partner-gated; plain sign-in only proves who the person is.
 *
 * Both therefore fall back to the bio-code challenge, which needs no
 * platform partnership.
 */
export const CODE_ONLY_PLATFORMS: Platform[] = ["instagram", "linkedin"];
