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
      style={{ background: "rgba(0,0,0,0.4)" }}
    >
      <div className="bg-white rounded-xl border border-[#e5e7eb] shadow-lg w-full max-w-xs p-6">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-[#111827] mb-1">
            Willkommen, {username}
          </h2>
          <p className="text-sm text-[#6b7280] leading-relaxed">
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
                    : "0 0 0 1px rgba(0,0,0,0.08)",
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
              className="text-xs font-medium px-2.5 py-0.5 rounded-full"
              style={{ backgroundColor: selectedPalette.bg, color: selectedPalette.text }}
            >
              {selectedPalette.label} ausgewählt
            </span>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-500 mb-4">{error}</p>
        )}

        <button
          onClick={handleConfirm}
          disabled={!selected || saving}
          className="w-full bg-[#111827] hover:bg-[#1f2937] disabled:bg-[#d1d5db] disabled:text-[#9ca3af] disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-md transition-colors text-sm"
        >
          {saving ? "Wird gespeichert…" : "Loslegen"}
        </button>
      </div>
    </div>
  );
}
