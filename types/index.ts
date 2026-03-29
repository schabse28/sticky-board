// Zentrale TypeScript-Interfaces und Konstanten für die Sticky Board Webanwendung.
// Alle anderen Dateien importieren Typen und Konstanten von hier – nie doppelt definieren.

// ── Note-Größen-Konstanten ────────────────────────────────────────────────────
export const NOTE_DEFAULT_W = 208;
export const NOTE_DEFAULT_H = 176;
export const NOTE_MIN_W = 160;
export const NOTE_MIN_H = 120;

export interface NoteData {
  text: string;
  color: string;
  posX: number;
  posY: number;
  userId: string;
  width?: number;   // px, default 208 (w-52)
  height?: number;  // px, default 176
  createdByName?: string;
}

export interface Note extends NoteData {
  id: string;
  boardId: string;
  createdAt: string;
}

export interface ShapeData {
  type: "rect" | "circle" | "arrow";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  filled: boolean;
  strokeWidth: number;
  userId: string;
}

export interface Shape extends ShapeData {
  id: string;
  boardId: string;
  createdAt: string;
}

export interface UserData {
  email: string;
  displayName: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  createdAt: string;
  role: "admin" | "user";
  loginAttempts?: number;
  lockedUntil?: string | null;
}

// Öffentliche Nutzerdarstellung (ohne Passwort-Hash)
export interface UserPublic {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  role: "admin" | "user";
  color: string | null;
  lastSeen: string | null;
  isOnline: boolean;
}

export interface OnlineUser {
  id: string;
  name: string;
  color: string;
}

export interface BoardMeta {
  id: string;
  name: string;
  createdBy: string;   // userId (oder "system" für migrierte Boards)
  createdAt: string;
  temporary?: boolean;
  expiresAt?: string | null;
}

export interface BoardPublic extends BoardMeta {
  noteCount: number;
  onlineCount: number;
  ttlSeconds: number | null; // null = dauerhaft, > 0 = verbleibende Sekunden
}

export type BoardEvent =
  | { type: "note:created"; note: Note }
  | { type: "note:position_updated"; noteId: string; posX: number; posY: number; byUserId: string }
  | { type: "note:text_updated"; noteId: string; text: string; byUserId: string }
  | { type: "note:resized"; noteId: string; width: number; height: number; byUserId: string }
  | { type: "note:deleted"; noteId: string; byUserId: string }
  | { type: "presence:update"; users: OnlineUser[] }
  | { type: "cursor_moved"; userId: string; displayName: string; color: string; x: number; y: number }
  | { type: "cursor_hidden"; userId: string }
  | { type: "user_updated"; userId: string; displayName: string; color: string }
  | { type: "shape:created"; shape: Shape }
  | { type: "shape:moved"; shapeId: string; x: number; y: number; byUserId: string }
  | { type: "shape:resized"; shapeId: string; x: number; y: number; width: number; height: number; byUserId: string }
  | { type: "shape:deleted"; shapeId: string; byUserId: string };
