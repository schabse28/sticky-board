import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createNote, getNotesByBoard, getUserColor, publishBoardEvent } from "@/lib/redis";

// Gemeinsames Board für alle eingeloggten Nutzer
const BOARD_ID = "main";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const notes = await getNotesByBoard(BOARD_ID);
  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const body = await request.json();
  const { text, posX, posY } = body;

  // Farbe kommt immer aus der festgelegten Nutzerfarbe, nie aus dem Request
  const userColor = (await getUserColor(session.user.id)) ?? "yellow";

  const note = await createNote(BOARD_ID, {
    text: text ?? "",
    color: userColor,
    posX: Number(posX),
    posY: Number(posY),
    userId: session.user.id,
  });

  // Alle anderen Clients via SSE informieren
  await publishBoardEvent({ type: "note:created", note });

  return NextResponse.json(note, { status: 201 });
}
