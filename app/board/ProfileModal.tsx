"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl border border-[#e5e7eb] shadow-lg p-6 w-full max-w-sm mx-4">
        <h2 className="text-lg font-semibold text-[#111827] mb-5">Profil bearbeiten</h2>
        <form onSubmit={handleSubmit}>
          <label className="text-sm font-medium text-[#374151] block mb-1.5">
            Anzeigename
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={40}
            autoFocus
            className="w-full border border-[#e5e7eb] rounded-md px-3 py-2.5 text-sm text-[#111827] focus:border-[#9ca3af] focus:outline-none transition-colors"
          />

          <label className="text-sm font-medium text-[#374151] block mt-5 mb-2">
            Farbe
          </label>
          <div className="flex gap-2.5">
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
                    : "0 0 0 1px rgba(0,0,0,0.08)",
                }}
              />
            ))}
          </div>

          {/* Vorschau */}
          <div className="mt-4 flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold select-none flex-shrink-0"
              style={{
                backgroundColor: SWATCH[color]?.bg ?? SWATCH.yellow.bg,
                color: SWATCH[color]?.text ?? SWATCH.yellow.text,
              }}
            >
              {(displayName.trim() || "?").slice(0, 1).toUpperCase()}
            </div>
            <span className="text-sm text-[#6b7280] truncate">
              {displayName.trim() || "…"}
            </span>
          </div>

          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm text-[#6b7280] hover:text-[#111827] py-2.5 rounded-md transition-colors"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={isSaving || !displayName.trim()}
              className="flex-1 text-sm bg-[#111827] hover:bg-[#1f2937] disabled:bg-[#d1d5db] disabled:cursor-not-allowed text-white py-2.5 rounded-md transition-colors font-medium"
            >
              {isSaving ? "Wird gespeichert…" : "Speichern"}
            </button>
          </div>
        </form>

        {/* ── Account löschen ─────────────────────────────────────── */}
        <div className="mt-6 pt-5 border-t border-[#e5e7eb]">
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full text-sm text-red-500 hover:text-red-600 py-2 rounded-md hover:bg-red-50 transition-colors"
            >
              Account löschen
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-600 font-medium">
                Account wirklich löschen?
              </p>
              <p className="text-sm text-[#6b7280]">
                Alle deine Notes und Daten werden unwiderruflich gelöscht.
              </p>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(""); }}
                placeholder="Passwort zur Bestätigung"
                autoComplete="current-password"
                className="w-full border border-red-200 rounded-md px-3 py-2.5 text-sm text-[#111827] focus:border-red-400 focus:outline-none transition-colors"
              />
              {deleteError && <p className="text-sm text-red-500">{deleteError}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowDeleteConfirm(false); setDeletePassword(""); setDeleteError(""); }}
                  disabled={isDeleting}
                  className="flex-1 text-sm text-[#6b7280] hover:text-[#111827] py-2.5 rounded-md transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  disabled={isDeleting || !deletePassword}
                  onClick={async () => {
                    setIsDeleting(true);
                    setDeleteError("");
                    try {
                      const res = await fetch("/api/user/account", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ password: deletePassword }),
                      });
                      if (!res.ok) {
                        const data = await res.json();
                        setDeleteError(data.error ?? "Fehler beim Löschen");
                        return;
                      }
                      await signOut({ callbackUrl: "/login?deleted=1" });
                    } catch {
                      setDeleteError("Netzwerkfehler – bitte erneut versuchen");
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  className="flex-1 text-sm bg-red-500 hover:bg-red-600 disabled:bg-[#d1d5db] disabled:cursor-not-allowed text-white py-2.5 rounded-md transition-colors font-medium"
                >
                  {isDeleting ? "Wird gelöscht…" : "Endgültig löschen"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
