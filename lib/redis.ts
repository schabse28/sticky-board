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
import type { NoteData, Note, UserData, User, UserPublic, OnlineUser, BoardEvent, BoardMeta, BoardPublic } from "@/types";

// Typen re-exportieren damit bestehende Imports von "@/lib/redis" weiterhin funktionieren
export type { NoteData, Note, UserData, User, UserPublic, OnlineUser, BoardEvent, BoardMeta, BoardPublic } from "@/types";

// ---------------------------------------------------------------------------
// Umgebungsvariablen-Validierung
// ---------------------------------------------------------------------------
// Wird beim ersten Import dieses Moduls ausgeführt, also beim Server-Start.
// Fehlende Pflicht-Variablen werden sofort mit hilfreicher Fehlermeldung gemeldet.

function validateEnvironment(): void {
  const errors: string[] = [];

  if (!process.env.NEXTAUTH_SECRET) {
    errors.push(
      "  NEXTAUTH_SECRET fehlt – generiere einen sicheren Wert:\n" +
      "    openssl rand -base64 32"
    );
  }

  if (!process.env.REDIS_URL) {
    // Fallback auf localhost ist vorhanden, aber wir warnen explizit
    console.warn(
      "[sticky-board] REDIS_URL nicht gesetzt, verwende Standard: redis://localhost:6379\n" +
      "  Redis starten: docker-compose up -d"
    );
  }

  if (errors.length > 0) {
    throw new Error(
      "\n[sticky-board] Fehlende Pflicht-Umgebungsvariablen:\n\n" +
      errors.join("\n\n") +
      "\n\nErstelle eine .env.local Datei im Projektverzeichnis:\n" +
      "  NEXTAUTH_URL=http://localhost:3000\n" +
      "  NEXTAUTH_SECRET=$(openssl rand -base64 32)\n" +
      "  REDIS_URL=redis://localhost:6379\n"
    );
  }
}

validateEnvironment();

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

// Einmalige Migration alter Nutzer auf E-Mail-Auth (asynchron, nicht-blockierend)
migrateUsersToEmailAuth().catch((err) =>
  console.error("[sticky-board] Migration fehlgeschlagen:", err)
);

// ---------------------------------------------------------------------------
// Key-Schemata
// ---------------------------------------------------------------------------
// Konsistente Schlüsselnamen vermeiden Kollisionen und erleichtern das Debuggen.

const keys = {
  note: (noteId: string) => `note:${noteId}`,
  boardNotes: (boardId: string) => `board:${boardId}:notes`,
  boardMeta: (boardId: string) => `board:${boardId}:meta`,
  boardOnline: (boardId: string) => `board:${boardId}:online`,
  allBoards: "boards:all",
  user: (userId: string) => `user:${userId}`,
  userByEmail: (email: string) => `email:${email.toLowerCase()}`,
  userByUsername: (username: string) => `username:${username}`, // Legacy – nur für Migration/Cleanup
  allUsers: "users:all",
  userLastSeen: (userId: string) => `user:${userId}:lastSeen`,
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
    width: String(note.width ?? 208),
    height: String(note.height ?? 176),
  };

  // TTL des Boards prüfen – temporäre Boards vererben ihre TTL auf Notes
  const boardTTL = await redis.ttl(keys.boardMeta(boardId));

  const pipeline = redis.pipeline();
  pipeline.hset(keys.note(id), hashFields);
  pipeline.sadd(keys.boardNotes(boardId), id);
  if (boardTTL > 0) {
    pipeline.expire(keys.note(id), boardTTL);
  }
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
      width: hash.width ? Number(hash.width) : undefined,
      height: hash.height ? Number(hash.height) : undefined,
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
 * Aktualisiert Breite und Höhe einer Note (Resize-Feature).
 */
