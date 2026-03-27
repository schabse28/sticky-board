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
```

No test suite exists in this project.

## Architecture

**Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · ioredis · next-auth v4 · bcryptjs

### Data Layer (`lib/redis.ts`)

Single Redis instance (singleton via `global._redisClient`) handles all data. Key schema:
- `note:{id}` — Hash with all note fields
- `board:{boardId}:notes` — Set of note IDs (currently only `"main"` board)
- `user:{id}` — Hash with user credentials
- `username:{name}` — String → userId reverse lookup
- `user:{id}:color` — String, set once per user, never changes
- `online:users` — Hash: userId → JSON `{name, color}`
- `board:main:events` — Redis Pub/Sub channel

All board events are `BoardEvent` union types published via `publishBoardEvent()`.

### Authentication (`lib/auth.ts`)

CredentialsProvider with JWT session strategy. `userId` is embedded in the JWT token, then surfaced in `session.user.id` via callbacks. Type augmentation in `types/next-auth.d.ts`.

### Real-time Sync (SSE)

`GET /api/events` — Each SSE connection creates its **own** ioredis instance in subscribe mode (because ioredis locks a connection after `SUBSCRIBE`; the global singleton cannot be reused). On connect: marks user online, broadcasts presence. On abort: unsubscribes, marks user offline, broadcasts updated presence. 25s heartbeat keeps connections alive through proxies.

### Board UI (`app/board/`)

- `page.tsx` — Server Component: loads session + initial notes + user color from Redis
- `Board.tsx` — Client Component: all interactive logic
  - SSE starts only after `currentUserColor` is non-null (color picker done)
  - Drag via window `mousemove`/`mouseup` + `dragRef` (avoids stale closure)
  - SSE deduplication: own-created notes checked by ID; own-dragged positions skipped via `dragRef.current?.noteId`; own text edits skipped via `editingIdRef.current`
- `ColorSetup.tsx` — Modal overlay shown on first login; blocks board until color chosen. 409 response means color already set (race condition) — treated as success.
- `StickyNote.tsx` — Individual note; colored header = drag handle; double-click to edit

### API Routes

| Route | Methods | Notes |
|-------|---------|-------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handler |
| `/api/register` | POST | Creates user; validates username ≥3 chars, password ≥6 chars |
| `/api/notes` | GET, POST | POST reads user color from Redis, never from client body |
| `/api/notes/[noteId]` | PATCH, DELETE | Ownership enforced via `assertOwner()` (reads `note:{id}.userId`) |
| `/api/events` | GET | SSE stream; `force-dynamic`, `runtime = "nodejs"` |
| `/api/user/color` | GET, POST | POST is idempotent for 409; color is permanent once set |

### Route Protection

`middleware.ts` uses `withAuth` from `next-auth/middleware`. Protects `/board/:path*` only. Pattern: `import { withAuth } from "next-auth/middleware"` — the re-export pattern (`export { default }`) does **not** work in Next.js 14 and causes "Cannot find module" errors.

## Environment Variables (`.env.local`)

```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generated-secret>
REDIS_URL=redis://localhost:6379
```

## Known Gotchas

- **`.next` cache**: After middleware or config changes, delete `.next/` and restart if you see unexpected 404s or module errors.
- **zsh glob expansion**: `git add "app/api/notes/[noteId]/route.ts"` — always quote paths with brackets in zsh.
- **SSE subscriber connections**: Never use the global `redis` singleton for Pub/Sub subscribing; always create a new `new Redis(...)` instance per SSE connection.
