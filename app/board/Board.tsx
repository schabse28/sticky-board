"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Note, BoardEvent, OnlineUser } from "@/lib/redis";
import StickyNote from "./StickyNote";
import SignOutButton from "./SignOutButton";
import ColorSetup from "./ColorSetup";

// Farbwerte für User-Avatare (gleiche Namen wie in StickyNote.tsx / ColorSetup.tsx)
const SWATCH: Record<string, { bg: string; text: string }> = {
  yellow: { bg: "#fde047", text: "#713f12" },
  green:  { bg: "#86efac", text: "#14532d" },
  pink:   { bg: "#f9a8d4", text: "#831843" },
  blue:   { bg: "#93c5fd", text: "#1e3a8a" },
  purple: { bg: "#d8b4fe", text: "#581c87" },
};

// ── Typen ──────────────────────────────────────────────────────────────────

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
  userId: string;
  initialUserColor: string | null;
}

// ── Komponente ─────────────────────────────────────────────────────────────

export default function Board({
  initialNotes,
  boardId,
  username,
  userId,
  initialUserColor,
}: BoardProps) {
  const [notes, setNotes] = useState<BoardNote[]>(() =>
    initialNotes.map((n, i) => ({ ...n, zIndex: i + 1 }))
  );
  const [currentUserColor, setCurrentUserColor] = useState<string | null>(initialUserColor);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Refs für Mouse- und SSE-Handler (kein Stale-Closure-Problem)
  const dragRef = useRef<DragState | null>(null);
  const notesRef = useRef<BoardNote[]>(notes);
  const editingIdRef = useRef<string | null>(null);

  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);

  // ── SSE – Echtzeit-Synchronisierung ──────────────────────────────────────
  // Startet erst wenn der Nutzer seine Farbe gewählt hat, damit der Server
  // die korrekte Presence-Information broadcasten kann.

  useEffect(() => {
    if (!currentUserColor) return;

    const es = new EventSource("/api/events");

    es.onmessage = (e: MessageEvent) => {
      let event: BoardEvent;
      try {
        event = JSON.parse(e.data as string) as BoardEvent;
      } catch {
        return;
      }

      switch (event.type) {
        case "note:created":
          setNotes((prev) => {
            // Deduplizieren: Note wurde von uns optimistisch hinzugefügt
            if (prev.some((n) => n.id === event.note.id)) return prev;
            const maxZ = Math.max(...prev.map((n) => n.zIndex), 0);
            return [...prev, { ...event.note, zIndex: maxZ + 1 }];
          });
          break;

        case "note:position_updated":
          // Nicht überschreiben während wir diese Note selbst ziehen
          if (dragRef.current?.noteId === event.noteId) return;
          setNotes((prev) =>
            prev.map((n) =>
              n.id === event.noteId ? { ...n, posX: event.posX, posY: event.posY } : n
            )
          );
          break;

        case "note:text_updated":
          // Nicht überschreiben während wir den Text selbst bearbeiten
          if (editingIdRef.current === event.noteId) return;
          setNotes((prev) =>
            prev.map((n) =>
              n.id === event.noteId ? { ...n, text: event.text } : n
            )
          );
          break;

        case "note:deleted":
          setNotes((prev) => prev.filter((n) => n.id !== event.noteId));
          if (editingIdRef.current === event.noteId) setEditingId(null);
          break;

        case "presence:update":
          setOnlineUsers(event.users);
          break;
      }
    };

    // EventSource reconnectet automatisch bei Verbindungsabbruch
    es.onerror = () => {};

    return () => es.close();
  }, [currentUserColor]); // startet/restartet wenn Farbe gesetzt wird

  // ── Drag & Drop ───────────────────────────────────────────────────────────

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

      const note = notesRef.current.find((n) => n.id === d.noteId);
      if (note) {
        fetch(`/api/notes/${note.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            posX: Math.round(note.posX),
            posY: Math.round(note.posY),
          }),
        });
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent, note: BoardNote) => {
    e.preventDefault();
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

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!currentUserColor) return;

    const canvas = document.getElementById("board-canvas");
    const rect = canvas?.getBoundingClientRect();
    const posX = Math.floor(Math.random() * Math.max((rect?.width ?? 800) - 230, 100)) + 40;
    const posY = Math.floor(Math.random() * Math.max((rect?.height ?? 600) - 220, 100)) + 40;

    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardId, text: "", posX, posY }),
      // Farbe wird serverseitig aus Redis gelesen – nie vom Client
    });

    if (!res.ok) return;

    const note: Note = await res.json();
    const maxZ = Math.max(...notesRef.current.map((n) => n.zIndex), 0);
    // Optimistisch hinzufügen; SSE-Echo wird dedupliziert
    setNotes((prev) => [...prev, { ...note, zIndex: maxZ + 1 }]);
    setEditingId(note.id);
  }, [boardId, currentUserColor]);

  const handleDelete = useCallback(async (noteId: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (editingIdRef.current === noteId) setEditingId(null);
    await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
  }, []);

  const handleTextSave = useCallback(async (noteId: string, text: string) => {
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, text } : n)));
    setEditingId(null);
    await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const myColor = currentUserColor ? SWATCH[currentUserColor] : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "#f1f5f9" }}>

      {/* Farb-Setup-Overlay für neue Nutzer (blockiert das Board) */}
      {!currentUserColor && (
        <ColorSetup
          username={username}
          onColorSelected={(color) => setCurrentUserColor(color)}
        />
      )}

      {/* ── Kopfzeile ──────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-5 py-2.5 flex items-center gap-3">

          {/* Logo */}
          <div className="flex items-center gap-2 mr-3">
            <span className="text-xl">📌</span>
            <span className="font-bold text-amber-800 text-base">Sticky Board</span>
          </div>

          {/* Note hinzufügen */}
          <button
            onClick={handleCreate}
            disabled={!currentUserColor}
            className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-500 active:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-amber-900 font-semibold text-sm px-4 py-2 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1"
          >
            <span className="text-base font-bold leading-none">+</span>
            Note hinzufügen
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Online-Nutzer */}
          {onlineUsers.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-medium mr-1">Online</span>
              {/* Grüner Punkt als Indikator */}
              <span className="w-2 h-2 rounded-full bg-green-400 mr-1" />
              {onlineUsers.slice(0, 10).map((user) => {
                const c = SWATCH[user.color] ?? SWATCH.yellow;
                const isMe = user.id === userId;
                return (
                  <div
                    key={user.id}
                    title={`${user.name}${isMe ? " (du)" : ""}`}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-sm cursor-default select-none transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c.bg,
                      color: c.text,
                      border: isMe ? `2.5px solid ${c.text}` : "2px solid rgba(255,255,255,0.6)",
                      boxShadow: isMe ? `0 0 0 1px ${c.bg}` : undefined,
                    }}
                  >
                    {user.name.slice(0, 1).toUpperCase()}
                  </div>
                );
              })}
              {onlineUsers.length > 10 && (
                <span className="text-xs text-slate-400 ml-0.5">
                  +{onlineUsers.length - 10}
                </span>
              )}
              <div className="w-px h-5 bg-slate-200 mx-2" />
            </div>
          )}

          {/* Eigener Avatar + Username */}
          <div className="flex items-center gap-2">
            {myColor && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: myColor.bg, color: myColor.text }}
              >
                {username.slice(0, 1).toUpperCase()}
              </div>
            )}
            <span className="text-sm font-semibold text-slate-700">{username}</span>
          </div>

          <SignOutButton />
        </div>
      </header>

      {/* ── Board-Fläche ─────────────────────────────────────────────────── */}
      <div
        id="board-canvas"
        className="flex-1 relative overflow-hidden"
        style={{
          backgroundColor: "#ffffff",
          backgroundImage: "radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)",
          backgroundSize: "28px 28px",
        }}
      >
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

        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <div className="text-center" style={{ color: "#94a3b8" }}>
              <div className="text-7xl mb-5">🗒️</div>
              <p className="text-xl font-semibold">Das Board ist leer</p>
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
