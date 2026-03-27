/**
 * Redis-Datenschicht für die Sticky Board Webanwendung
 *
 * Warum Redis statt SQL?
 * ---------------------
 * 1. Kein festes Schema: Notes können jederzeit neue Felder erhalten (z.B. fontSize,
 *    rotation) ohne Migrationen. Redis Hashes speichern beliebige Key-Value-Paare.
 *
 * 2. Schnelle Key-Value Lookups: Der Zugriff auf eine einzelne Note via "note:{id}"
 *    ist O(1) – kein Table-Scan, kein JOIN, kein Query-Planner-Overhead.
 *
 * 3. Natürliche Datenstrukturen: Ein Board mit seinen Notes passt perfekt als
 *    Redis Set ("board:{boardId}:notes"). SMEMBERS liefert alle Note-IDs in O(N)
 *    ohne komplexe Abfragen.
 *
 * 4. Niedrige Latenz: Redis hält alle Daten im Arbeitsspeicher. Für eine
 *    kollaborative Echtzeit-App (viele kleine Lese-/Schreiboperationen bei
 *    Drag & Drop) ist das entscheidend.
 *
 * 5. Einfaches horizontales Skalieren: Redis Cluster oder Read Replicas lassen
 *    sich ohne Schema-Änderungen ergänzen.
 */

import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Verbindung
// ---------------------------------------------------------------------------

// Singleton-Pattern: In Next.js (Hot-Reload / Serverless) wird bei jedem
// Modul-Reload eine neue Verbindung geöffnet, wenn wir nicht im globalen
// Scope cachen.
declare global {
  // eslint-disable-next-line no-var
  var _redisClient: Redis | undefined;
}

function getRedisClient(): Redis {
  if (!global._redisClient) {
    global._redisClient = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      // Automatisches Reconnect mit exponentiellem Backoff
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    });

    global._redisClient.on("error", (err) => {
      console.error("[Redis] Verbindungsfehler:", err);
    });
  }
  return global._redisClient;
}

export const redis = getRedisClient();

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface NoteData {
  text: string;
  color: string;
  posX: number;
  posY: number;
  userId: string;
}

export interface Note extends NoteData {
  id: string;
  boardId: string;
  createdAt: string;
}

export interface UserData {
  username: string;
  password: string; // wird als Hash gespeichert
}

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Key-Schemata
// ---------------------------------------------------------------------------
// Konsistente Schlüsselnamen vermeiden Kollisionen und erleichtern das Debuggen.

const keys = {
  note: (noteId: string) => `note:${noteId}`,
  boardNotes: (boardId: string) => `board:${boardId}:notes`,
  user: (userId: string) => `user:${userId}`,
  userByUsername: (username: string) => `username:${username}`,
};

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/**
 * Erstellt eine neue Note und verknüpft sie mit dem Board.
 *
 * Datenhaltung:
 *   - Redis Hash  "note:{id}"              → alle Felder der Note
 *   - Redis Set   "board:{boardId}:notes"  → Menge aller Note-IDs des Boards
 *
 * Das Set ermöglicht O(1)-Prüfung der Zugehörigkeit und einfaches Auflisten
 * aller Notes eines Boards, ohne einen sekundären Index pflegen zu müssen.
 */
export async function createNote(boardId: string, noteData: NoteData): Promise<Note> {
  const id = uuidv4();
  const createdAt = new Date().toISOString();

  const note: Note = {
    id,
    boardId,
    createdAt,
    ...noteData,
  };

  // Hash-Felder müssen als flaches String-Objekt übergeben werden
  const hashFields: Record<string, string> = {
    id,
    boardId,
    text: note.text,
    color: note.color,
    posX: String(note.posX),
    posY: String(note.posY),
    userId: note.userId,
    createdAt,
  };

  // Pipeline: beide Operationen atomar und in einem Netzwerk-Roundtrip
  const pipeline = redis.pipeline();
  pipeline.hset(keys.note(id), hashFields);
  pipeline.sadd(keys.boardNotes(boardId), id);
  await pipeline.exec();

  return note;
}

