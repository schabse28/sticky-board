"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered") === "1";
  const deleted = searchParams.get("deleted") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error === "AccountLocked") {
      setError("Zu viele Fehlversuche. Konto für 15 Minuten gesperrt.");
    } else if (result?.error) {
      setError("E-Mail oder Passwort falsch.");
    } else {
      router.push("/board");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col items-center justify-center px-6">

      {/* Logo */}
      <div className="mb-10 flex flex-col items-center">
        <div className="w-10 h-10 bg-[#111827] rounded-lg flex items-center justify-center mb-5">
          <span className="text-white text-sm font-semibold">SB</span>
        </div>
        <h1 className="text-2xl font-semibold text-[#111827]">Anmelden</h1>
        <p className="text-sm text-[#6b7280] mt-1.5">Melde dich an, um loszulegen</p>
      </div>

      {registered && !error && (
        <p className="mb-4 text-sm text-emerald-600">
          Konto erstellt – bitte melde dich an.
        </p>
      )}

      {deleted && !error && (
        <p className="mb-4 text-sm text-[#6b7280]">
          Account erfolgreich gelöscht.
        </p>
      )}

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
            Passwort
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
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
          {loading ? "Wird angemeldet…" : "Anmelden"}
        </button>
      </form>

      <p className="mt-8 text-sm text-[#6b7280]">
        Noch kein Konto?{" "}
        <Link
          href="/register"
          className="text-[#111827] underline underline-offset-2 hover:text-[#6b7280] transition-colors"
        >
          Registrieren
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
