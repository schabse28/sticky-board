import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redis, deleteShape, publishBoardEvent, updateShapePosition, updateShapeSize } from "@/lib/redis";

async function getShapeOwner(shapeId: string): Promise<string | null> {
  return redis.hget(`shape:${shapeId}`, "userId");
}

export async function PATCH(
  request: Request,
  { params }: { params: { boardId: string; shapeId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const ownerId = await getShapeOwner(params.shapeId);
  if (ownerId !== session.user.id) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const body = await request.json();

  if (body.width !== undefined && body.height !== undefined) {
    await updateShapeSize(
      params.shapeId,
      Number(body.x), Number(body.y),
      Number(body.width), Number(body.height)
    );
    await publishBoardEvent(params.boardId, {
      type: "shape:resized",
      shapeId: params.shapeId,
      x: Number(body.x), y: Number(body.y),
      width: Number(body.width), height: Number(body.height),
      byUserId: session.user.id,
    });
  } else if (body.x !== undefined && body.y !== undefined) {
    await updateShapePosition(params.shapeId, Number(body.x), Number(body.y));
    await publishBoardEvent(params.boardId, {
      type: "shape:moved",
      shapeId: params.shapeId,
      x: Number(body.x), y: Number(body.y),
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

  const ownerId = await getShapeOwner(params.shapeId);
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
