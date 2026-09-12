import type { Metadata } from "next";
import { VERTICAL } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: `${VERTICAL.name} — ${VERTICAL.tagline}`,
  description: VERTICAL.blurb,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
