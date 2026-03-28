"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { Note, BoardEvent, OnlineUser } from "@/types";
import StickyNote from "./StickyNote";
import SignOutButton from "./SignOutButton";
import ColorSetup from "./ColorSetup";

const SWATCH: Record<string, { bg: string; text: string }> = {
  yellow: { bg: "#fde047", text: "#713f12" },
  green:  { bg: "#86efac", text: "#14532d" },
  pink:   { bg: "#f9a8d4", text: "#831843" },
  blue:   { bg: "#93c5fd", text: "#1e3a8a" },
  purple: { bg: "#d8b4fe", text: "#581c87" },
};

// Standardmaße einer neuen Note
const NOTE_DEFAULT_W = 208;
const NOTE_DEFAULT_H = 176;
const NOTE_MIN_W = 160;
const NOTE_MIN_H = 120;

// ── Typen ──────────────────────────────────────────────────────────────────

type BoardNote = Note & { zIndex: number };

interface DragState {
  noteId: string;
  startMouseX: number;
  startMouseY: number;
  startNoteX: number;
  startNoteY: number;
}

interface ResizeState {
  noteId: string;
  startMouseX: number;
  startMouseY: number;
  startWidth: number;
  startHeight: number;
}

interface CursorState {
  x: number;
  y: number;
  displayName: string;
  color: string;
  lastUpdate: number;
}

type UndoAction =
  | { type: "note_created"; noteId: string }
  | { type: "note_moved"; noteId: string; oldPosX: number; oldPosY: number }
  | { type: "note_deleted"; noteData: Note }
  | { type: "note_resized"; noteId: string; oldWidth: number; oldHeight: number }
  | { type: "note_text_changed"; noteId: string; oldText: string };

const UNDO_LIMIT = 10;

interface BoardProps {
  initialNotes: Note[];
  boardId: string;
  boardName: string;
  username: string;
  userId: string;
  initialUserColor: string | null;
  isAdmin: boolean;
  boardTtl: number | null;
}

function formatTTL(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return m > 0 ? `${h} Std ${m} Min` : `${h} Std`;
  if (m > 0) return `${m} Min`;
  return "< 1 Min";
}

// ── Komponente ─────────────────────────────────────────────────────────────

