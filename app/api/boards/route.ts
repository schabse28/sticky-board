import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllBoards, createBoard } from "@/lib/redis";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  try {
    const boards = await getAllBoards();
    return NextResponse.json(boards);
  } catch (error) {
    console.error("[GET /api/boards]", error);
    return NextResponse.json({ error: "Boards konnten nicht geladen werden" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name || name.length < 1) {
    return NextResponse.json({ error: "Board-Name darf nicht leer sein" }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json({ error: "Board-Name zu lang (max. 60 Zeichen)" }, { status: 400 });
  }

  try {
    const board = await createBoard(name, session.user.id);
    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    console.error("[POST /api/boards]", error);
    return NextResponse.json({ error: "Board konnte nicht erstellt werden" }, { status: 500 });
  }
}
