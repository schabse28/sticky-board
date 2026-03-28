"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Etwas ist schiefgelaufen</h2>
          <p>{error.message}</p>
          <button onClick={reset} style={{ marginTop: "1rem", padding: "0.5rem 1rem" }}>
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
