# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start Redis + install deps + start dev server
docker-compose up -d && npm install && npm run dev

# Individual commands
docker-compose up -d   # Start Redis container (required before dev server)
npm run dev            # Dev server on http://localhost:3000
npm run build          # Production build
npm run start          # Start production build
npm run lint           # ESLint check

# Stop Redis
docker-compose down
docker-compose down -v  # Stop and delete all Redis data
```

**Node.js v20 LTS required.** Next.js 14 is incompatible with Node.js v23+. If using nvm: `nvm use` (`.nvmrc` is present).

No test suite exists in this project.

## Architecture

**Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · ioredis · next-auth v4 · bcryptjs

### Data Layer (`lib/redis.ts`)

Single Redis instance (singleton via `global._redisClient`) handles all data. Key schema:

| Key | Type | Content |
|-----|------|---------|
| `note:{id}` | Hash | all note fields incl. `boardId`, `userId`, `createdByName` |
| `board:{boardId}:notes` | Set | note IDs belonging to board |
| `shape:{id}` | Hash | all shape fields incl. `boardId`, `type`, `userId` |
| `board:{boardId}:shapes` | Set | shape IDs belonging to board |
| `board:{boardId}:meta` | Hash | board metadata (`name`, `createdBy`, `temporary`, `expiresAt`) |
| `board:{boardId}:online` | Set | userIds currently on this board |
| `boards:all` | Set | all known board IDs |
| `user:{id}` | Hash | credentials + `role` + `loginAttempts` + `lockedUntil` |
| `email:{email}` | String | reverse lookup email → userId |
| `user:{id}:color` | String | user color (set once, permanent) |
| `user:{id}:lastSeen` | String | ISO timestamp |
| `online:users` | Hash | userId → JSON `{name, color}` (global presence) |

`username:{name}` is legacy-only — kept for migration cleanup, never written for new users.

All board events are `BoardEvent` union types (`types/index.ts`) published via `publishBoardEvent()`. Shared note/shape size constants (`NOTE_DEFAULT_W/H`, `NOTE_MIN_W/H`) live in `types/index.ts` — never redefine locally.

### Authentication (`lib/auth.ts`)

CredentialsProvider with JWT strategy. `userId` and `role` embedded in JWT, surfaced as `session.user.id` / `session.user.role` via callbacks. Type augmentation in `types/next-auth.d.ts`. Brute-force protection: 5 failed attempts → 15-minute lockout stored in `user:{id}.lockedUntil`.

First registered user automatically gets `role: "admin"`.

### Real-time Sync (SSE)

`GET /api/events?boardId=...` — Each SSE connection creates its **own** ioredis instance in subscribe mode (ioredis locks a connection after `SUBSCRIBE`; the global singleton cannot be reused). Subscribes to two channels: `board:{boardId}:events` (board-specific) and `presence:events` (global). On connect: marks user online on board + globally, broadcasts presence. On abort: unsubscribes, marks offline, broadcasts updated presence. 25s heartbeat prevents proxy timeouts.

**Never use the global `redis` singleton for Pub/Sub subscribing** — always `new Redis(...)` per SSE connection.

### Board UI (`app/board/[boardId]/`)

- `page.tsx` — Server Component: loads session + initial notes + shapes + user color from Redis
- `Board.tsx` — Client Component (~1400 lines): all interactive logic
  - SSE starts only after `currentUserColor` is non-null (ColorSetup done)
  - **Drag** via window `mousemove`/`mouseup` + `dragRef` (avoids stale closure)
  - **Resize** notes via bottom-right handle; shapes via edge handles
  - **Drawing** shapes: mousedown on canvas sets `drawingRef`, mousemove updates preview SVG, mouseup commits via POST
  - **Undo** stack (max 10): `undoStack` state + `pushUndo()` — covers note create/delete/resize and shape create/delete/resize
  - **Cursor tracking**: throttled `mousemove` → `POST /api/boards/{id}/cursors`; stale cursors removed after 3.5s
  - **SSE deduplication**: own-created notes/shapes skip re-add by ID; own drag skipped via `dragRef.current?.noteId`; own text edits skipped via `editingIdRef.current`
  - **Edit mode race condition**: `setTimeout(() => setEditingId(note.id), 0)` fires immediately after `setNotes`; `pendingEditRef` is SSE fallback only
- `ColorSetup.tsx` — Blocks board until color chosen on first login. 409 = color already set → treated as success.
- `StickyNote.tsx` — Colored header = drag handle; double-click to edit (owner only); resize handle bottom-right (owner only); creator name bottom-left

### Multi-Board Support

`/boards` lists all boards. Each board has its own URL `/board/[boardId]`. Boards can be **temporary** (24h TTL stored as Redis key TTL on `board:{boardId}:meta`). `cleanupExpiredBoards()` runs on server start. Temporary boards can be made permanent via `POST /api/boards/[boardId]/persist`.

### API Routes

| Route | Methods | Notes |
|-------|---------|-------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handler |
| `/api/register` | POST | Creates user; email format + password ≥6 chars; first user → admin |
| `/api/boards` | GET, POST | List all boards / create board (`temporary` flag supported) |
| `/api/boards/[boardId]` | GET, DELETE | Board meta / admin-only delete |
| `/api/boards/[boardId]/notes` | GET, POST | POST enforces rate limit: 50 notes/user/board |
| `/api/boards/[boardId]/shapes` | GET, POST | POST enforces rate limit: 50 shapes/user/board |
| `/api/boards/[boardId]/shapes/[shapeId]` | PATCH, DELETE | Verifies shape.boardId === params.boardId before acting |
| `/api/boards/[boardId]/cursors` | POST, DELETE | Throttled cursor position updates |
| `/api/boards/[boardId]/persist` | POST | Makes temporary board permanent |
| `/api/notes/[noteId]` | PATCH, DELETE | Ownership via `assertOwner()`; text capped at 10,000 chars |
| `/api/events` | GET | SSE stream; `force-dynamic`, `runtime = "nodejs"` |
| `/api/user/color` | GET, POST | POST is idempotent for 409; color is permanent once set |
| `/api/user/profile` | PATCH | Display name + color; publishes `user_updated` event |
| `/api/user/account` | DELETE | Password-verified account + content deletion |
| `/api/admin/users` | GET | Admin: list all users |
| `/api/admin/users/[userId]` | PATCH, DELETE | Admin: role change / delete user |
| `/api/admin/notes/[noteId]` | DELETE | Admin: delete any note |
| `/api/admin/cleanup` | POST | Admin: trigger expired board cleanup |

### Route Protection

`middleware.ts` uses `withAuth` from `next-auth/middleware`. Protects `/board/:path*`, `/boards/:path*`, and `/admin/:path*`. The re-export pattern (`export { default }`) does **not** work in Next.js 14 — import `withAuth` directly.

## Environment Variables (`.env.local`)

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<openssl rand -base64 32>
REDIS_URL=redis://localhost:6379
```

## Known Gotchas

- **`.next` cache**: After middleware or config changes, delete `.next/` and restart if you see unexpected 404s or module errors.
- **zsh glob expansion**: Always quote bracket paths: `git add "app/api/notes/[noteId]/route.ts"`
- **SSE subscriber connections**: Never reuse the global `redis` singleton for subscribing.
- **Shape boardId verification**: Both PATCH and DELETE on `shapes/[shapeId]` read `boardId` from the shape hash via `hmget` and return 404 if it doesn't match `params.boardId`.
- **`/api/notes` (legacy) is deleted**: Note creation goes through `/api/boards/[boardId]/notes`; individual note PATCH/DELETE still go through `/api/notes/[noteId]`.
