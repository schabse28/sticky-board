"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Note } from "@/lib/redis";
import StickyNote from "./StickyNote";
import SignOutButton from "./SignOutButton";

// ── Farbauswahl ────────────────────────────────────────────────────────────

const PALETTE = [
  { id: "yellow", label: "Gelb",  swatch: "#fde047" },
  { id: "green",  label: "Grün",  swatch: "#86efac" },
  { id: "pink",   label: "Rosa",  swatch: "#f9a8d4" },
  { id: "blue",   label: "Blau",  swatch: "#93c5fd" },
  { id: "purple", label: "Lila",  swatch: "#d8b4fe" },
];

// ── Typen ──────────────────────────────────────────────────────────────────

// Erweitert Note um lokalen zIndex für die Render-Reihenfolge (nicht in Redis)
type BoardNote = Note & { zIndex: number };

interface DragState {
  noteId: string;
  startMouseX: number;
  startMouseY: number;
  startNoteX: number;
  startNoteY: number;
}

interface BoardProps {
  initialNotes: Note[];
  boardId: string;
  username: string;
}

// ── Komponente ─────────────────────────────────────────────────────────────

export default function Board({ initialNotes, boardId, username }: BoardProps) {
  const [notes, setNotes] = useState<BoardNote[]>(() =>
    initialNotes.map((n, i) => ({ ...n, zIndex: i + 1 }))
  );
  const [selectedColor, setSelectedColor] = useState("yellow");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Refs für Mouse-Handler ohne Stale-Closure-Probleme
  const dragRef = useRef<DragState | null>(null);
  const notesRef = useRef<BoardNote[]>(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  // Globale Mouse-Events auf window: Drag funktioniert auch wenn die Maus
  // die Note verlässt (schnelles Bewegen).
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startMouseX;
      const dy = e.clientY - d.startMouseY;
      setNotes((prev) =>
        prev.map((n) =>
          n.id === d.noteId
            ? { ...n, posX: d.startNoteX + dx, posY: d.startNoteY + dy }
            : n
        )
      );
    };

    const onMouseUp = () => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;

      // Finale Position in Redis persistieren
      const note = notesRef.current.find((n) => n.id === d.noteId);
      if (note) {
        fetch(`/api/notes/${note.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ posX: Math.round(note.posX), posY: Math.round(note.posY) }),
        });
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []); // leere Deps: läuft einmal, liest State immer via Ref

  const handleDragStart = useCallback((e: React.MouseEvent, note: BoardNote) => {
    e.preventDefault();
    // Gezogene Note nach vorne bringen
    const maxZ = Math.max(...notesRef.current.map((n) => n.zIndex), 0);
    setNotes((prev) =>
      prev.map((n) => (n.id === note.id ? { ...n, zIndex: maxZ + 1 } : n))
    );
    dragRef.current = {
      noteId: note.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startNoteX: note.posX,
      startNoteY: note.posY,
    };
  }, []);

  // ── Note erstellen ───────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    const canvas = document.getElementById("board-canvas");
    const rect = canvas?.getBoundingClientRect();
    // Zufällige Position innerhalb der sichtbaren Fläche
    const posX = Math.floor(Math.random() * Math.max((rect?.width ?? 800) - 230, 100)) + 40;
    const posY = Math.floor(Math.random() * Math.max((rect?.height ?? 600) - 220, 100)) + 40;

    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, text: "", color: selectedColor, posX, posY }),
    });

    if (!res.ok) return;

    const note: Note = await res.json();
    const maxZ = Math.max(...notesRef.current.map((n) => n.zIndex), 0);
    setNotes((prev) => [...prev, { ...note, zIndex: maxZ + 1 }]);
    // Neue Note sofort in den Bearbeitungsmodus
    setEditingId(note.id);
  }, [boardId, selectedColor]);

  // ── Note löschen ─────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (noteId: string) => {
    // Optimistisch aus dem UI entfernen
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (editingId === noteId) setEditingId(null);
    await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
  }, [editingId]);

  // ── Text speichern ───────────────────────────────────────────────────────

  const handleTextSave = useCallback(async (noteId: string, text: string) => {
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, text } : n)));
    setEditingId(null);
    await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#f1f5f9" }}>

      {/* ── Kopfzeile ──────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-5 py-2.5 flex items-center gap-4">

          {/* Logo */}
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xl">📌</span>
            <span className="font-bold text-amber-800 text-base">Sticky Board</span>
          </div>

          {/* Farbpalette */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wide mr-1">
              Farbe
            </span>
            {PALETTE.map((c) => (
              <button
                key={c.id}
                title={c.label}
                onClick={() => setSelectedColor(c.id)}
                className="w-6 h-6 rounded-full transition-all hover:scale-110 focus:outline-none"
                style={{
                  backgroundColor: c.swatch,
                  border: selectedColor === c.id
                    ? "2.5px solid #1e293b"
                    : "2px solid transparent",
                  boxShadow: selectedColor === c.id ? "0 0 0 1px #94a3b8" : "none",
                  transform: selectedColor === c.id ? "scale(1.15)" : "scale(1)",
                }}
              />
            ))}
          </div>

          {/* Note hinzufügen */}
          <button
            onClick={handleCreate}
            className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-500 active:bg-amber-600 text-amber-900 font-semibold text-sm px-4 py-2 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 ml-1"
          >
            <span className="text-base font-bold leading-none">+</span>
            Note hinzufügen
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Benutzer + Abmelden */}
          <span className="text-sm text-slate-500">
            <span className="font-semibold text-amber-700">{username}</span>
          </span>
          <SignOutButton />
        </div>
      </header>

      {/* ── Board-Fläche ────────────────────────────────────────────────── */}
      <div
        id="board-canvas"
        className="flex-1 relative overflow-hidden"
        style={{
          // Canva-ähnliches Punktraster
          backgroundColor: "#ffffff",
          backgroundImage:
            "radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)",
          backgroundSize: "28px 28px",
        }}
      >
        {/* Notes */}
        {notes.map((note) => (
          <StickyNote
            key={note.id}
            id={note.id}
            text={note.text}
            color={note.color}
            posX={note.posX}
            posY={note.posY}
            zIndex={note.zIndex}
            isEditing={editingId === note.id}
            onDragStart={(e) => handleDragStart(e, note)}
            onDoubleClick={() => setEditingId(note.id)}
            onDelete={() => handleDelete(note.id)}
            onTextSave={(text) => handleTextSave(note.id, text)}
          />
        ))}

        {/* Leerzustand */}
        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <div className="text-center" style={{ color: "#94a3b8" }}>
              <div className="text-7xl mb-5">🗒️</div>
              <p className="text-xl font-semibold">Noch keine Notes</p>
              <p className="text-sm mt-2 opacity-75">
                Klicke auf „+ Note hinzufügen" um loszulegen
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
