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

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
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
    <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center px-6">

      {/* Logo */}
      <div className="mb-10 flex flex-col items-center">
        <div className="w-10 h-10 bg-[#111827] rounded-lg flex items-center justify-center mb-5">
          <span className="text-white text-sm font-semibold">SB</span>
        </div>
        <h1 className="text-2xl font-semibold text-[#111827]">Konto erstellen</h1>
        <p className="text-sm text-[#6b7280] mt-1.5">Erstelle dein Konto</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-[380px] space-y-5">
        <div>
          <label className="block text-sm font-medium text-[#374151] mb-1.5">
            E-Mail-Adresse
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full border border-[#e5e7eb] rounded-md px-3 py-2.5 text-sm text-[#111827] placeholder-[#9ca3af] focus:border-[#9ca3af] focus:outline-none transition-colors"
            placeholder="deine@email.de"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#374151] mb-1.5">
            Anzeigename
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            minLength={2}
            autoComplete="nickname"
            className="w-full border border-[#e5e7eb] rounded-md px-3 py-2.5 text-sm text-[#111827] placeholder-[#9ca3af] focus:border-[#9ca3af] focus:outline-none transition-colors"
            placeholder="Dein Name auf dem Board"
          />
          <p className="text-xs text-[#9ca3af] mt-1.5">Wird auf dem Board angezeigt</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#374151] mb-1.5">
            Passwort
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full border border-[#e5e7eb] rounded-md px-3 py-2.5 text-sm text-[#111827] placeholder-[#9ca3af] focus:border-[#9ca3af] focus:outline-none transition-colors"
            placeholder="••••••••"
          />
          <p className="text-xs text-[#9ca3af] mt-1.5">Mindestens 8 Zeichen</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#374151] mb-1.5">
            Passwort bestätigen
          </label>
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            required
            autoComplete="new-password"
            className="w-full border border-[#e5e7eb] rounded-md px-3 py-2.5 text-sm text-[#111827] placeholder-[#9ca3af] focus:border-[#9ca3af] focus:outline-none transition-colors"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#111827] hover:bg-[#1f2937] disabled:bg-[#d1d5db] disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-md transition-colors text-sm"
        >
          {loading ? "Wird registriert…" : "Konto erstellen"}
        </button>
      </form>

      <p className="mt-8 text-sm text-[#6b7280]">
        Bereits registriert?{" "}
        <Link
          href="/login"
          className="text-[#111827] underline underline-offset-2 hover:text-[#6b7280] transition-colors"
        >
          Anmelden
        </Link>
      </p>
    </div>
  );
}
