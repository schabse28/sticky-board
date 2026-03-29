"use client";

import { useState, useEffect, useRef } from "react";
import { NOTE_DEFAULT_W, NOTE_DEFAULT_H } from "@/types";

const COLORS: Record<string, { bg: string; header: string; border: string; text: string }> = {
  yellow: { bg: "#fefce8", header: "#fde047", border: "#fbbf24", text: "#78350f" },
  green:  { bg: "#f0fdf4", header: "#86efac", border: "#4ade80", text: "#14532d" },
  pink:   { bg: "#fdf2f8", header: "#f9a8d4", border: "#f472b6", text: "#831843" },
  blue:   { bg: "#eff6ff", header: "#93c5fd", border: "#60a5fa", text: "#1e3a8a" },
  purple: { bg: "#faf5ff", header: "#d8b4fe", border: "#c084fc", text: "#581c87" },
};

// ── relatives Zeitformat (Deutsch) ────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs  / 24);

  if (mins < 1)  return "gerade eben";
  if (mins < 60) return `vor ${mins} Min`;
  if (hrs  < 24) return hrs === 1 ? "vor 1 Std" : `vor ${hrs} Std`;
  if (days === 1) return "gestern";
  return `vor ${days} Tagen`;
}

// ── Props ─────────────────────────────────────────────────────────────────

export interface StickyNoteProps {
  id: string;
  text: string;
  color: string;
  posX: number;
  posY: number;
  zIndex: number;
  width?: number;
  height?: number;
  createdAt: string;
  createdByName?: string;
  isEditing: boolean;
  isDeleting?: boolean;
  isOwner?: boolean;
  canDelete?: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onDelete: () => void;
  onTextSave: (text: string) => void;
  onResizeStart?: (e: React.MouseEvent) => void;
}

// ── Komponente ────────────────────────────────────────────────────────────

export default function StickyNote({
  text,
  color,
  posX,
  posY,
  zIndex,
  width = NOTE_DEFAULT_W,
  height = NOTE_DEFAULT_H,
  createdAt,
  createdByName,
  isEditing,
  isDeleting = false,
  isOwner = true,
  canDelete = isOwner,
  onDragStart,
  onDoubleClick,
  onDelete,
  onTextSave,
  onResizeStart,
}: StickyNoteProps) {
  const [localText, setLocalText] = useState(text);
  const [relTime, setRelTime] = useState(() => formatRelativeTime(createdAt));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const c = COLORS[color] ?? COLORS.yellow;

  // Textarea fokussieren wenn Edit-Modus startet
  // Mehrere Fallbacks wegen Race Condition: beim Erstellen einer neuen Note
  // werden setNotes und setEditingId im selben Batch aufgerufen — die Textarea
  // existiert beim ersten useEffect-Lauf möglicherweise noch nicht im DOM.
  useEffect(() => {
    if (!isEditing) return;

    const focus = () => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    };

    // Sofort versuchen (funktioniert bei Doppelklick auf bestehende Note)
    focus();
    // rAF-Fallback (nach React-Commit, vor Paint)
    const raf = requestAnimationFrame(focus);
    // setTimeout-Fallback (nach Paint — deckt den Fall ab, dass die Textarea
    // erst im nächsten Render-Zyklus gemountet wird)
    const timer = setTimeout(focus, 50);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [isEditing]);

  // Text von außen synchronisieren (nicht während eigener Bearbeitung)
  useEffect(() => {
    if (!isEditing) setLocalText(text);
  }, [text, isEditing]);

  // Timestamp jede Minute aktualisieren
  useEffect(() => {
    const id = setInterval(() => setRelTime(formatRelativeTime(createdAt)), 60_000);
    return () => clearInterval(id);
  }, [createdAt]);

  return (
    <div
      className="absolute rounded-xl flex flex-col group transition-opacity duration-150"
      style={{
        left: posX,
        top: posY,
        zIndex,
        width,
        height,
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        boxShadow: isDeleting
          ? "none"
          : "0 1px 3px rgba(0,0,0,0.07), 0 6px 20px rgba(0,0,0,0.07)",
        opacity: isDeleting ? 0.4 : 1,
        pointerEvents: isDeleting ? "none" : undefined,
      }}
    >
      {/* ── Drag-Handle ──────────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 py-2 cursor-grab active:cursor-grabbing select-none rounded-t-xl"
        style={{ backgroundColor: c.header }}
        onMouseDown={onDragStart}
      >
        {/* Grip-Punkte 3×2 */}
        <div className="grid grid-cols-3 gap-[3px] opacity-40">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="w-[3px] h-[3px] rounded-full" style={{ backgroundColor: c.text }} />
          ))}
        </div>

        {/* Löschen-Button – Ersteller oder Admin */}
        {canDelete ? (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onDelete}
            disabled={isDeleting}
            title={isDeleting ? "Wird gelöscht…" : "Note löschen"}
            className="w-5 h-5 flex items-center justify-center rounded-md text-sm leading-none transition-colors"
            style={{
              color: (!isOwner) ? "#ef4444" : c.text,
              opacity: isDeleting ? 0.5 : (!isOwner ? 0.6 : 0.35),
            }}
            onMouseEnter={(e) =>
              !isDeleting && ((e.currentTarget as HTMLButtonElement).style.opacity = "1")
            }
            onMouseLeave={(e) => {
              if (!isDeleting) {
                (e.currentTarget as HTMLButtonElement).style.opacity = !isOwner ? "0.6" : "0.35";
              }
            }}
          >
            {isDeleting ? "…" : "×"}
          </button>
        ) : (
          <span className="w-5 h-5" />
        )}
      </div>

      {/* ── Inhalt ──────────────────────────────────────────────────────── */}
      <div
        className="flex-1 relative overflow-hidden"
        onDoubleClick={isOwner ? onDoubleClick : undefined}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            onBlur={() => onTextSave(localText)}
            onKeyDown={(e) => {
              if (e.key === "Escape") e.currentTarget.blur();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute inset-0 p-3 resize-none bg-transparent outline-none text-sm leading-relaxed w-full"
            style={{ color: c.text }}
            placeholder="Text eingeben…"
            autoFocus
          />
        ) : (
          <div className="absolute inset-0 p-3 overflow-y-auto">
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap break-words"
              style={{
                color: c.text,
                cursor: isOwner ? "text" : "default",
              }}
            >
              {localText || (
                <span style={{ opacity: 0.3, fontStyle: "italic" }}>
                  {isOwner ? "Doppelklick zum Bearbeiten" : "Nur lesbar"}
                </span>
              )}
            </p>
          </div>
        )}

        {/* Ersteller + Timestamp – unten im Inhaltsbereich */}
        <div
          className="absolute bottom-1.5 left-2.5 text-[10px] leading-none pointer-events-none select-none truncate"
          style={{ color: c.text, opacity: 0.28, maxWidth: "60%" }}
        >
          {isOwner ? "Du" : (createdByName ?? "")}
        </div>
        <div
          className="absolute bottom-1.5 right-2.5 text-[10px] leading-none pointer-events-none select-none"
          style={{ color: c.text, opacity: 0.28 }}
        >
          {relTime}
        </div>
      </div>

      {/* ── Resize-Handle – nur für den Ersteller ───────────────────────── */}
      {isOwner && onResizeStart && (
        <div
          className="absolute bottom-1 right-1 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity p-1"
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e); }}
          title="Größe ändern"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <line x1="1" y1="8" x2="8" y2="1" stroke={c.border} strokeWidth="1.5" strokeLinecap="round" />
            <line x1="4.5" y1="8" x2="8" y2="4.5" stroke={c.border} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
