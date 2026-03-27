"use client";

import { useState } from "react";

const PALETTE = [
  { id: "yellow", label: "Gelb",   bg: "#fde047", text: "#78350f" },
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-8">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">
            Willkommen, {username}
          </h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            Wähle deine Note-Farbe. Sie ist dauerhaft und kann nicht geändert werden.
          </p>
        </div>

        {/* Farbkreise */}
        <div className="flex justify-between mb-6">
          {PALETTE.map((c) => {
            const isSelected = selected === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                title={c.label}
                className="w-11 h-11 rounded-full transition-all duration-150 focus:outline-none"
                style={{
                  backgroundColor: c.bg,
                  boxShadow: isSelected
                    ? `0 0 0 2px white, 0 0 0 4px ${c.text}`
                    : "0 1px 4px rgba(0,0,0,0.12)",
                  transform: isSelected ? "scale(1.15)" : "scale(1)",
                }}
              />
            );
          })}
        </div>

        {/* Vorschau */}
        <div className="h-5 mb-5 flex items-center">
          {selectedPalette && (
            <span
              className="text-[11px] font-medium px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: selectedPalette.bg, color: selectedPalette.text }}
            >
              {selectedPalette.label} ausgewählt
            </span>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-500 mb-4">{error}</p>
        )}

        <button
          onClick={handleConfirm}
          disabled={!selected || saving}
          className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors text-sm"
        >
          {saving ? "Wird gespeichert…" : "Loslegen →"}
        </button>
      </div>
    </div>
  );
}
