import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createNote, getNotesByBoard } from "@/lib/redis";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const boardId = searchParams.get("boardId");

  // Nur das eigene Board darf abgerufen werden
  if (!boardId || boardId !== session.user.id) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const notes = await getNotesByBoard(boardId);
  return NextResponse.json(notes);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const body = await request.json();
  const { boardId, text, color, posX, posY } = body;

  if (boardId !== session.user.id) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const note = await createNote(boardId, {
    text: text ?? "",
    color: color ?? "yellow",
    posX: Number(posX),
    posY: Number(posY),
    userId: session.user.id,
  });

  return NextResponse.json(note, { status: 201 });
}
