"use client";

import { useState } from "react";

const PALETTE = [
  { id: "yellow", label: "Gelb",   bg: "#fde047", text: "#713f12" },
  { id: "green",  label: "Grün",   bg: "#86efac", text: "#14532d" },
  { id: "pink",   label: "Rosa",   bg: "#f9a8d4", text: "#831843" },
  { id: "blue",   label: "Blau",   bg: "#93c5fd", text: "#1e3a8a" },
  { id: "purple", label: "Lila",   bg: "#d8b4fe", text: "#581c87" },
];

interface ColorSetupProps {
  username: string;
  onColorSelected: (color: string) => void;
}

export default function ColorSetup({ username, onColorSelected }: ColorSetupProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!selected) return;
    setSaving(true);
    setError("");

    const res = await fetch("/api/user/color", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: selected }),
    });

    if (!res.ok) {
      const data = await res.json();
      // 409 = Farbe bereits gesetzt (Race Condition) → trotzdem fortfahren
      if (res.status === 409 && data.color) {
        onColorSelected(data.color as string);
        return;
      }
      setError(data.error ?? "Fehler beim Speichern");
      setSaving(false);
      return;
    }

    onColorSelected(selected);
  }

  const selectedPalette = PALETTE.find((c) => c.id === selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.6)", backdropFilter: "blur(2px)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
        <div className="text-5xl mb-4">🎨</div>
        <h2 className="text-xl font-bold text-gray-800 mb-1">
          Willkommen, {username}!
        </h2>
        <p className="text-gray-500 text-sm mb-6 leading-relaxed">
          Wähle deine persönliche Farbe. Sie wird dauerhaft mit dir verknüpft und
          kann <strong>nicht</strong> geändert werden.
        </p>

        {/* Farbkreise */}
        <div className="flex justify-center gap-4 mb-5">
          {PALETTE.map((c) => {
            const isSelected = selected === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                title={c.label}
                className="w-12 h-12 rounded-full transition-all duration-150 focus:outline-none"
                style={{
                  backgroundColor: c.bg,
                  border: isSelected ? `3px solid ${c.text}` : "3px solid transparent",
                  boxShadow: isSelected
                    ? `0 0 0 3px white, 0 0 0 5px ${c.text}`
                    : "0 2px 6px rgba(0,0,0,0.15)",
                  transform: isSelected ? "scale(1.18)" : "scale(1)",
                }}
              />
            );
          })}
        </div>

        {/* Vorschau */}
        <div className="h-6 mb-4 flex items-center justify-center">
          {selectedPalette && (
            <span
              className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ backgroundColor: selectedPalette.bg, color: selectedPalette.text }}
            >
              {selectedPalette.label} ausgewählt
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 mb-3">{error}</p>
        )}

        <button
          onClick={handleConfirm}
          disabled={!selected || saving}
          className="w-full bg-amber-400 hover:bg-amber-500 active:bg-amber-600 disabled:bg-amber-200 disabled:cursor-not-allowed text-amber-900 font-semibold py-2.5 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
        >
          {saving ? "Wird gespeichert…" : "Farbe wählen & loslegen →"}
        </button>
      </div>
    </div>
  );
}
