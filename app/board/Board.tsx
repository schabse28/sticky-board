"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { Note, Shape, BoardEvent, OnlineUser } from "@/types";
import StickyNote from "./StickyNote";
import SignOutButton from "./SignOutButton";
import ColorSetup from "./ColorSetup";
import ProfileModal from "./ProfileModal";

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
type BoardShape = Shape & { zIndex: number };
type ShapeTool = "rect" | "circle" | "arrow";

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

interface DrawingState {
  tool: ShapeTool;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface ShapeDragState {
  shapeId: string;
  startMouseX: number;
  startMouseY: number;
  startX: number;
  startY: number;
}

interface ShapeResizeState {
  shapeId: string;
  shapeType: "rect" | "circle" | "arrow";
  anchorX: number;
  anchorY: number;
  draggingTail: boolean;
  origX: number;
  origY: number;
  origWidth: number;
  origHeight: number;
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
  | { type: "note_text_changed"; noteId: string; oldText: string }
  | { type: "shape_created"; shapeId: string }
  | { type: "shape_moved"; shapeId: string; oldX: number; oldY: number }
  | { type: "shape_resized"; shapeId: string; oldX: number; oldY: number; oldWidth: number; oldHeight: number }
  | { type: "shape_deleted"; shapeData: Shape };

const UNDO_LIMIT = 10;

interface BoardProps {
  initialNotes: Note[];
  initialShapes: Shape[];
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

function arrowHeadPoints(x1: number, y1: number, x2: number, y2: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const len = 14;
  return [
    [x2 - len * Math.cos(angle - Math.PI / 7), y2 - len * Math.sin(angle - Math.PI / 7)],
    [x2, y2],
    [x2 - len * Math.cos(angle + Math.PI / 7), y2 - len * Math.sin(angle + Math.PI / 7)],
  ].map(([px, py]) => `${px},${py}`).join(" ");
}

// ── Komponente ─────────────────────────────────────────────────────────────

export default function Board({
  initialNotes,
  initialShapes,
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
  const [displayName, setDisplayName] = useState(username);
  const [currentUserColor, setCurrentUserColor] = useState<string | null>(initialUserColor);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [cursors, setCursors] = useState<Record<string, CursorState>>({});
  const [isTemporary, setIsTemporary] = useState(boardTtl !== null);
  const [isPersisting, setIsPersisting] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Shape-State
  const [shapes, setShapes] = useState<BoardShape[]>(() =>
    initialShapes.map((s, i) => ({ ...s, zIndex: i + 1 }))
  );
  const [activeTool, setActiveTool] = useState<ShapeTool | null>(null);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [drawingShape, setDrawingShape] = useState<DrawingState | null>(null);

  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const notesRef = useRef<BoardNote[]>(notes);
  const editingIdRef = useRef<string | null>(null);
  const lastCursorSentRef = useRef<number>(0);
  const undoStackRef = useRef<UndoAction[]>([]);
  const drawingRef = useRef<DrawingState | null>(null);
  const shapeDragRef = useRef<ShapeDragState | null>(null);
  const shapeResizeRef = useRef<ShapeResizeState | null>(null);
  const shapesRef = useRef<BoardShape[]>(shapes);
  const [undoCount, setUndoCount] = useState(0);

  function pushUndo(action: UndoAction) {
    undoStackRef.current.push(action);
    if (undoStackRef.current.length > UNDO_LIMIT) undoStackRef.current.shift();
    setUndoCount(undoStackRef.current.length);
  }

  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { editingIdRef.current = editingId; }, [editingId]);
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);

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

        case "user_updated":
          if (event.userId === userId) {
            if (event.displayName) setDisplayName(event.displayName);
            if (event.color) setCurrentUserColor(event.color);
          }
          setOnlineUsers((prev) =>
            prev.map((u) =>
              u.id === event.userId
                ? { ...u, name: event.displayName || u.name, color: event.color || u.color }
                : u
            )
          );
          if (event.color) {
            setNotes((prev) =>
              prev.map((n) =>
                n.userId === event.userId ? { ...n, color: event.color } : n
              )
            );
            setShapes((prev) =>
              prev.map((s) =>
                s.userId === event.userId ? { ...s, color: event.color } : s
              )
            );
          }
          break;

