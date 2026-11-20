"use client";

/** Last resort when even the root layout fails. Plain styles, no app chrome. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="nl">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          background: "#2B1810",
          color: "#FCEBD0",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 22,
          textAlign: "center",
        }}
      >
        <main>
          <h1 style={{ fontSize: 30, margin: 0, textShadow: "3px 3px 0 #F06A1F" }}>Valse start!</h1>
          <p style={{ color: "#E9C9A0", fontSize: 17, lineHeight: 1.45 }}>
            De app kon niet laden. Probeer het over een minuutje opnieuw.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 48,
              padding: "0 22px",
              border: 0,
              borderRadius: 999,
              background: "#F06A1F",
              color: "#2B1810",
              fontWeight: 800,
              fontSize: 17,
              boxShadow: "0 4px 0 #9E3E0B",
            }}
          >
            Probeer opnieuw
          </button>
        </main>
      </body>
    </html>
  );
}