/**
 * Gibt alle Notes eines Boards zurück.
 *
 * Vorgehen:
 *   1. SMEMBERS liefert alle Note-IDs aus dem Board-Set.
 *   2. Für jede ID wird der zugehörige Hash per HGETALL geladen.
 *
 * Da Redis im Arbeitsspeicher arbeitet, ist das auch bei vielen Notes
 * deutlich schneller als ein SQL SELECT mit WHERE-Bedingung auf nicht
 * indizierten Spalten.
 */
export async function getNotesByBoard(boardId: string): Promise<Note[]> {
  const noteIds = await redis.smembers(keys.boardNotes(boardId));

  if (noteIds.length === 0) return [];

  // Pipeline für alle HGETALL-Aufrufe: ein Roundtrip statt N Roundtrips
  const pipeline = redis.pipeline();
  for (const id of noteIds) {
    pipeline.hgetall(keys.note(id));
  }
  const results = await pipeline.exec();

  if (!results) return [];

  const notes: Note[] = [];
  for (const [err, data] of results) {
    if (err || !data || typeof data !== "object") continue;

    const hash = data as Record<string, string>;
    if (!hash.id) continue; // verwaiste Set-Einträge überspringen

    notes.push({
      id: hash.id,
      boardId: hash.boardId,
      text: hash.text,
      color: hash.color,
      posX: Number(hash.posX),
      posY: Number(hash.posY),
      userId: hash.userId,
      createdAt: hash.createdAt,
    });
  }

  return notes;
}

/**
 * Aktualisiert ausschließlich die Position einer Note.
 *
 * HSET auf einzelne Felder ist deutlich effizienter als das Lesen,
 * Modifizieren und Zurückschreiben des gesamten Datensatzes – in SQL
 * wäre das ein UPDATE mit WHERE, der intern ebenfalls einen Zeiger
 * auf die Zeile braucht. Redis macht es einfacher und schneller.
 */
export async function updateNotePosition(
  noteId: string,
  posX: number,
  posY: number
): Promise<void> {
  // Prüfen ob die Note existiert, bevor wir versuchen sie zu aktualisieren
  const exists = await redis.exists(keys.note(noteId));
  if (!exists) {
    throw new Error(`Note ${noteId} nicht gefunden`);
  }

  await redis.hset(keys.note(noteId), {
    posX: String(posX),
    posY: String(posY),
  });
}

/**
 * Löscht eine Note und entfernt sie aus dem Board-Set.
 *
 * Das Board-Set und der Hash müssen gemeinsam bereinigt werden –
 * sonst entstehen verwaiste Set-Einträge, die auf nicht mehr
 * existierende Hashes zeigen. Pipeline stellt sicher, dass beide
 * Operationen in einem Roundtrip ausgeführt werden.
 */
export async function deleteNote(noteId: string): Promise<void> {
  // boardId aus dem Hash lesen, um das korrekte Set zu aktualisieren
  const boardId = await redis.hget(keys.note(noteId), "boardId");

  const pipeline = redis.pipeline();
  pipeline.del(keys.note(noteId));
  if (boardId) {
    pipeline.srem(keys.boardNotes(boardId), noteId);
  }
  await pipeline.exec();
}

// ---------------------------------------------------------------------------
// Benutzer
// ---------------------------------------------------------------------------

/**
 * Legt einen neuen Benutzer an.
 *
 * Das Passwort wird mit bcrypt gehasht – niemals Klartext in Redis speichern.
 * Zwei Hash-Keys:
 *   - "user:{id}"           → alle Benutzerdaten
 *   - "username:{username}" → Lookup-Key (O(1) Suche nach Username)
 *
 * In SQL bräuchten wir einen UNIQUE-Index auf username. Redis löst das
 * eleganter: Der Key "username:{name}" existiert genau dann, wenn der
 * Benutzername vergeben ist.
 */
