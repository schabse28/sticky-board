"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== passwordConfirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Registrierung fehlgeschlagen.");
        return;
      }

      // Nach erfolgreicher Registrierung automatisch einloggen
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Registrierung hat geklappt, aber Login schlug fehl – weiterleiten
        router.push("/login?registered=1");
      } else {
        router.push("/board");
        router.refresh();
      }
    } catch {
      setError("Netzwerkfehler. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">

      {/* Brand */}
      <div className="mb-12 text-center">
        <div className="inline-flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
            <span className="text-white text-xs font-bold tracking-tight">SB</span>
          </div>
          <span className="text-xl font-semibold tracking-tight text-gray-900">
            Sticky Board
          </span>
        </div>
        <p className="text-sm text-gray-400">Erstelle dein Konto</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
        <div>
          <label className="block text-[11px] tracking-[0.12em] uppercase font-mono text-gray-400 mb-2">
            E-Mail-Adresse
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full bg-gray-100 rounded-2xl px-5 py-4 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:bg-gray-200 transition-colors"
            placeholder="deine@email.de"
          />
        </div>

        <div>
          <label className="block text-[11px] tracking-[0.12em] uppercase font-mono text-gray-400 mb-2">
            Anzeigename
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={2}
            autoComplete="nickname"
            className="w-full bg-gray-100 rounded-2xl px-5 py-4 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:bg-gray-200 transition-colors"
            placeholder="Dein Name auf dem Board"
          />
          <p className="text-[11px] text-gray-400 mt-1.5 px-1">Wird auf dem Board angezeigt</p>
        </div>

        <div>
          <label className="block text-[11px] tracking-[0.12em] uppercase font-mono text-gray-400 mb-2">
            Passwort
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full bg-gray-100 rounded-2xl px-5 py-4 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:bg-gray-200 transition-colors"
            placeholder="••••••••"
          />
          <p className="text-[11px] text-gray-400 mt-1.5 px-1">Mindestens 8 Zeichen</p>
        </div>

        <div>
          <label className="block text-[11px] tracking-[0.12em] uppercase font-mono text-gray-400 mb-2">
            Passwort bestätigen
          </label>
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full bg-gray-100 rounded-2xl px-5 py-4 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:bg-gray-200 transition-colors"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-xs text-red-500 px-1 pt-1">{error}</p>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 hover:bg-slate-800 active:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium py-4 rounded-2xl transition-colors text-sm"
          >
            {loading ? "Wird registriert…" : "Konto erstellen"}
          </button>
        </div>
      </form>

      <p className="mt-8 text-xs text-gray-400">
        Bereits registriert?{" "}
        <Link
          href="/login"
          className="text-gray-900 underline underline-offset-2 hover:text-gray-600 transition-colors"
        >
          Anmelden
        </Link>
      </p>
    </div>
  );
}
