"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

const SWATCH: Record<string, { bg: string; text: string }> = {
  yellow: { bg: "#fde047", text: "#713f12" },
  green:  { bg: "#86efac", text: "#14532d" },
  pink:   { bg: "#f9a8d4", text: "#831843" },
  blue:   { bg: "#93c5fd", text: "#1e3a8a" },
  purple: { bg: "#d8b4fe", text: "#581c87" },
};

interface ProfileModalProps {
  currentDisplayName: string;
  currentColor: string;
  onClose: () => void;
  onSaved: (displayName: string, color: string) => void;
}

export default function ProfileModal({
  currentDisplayName,
  currentColor,
  onClose,
  onSaved,
}: ProfileModalProps) {
  const { update } = useSession();
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [color, setColor] = useState(currentColor);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) {
      setError("Name muss mindestens 2 Zeichen lang sein");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, color }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Fehler beim Speichern");
        return;
      }

      // JWT-Session mit neuem Namen aktualisieren
      await update({ name });
      onSaved(name, color);
      onClose();
    } catch {
      setError("Netzwerkfehler – bitte erneut versuchen");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Profil bearbeiten</h2>
        <form onSubmit={handleSubmit}>
          <label className="text-xs font-medium text-slate-600 block mb-1">
            Anzeigename
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            autoFocus
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />

          <label className="text-xs font-medium text-slate-600 block mt-4 mb-2">
            Farbe
          </label>
          <div className="flex gap-2">
            {Object.entries(SWATCH).map(([key, c]) => (
              <button
                key={key}
                type="button"
                onClick={() => setColor(key)}
                className="w-8 h-8 rounded-full transition-transform"
                style={{
                  backgroundColor: c.bg,
                  transform: color === key ? "scale(1.25)" : "scale(1)",
                  boxShadow: color === key
                    ? `0 0 0 2px white, 0 0 0 3.5px ${c.bg}`
                    : "0 0 0 1px rgba(0,0,0,0.1)",
                }}
              />
            ))}
          </div>

          {/* Vorschau */}
          <div className="mt-4 flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold select-none flex-shrink-0"
              style={{
                backgroundColor: SWATCH[color]?.bg ?? SWATCH.yellow.bg,
                color: SWATCH[color]?.text ?? SWATCH.yellow.text,
              }}
            >
              {(displayName.trim() || "?").slice(0, 1).toUpperCase()}
            </div>
            <span className="text-xs text-slate-500 truncate">
              {displayName.trim() || "…"}
            </span>
          </div>

          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

          <div className="flex gap-2 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm text-slate-500 hover:text-slate-700 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSaving || !displayName.trim()}
              className="flex-1 text-sm bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2 rounded-xl transition-colors font-medium"
            >
              {isSaving ? "Wird gespeichert…" : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