        // Shape-Events
        case "shape:created":
          setShapes((prev) => {
            if (prev.some((s) => s.id === event.shape.id)) return prev;
            const maxZ = Math.max(...prev.map((s) => s.zIndex), 0);
            return [...prev, { ...event.shape, zIndex: maxZ + 1 }];
          });
          break;

        case "shape:moved":
          if (shapeDragRef.current?.shapeId === event.shapeId) return;
          setShapes((prev) =>
            prev.map((s) =>
              s.id === event.shapeId ? { ...s, x: event.x, y: event.y } : s
            )
          );
          break;

        case "shape:resized":
          if (shapeResizeRef.current?.shapeId === event.shapeId) return;
          setShapes((prev) =>
            prev.map((s) =>
              s.id === event.shapeId
                ? { ...s, x: event.x, y: event.y, width: event.width, height: event.height }
                : s
            )
          );
          break;

        case "shape:deleted":
          setShapes((prev) => prev.filter((s) => s.id !== event.shapeId));
          break;
      }
    };

    es.onerror = () => {};

    return () => es.close();
  }, [currentUserColor, boardId]);

  // ── Drag & Drop + Resize + Shape-Interaktionen ─────────────────────────
  // Alle laufen über globale Mouse-Events, damit Ziehen außerhalb der
  // Element-Fläche weiterhin funktioniert.

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Note-Drag
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

      // Note-Resize
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
        return;
      }

      // Shape-Drawing (Vorschau)
      const dr = drawingRef.current;
      if (dr) {
        const canvas = document.getElementById("board-canvas");
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          dr.currentX = Math.round(e.clientX - rect.left);
          dr.currentY = Math.round(e.clientY - rect.top);
          setDrawingShape({ ...dr });
        }
        return;
      }

      // Shape-Drag
      const sd = shapeDragRef.current;
      if (sd) {
        const dx = e.clientX - sd.startMouseX;
        const dy = e.clientY - sd.startMouseY;
        setShapes((prev) =>
          prev.map((s) =>
            s.id === sd.shapeId ? { ...s, x: sd.startX + dx, y: sd.startY + dy } : s
          )
        );
        return;
      }

      // Shape-Resize
      const sr = shapeResizeRef.current;
      if (sr) {
        const canvas = document.getElementById("board-canvas");
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = Math.round(e.clientX - rect.left);
        const mouseY = Math.round(e.clientY - rect.top);

        let newX: number, newY: number, newW: number, newH: number;
        if (sr.shapeType === "arrow") {
          if (sr.draggingTail) {
            newX = mouseX; newY = mouseY;
            newW = sr.anchorX - mouseX; newH = sr.anchorY - mouseY;
          } else {
            newX = sr.anchorX; newY = sr.anchorY;
            newW = mouseX - sr.anchorX; newH = mouseY - sr.anchorY;
          }
        } else {
          newX = Math.min(sr.anchorX, mouseX);
          newY = Math.min(sr.anchorY, mouseY);
          newW = Math.abs(mouseX - sr.anchorX);
          newH = Math.abs(mouseY - sr.anchorY);
        }

        setShapes((prev) =>
          prev.map((s) =>
            s.id === sr.shapeId
              ? { ...s, x: newX, y: newY, width: newW, height: newH }
              : s
          )
        );
      }
    };

    const onMouseUp = () => {
      // Note-Drag abschließen
      const d = dragRef.current;
      if (d) {
        dragRef.current = null;
        const note = notesRef.current.find((n) => n.id === d.noteId);
        if (note) {
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

      // Note-Resize abschließen
      const r = resizeRef.current;
      if (r) {
        resizeRef.current = null;
        const note = notesRef.current.find((n) => n.id === r.noteId);
        if (note) {
          const curW = Math.round(note.width ?? NOTE_DEFAULT_W);
          const curH = Math.round(note.height ?? NOTE_DEFAULT_H);
          if (curW !== Math.round(r.startWidth) || curH !== Math.round(r.startHeight)) {
            pushUndo({ type: "note_resized", noteId: r.noteId, oldWidth: r.startWidth, oldHeight: r.startHeight });
          }
          fetch(`/api/notes/${note.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ width: curW, height: curH }),
          });
        }
        return;
      }

      // Shape-Drawing abschließen
      const dr = drawingRef.current;
      if (dr) {
        drawingRef.current = null;
        setDrawingShape(null);

        const w = dr.currentX - dr.startX;
        const h = dr.currentY - dr.startY;
        if (Math.abs(w) < 10 && Math.abs(h) < 10) return;

        let sx: number, sy: number, sw: number, sh: number;
        if (dr.tool === "arrow") {
          sx = dr.startX; sy = dr.startY; sw = w; sh = h;
        } else {
          sx = Math.min(dr.startX, dr.currentX);
          sy = Math.min(dr.startY, dr.currentY);
          sw = Math.abs(w); sh = Math.abs(h);
        }

        fetch(`/api/boards/${boardId}/shapes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: dr.tool, x: sx, y: sy, width: sw, height: sh, filled: false, strokeWidth: 2 }),
        }).then(async (res) => {
          if (res.ok) {
            const shape = (await res.json()) as Shape;
            const maxZ = Math.max(...shapesRef.current.map((s) => s.zIndex), 0);
            setShapes((prev) => [...prev, { ...shape, zIndex: maxZ + 1 }]);
            pushUndo({ type: "shape_created", shapeId: shape.id });
          }
        });
        return;
      }

      // Shape-Drag abschließen
      const sd = shapeDragRef.current;
      if (sd) {
        shapeDragRef.current = null;
        const shape = shapesRef.current.find((s) => s.id === sd.shapeId);
        if (shape && (Math.round(shape.x) !== Math.round(sd.startX) || Math.round(shape.y) !== Math.round(sd.startY))) {
          pushUndo({ type: "shape_moved", shapeId: sd.shapeId, oldX: sd.startX, oldY: sd.startY });
          fetch(`/api/boards/${boardId}/shapes/${sd.shapeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x: Math.round(shape.x), y: Math.round(shape.y) }),
          });
        }
        return;
      }

      // Shape-Resize abschließen
      const sr = shapeResizeRef.current;
      if (sr) {
        shapeResizeRef.current = null;
        const shape = shapesRef.current.find((s) => s.id === sr.shapeId);
        if (shape && (shape.x !== sr.origX || shape.y !== sr.origY || shape.width !== sr.origWidth || shape.height !== sr.origHeight)) {
          pushUndo({
            type: "shape_resized", shapeId: sr.shapeId,
            oldX: sr.origX, oldY: sr.origY, oldWidth: sr.origWidth, oldHeight: sr.origHeight,
          });
          fetch(`/api/boards/${boardId}/shapes/${sr.shapeId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              x: Math.round(shape.x), y: Math.round(shape.y),
              width: Math.round(shape.width), height: Math.round(shape.height),
            }),
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

    const savedNote = notesRef.current.find((n) => n.id === noteId);
    setDeletingIds((prev) => new Set(prev).add(noteId));

    try {
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

  // ── Shape-Interaktionen ────────────────────────────────────────────────────

  function handleBoardMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (selectedShapeId) setSelectedShapeId(null);
    if (!activeTool || !currentUserColor) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    drawingRef.current = { tool: activeTool, startX: x, startY: y, currentX: x, currentY: y };
    setDrawingShape({ tool: activeTool, startX: x, startY: y, currentX: x, currentY: y });
  }

  function handleShapeMouseDown(e: React.MouseEvent, shape: BoardShape) {
    e.stopPropagation();
    e.preventDefault();
    setSelectedShapeId(shape.id);
    if (shape.userId !== userId) return;
    const maxZ = Math.max(...shapesRef.current.map((s) => s.zIndex), 0);
    setShapes((prev) => prev.map((s) => (s.id === shape.id ? { ...s, zIndex: maxZ + 1 } : s)));
    shapeDragRef.current = {
      shapeId: shape.id,
      startMouseX: e.clientX, startMouseY: e.clientY,
      startX: shape.x, startY: shape.y,
    };
  }

  function handleShapeResizeStart(e: React.MouseEvent, shape: BoardShape, handle: string) {
    e.stopPropagation();
    e.preventDefault();
    let anchorX: number, anchorY: number;
    let draggingTail = false;
    if (shape.type === "arrow") {
      if (handle === "start") {
        anchorX = shape.x + shape.width; anchorY = shape.y + shape.height;
        draggingTail = true;
      } else {
        anchorX = shape.x; anchorY = shape.y;
      }
    } else {
      switch (handle) {
        case "nw": anchorX = shape.x + shape.width; anchorY = shape.y + shape.height; break;
        case "ne": anchorX = shape.x; anchorY = shape.y + shape.height; break;
        case "sw": anchorX = shape.x + shape.width; anchorY = shape.y; break;
        default:   anchorX = shape.x; anchorY = shape.y; break;
      }
    }
    shapeResizeRef.current = {
      shapeId: shape.id, shapeType: shape.type,
      anchorX, anchorY, draggingTail,
      origX: shape.x, origY: shape.y, origWidth: shape.width, origHeight: shape.height,
    };
  }

  async function handleDeleteShape(shapeId: string) {
    const shape = shapesRef.current.find((s) => s.id === shapeId);
    if (!shape) return;
    const isOwner = shape.userId === userId;
    if (!isOwner && !isAdmin) return;
    setShapes((prev) => prev.filter((s) => s.id !== shapeId));
    setSelectedShapeId(null);
    const res = await fetch(`/api/boards/${boardId}/shapes/${shapeId}`, { method: "DELETE" });
    if (res.ok && isOwner) {
      pushUndo({ type: "shape_deleted", shapeData: shape });
    }
  }

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

      case "shape_created":
        setShapes((prev) => prev.filter((s) => s.id !== action.shapeId));
        fetch(`/api/boards/${boardId}/shapes/${action.shapeId}`, { method: "DELETE" }).catch(() => {});
        break;

      case "shape_moved":
        setShapes((prev) =>
          prev.map((s) =>
            s.id === action.shapeId ? { ...s, x: action.oldX, y: action.oldY } : s
          )
        );
        fetch(`/api/boards/${boardId}/shapes/${action.shapeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x: action.oldX, y: action.oldY }),
        }).catch(() => {});
        break;

      case "shape_resized":
        setShapes((prev) =>
          prev.map((s) =>
            s.id === action.shapeId
              ? { ...s, x: action.oldX, y: action.oldY, width: action.oldWidth, height: action.oldHeight }
              : s
          )
        );
        fetch(`/api/boards/${boardId}/shapes/${action.shapeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            x: action.oldX, y: action.oldY, width: action.oldWidth, height: action.oldHeight,
          }),
        }).catch(() => {});
        break;

      case "shape_deleted": {
        const sd = action.shapeData;
        const shapeRes = await fetch(`/api/boards/${boardId}/shapes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: sd.type, x: sd.x, y: sd.y,
            width: sd.width, height: sd.height,
            filled: sd.filled, strokeWidth: sd.strokeWidth,
          }),
        });
        if (shapeRes.ok) {
          const restored = (await shapeRes.json()) as Shape;
          const maxZ = Math.max(...shapesRef.current.map((s) => s.zIndex), 0);
          setShapes((prev) => [...prev, { ...restored, zIndex: maxZ + 1 }]);
        }
        break;
      }
    }
  }, [boardId]);

  // Strg+Z / Cmd+Z Tastenkürzel (nicht während Textbearbeitung)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        if (editingIdRef.current) return;
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleUndo]);

  // Löschen/Escape für Shapes
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (drawingRef.current) {
          drawingRef.current = null;
          setDrawingShape(null);
          return;
        }
        setActiveTool(null);
        setSelectedShapeId(null);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedShapeId) {
        if (editingIdRef.current) return;
        e.preventDefault();
        handleDeleteShape(selectedShapeId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedShapeId]);

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
          username={displayName}
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

          {/* Shape-Tools */}
          <div className="flex items-center gap-0.5 border-l border-slate-700 pl-2">
            {([
              { tool: "rect" as const, icon: "□", title: "Rechteck" },
              { tool: "circle" as const, icon: "○", title: "Kreis" },
              { tool: "arrow" as const, icon: "→", title: "Pfeil" },
            ]).map(({ tool, icon, title }) => (
              <button
                key={tool}
                onClick={() => {
                  setActiveTool((prev) => (prev === tool ? null : tool));
                  setSelectedShapeId(null);
                }}
                title={title}
                className={`w-7 h-7 flex items-center justify-center rounded-md text-sm transition-colors ${
                  activeTool === tool
                    ? "bg-white text-slate-900"
                    : "text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                {icon}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setActiveTool(null); handleCreate(); }}
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
            <button
              onClick={() => setShowProfileModal(true)}
              title={`${displayName} – Profil bearbeiten`}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold select-none hover:scale-110 transition-transform"
              style={{
                backgroundColor: myColor.bg,
                color: myColor.text,
                boxShadow: "0 0 0 1.5px #0f172a, 0 0 0 3px " + myColor.bg,
              }}
            >
              {displayName.slice(0, 1).toUpperCase()}
            </button>
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
          cursor: activeTool ? "crosshair" : undefined,
        }}
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleBoardMouseMove}
        onMouseLeave={handleBoardMouseLeave}
        onDoubleClick={(e) => {
          if (activeTool) return;
          if (e.target !== e.currentTarget) return;
          if (!currentUserColor || isCreating) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const posX = Math.max(8, Math.round(e.clientX - rect.left - NOTE_DEFAULT_W / 2));
          const posY = Math.max(8, Math.round(e.clientY - rect.top - 14));
          handleCreate(posX, posY);
        }}
      >
        {/* ── Shape-Layer (SVG) ──────────────────────────────────────────── */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ pointerEvents: "none", zIndex: 1 }}
        >
          {[...shapes].sort((a, b) => a.zIndex - b.zIndex).map((shape) => {
            const c = SWATCH[shape.color] ?? SWATCH.yellow;
            const isSelected = selectedShapeId === shape.id;
            const isOwner = shape.userId === userId;

            return (
              <g key={shape.id}>
                {/* Shape-Body */}
                {shape.type === "rect" && (
                  <rect
                    x={shape.x} y={shape.y}
                    width={Math.abs(shape.width)} height={Math.abs(shape.height)}
                    fill={shape.filled ? c.bg + "30" : "none"}
                    stroke={c.bg} strokeWidth={2.5} rx={4}
                    style={{ pointerEvents: "auto", cursor: isOwner ? "move" : "default" }}
                    onMouseDown={(e) => handleShapeMouseDown(e, shape)}
                  />
                )}
                {shape.type === "circle" && (
                  <ellipse
                    cx={shape.x + shape.width / 2} cy={shape.y + shape.height / 2}
                    rx={Math.abs(shape.width) / 2} ry={Math.abs(shape.height) / 2}
                    fill={shape.filled ? c.bg + "30" : "none"}
                    stroke={c.bg} strokeWidth={2.5}
                    style={{ pointerEvents: "auto", cursor: isOwner ? "move" : "default" }}
                    onMouseDown={(e) => handleShapeMouseDown(e, shape)}
                  />
                )}
                {shape.type === "arrow" && (() => {
                  const x1 = shape.x, y1 = shape.y;
                  const x2 = shape.x + shape.width, y2 = shape.y + shape.height;
                  return (
                    <>
                      {/* Breitere unsichtbare Linie für einfacheres Klicken */}
                      <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke="transparent" strokeWidth={14}
                        style={{ pointerEvents: "auto", cursor: isOwner ? "move" : "default" }}
                        onMouseDown={(e) => handleShapeMouseDown(e, shape)}
                      />
                      <line x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={c.bg} strokeWidth={shape.strokeWidth ?? 2}
                        strokeLinecap="round"
                        pointerEvents="none"
                      />
                      <polygon
                        points={arrowHeadPoints(x1, y1, x2, y2)}
                        fill={c.bg} pointerEvents="none"
                      />
                    </>
                  );
                })()}

                {/* Selection-Outline + Handles */}
                {isSelected && shape.type !== "arrow" && (
                  <>
                    <rect
                      x={shape.x - 2} y={shape.y - 2}
                      width={Math.abs(shape.width) + 4} height={Math.abs(shape.height) + 4}
                      fill="none" stroke="#3b82f6" strokeWidth={1.5}
                      strokeDasharray="5 3" pointerEvents="none"
                    />
                    {[
                      { cx: shape.x, cy: shape.y, handle: "nw", cursor: "nw-resize" },
                      { cx: shape.x + shape.width, cy: shape.y, handle: "ne", cursor: "ne-resize" },
                      { cx: shape.x, cy: shape.y + shape.height, handle: "sw", cursor: "sw-resize" },
                      { cx: shape.x + shape.width, cy: shape.y + shape.height, handle: "se", cursor: "se-resize" },
                    ].map(({ cx, cy, handle, cursor }) => (
                      <rect
                        key={handle}
                        x={cx - 4} y={cy - 4} width={8} height={8}
                        fill="white" stroke="#3b82f6" strokeWidth={1.5} rx={1}
                        style={{ pointerEvents: isOwner ? "auto" : "none", cursor }}
                        onMouseDown={(e) => handleShapeResizeStart(e, shape, handle)}
                      />
                    ))}
                    {/* X-Button zum Löschen */}
                    {(isOwner || isAdmin) && (
                      <g
                        style={{ pointerEvents: "auto", cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); handleDeleteShape(shape.id); }}
                      >
                        <circle cx={shape.x + shape.width + 8} cy={shape.y - 8} r={8}
                          fill="#ef4444" />
                        <text x={shape.x + shape.width + 8} y={shape.y - 4}
                          textAnchor="middle" fill="white" fontSize={11} fontWeight={700}>
                          ×
                        </text>
                      </g>
                    )}
                  </>
                )}
                {isSelected && shape.type === "arrow" && (
                  <>
                    <circle cx={shape.x} cy={shape.y} r={5}
                      fill="white" stroke="#3b82f6" strokeWidth={1.5}
                      style={{ pointerEvents: isOwner ? "auto" : "none", cursor: "crosshair" }}
                      onMouseDown={(e) => handleShapeResizeStart(e, shape, "start")}
                    />
                    <circle
                      cx={shape.x + shape.width} cy={shape.y + shape.height} r={5}
                      fill="white" stroke="#3b82f6" strokeWidth={1.5}
                      style={{ pointerEvents: isOwner ? "auto" : "none", cursor: "crosshair" }}
                      onMouseDown={(e) => handleShapeResizeStart(e, shape, "end")}
                    />
                    {(isOwner || isAdmin) && (
                      <g
                        style={{ pointerEvents: "auto", cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); handleDeleteShape(shape.id); }}
                      >
                        <circle
                          cx={(shape.x + shape.x + shape.width) / 2}
                          cy={(shape.y + shape.y + shape.height) / 2 - 16}
                          r={8} fill="#ef4444"
                        />
                        <text
                          x={(shape.x + shape.x + shape.width) / 2}
                          y={(shape.y + shape.y + shape.height) / 2 - 12}
                          textAnchor="middle" fill="white" fontSize={11} fontWeight={700}>
                          ×
                        </text>
                      </g>
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* Drawing-Vorschau */}
          {drawingShape && currentUserColor && (() => {
            const c = SWATCH[currentUserColor] ?? SWATCH.yellow;
            const { tool, startX, startY, currentX, currentY } = drawingShape;

            if (tool === "rect") {
              const x = Math.min(startX, currentX);
              const y = Math.min(startY, currentY);
              const w = Math.abs(currentX - startX);
              const h = Math.abs(currentY - startY);
              return <rect x={x} y={y} width={w} height={h} fill="none" stroke={c.bg} strokeWidth={2.5} strokeDasharray="5 3" rx={4} pointerEvents="none" />;
            }
            if (tool === "circle") {
              const cx = (startX + currentX) / 2;
              const cy = (startY + currentY) / 2;
              const rx = Math.abs(currentX - startX) / 2;
              const ry = Math.abs(currentY - startY) / 2;
              return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={c.bg} strokeWidth={2.5} strokeDasharray="5 3" pointerEvents="none" />;
            }
            if (tool === "arrow") {
              return (
                <>
                  <line x1={startX} y1={startY} x2={currentX} y2={currentY} stroke={c.bg} strokeWidth={2} strokeDasharray="5 3" pointerEvents="none" />
                  <polygon points={arrowHeadPoints(startX, startY, currentX, currentY)} fill={c.bg} opacity={0.5} pointerEvents="none" />
                </>
              );
            }
            return null;
          })()}
        </svg>

        {/* ── Notes ──────────────────────────────────────────────────────── */}
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

        {notes.length === 0 && shapes.length === 0 && (
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

      {/* Profil-Modal */}
      {showProfileModal && currentUserColor && (
        <ProfileModal
          currentDisplayName={displayName}
          currentColor={currentUserColor}
          onClose={() => setShowProfileModal(false)}
          onSaved={(newName, newColor) => {
            setDisplayName(newName);
            setCurrentUserColor(newColor);
            setNotes((prev) =>
              prev.map((n) => (n.userId === userId ? { ...n, color: newColor } : n))
            );
          }}
        />
      )}
    </div>
  );
}
