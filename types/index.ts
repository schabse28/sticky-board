// Zentrale TypeScript-Interfaces für die Sticky Board Webanwendung.
// Alle anderen Dateien importieren Typen von hier – nie doppelt definieren.

export interface NoteData {
  text: string;
  color: string;
  posX: number;
  posY: number;
  userId: string;
  width?: number;   // px, default 208 (w-52)
  height?: number;  // px, default 176
}

export interface Note extends NoteData {
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
  | { type: "cursor_hidden"; userId: string };
