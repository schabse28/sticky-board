"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Benutzername oder Passwort falsch.");
    } else {
      router.push("/board");
      router.refresh();
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
        <p className="text-sm text-gray-400">Melde dich an, um loszulegen</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3">
        <div>
          <label className="block text-[11px] tracking-[0.12em] uppercase font-mono text-gray-400 mb-2">
            Benutzername
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            className="w-full bg-gray-100 rounded-2xl px-5 py-4 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:bg-gray-200 transition-colors"
            placeholder="dein_name"
          />
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
            autoComplete="current-password"
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
            {loading ? "Wird angemeldet…" : "Anmelden"}
          </button>
        </div>
      </form>

      <p className="mt-8 text-xs text-gray-400">
        Noch kein Konto?{" "}
        <Link
          href="/register"
          className="text-gray-900 underline underline-offset-2 hover:text-gray-600 transition-colors"
        >
          Registrieren
        </Link>
      </p>
    </div>
  );
}