export async function updateNoteSize(
  noteId: string,
  width: number,
  height: number
): Promise<void> {
  const exists = await redis.exists(keys.note(noteId));
  if (!exists) {
    throw new Error(`Note ${noteId} nicht gefunden`);
  }

  await redis.hset(keys.note(noteId), {
    width: String(width),
    height: String(height),
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
/** Löscht eine Note und gibt die zugehörige boardId zurück (für Event-Publishing). */
export async function deleteNote(noteId: string): Promise<string | null> {
  // boardId aus dem Hash lesen, um das korrekte Set zu aktualisieren
  const boardId = await redis.hget(keys.note(noteId), "boardId");

  const pipeline = redis.pipeline();
  pipeline.del(keys.note(noteId));
  if (boardId) {
    pipeline.srem(keys.boardNotes(boardId), noteId);
  }
  await pipeline.exec();

  return boardId ?? null;
}

// ---------------------------------------------------------------------------
// Benutzer
// ---------------------------------------------------------------------------

/**
 * Legt einen neuen Benutzer an.
 *
 * Das Passwort wird mit bcrypt gehasht – niemals Klartext in Redis speichern.
 * Zwei Hash-Keys:
 *   - "user:{id}"       → alle Benutzerdaten
 *   - "email:{email}"   → Lookup-Key (O(1) Suche nach E-Mail)
 */
export async function createUser(userData: UserData): Promise<User> {
  const email = userData.email.toLowerCase().trim();

  // Sicherstellen, dass die E-Mail noch nicht existiert
  const existingId = await redis.get(keys.userByEmail(email));
  if (existingId) {
    throw new Error("E-Mail bereits vergeben");
  }

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const passwordHash = await bcrypt.hash(userData.password, 12);

  // Erster registrierter Nutzer wird automatisch Admin
  const userCount = await redis.scard(keys.allUsers);
  const role: "admin" | "user" = userCount === 0 ? "admin" : "user";

  const user: User = {
    id,
    email,
    displayName: userData.displayName.trim(),
    passwordHash,
    createdAt,
    role,
    loginAttempts: 0,
  };

  const pipeline = redis.pipeline();
  pipeline.hset(keys.user(id), {
    id,
    email,
    displayName: user.displayName,
    passwordHash,
    createdAt,
    role,
    loginAttempts: "0",
  });
  // Reverse-Lookup: E-Mail → User-ID
  pipeline.set(keys.userByEmail(email), id);
  // Alle User-IDs für Admin-Übersicht
  pipeline.sadd(keys.allUsers, id);
  await pipeline.exec();

  return user;
}

/**
 * Gibt einen Benutzer anhand seiner E-Mail-Adresse zurück.
 *
 * Zweistufiger Lookup:
 *   1. "email:{email}" → User-ID (String, O(1))
 *   2. "user:{id}"     → Benutzerdaten (Hash, O(1))
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const userId = await redis.get(keys.userByEmail(email.toLowerCase().trim()));
  if (!userId) return null;

  const hash = await redis.hgetall(keys.user(userId));
  if (!hash || !hash.id) return null;

  return {
    id: hash.id,
    email: hash.email,
    displayName: hash.displayName,
    passwordHash: hash.passwordHash,
    createdAt: hash.createdAt,
    role: (hash.role as "admin" | "user") ?? "user",
    loginAttempts: hash.loginAttempts ? Number(hash.loginAttempts) : 0,
    lockedUntil: hash.lockedUntil || null,
  };
}

/**
 * Überprüft E-Mail und Passwort mit Brute-Force-Schutz.
 * Nach 5 Fehlversuchen wird der Account 15 Minuten gesperrt.
 * Gibt den User zurück wenn korrekt, "locked" wenn gesperrt, sonst null.
 */
export async function verifyUser(
  email: string,
  password: string
): Promise<User | null | "locked"> {
  const user = await getUserByEmail(email);
  if (!user) return null;

  // Sperre prüfen
  if (user.lockedUntil) {
    const lockedUntil = new Date(user.lockedUntil);
    if (lockedUntil > new Date()) {
      return "locked";
    }
    // Sperre abgelaufen – zurücksetzen
    await redis.hset(keys.user(user.id), { loginAttempts: "0", lockedUntil: "" });
    user.loginAttempts = 0;
    user.lockedUntil = null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    const attempts = (user.loginAttempts ?? 0) + 1;
    if (attempts >= 5) {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await redis.hset(keys.user(user.id), {
        loginAttempts: String(attempts),
        lockedUntil,
      });
    } else {
      await redis.hset(keys.user(user.id), { loginAttempts: String(attempts) });
    }
    return null;
  }

  // Erfolg – Fehlversuche zurücksetzen
  await redis.hset(keys.user(user.id), { loginAttempts: "0", lockedUntil: "" });
  return user;
}

/**
 * Migriert bestehende Nutzer (username-basiert) auf das neue E-Mail-System.
 * Läuft einmalig; wird durch den Redis-Key "migration:v2:email:done" markiert.
 */
export async function migrateUsersToEmailAuth(): Promise<void> {
  const migrationKey = "migration:v2:email:done";
  const alreadyDone = await redis.get(migrationKey);
  if (alreadyDone) return;

  const userIds = await redis.smembers(keys.allUsers);
  if (userIds.length === 0) {
    await redis.set(migrationKey, "1");
    return;
  }

  // Alle User-Hashes laden
  const fetchPipeline = redis.pipeline();
  for (const userId of userIds) {
    fetchPipeline.hgetall(keys.user(userId));
  }
  const results = await fetchPipeline.exec();
  if (!results) {
    await redis.set(migrationKey, "1");
    return;
  }

  const writePipeline = redis.pipeline();
  for (let i = 0; i < userIds.length; i++) {
    const [err, data] = results[i];
    if (err || !data || typeof data !== "object") continue;
    const hash = data as Record<string, string>;
    if (!hash.id || hash.email) continue; // bereits migriert

    const email = `${hash.username ?? hash.id}@local.dev`.toLowerCase();
    const displayName = hash.username ?? hash.id;

    writePipeline.hset(keys.user(hash.id), {
      email,
      displayName,
      loginAttempts: "0",
    });
    writePipeline.set(keys.userByEmail(email), hash.id);
  }

  await writePipeline.exec();
  await redis.set(migrationKey, "1");

  console.log("[sticky-board] Migration v2: Nutzer auf E-Mail-Authentifizierung migriert");
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

/**
 * Aktualisiert displayName und/oder Farbe eines Nutzers.
 * Bei Farb-Änderung: alle Notes des Nutzers boardübergreifend umfärben.
 * Aktualisiert auch den Online-Präsenz-Eintrag falls der Nutzer online ist.
 */
export async function updateUserProfile(
  userId: string,
  { displayName, color }: { displayName?: string; color?: string }
): Promise<void> {
  const pipeline = redis.pipeline();

  if (displayName) {
    pipeline.hset(keys.user(userId), { displayName });
  }
  if (color) {
    pipeline.set(`user:${userId}:color`, color);
  }
  await pipeline.exec();

  // Online-Präsenz aktualisieren falls Nutzer gerade online ist
  const onlineEntry = await redis.hget("online:users", userId);
  if (onlineEntry) {
    const current = JSON.parse(onlineEntry) as { name: string; color: string };
    await redis.hset("online:users", userId, JSON.stringify({
      name: displayName ?? current.name,
      color: color ?? current.color,
    }));
  }

  // Bei Farb-Änderung: alle Notes des Nutzers boardübergreifend umfärben
  if (color) {
    const boardIds = await redis.smembers(keys.allBoards);
    if (boardIds.length === 0) return;

    const noteSetPipeline = redis.pipeline();
    for (const boardId of boardIds) {
      noteSetPipeline.smembers(keys.boardNotes(boardId));
    }
    const noteSetResults = await noteSetPipeline.exec();
    if (!noteSetResults) return;

    const allNoteIds: string[] = [];
    for (const [err, noteIds] of noteSetResults) {
      if (err || !Array.isArray(noteIds)) continue;
      allNoteIds.push(...(noteIds as string[]));
    }
    if (allNoteIds.length === 0) return;

    const userIdPipeline = redis.pipeline();
    for (const noteId of allNoteIds) {
      userIdPipeline.hget(keys.note(noteId), "userId");
    }
    const userIdResults = await userIdPipeline.exec();
    if (!userIdResults) return;

    const colorPipeline = redis.pipeline();
    let hasUpdates = false;
    for (let i = 0; i < allNoteIds.length; i++) {
      const [err, noteUserId] = userIdResults[i];
      if (err || noteUserId !== userId) continue;
      colorPipeline.hset(keys.note(allNoteIds[i]), { color });
      hasUpdates = true;
    }
    if (hasUpdates) await colorPipeline.exec();
  }
}

// ---------------------------------------------------------------------------
// Online-Präsenz
// ---------------------------------------------------------------------------
// Redis Hash "online:users": userId → JSON({name, color})
// Einfacher als ein separater Presence-Service; für lokale Nutzung ausreichend.

export async function setUserOnline(
  userId: string,
  name: string,
  color: string
): Promise<void> {
  await redis.hset("online:users", userId, JSON.stringify({ name, color }));
}

export async function setUserOffline(userId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.hdel("online:users", userId);
  pipeline.set(keys.userLastSeen(userId), new Date().toISOString());
  await pipeline.exec();
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
//
// Kanalarchitektur:
//   board:{boardId}:events  → boardspezifische Note-Events (create/move/edit/resize/delete)
//   presence:events          → globale Präsenz-Updates (wer ist online)

/** Board-spezifischer Kanal für Note-Events. */
export const boardChannel = (boardId: string) => `board:${boardId}:events`;

/** Globaler Kanal für Präsenz-Updates (board-übergreifend). */
export const PRESENCE_CHANNEL = "presence:events";

/** Sendet ein Note-Ereignis an alle SSE-Clients des angegebenen Boards. */
export async function publishBoardEvent(boardId: string, event: BoardEvent): Promise<void> {
  await redis.publish(boardChannel(boardId), JSON.stringify(event));
}

/** Sendet ein Präsenz-Update an alle verbundenen SSE-Clients (alle Boards). */
export async function publishPresenceEvent(users: OnlineUser[]): Promise<void> {
  const event: BoardEvent = { type: "presence:update", users };
  await redis.publish(PRESENCE_CHANNEL, JSON.stringify(event));
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/**
 * Stellt sicher, dass das "main"-Board in der neuen Struktur existiert.
 * Wird einmalig beim ersten Zugriff aufgerufen (Migration alter Daten).
 */
export async function ensureMainBoard(): Promise<void> {
  const exists = await redis.exists(keys.boardMeta("main"));
  if (!exists) {
    const pipeline = redis.pipeline();
    pipeline.hset(keys.boardMeta("main"), {
      id: "main",
      name: "Hauptboard",
      createdBy: "system",
      createdAt: new Date().toISOString(),
    });
    pipeline.sadd(keys.allBoards, "main");
    await pipeline.exec();
  }

  // Abgelaufene temporäre Boards beim Start bereinigen (nicht-blockierend)
  cleanupExpiredBoards().catch((err) =>
    console.error("[sticky-board] Cleanup abgelaufener Boards fehlgeschlagen:", err)
  );
}

const BOARD_TTL_SECONDS = 86400; // 24 Stunden

/** Erstellt ein neues Board und trägt es in boards:all ein. */
export async function createBoard(
  name: string,
  userId: string,
  temporary = false
): Promise<BoardMeta> {
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const expiresAt = temporary
    ? new Date(Date.now() + BOARD_TTL_SECONDS * 1000).toISOString()
    : null;

  const meta: BoardMeta = { id, name, createdBy: userId, createdAt, temporary, expiresAt };

  const pipeline = redis.pipeline();
  pipeline.hset(keys.boardMeta(id), {
    id,
    name,
    createdBy: userId,
    createdAt,
    temporary: temporary ? "1" : "0",
    ...(expiresAt ? { expiresAt } : {}),
  });
  if (temporary) {
    pipeline.expire(keys.boardMeta(id), BOARD_TTL_SECONDS);
  }
  pipeline.sadd(keys.allBoards, id);
  await pipeline.exec();

  return meta;
}

/** Gibt die Metadaten eines Boards zurück (oder null wenn nicht gefunden). */
export async function getBoard(boardId: string): Promise<BoardMeta | null> {
  if (boardId === "main") await ensureMainBoard();
  const hash = await redis.hgetall(keys.boardMeta(boardId));
  if (!hash?.id) return null;
  return {
    id: hash.id,
    name: hash.name,
    createdBy: hash.createdBy,
    createdAt: hash.createdAt,
    temporary: hash.temporary === "1",
    expiresAt: hash.expiresAt || null,
  };
}

/** Gibt die verbleibende TTL eines Boards in Sekunden zurück (null = dauerhaft). */
export async function getBoardTTL(boardId: string): Promise<number | null> {
  const ttl = await redis.ttl(keys.boardMeta(boardId));
  return ttl > 0 ? ttl : null;
}

/**
 * Bereinigt abgelaufene temporäre Boards aus Redis.
 * Prüft alle Einträge in boards:all – fehlt der Meta-Key (Redis TTL abgelaufen),
 * werden Notes-Set, Online-Set und der boards:all-Eintrag entfernt.
 * Gibt die Anzahl bereinigter Boards zurück.
 */
export async function cleanupExpiredBoards(): Promise<number> {
  const boardIds = await redis.smembers(keys.allBoards);
  if (boardIds.length === 0) return 0;

  // Prüfen welche Meta-Keys nicht mehr existieren (Redis TTL abgelaufen)
  const existsPipeline = redis.pipeline();
  for (const id of boardIds) {
    existsPipeline.exists(keys.boardMeta(id));
  }
  const existsResults = await existsPipeline.exec();
  if (!existsResults) return 0;

  const expiredIds: string[] = [];
  for (let i = 0; i < boardIds.length; i++) {
    const [err, exists] = existsResults[i];
    if (!err && exists === 0) {
      expiredIds.push(boardIds[i]);
    }
  }

  if (expiredIds.length === 0) return 0;

  // Abgelaufene Boards vollständig aus Redis entfernen
  for (const id of expiredIds) {
    const noteIds = await redis.smembers(keys.boardNotes(id));
    const cleanPipeline = redis.pipeline();
    for (const noteId of noteIds) {
      cleanPipeline.del(keys.note(noteId));
    }
    cleanPipeline.del(keys.boardNotes(id));
    cleanPipeline.del(keys.boardOnline(id));
    cleanPipeline.srem(keys.allBoards, id);
    await cleanPipeline.exec();
  }

  return expiredIds.length;
}

/** Macht ein temporäres Board dauerhaft (entfernt TTL). */
export async function makeBoardPermanent(boardId: string): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.persist(keys.boardMeta(boardId));
  pipeline.hset(keys.boardMeta(boardId), { temporary: "0", expiresAt: "" });
  await pipeline.exec();
}

/** Gibt alle Boards mit Note-Anzahl, Online-Nutzer-Anzahl und TTL zurück. */
export async function getAllBoards(): Promise<BoardPublic[]> {
  await ensureMainBoard();
  const boardIds = await redis.smembers(keys.allBoards);
  if (boardIds.length === 0) return [];

  // 4 Operationen pro Board: meta, noteCount, onlineCount, ttl
  const pipeline = redis.pipeline();
  for (const id of boardIds) {
    pipeline.hgetall(keys.boardMeta(id));
    pipeline.scard(keys.boardNotes(id));
    pipeline.scard(keys.boardOnline(id));
    pipeline.ttl(keys.boardMeta(id));
  }
  const results = await pipeline.exec();
  if (!results) return [];

  const boards: BoardPublic[] = [];
  const staleIds: string[] = [];

  for (let i = 0; i < boardIds.length; i++) {
    const [metaErr, metaData] = results[i * 4];
    const [, noteCount] = results[i * 4 + 1];
    const [, onlineCount] = results[i * 4 + 2];
    const [, ttl] = results[i * 4 + 3];

    if (metaErr || !metaData || typeof metaData !== "object") {
      staleIds.push(boardIds[i]);
      continue;
    }
    const hash = metaData as Record<string, string>;
    if (!hash.id) {
      staleIds.push(boardIds[i]);
      continue;
    }

    boards.push({
      id: hash.id,
      name: hash.name,
      createdBy: hash.createdBy,
      createdAt: hash.createdAt,
      temporary: hash.temporary === "1",
      expiresAt: hash.expiresAt || null,
      noteCount: (noteCount as number) ?? 0,
      onlineCount: (onlineCount as number) ?? 0,
      ttlSeconds: typeof ttl === "number" && ttl > 0 ? ttl : null,
    });
  }

  // Veraltete Board-IDs (abgelaufene TTL) aus dem Index bereinigen
  if (staleIds.length > 0) {
    const cleanPipeline = redis.pipeline();
    for (const id of staleIds) cleanPipeline.srem(keys.allBoards, id);
    await cleanPipeline.exec();
  }

  return boards.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

/**
 * Löscht ein Board mit allen seinen Notes.
 * Pipeline löscht: alle Note-Hashes, das Notes-Set, das Online-Set und den Meta-Hash.
 */
export async function deleteBoard(boardId: string): Promise<void> {
  const noteIds = await redis.smembers(keys.boardNotes(boardId));
  const pipeline = redis.pipeline();
  for (const noteId of noteIds) {
    pipeline.del(keys.note(noteId));
  }
  pipeline.del(keys.boardNotes(boardId));
  pipeline.del(keys.boardMeta(boardId));
  pipeline.del(keys.boardOnline(boardId));
  pipeline.srem(keys.allBoards, boardId);
  await pipeline.exec();
}

// ---------------------------------------------------------------------------
// Board-Online-Präsenz (pro Board)
// ---------------------------------------------------------------------------

/** Trägt einen Nutzer als aktiv auf einem Board ein. */
export async function setBoardUserOnline(boardId: string, userId: string): Promise<void> {
  await redis.sadd(keys.boardOnline(boardId), userId);
}

/** Entfernt einen Nutzer aus dem Board-Online-Set. */
export async function setBoardUserOffline(boardId: string, userId: string): Promise<void> {
  await redis.srem(keys.boardOnline(boardId), userId);
}

// ---------------------------------------------------------------------------
// Admin-Funktionen
// ---------------------------------------------------------------------------

/** Gibt die Rolle eines Nutzers zurück. */
export async function getUserRole(userId: string): Promise<"admin" | "user"> {
  const role = await redis.hget(keys.user(userId), "role");
  return (role as "admin" | "user") ?? "user";
}

/** Setzt die Rolle eines Nutzers. */
export async function setUserRole(userId: string, role: "admin" | "user"): Promise<void> {
  await redis.hset(keys.user(userId), { role });
}

/** Gibt alle Nutzer als öffentliche Darstellung zurück. */
export async function getAllUsers(): Promise<UserPublic[]> {
  const userIds = await redis.smembers(keys.allUsers);
  if (userIds.length === 0) return [];

  // Alle Nutzerdaten, Farben und lastSeen parallel laden
  const pipeline = redis.pipeline();
  for (const id of userIds) {
    pipeline.hgetall(keys.user(id));
    pipeline.get(`user:${id}:color`);
    pipeline.get(keys.userLastSeen(id));
  }
  const results = await pipeline.exec();
  if (!results) return [];

  const onlineData = await redis.hgetall("online:users");
  const onlineIds = new Set(Object.keys(onlineData ?? {}));

  const users: UserPublic[] = [];
  for (let i = 0; i < userIds.length; i++) {
    const hashResult = results[i * 3];
    const colorResult = results[i * 3 + 1];
    const lastSeenResult = results[i * 3 + 2];

    if (hashResult[0] || !hashResult[1]) continue;
    const hash = hashResult[1] as Record<string, string>;
    if (!hash.id) continue;

    users.push({
      id: hash.id,
      email: hash.email ?? `${hash.username ?? hash.id}@local.dev`,
      displayName: hash.displayName ?? hash.username ?? hash.id,
      createdAt: hash.createdAt,
      role: (hash.role as "admin" | "user") ?? "user",
      color: (colorResult[1] as string | null) ?? null,
      lastSeen: (lastSeenResult[1] as string | null) ?? null,
      isOnline: onlineIds.has(hash.id),
    });
  }

  return users;
}

/**
 * Löscht einen Nutzer vollständig:
 * User-Hash, E-Mail-Lookup, (Legacy-)Username-Lookup, AllUsers-Set, Farbe, lastSeen, Online-Präsenz.
 */
export async function deleteUser(userId: string): Promise<void> {
  const hash = await redis.hmget(keys.user(userId), "email", "username");
  const [email, username] = hash;
  const pipeline = redis.pipeline();
  pipeline.del(keys.user(userId));
  if (email) pipeline.del(keys.userByEmail(email));
  if (username) pipeline.del(keys.userByUsername(username)); // Legacy-Cleanup
  pipeline.srem(keys.allUsers, userId);
  pipeline.del(`user:${userId}:color`);
  pipeline.del(keys.userLastSeen(userId));
  pipeline.hdel("online:users", userId);
  await pipeline.exec();
}
