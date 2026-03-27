import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBoard, deleteBoard, publishBoardEvent, getNotesByBoard } from "@/lib/redis";

export async function DELETE(
  _request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { boardId } = params;

  // Das Hauptboard kann nicht gelöscht werden
  if (boardId === "main") {
    return NextResponse.json({ error: "Das Hauptboard kann nicht gelöscht werden" }, { status: 400 });
  }

  const board = await getBoard(boardId);
  if (!board) {
    return NextResponse.json({ error: "Board nicht gefunden" }, { status: 404 });
  }

  // Nur Admins oder der Ersteller dürfen löschen
  const isAdmin = session.user.role === "admin";
  const isCreator = board.createdBy === session.user.id;
  if (!isAdmin && !isCreator) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  try {
    // Alle verbliebenen Notes als gelöscht broadcasten, dann Board löschen
    const notes = await getNotesByBoard(boardId);
    await Promise.all(
      notes.map((note) =>
        publishBoardEvent(boardId, { type: "note:deleted", noteId: note.id, byUserId: session.user.id })
      )
    );
    await deleteBoard(boardId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[DELETE /api/boards/${boardId}]`, error);
    return NextResponse.json({ error: "Board konnte nicht gelöscht werden" }, { status: 500 });
  }
}
