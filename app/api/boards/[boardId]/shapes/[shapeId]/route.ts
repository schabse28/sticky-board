import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redis, deleteShape, publishBoardEvent, updateShapePosition, updateShapeSize } from "@/lib/redis";

/** Liest boardId und userId der Shape in einem Roundtrip. */
async function getShapeMeta(
  shapeId: string
): Promise<{ boardId: string | null; ownerId: string | null }> {
  const [boardId, ownerId] = await redis.hmget(`shape:${shapeId}`, "boardId", "userId");
  return { boardId, ownerId };
}

export async function PATCH(
  request: Request,
  { params }: { params: { boardId: string; shapeId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { boardId: shapeBoardId, ownerId } = await getShapeMeta(params.shapeId);

  if (!shapeBoardId) {
    return NextResponse.json({ error: "Shape nicht gefunden" }, { status: 404 });
  }
  if (shapeBoardId !== params.boardId) {
    return NextResponse.json({ error: "Shape nicht gefunden" }, { status: 404 });
  }
  if (ownerId !== session.user.id) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const body = await request.json();

  if (body.width !== undefined && body.height !== undefined) {
    const x = Number(body.x);
    const y = Number(body.y);
    const width = Number(body.width);
    const height = Number(body.height);

    if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
      return NextResponse.json({ error: "Ungültige numerische Werte" }, { status: 400 });
    }

    await updateShapeSize(params.shapeId, x, y, width, height);
    await publishBoardEvent(params.boardId, {
      type: "shape:resized",
      shapeId: params.shapeId,
      x, y, width, height,
      byUserId: session.user.id,
    });
  } else if (body.x !== undefined && body.y !== undefined) {
    const x = Number(body.x);
    const y = Number(body.y);

    if (isNaN(x) || isNaN(y)) {
      return NextResponse.json({ error: "Ungültige numerische Werte" }, { status: 400 });
    }

    await updateShapePosition(params.shapeId, x, y);
    await publishBoardEvent(params.boardId, {
      type: "shape:moved",
      shapeId: params.shapeId,
      x, y,
      byUserId: session.user.id,
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { boardId: string; shapeId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { boardId: shapeBoardId, ownerId } = await getShapeMeta(params.shapeId);

  if (!shapeBoardId) {
    return NextResponse.json({ error: "Shape nicht gefunden" }, { status: 404 });
  }
  if (shapeBoardId !== params.boardId) {
    return NextResponse.json({ error: "Shape nicht gefunden" }, { status: 404 });
  }

  const isAdmin = session.user.role === "admin";
  if (ownerId !== session.user.id && !isAdmin) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  await deleteShape(params.shapeId);
  await publishBoardEvent(params.boardId, {
    type: "shape:deleted",
    shapeId: params.shapeId,
    byUserId: session.user.id,
  });

  return new Response(null, { status: 204 });
}
