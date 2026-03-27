/**
 * SSE-Endpunkt für Echtzeit-Board-Updates
 *
 * Jede SSE-Verbindung bekommt eine eigene Redis-Verbindung im Subscribe-Modus.
 * ioredis sperrt eine Connection nach dem ersten SUBSCRIBE-Aufruf – deshalb
 * kann die globale Singleton-Connection nicht verwendet werden.
 *
 * Ablauf:
 *   1. Client öffnet GET /api/events (Browser-EventSource)
 *   2. Nutzer wird als "online" markiert → Presence-Update an alle
 *   3. Dedizierter Redis-Subscriber hört auf "board:main:events"
 *   4. Jede publizierte Nachricht wird als SSE-Frame an den Client gestreamt
 *   5. Bei Verbindungstrennung: Subscriber schließen, Nutzer offline setzen
 */

import Redis from "ioredis";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getUserColor,
  setUserOnline,
  setUserOffline,
  getOnlineUsers,
  publishBoardEvent,
  BOARD_CHANNEL,
} from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Nicht authentifiziert", { status: 401 });
  }

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

      // Nutzer online setzen und Presence an alle senden
      const userColor = (await getUserColor(userId)) ?? "yellow";
      await setUserOnline(userId, userName, userColor);
      const users = await getOnlineUsers();
      await publishBoardEvent({ type: "presence:update", users });

      // Board-Kanal abonnieren
      await subscriber.subscribe(BOARD_CHANNEL);
      subscriber.on("message", (_ch, msg) => send(msg));

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
          await subscriber?.unsubscribe(BOARD_CHANNEL);
          await subscriber?.quit();
        } catch {}

        try {
          await setUserOffline(userId);
          const updated = await getOnlineUsers();
          await publishBoardEvent({ type: "presence:update", users: updated });
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
      // Nginx/Caddy-Puffer deaktivieren, damit Events sofort ankommen
      "X-Accel-Buffering": "no",
    },
  });
}
