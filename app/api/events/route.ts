/**
 * SSE-Endpunkt für Echtzeit-Board-Updates
 *
 * Jede SSE-Verbindung bekommt eine eigene Redis-Verbindung im Subscribe-Modus.
 * ioredis sperrt eine Connection nach dem ersten SUBSCRIBE-Aufruf – deshalb
 * kann die globale Singleton-Connection nicht verwendet werden.
 *
 * Kanalarchitektur:
 *   board:{boardId}:events  → boardspezifische Note-Events
 *   presence:events          → globale Präsenz-Updates (alle Boards)
 *
 * Ablauf:
 *   1. Client öffnet GET /api/events?boardId=... (Browser-EventSource)
 *   2. Beide Kanäle abonnieren, dann Nutzer online setzen
 *   3. Jede publizierte Nachricht wird als SSE-Frame an den Client gestreamt
 *   4. Bei Verbindungstrennung: offline setzen, Board-Präsenz bereinigen
 */

import Redis from "ioredis";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getUserColor,
  setUserOnline,
  setUserOffline,
  getOnlineUsers,
  publishPresenceEvent,
  boardChannel,
  PRESENCE_CHANNEL,
  setBoardUserOnline,
  setBoardUserOffline,
} from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  let session;
  try {
    session = await getServerSession(authOptions);
  } catch (error) {
    console.error("[GET /api/events] Session-Fehler:", error);
    return new Response("Interner Serverfehler", { status: 500 });
  }

  if (!session?.user) {
    return new Response("Nicht authentifiziert", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get("boardId") ?? "main";

  const userId = session.user.id;
  const userName = session.user.name ?? "Unbekannt";
  const encoder = new TextEncoder();

  let subscriber: Redis | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Controller bereits geschlossen
        }
      };

      // Eigene Subscriber-Connection (nicht der globale Singleton)
      subscriber = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
        retryStrategy: (times) => Math.min(times * 100, 3000),
      });

      subscriber.on("error", (err) => {
        console.error("[SSE Subscriber]", err.message);
      });

      // Zuerst abonnieren – nur so empfängt dieser Client sein eigenes Presence-Event.
      // boardChannel: note-spezifische Events dieses Boards
      // PRESENCE_CHANNEL: globale Online-Nutzer-Updates (board-übergreifend)
      await subscriber.subscribe(boardChannel(boardId), PRESENCE_CHANNEL);
      subscriber.on("message", (_ch, msg) => send(msg));

      // Nutzer global + boardspezifisch online setzen, dann Presence broadcasten
      const userColor = (await getUserColor(userId)) ?? "yellow";
      await setUserOnline(userId, userName, userColor);
      await setBoardUserOnline(boardId, userId);
      const users = await getOnlineUsers();
      await publishPresenceEvent(users);

      // Keep-Alive: Proxies und Browser trennen bei ~30s Inaktivität
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          if (heartbeat) clearInterval(heartbeat);
        }
      }, 25_000);

      // Aufräumen wenn Client die Verbindung trennt
      request.signal.addEventListener("abort", async () => {
        if (heartbeat) clearInterval(heartbeat);

        try {
          await subscriber?.unsubscribe();
          await subscriber?.quit();
        } catch {}

        try {
          await setUserOffline(userId);
          await setBoardUserOffline(boardId, userId);
          const updated = await getOnlineUsers();
          await publishPresenceEvent(updated);
        } catch {}

        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
