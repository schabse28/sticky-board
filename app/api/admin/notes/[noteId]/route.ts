import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { deleteNote, publishBoardEvent } from "@/lib/redis";

export async function DELETE(
  _request: Request,
  { params }: { params: { noteId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const { noteId } = params;

  try {
    const boardId = await deleteNote(noteId);
    await publishBoardEvent(boardId ?? "main", {
      type: "note:deleted",
      noteId,
      byUserId: session.user.id,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[DELETE /api/admin/notes/${noteId}]`, error);
    return NextResponse.json({ error: "Note konnte nicht gelöscht werden" }, { status: 500 });
  }
}
