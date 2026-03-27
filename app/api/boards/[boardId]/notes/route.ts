import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createNote, getNotesByBoard, getBoard, getUserColor, publishBoardEvent } from "@/lib/redis";

export async function GET(
  _request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { boardId } = params;

  try {
    const notes = await getNotesByBoard(boardId);
    return NextResponse.json(notes);
  } catch (error) {
    console.error(`[GET /api/boards/${boardId}/notes]`, error);
    return NextResponse.json({ error: "Notes konnten nicht geladen werden" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { boardId } = params;

  // Board muss existieren
  const board = await getBoard(boardId);
  if (!board) {
    return NextResponse.json({ error: "Board nicht gefunden" }, { status: 404 });
  }

  let body: { text?: string; posX?: number; posY?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const { text, posX, posY } = body;
  if (posX === undefined || posY === undefined) {
    return NextResponse.json({ error: "posX und posY sind erforderlich" }, { status: 400 });
  }

  try {
    // Farbe kommt immer aus der festgelegten Nutzerfarbe, nie aus dem Request
    const userColor = (await getUserColor(session.user.id)) ?? "yellow";

    const note = await createNote(boardId, {
      text: text ?? "",
      color: userColor,
      posX: Number(posX),
      posY: Number(posY),
      userId: session.user.id,
    });

    await publishBoardEvent(boardId, { type: "note:created", note });

    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    console.error(`[POST /api/boards/${boardId}/notes]`, error);
    return NextResponse.json({ error: "Note konnte nicht erstellt werden" }, { status: 500 });
  }
}
