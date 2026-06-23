import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.eznii.dawly",
  appName: "Eznii Ya Dawly",
  // webDir is a required field but we load the live server via server.url.
  // The native WebView never loads files from here — only used by `cap sync`.
  // ponytail: webDir points at public/ (static assets); server.url overrides.
  webDir: "public",
  server: {
    // The native shell loads the live Vercel deployment.
    // Content updates ship without app-store review.
    url: "https://worldcup-leaderboard-indol.vercel.app",
    cleartext: false,
    // Allow the WebView to navigate these origins without opening a browser.
    // *.supabase.co covers auth redirects so login keeps working in-app.
    allowNavigation: [
      "worldcup-leaderboard-indol.vercel.app",
      "*.supabase.co",
    ],
  },
  ios: {
    // contentInset:always so our header's env(safe-area-inset-top) works.
    contentInset: "always",
  },
  android: {
    backgroundColor: "#0A0A0B",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0A0A0B",
      showSpinner: false,
      // The generated splash assets will appear here after `npx @capacitor/assets generate`.
    },
    StatusBar: {
      // Light text (white clock/icons) on our black header.
      style: "DARK",
      backgroundColor: "#0A0A0B",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
