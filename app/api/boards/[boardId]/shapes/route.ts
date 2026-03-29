import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createShape, getShapesByBoard, getUserColor, publishBoardEvent, redis } from "@/lib/redis";

export async function GET(
  _request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }
  const shapes = await getShapesByBoard(params.boardId);
  return NextResponse.json(shapes);
}

export async function POST(
  request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const body = await request.json();
  const { type, x, y, width, height, filled, strokeWidth } = body;

  if (!["rect", "circle", "arrow"].includes(type)) {
    return NextResponse.json({ error: "Ungültiger Shape-Typ" }, { status: 400 });
  }

  // Rate Limiting: max. 50 Shapes pro Nutzer pro Board
  const totalShapeIds = await redis.smembers(`board:${params.boardId}:shapes`);
  if (totalShapeIds.length >= 50) {
    const p = redis.pipeline();
    for (const id of totalShapeIds) p.hget(`shape:${id}`, "userId");
    const results = (await p.exec()) ?? [];
    const userShapeCount = results.filter(([, uid]) => uid === session.user.id).length;
    if (userShapeCount >= 50) {
      return NextResponse.json(
        { error: "Maximale Anzahl von 50 Shapes pro Board erreicht" },
        { status: 429 }
      );
    }
  }

  const color = (await getUserColor(session.user.id)) ?? "yellow";

  const shape = await createShape(params.boardId, {
    type,
    x: Number(x),
    y: Number(y),
    width: Number(width),
    height: Number(height),
    color,
    filled: !!filled,
    strokeWidth: Number(strokeWidth) || 2,
    userId: session.user.id,
  });

  await publishBoardEvent(params.boardId, { type: "shape:created", shape });
  return NextResponse.json(shape, { status: 201 });
}
