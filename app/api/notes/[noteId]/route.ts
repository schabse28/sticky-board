import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateNotePosition, deleteNote, redis, publishBoardEvent } from "@/lib/redis";

// Nur der Ersteller darf seine eigene Note bearbeiten oder löschen
async function assertOwner(noteId: string, userId: string): Promise<boolean> {
  const noteUserId = await redis.hget(`note:${noteId}`, "userId");
  return noteUserId === userId;
}

export async function PATCH(
  request: Request,
  { params }: { params: { noteId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { noteId } = params;
  if (!(await assertOwner(noteId, session.user.id))) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const body = await request.json();

  if (body.posX !== undefined && body.posY !== undefined) {
    const posX = Number(body.posX);
    const posY = Number(body.posY);
    await updateNotePosition(noteId, posX, posY);
    await publishBoardEvent({
      type: "note:position_updated",
      noteId,
      posX,
      posY,
      byUserId: session.user.id,
    });
  }

  if (body.text !== undefined) {
    const text = String(body.text);
    await redis.hset(`note:${noteId}`, { text });
    await publishBoardEvent({
      type: "note:text_updated",
      noteId,
      text,
      byUserId: session.user.id,
    });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { noteId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { noteId } = params;
  if (!(await assertOwner(noteId, session.user.id))) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  await deleteNote(noteId);
  await publishBoardEvent({
    type: "note:deleted",
    noteId,
    byUserId: session.user.id,
  });

  return NextResponse.json({ success: true });
}
