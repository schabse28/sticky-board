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
    <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Titelbereich */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📌</div>
          <h1 className="text-3xl font-bold text-amber-900">Sticky Board</h1>
          <p className="text-amber-700 mt-1">Melde dich an, um loszulegen</p>
        </div>

        {/* Karte */}
        <div className="bg-white rounded-2xl shadow-lg p-8 border border-amber-100">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Anmelden</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Benutzername
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                placeholder="dein_name"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Passwort
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-400 hover:bg-amber-500 disabled:bg-amber-200 text-amber-900 font-semibold py-2.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
            >
              {loading ? "Wird angemeldet…" : "Anmelden"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Noch kein Konto?{" "}
            <Link
              href="/register"
              className="text-amber-600 hover:text-amber-700 font-medium"
            >
              Registrieren
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
