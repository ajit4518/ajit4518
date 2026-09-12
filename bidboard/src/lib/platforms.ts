import type { Platform } from "./rules";

export const PLATFORMS: {
  id: Platform;
  label: string;
  profileUrl: (handle: string) => string;
}[] = [
  { id: "x",         label: "X",         profileUrl: (h) => `https://x.com/${h}` },
  { id: "instagram", label: "Instagram", profileUrl: (h) => `https://instagram.com/${h}` },
  { id: "tiktok",    label: "TikTok",    profileUrl: (h) => `https://tiktok.com/@${h}` },
  { id: "youtube",   label: "YouTube",   profileUrl: (h) => `https://youtube.com/@${h}` },
  { id: "linkedin",  label: "LinkedIn",  profileUrl: (h) => `https://linkedin.com/company/${h}` },
];

export const PLATFORM_IDS = PLATFORMS.map((p) => p.id);

export function isPlatform(v: string | undefined | null): v is Platform {
  return !!v && (PLATFORM_IDS as string[]).includes(v);
}

export function platformLabel(id: Platform): string {
  return PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

export function profileUrlFor(id: Platform, handle: string): string {
  return PLATFORMS.find((p) => p.id === id)!.profileUrl(handle);
}
