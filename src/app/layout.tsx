import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Anton, Teko } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// BODY / UI — clean, modern, high legibility. Also the default for inline stats
// (paired with tabular-nums) so leaderboard columns align.
const geistSans = Geist({
  variable: "--font-body",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// DISPLAY — ultra-bold condensed, scoreboard/poster energy. Hero headlines and
// large numerals ONLY, never body. Single weight (400) by design.
const anton = Anton({
  variable: "--font-display",
  weight: "400",
  subsets: ["latin"],
});

// NUMERIC — big displayed scoreboard numbers (scores, points, big stats).
const teko = Teko({
  variable: "--font-numeric",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  ? process.env.NEXT_PUBLIC_APP_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://worldcup-leaderboard-indol.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "GroupStage — World Cup 2026 Prediction League",
    template: "%s · GroupStage",
  },
  description:
    "Predict scorelines, climb the leaderboard, win bragging rights. A private World Cup 2026 prediction game for you and your friends.",
  applicationName: "GroupStage",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "GroupStage" },
  openGraph: {
    title: "GroupStage — World Cup 2026 Prediction League",
    description: "Predict scorelines, climb the leaderboard, win bragging rights. A private World Cup 2026 prediction game for you and your friends.",
    url: baseUrl,
    siteName: "GroupStage",
    images: [
      {
        url: "/brand-mark.jpg",
        width: 256,
        height: 256,
        alt: "GroupStage Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "GroupStage — World Cup 2026 Prediction League",
    description: "Predict scorelines, climb the leaderboard, win bragging rights. A private World Cup 2026 prediction game for you and your friends.",
    images: ["/brand-mark.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1f17",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} ${teko.variable} min-h-dvh antialiased`}
      >
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
