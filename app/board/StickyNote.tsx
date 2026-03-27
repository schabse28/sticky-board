"use client";

import { useState, useEffect, useRef } from "react";

// Farbpalette: bg = Note-Fläche, header = Griffleiste, border = Rahmen
const COLORS: Record<string, { bg: string; header: string; border: string; text: string }> = {
  yellow: { bg: "#fef9c3", header: "#fde047", border: "#facc15", text: "#713f12" },
  green:  { bg: "#dcfce7", header: "#86efac", border: "#4ade80", text: "#14532d" },
  pink:   { bg: "#fce7f3", header: "#f9a8d4", border: "#f472b6", text: "#831843" },
  blue:   { bg: "#dbeafe", header: "#93c5fd", border: "#60a5fa", text: "#1e3a8a" },
  purple: { bg: "#f3e8ff", header: "#d8b4fe", border: "#c084fc", text: "#581c87" },
};

export interface StickyNoteProps {
  id: string;
  text: string;
  color: string;
  posX: number;
  posY: number;
  zIndex: number;
  isEditing: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onDelete: () => void;
  onTextSave: (text: string) => void;
}

export default function StickyNote({
  text,
  color,
  posX,
  posY,
  zIndex,
  isEditing,
  onDragStart,
  onDoubleClick,
  onDelete,
  onTextSave,
}: StickyNoteProps) {
  const [localText, setLocalText] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const c = COLORS[color] ?? COLORS.yellow;

  // Textarea fokussieren sobald Edit-Modus aktiv wird
  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
      // Cursor ans Ende setzen
      const len = textareaRef.current?.value.length ?? 0;
      textareaRef.current?.setSelectionRange(len, len);
    }
  }, [isEditing]);

  // Text von außen synchronisieren (z.B. nach Server-Antwort), aber nicht
  // während der Nutzer gerade tippt
  useEffect(() => {
    if (!isEditing) setLocalText(text);
  }, [text, isEditing]);

  return (
    <div
      className="absolute w-52 rounded shadow-lg"
      style={{
        left: posX,
        top: posY,
        zIndex,
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        minHeight: 180,
        // Schatten-Stapel für den "echter Klebezettel"-Effekt
        boxShadow: "2px 3px 8px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.08)",
      }}
    >
      {/* ── Griffleiste (Drag Handle) ── */}
      <div
        className="flex items-center justify-between px-2 py-1 cursor-grab active:cursor-grabbing select-none"
        style={{ backgroundColor: c.header, borderBottom: `1px solid ${c.border}` }}
        onMouseDown={onDragStart}
      >
        {/* Drei Punkte als visueller Hinweis auf Verschiebbarkeit */}
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-white/60" />
          <span className="w-2 h-2 rounded-full bg-white/60" />
          <span className="w-2 h-2 rounded-full bg-white/60" />
        </div>

        {/* Löschen-Button — stopPropagation verhindert ungewollten Drag-Start */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          title="Note löschen"
          className="w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold opacity-50 hover:opacity-100 hover:bg-red-400 hover:text-white transition"
        >
          ✕
        </button>
      </div>

      {/* ── Inhalt ── */}
      <div className="p-2" onDoubleClick={onDoubleClick}>
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onBlur={() => onTextSave(localText)}
            onKeyDown={(e) => {
              // Escape speichert ebenfalls
              if (e.key === "Escape") {
                e.currentTarget.blur();
              }
            }}
            // Drag auf der Textarea starten verhindert versehentliches Verschieben
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full resize-none bg-transparent outline-none text-sm leading-relaxed"
            style={{ color: c.text, minHeight: 130 }}
            placeholder="Text eingeben…"
          />
        ) : (
          <p
            className="text-sm leading-relaxed whitespace-pre-wrap break-words cursor-text"
            style={{ color: c.text, minHeight: 130 }}
          >
            {localText || (
              <span style={{ opacity: 0.35, fontStyle: "italic" }}>
                Doppelklick zum Bearbeiten
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