export async function createUser(userData: UserData): Promise<User> {
  // Sicherstellen, dass der Benutzername noch nicht existiert
  const existingId = await redis.get(keys.userByUsername(userData.username));
  if (existingId) {
    throw new Error(`Benutzername "${userData.username}" ist bereits vergeben`);
  }

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const passwordHash = await bcrypt.hash(userData.password, 12);

  const user: User = {
    id,
    username: userData.username,
    passwordHash,
    createdAt,
  };

  const pipeline = redis.pipeline();
  pipeline.hset(keys.user(id), {
    id,
    username: user.username,
    passwordHash,
    createdAt,
  });
  // Reverse-Lookup: Username → User-ID
  pipeline.set(keys.userByUsername(userData.username), id);
  await pipeline.exec();

  return user;
}

/**
 * Gibt einen Benutzer anhand seines Usernamens zurück.
 *
 * Zweistufiger Lookup:
 *   1. "username:{name}" → User-ID (String, O(1))
 *   2. "user:{id}"       → Benutzerdaten (Hash, O(1))
 *
 * Dieser Ansatz vermeidet einen Table-Scan über alle User-Hashes,
 * der in SQL ohne Index ebenfalls teuer wäre.
 */
export async function getUser(username: string): Promise<User | null> {
  const userId = await redis.get(keys.userByUsername(username));
  if (!userId) return null;

  const hash = await redis.hgetall(keys.user(userId));
  if (!hash || !hash.id) return null;

  return {
    id: hash.id,
    username: hash.username,
    passwordHash: hash.passwordHash,
    createdAt: hash.createdAt,
  };
}

/**
 * Überprüft Benutzername und Passwort.
 * Gibt den User zurück wenn die Credentials korrekt sind, sonst null.
 */
export async function verifyUser(username: string, password: string): Promise<User | null> {
  const user = await getUser(username);
  if (!user) return null;

  const isValid = await bcrypt.compare(password, user.passwordHash);
  return isValid ? user : null;
}

// ---------------------------------------------------------------------------
// Nutzerfarbe
// ---------------------------------------------------------------------------
// Jeder Nutzer wählt seine Farbe einmalig. Sie wird als einfacher String-Key
// gespeichert – kein Schema, kein ALTER TABLE. Redis macht das in O(1).

export async function getUserColor(userId: string): Promise<string | null> {
  return redis.get(`user:${userId}:color`);
}

export async function setUserColor(userId: string, color: string): Promise<void> {
  await redis.set(`user:${userId}:color`, color);
}

// ---------------------------------------------------------------------------
// Online-Präsenz
// ---------------------------------------------------------------------------
// Redis Hash "online:users": userId → JSON({name, color})
// Einfacher als ein separater Presence-Service; für lokale Nutzung ausreichend.

export interface OnlineUser {
  id: string;
  name: string;
  color: string;
}

export async function setUserOnline(
  userId: string,
  name: string,
  color: string
): Promise<void> {
  await redis.hset("online:users", userId, JSON.stringify({ name, color }));
}

export async function setUserOffline(userId: string): Promise<void> {
  await redis.hdel("online:users", userId);
}

export async function getOnlineUsers(): Promise<OnlineUser[]> {
  const data = await redis.hgetall("online:users");
  if (!data) return [];
  return Object.entries(data).map(([id, json]) => {
    const { name, color } = JSON.parse(json) as { name: string; color: string };
    return { id, name, color };
  });
}

// ---------------------------------------------------------------------------
// Pub/Sub für Echtzeit-Synchronisierung
// ---------------------------------------------------------------------------
// Redis Pub/Sub ist der einfachste Weg, Nachrichten zwischen Server-Prozessen
// (SSE-Handler) zu verteilen. Kein Polling, keine Websocket-Bibliothek nötig.

export type BoardEvent =
  | { type: "note:created"; note: Note }
  | { type: "note:position_updated"; noteId: string; posX: number; posY: number; byUserId: string }
  | { type: "note:text_updated"; noteId: string; text: string; byUserId: string }
  | { type: "note:deleted"; noteId: string; byUserId: string }
  | { type: "presence:update"; users: OnlineUser[] };

export const BOARD_CHANNEL = "board:main:events";

/** Sendet ein Ereignis an alle SSE-Clients, die den Board-Kanal abonniert haben. */
export async function publishBoardEvent(event: BoardEvent): Promise<void> {
  await redis.publish(BOARD_CHANNEL, JSON.stringify(event));
}
