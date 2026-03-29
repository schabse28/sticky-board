import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateNotePosition, updateNoteSize, deleteNote, redis, publishBoardEvent } from "@/lib/redis";

// Nur der Ersteller darf seine eigene Note bearbeiten oder löschen
async function assertOwner(noteId: string, userId: string): Promise<boolean> {
  const noteUserId = await redis.hget(`note:${noteId}`, "userId");
  return noteUserId === userId;
}

async function getNoteBoard(noteId: string): Promise<string> {
  return (await redis.hget(`note:${noteId}`, "boardId")) ?? "main";
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  try {
    if (!(await assertOwner(noteId, session.user.id))) {
      return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
    }

    const boardId = await getNoteBoard(noteId);

    if (body.posX !== undefined && body.posY !== undefined) {
      const posX = Number(body.posX);
      const posY = Number(body.posY);
      await updateNotePosition(noteId, posX, posY);
      await publishBoardEvent(boardId, {
        type: "note:position_updated",
        noteId,
        posX,
        posY,
        byUserId: session.user.id,
      });
    }

    if (body.text !== undefined) {
      const text = String(body.text);
      if (text.length > 10_000) {
        return NextResponse.json({ error: "Text zu lang (max. 10.000 Zeichen)" }, { status: 400 });
      }
      await redis.hset(`note:${noteId}`, { text });
      await publishBoardEvent(boardId, {
        type: "note:text_updated",
        noteId,
        text,
        byUserId: session.user.id,
      });
    }

    if (body.width !== undefined && body.height !== undefined) {
      const width = Math.max(160, Number(body.width));
      const height = Math.max(120, Number(body.height));
      await updateNoteSize(noteId, width, height);
      await publishBoardEvent(boardId, {
        type: "note:resized",
        noteId,
        width,
        height,
        byUserId: session.user.id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[PATCH /api/notes/${noteId}]`, error);
    return NextResponse.json({ error: "Note konnte nicht aktualisiert werden" }, { status: 500 });
  }
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

  try {
    if (!(await assertOwner(noteId, session.user.id))) {
      return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
    }

    const boardId = await deleteNote(noteId);
    await publishBoardEvent(boardId ?? "main", {
      type: "note:deleted",
      noteId,
      byUserId: session.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[DELETE /api/notes/${noteId}]`, error);
    return NextResponse.json({ error: "Note konnte nicht gelöscht werden" }, { status: 500 });
  }
}
