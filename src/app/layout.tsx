import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Anton, Teko, Noto_Sans_Arabic } from "next/font/google";
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

// Arabic body copy in Franco-Arabic recaps (paired with Geist for Latin runs).
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
});

const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  ? process.env.NEXT_PUBLIC_APP_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://worldcup-leaderboard-indol.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Eznii Ya Dawly — World Cup 2026 Prediction League",
    template: "%s · Eznii Ya Dawly",
  },
  description:
    "Predict scorelines, climb the leaderboard, win bragging rights. A private World Cup 2026 prediction game for you and your friends.",
  applicationName: "Eznii Ya Dawly",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Eznii Ya Dawly" },
  openGraph: {
    title: "Eznii Ya Dawly — World Cup 2026 Prediction League",
    description: "Predict scorelines, climb the leaderboard, win bragging rights. A private World Cup 2026 prediction game for you and your friends.",
    url: baseUrl,
    siteName: "Eznii Ya Dawly",
    images: [
      {
        url: "/brand-mark.jpg",
        width: 256,
        height: 256,
        alt: "Eznii Ya Dawly Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Eznii Ya Dawly — World Cup 2026 Prediction League",
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
      <head>
        {/* Next 15 only emits <meta name="mobile-web-app-capable"> and DROPS the
            legacy apple-mobile-web-app-capable. iOS Safari only honors the apple-
            prefixed one — without it iOS won't go fully standalone and IGNORES the
            startup images below. Emit it explicitly. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* iOS standalone PWA launch images. iOS ignores the manifest for the
            splash screen — it needs one apple-touch-startup-image per device
            size/orientation, matched by media query, or it shows blank white.
            Generated into /public/splash (logo on the brand-dark background). */}
        <link rel="apple-touch-startup-image" media="(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/iphone-se.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/iphone-8.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-8-plus.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-x-11pro-12mini.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/iphone-xr-11.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-xsmax-11promax.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-12-13-14.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-12-13-14-promax.png" />
        {/* 393×852@3 = iPhone 14 Pro AND 15 / 15 Pro / 16 (same logical size) */}
        <link rel="apple-touch-startup-image" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-393x852.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-14-15-promax.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-15-16-pro.png" />
        {/* 440×956@3 = iPhone 16 Pro Max */}
        <link rel="apple-touch-startup-image" media="(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/splash/iphone-16-promax.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 820px) and (device-height: 1180px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/ipad-10.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/ipad-pro-11.png" />
        <link rel="apple-touch-startup-image" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" href="/splash/ipad-pro-12.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} ${teko.variable} ${notoArabic.variable} min-h-dvh antialiased`}
      >
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
