import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { updateNotePosition, deleteNote, redis } from "@/lib/redis";

// Eigentümerschaft prüfen: userId der Note muss mit der Session übereinstimmen
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

  // Position aktualisieren
  if (body.posX !== undefined && body.posY !== undefined) {
    await updateNotePosition(noteId, Number(body.posX), Number(body.posY));
  }

  // Text aktualisieren
  if (body.text !== undefined) {
    await redis.hset(`note:${noteId}`, { text: String(body.text) });
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
  return NextResponse.json({ success: true });
}
