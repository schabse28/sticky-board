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
  username: string;
  password: string;
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  role: "admin" | "user";
}

// Öffentliche Nutzerdarstellung (ohne Passwort-Hash)
export interface UserPublic {
  id: string;
  username: string;
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
}

export interface BoardPublic extends BoardMeta {
  noteCount: number;
  onlineCount: number;
}

export type BoardEvent =
  | { type: "note:created"; note: Note }
  | { type: "note:position_updated"; noteId: string; posX: number; posY: number; byUserId: string }
  | { type: "note:text_updated"; noteId: string; text: string; byUserId: string }
  | { type: "note:resized"; noteId: string; width: number; height: number; byUserId: string }
  | { type: "note:deleted"; noteId: string; byUserId: string }
  | { type: "presence:update"; users: OnlineUser[] };