export default function Board({
  initialNotes,
  boardId,
  boardName,
  username,
  userId,
  initialUserColor,
  isAdmin,
  boardTtl,
}: BoardProps) {
  const [notes, setNotes] = useState<BoardNote[]>(() =>
    initialNotes.map((n, i) => ({ ...n, zIndex: i + 1 }))
  );
  const [currentUserColor, setCurrentUserColor] = useState<string | null>(initialUserColor);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [cursors, setCursors] = useState<Record<string, CursorState>>({});
  const [isTemporary, setIsTemporary] = useState(boardTtl !== null);
  const [isPersisting, setIsPersisting] = useState(false);

  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const notesRef = useRef<BoardNote[]>(notes);
  const editingIdRef = useRef<string | null>(null);
  const lastCursorSentRef = useRef<number>(0);
  const undoStackRef = useRef<UndoAction[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  function pushUndo(action: UndoAction) {
    undoStackRef.current.push(action);
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
  }

  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);

  // Cursor-Cleanup: entfernt Cursor die länger als 3,5s nicht aktualisiert wurden
  // (spiegelt die Redis TTL von 3s wider, falls kein cursor_hidden Event kommt)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        const next = Object.fromEntries(
          Object.entries(prev).filter(([, c]) => now - c.lastUpdate < 3500)
        );
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── SSE ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUserColor) return;

    const es = new EventSource(`/api/events?boardId=${boardId}`);

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
            if (prev.some((n) => n.id === event.note.id)) return prev;
            const maxZ = Math.max(...prev.map((n) => n.zIndex), 0);
            return [...prev, { ...event.note, zIndex: maxZ + 1 }];
          });
          break;

        case "note:position_updated":
          if (dragRef.current?.noteId === event.noteId) return;
          setNotes((prev) =>
            prev.map((n) =>
              n.id === event.noteId ? { ...n, posX: event.posX, posY: event.posY } : n
            )
          );
          break;

        case "note:text_updated":
          if (editingIdRef.current === event.noteId) return;
          setNotes((prev) =>
            prev.map((n) =>
              n.id === event.noteId ? { ...n, text: event.text } : n
            )
          );
          break;

        case "note:resized":
          // Nicht überschreiben während wir diese Note selbst resizen
          if (resizeRef.current?.noteId === event.noteId) return;
          setNotes((prev) =>
            prev.map((n) =>
              n.id === event.noteId
                ? { ...n, width: event.width, height: event.height }
                : n
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

        case "cursor_moved":
          setCursors((prev) => ({
            ...prev,
            [event.userId]: {
              x: event.x,
              y: event.y,
              displayName: event.displayName,
              color: event.color,
              lastUpdate: Date.now(),
            },
          }));
          break;

        case "cursor_hidden":
          setCursors((prev) => {
            const next = { ...prev };
            delete next[event.userId];
            return next;
          });
          break;
      }
    };

    es.onerror = () => {};

    return () => es.close();
  }, [currentUserColor, boardId]);

  // ── Drag & Drop + Resize ─────────────────────────────────────────────────
  // Beide Interaktionen laufen über globale Mouse-Events, damit das Ziehen
  // außerhalb der Note-Fläche weiterhin funktioniert.

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Drag-Logik
      const d = dragRef.current;
      if (d) {
        const dx = e.clientX - d.startMouseX;
        const dy = e.clientY - d.startMouseY;
        setNotes((prev) =>
          prev.map((n) =>
            n.id === d.noteId
              ? { ...n, posX: d.startNoteX + dx, posY: d.startNoteY + dy }
              : n
          )
        );
        return;
      }

      // Resize-Logik
      const r = resizeRef.current;
      if (r) {
        const dx = e.clientX - r.startMouseX;
        const dy = e.clientY - r.startMouseY;
        const newWidth = Math.max(NOTE_MIN_W, r.startWidth + dx);
        const newHeight = Math.max(NOTE_MIN_H, r.startHeight + dy);
        setNotes((prev) =>
          prev.map((n) =>
            n.id === r.noteId ? { ...n, width: newWidth, height: newHeight } : n
          )
        );
      }
    };

    const onMouseUp = () => {
      // Drag beenden und Position speichern
      const d = dragRef.current;
      if (d) {
        dragRef.current = null;
        const note = notesRef.current.find((n) => n.id === d.noteId);
        if (note) {
          // Undo-Eintrag nur wenn sich die Position geändert hat
          if (Math.round(note.posX) !== Math.round(d.startNoteX) ||
              Math.round(note.posY) !== Math.round(d.startNoteY)) {
            pushUndo({ type: "note_moved", noteId: d.noteId, oldPosX: d.startNoteX, oldPosY: d.startNoteY });
          }
          fetch(`/api/notes/${note.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              posX: Math.round(note.posX),
              posY: Math.round(note.posY),
            }),
          });
        }
        return;
      }

      // Resize beenden und Größe speichern
      const r = resizeRef.current;
      if (r) {
        resizeRef.current = null;
        const note = notesRef.current.find((n) => n.id === r.noteId);
        if (note) {
          const curW = Math.round(note.width ?? NOTE_DEFAULT_W);
          const curH = Math.round(note.height ?? NOTE_DEFAULT_H);
          // Undo-Eintrag nur wenn sich die Größe geändert hat
          if (curW !== Math.round(r.startWidth) || curH !== Math.round(r.startHeight)) {
            pushUndo({ type: "note_resized", noteId: r.noteId, oldWidth: r.startWidth, oldHeight: r.startHeight });
          }
          fetch(`/api/notes/${note.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ width: curW, height: curH }),
          });
        }
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

  const handleResizeStart = useCallback((e: React.MouseEvent, note: BoardNote) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      noteId: note.id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startWidth: note.width ?? NOTE_DEFAULT_W,
      startHeight: note.height ?? NOTE_DEFAULT_H,
    };
  }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  // posXOverride/posYOverride: gesetzt beim Doppelklick auf den Hintergrund,
  // sonst zufällige Position auf dem Board.
  const handleCreate = useCallback(async (posXOverride?: number, posYOverride?: number) => {
    if (!currentUserColor || isCreating) return;
    setIsCreating(true);

    try {
      let posX: number;
      let posY: number;

      if (posXOverride !== undefined && posYOverride !== undefined) {
        posX = posXOverride;
        posY = posYOverride;
      } else {
        const canvas = document.getElementById("board-canvas");
        const rect = canvas?.getBoundingClientRect();
        posX = Math.floor(Math.random() * Math.max((rect?.width ?? 800) - 230, 100)) + 40;
        posY = Math.floor(Math.random() * Math.max((rect?.height ?? 600) - 220, 100)) + 40;
      }

      const res = await fetch(`/api/boards/${boardId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "", posX, posY }),
      });

      if (!res.ok) return;

      const note: Note = await res.json();
      const maxZ = Math.max(...notesRef.current.map((n) => n.zIndex), 0);
      setNotes((prev) => [...prev, { ...note, zIndex: maxZ + 1 }]);
      pushUndo({ type: "note_created", noteId: note.id });
      setEditingId(note.id);
    } catch (error) {
      console.error("Fehler beim Erstellen der Note:", error);
    } finally {
      setIsCreating(false);
    }
  }, [boardId, currentUserColor, isCreating]);

  const handleDelete = useCallback(async (noteId: string, noteOwnerId: string) => {
    if (editingIdRef.current === noteId) setEditingId(null);

    // Note-Daten für Undo sichern bevor sie gelöscht wird
    const savedNote = notesRef.current.find((n) => n.id === noteId);

    setDeletingIds((prev) => new Set(prev).add(noteId));

    try {
      // Admins nutzen die Admin-Route um fremde Notes zu löschen
      const isOwner = noteOwnerId === userId;
      const url = (!isOwner && isAdmin)
        ? `/api/admin/notes/${noteId}`
        : `/api/notes/${noteId}`;

      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        if (savedNote && isOwner) {
          pushUndo({ type: "note_deleted", noteData: savedNote });
        }
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      }
    } catch (error) {
      console.error("Fehler beim Löschen der Note:", error);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });
    }
  }, [isAdmin, userId]);

  const handleTextSave = useCallback(async (noteId: string, text: string) => {
    const oldNote = notesRef.current.find((n) => n.id === noteId);
    if (oldNote && oldNote.text !== text) {
      pushUndo({ type: "note_text_changed", noteId, oldText: oldNote.text });
    }
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, text } : n)));
    setEditingId(null);
    await fetch(`/api/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  }, []);

  // ── Cursor-Tracking ───────────────────────────────────────────────────────

  const handleBoardMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentUserColor) return;
    const now = Date.now();
    if (now - lastCursorSentRef.current < 50) return;
    lastCursorSentRef.current = now;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);

    fetch(`/api/boards/${boardId}/cursors`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y }),
    }).catch(() => {});
  }, [boardId, currentUserColor]);

  const handleBoardMouseLeave = useCallback(() => {
    if (!currentUserColor) return;
    fetch(`/api/boards/${boardId}/cursors`, { method: "DELETE" }).catch(() => {});
  }, [boardId, currentUserColor]);

  // ── Undo ──────────────────────────────────────────────────────────────────

  const handleUndo = useCallback(async () => {
    const action = undoStackRef.current.pop();
    if (!action) return;
    setUndoCount(undoStackRef.current.length);

    switch (action.type) {
      case "note_created":
        setNotes((prev) => prev.filter((n) => n.id !== action.noteId));
        fetch(`/api/notes/${action.noteId}`, { method: "DELETE" }).catch(() => {});
        break;

      case "note_moved":
        setNotes((prev) =>
          prev.map((n) =>
            n.id === action.noteId ? { ...n, posX: action.oldPosX, posY: action.oldPosY } : n
          )
        );
        fetch(`/api/notes/${action.noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ posX: action.oldPosX, posY: action.oldPosY }),
        }).catch(() => {});
        break;

      case "note_deleted": {
        const d = action.noteData;
        const res = await fetch(`/api/boards/${boardId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: d.text, posX: d.posX, posY: d.posY }),
        });
        if (res.ok) {
          const note: Note = await res.json();
          const maxZ = Math.max(...notesRef.current.map((n) => n.zIndex), 0);
          setNotes((prev) => [...prev, { ...note, zIndex: maxZ + 1 }]);
          // Originalmaße wiederherstellen wenn sie vom Standard abweichen
          if (d.width && d.height && (d.width !== NOTE_DEFAULT_W || d.height !== NOTE_DEFAULT_H)) {
            fetch(`/api/notes/${note.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ width: d.width, height: d.height }),
            }).catch(() => {});
            setNotes((prev) =>
              prev.map((n) => n.id === note.id ? { ...n, width: d.width, height: d.height } : n)
            );
          }
        }
        break;
      }

      case "note_resized":
        setNotes((prev) =>
          prev.map((n) =>
            n.id === action.noteId
              ? { ...n, width: action.oldWidth, height: action.oldHeight }
              : n
          )
        );
        fetch(`/api/notes/${action.noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ width: action.oldWidth, height: action.oldHeight }),
        }).catch(() => {});
        break;

      case "note_text_changed":
        setNotes((prev) =>
          prev.map((n) =>
            n.id === action.noteId ? { ...n, text: action.oldText } : n
          )
        );
        fetch(`/api/notes/${action.noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: action.oldText }),
        }).catch(() => {});
        break;
    }
  }, [boardId]);

  // Strg+Z / Cmd+Z Tastenkürzel (nicht während Textbearbeitung)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (editingIdRef.current) return; // Textfeld hat eigenes Undo
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo]);

  // ── Temporäres Board: dauerhaft machen ───────────────────────────────────

  async function handlePersistBoard() {
    setIsPersisting(true);
    try {
      const res = await fetch(`/api/boards/${boardId}/persist`, { method: "POST" });
      if (res.ok) setIsTemporary(false);
    } finally {
      setIsPersisting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const myColor = currentUserColor ? SWATCH[currentUserColor] : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Farb-Setup-Overlay */}
      {!currentUserColor && (
        <ColorSetup
          username={username}
          onColorSelected={(color) => setCurrentUserColor(color)}
        />
      )}

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 h-11 bg-slate-900 flex items-center px-4 gap-4 border-b border-slate-800">

        {/* Logo + Breadcrumb – links */}
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/boards"
            className="flex items-center gap-2 group"
            title="Alle Boards"
          >
            <div className="w-6 h-6 rounded-md bg-white/10 group-hover:bg-white/20 flex items-center justify-center flex-shrink-0 transition-colors">
              <span className="text-white text-[10px] font-bold tracking-tight">SB</span>
            </div>
          </Link>
          <span className="text-slate-600 text-sm">/</span>
          <span className="text-white font-semibold text-sm tracking-tight truncate max-w-[180px]">
            {boardName}
          </span>
        </div>

        {/* Online-Nutzer – Mitte */}
        <div className="flex-1 flex items-center justify-center">
          {onlineUsers.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <div className="flex items-center gap-1">
                {onlineUsers.slice(0, 8).map((user) => {
                  const c = SWATCH[user.color] ?? SWATCH.yellow;
                  const isMe = user.id === userId;
                  return (
                    <div
                      key={user.id}
                      title={`${user.name}${isMe ? " (du)" : ""}`}
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold select-none cursor-default flex-shrink-0"
                      style={{
                        backgroundColor: c.bg,
                        color: c.text,
                        boxShadow: isMe
                          ? `0 0 0 1.5px #0f172a, 0 0 0 3px ${c.bg}`
                          : "0 0 0 1px rgba(255,255,255,0.12)",
                      }}
                    >
                      {user.name.slice(0, 1).toUpperCase()}
                    </div>
                  );
                })}
                {onlineUsers.length > 8 && (
                  <span className="text-[11px] text-slate-500 ml-0.5">
                    +{onlineUsers.length - 8}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">
                {onlineUsers.length} online
              </span>
            </div>
          )}
        </div>

        {/* Aktionen – rechts */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1.5 rounded-lg hover:bg-white/10"
            >
              Admin
            </Link>
          )}

          <button
            onClick={handleUndo}
            disabled={undoCount === 0}
            title="Rückgängig (Strg+Z)"
            className="flex items-center gap-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-xs px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
          >
            <span className="text-sm leading-none">↩</span>
            {undoCount > 0 && <span className="tabular-nums">{undoCount}</span>}
          </button>

          <button
            onClick={() => handleCreate()}
            disabled={!currentUserColor || isCreating}
            className="flex items-center gap-1.5 bg-white hover:bg-gray-100 active:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-medium text-xs px-3 py-1.5 rounded-lg transition-colors"
          >
            {isCreating ? (
              <span className="animate-spin inline-block leading-none text-sm">⟳</span>
            ) : (
              <span className="text-base leading-none font-semibold">+</span>
            )}
            <span>{isCreating ? "Erstellt…" : "Neue Note"}</span>
          </button>

          {myColor && (
            <div
              title={username}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold cursor-default select-none"
              style={{
                backgroundColor: myColor.bg,
                color: myColor.text,
                boxShadow: "0 0 0 1.5px #0f172a, 0 0 0 3px " + myColor.bg,
              }}
            >
              {username.slice(0, 1).toUpperCase()}
            </div>
          )}

          <SignOutButton />
        </div>
      </header>

      {/* ── Temporäres-Board-Banner ──────────────────────────────────────── */}
      {isTemporary && boardTtl !== null && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4">
          <span className="text-xs text-amber-700">
            ⏱ Temporäres Board — wird in <strong>{formatTTL(boardTtl)}</strong> automatisch gelöscht
          </span>
          <button
            onClick={handlePersistBoard}
            disabled={isPersisting}
            className="flex-shrink-0 text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-medium px-3 py-1 rounded-lg transition-colors"
          >
            {isPersisting ? "Wird gespeichert…" : "Session speichern"}
          </button>
        </div>
      )}

      {/* ── Board-Fläche ─────────────────────────────────────────────────── */}
      <div
        id="board-canvas"
        className="flex-1 relative overflow-hidden"
        style={{
          backgroundColor: "#ffffff",
          backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        onMouseMove={handleBoardMouseMove}
        onMouseLeave={handleBoardMouseLeave}
        onDoubleClick={(e) => {
          // Nur Doppelklick direkt auf den Hintergrund (nicht auf eine Note)
          if (e.target !== e.currentTarget) return;
          if (!currentUserColor || isCreating) return;
          const rect = e.currentTarget.getBoundingClientRect();
          // Note mittig unter dem Cursor platzieren, Header auf Klickhöhe
          const posX = Math.max(8, Math.round(e.clientX - rect.left - NOTE_DEFAULT_W / 2));
          const posY = Math.max(8, Math.round(e.clientY - rect.top - 14));
          handleCreate(posX, posY);
        }}
      >
        {notes.map((note) => {
          const isOwner = note.userId === userId;
          const canDelete = isOwner || isAdmin;
          return (
            <StickyNote
              key={note.id}
              id={note.id}
              text={note.text}
              color={note.color}
              posX={note.posX}
              posY={note.posY}
              zIndex={note.zIndex}
              width={note.width}
              height={note.height}
              createdAt={note.createdAt}
              isEditing={editingId === note.id}
              isDeleting={deletingIds.has(note.id)}
              isOwner={isOwner}
              canDelete={canDelete}
              onDragStart={(e) => handleDragStart(e, note)}
              onDoubleClick={() => {
                if (isOwner) setEditingId(note.id);
              }}
              onDelete={() => handleDelete(note.id, note.userId)}
              onTextSave={(text) => handleTextSave(note.id, text)}
              onResizeStart={isOwner ? (e) => handleResizeStart(e, note) : undefined}
            />
          );
        })}

        {notes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-400">Das Board ist leer</p>
              <p className="text-xs text-gray-300 mt-1">
                Klicke auf &bdquo;+ Neue Note&ldquo; oder doppelklicke auf das Board
              </p>
            </div>
          </div>
        )}

        {/* Remote-Cursor der anderen Online-Nutzer */}
        {Object.entries(cursors).map(([cUserId, cursor]) => {
          const c = SWATCH[cursor.color] ?? SWATCH.yellow;
          return (
            <div
              key={cUserId}
              className="pointer-events-none select-none absolute top-0 left-0"
              style={{
                transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                transition: "transform 0.1s ease-out",
                zIndex: 10000,
              }}
            >
              <svg width="14" height="18" viewBox="0 0 14 18" fill="none">
                <path
                  d="M1.5 1.5 L1.5 14.5 L4.5 11.5 L7 17 L9 16 L6.5 10.5 L11.5 10.5 Z"
                  fill={c.bg}
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
              <div
                style={{
                  marginTop: 1,
                  marginLeft: 4,
                  backgroundColor: c.bg,
                  color: c.text,
                  fontSize: 10,
                  fontWeight: 600,
                  lineHeight: 1.4,
                  padding: "1px 5px",
                  borderRadius: 4,
                  whiteSpace: "nowrap",
                }}
              >
                {cursor.displayName}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
