import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redis, getUserColor, publishBoardEvent } from "@/lib/redis";

// Cursor-Key in Redis: cursor:{boardId}:{userId} → JSON({x,y,displayName,color})
// TTL: 3 Sekunden – verschwindet automatisch bei Inaktivität
const cursorKey = (boardId: string, userId: string) => `cursor:${boardId}:${userId}`;

export async function PATCH(
  request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  let body: { x?: number; y?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { x, y } = body;
  if (typeof x !== "number" || typeof y !== "number") {
    return NextResponse.json({ error: "x und y erforderlich" }, { status: 400 });
  }

  const { boardId } = params;
  const userId = session.user.id;
  const displayName = session.user.name ?? "Unbekannt";
  const color = (await getUserColor(userId)) ?? "yellow";

  // Position mit 3s TTL speichern (automatisches Ablaufen bei Inaktivität)
  await redis.setex(
    cursorKey(boardId, userId),
    3,
    JSON.stringify({ x, y, displayName, color })
  );

  // Echtzeit-Event an alle Board-Teilnehmer senden
  await publishBoardEvent(boardId, {
    type: "cursor_moved",
    userId,
    displayName,
    color,
    x,
    y,
  });

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { boardId } = params;
  const userId = session.user.id;

  // Cursor aus Redis entfernen und sofortiges Hide-Event senden
  await redis.del(cursorKey(boardId, userId));

  await publishBoardEvent(boardId, {
    type: "cursor_hidden",
    userId,
  });

  return new NextResponse(null, { status: 204 });
}
