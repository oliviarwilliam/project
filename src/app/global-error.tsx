"use client";

// Last resort when the root layout itself fails. It must bring its own html and body.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center", padding: 16 }}>
        <main>
          <h1>TeenVest is having a problem</h1>
          <p>Please try again in a moment.</p>
          <button type="button" onClick={reset} style={{ padding: "10px 18px", borderRadius: 8, border: 0, background: "#1f54d6", color: "#fff", fontWeight: 600 }}>Try again</button>
        </main>
      </body>
    </html>
  );
}
