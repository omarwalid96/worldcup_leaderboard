"use client";

/**
 * Catches errors in the root layout itself. Must render its own <html>/<body>.
 * Kept dependency-free (no theme tokens) since the layout may have failed.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0b",
          color: "#fafafa",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        <h1 style={{ fontSize: 28, margin: 0 }}>Something went wrong</h1>
        <p style={{ color: "#a1a1aa", maxWidth: 360 }}>
          The app failed to load. Please reload the page.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 16,
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: "#e2b64b",
            color: "#0a0a0b",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
