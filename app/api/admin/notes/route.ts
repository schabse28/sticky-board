import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllBoards, getNotesByBoard, getShapesByBoard, deleteNote, deleteShape, publishBoardEvent } from "@/lib/redis";

async function assertAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if (session.user.role !== "admin") return null;
  return session;
}

// GET alle Notes aller Boards
export async function GET() {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  try {
    const boards = await getAllBoards();
    const results = await Promise.all(
      boards.map(async (b) => ({ boardId: b.id, boardName: b.name, notes: await getNotesByBoard(b.id) }))
    );
    return NextResponse.json(results);
  } catch (error) {
    console.error("[GET /api/admin/notes]", error);
    return NextResponse.json({ error: "Fehler beim Laden der Notes" }, { status: 500 });
  }
}

// DELETE alle Notes eines Boards (Board leeren, nicht löschen)
export async function DELETE(request: Request) {
  const session = await assertAdmin();
  if (!session) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get("boardId") ?? "main";

  try {
    const [notes, shapes] = await Promise.all([
      getNotesByBoard(boardId),
      getShapesByBoard(boardId),
    ]);

    await Promise.all([
      ...notes.map(async (note) => {
        await deleteNote(note.id);
        await publishBoardEvent(boardId, {
          type: "note:deleted",
          noteId: note.id,
          byUserId: session.user.id,
        });
      }),
      ...shapes.map(async (shape) => {
        await deleteShape(shape.id);
        await publishBoardEvent(boardId, {
          type: "shape:deleted",
          shapeId: shape.id,
          byUserId: session.user.id,
        });
      }),
    ]);

    return NextResponse.json({ success: true, deletedNotes: notes.length, deletedShapes: shapes.length });
  } catch (error) {
    console.error("[DELETE /api/admin/notes]", error);
    return NextResponse.json({ error: "Fehler beim Leeren des Boards" }, { status: 500 });
  }
}
