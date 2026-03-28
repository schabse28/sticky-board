import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBoard, makeBoardPermanent } from "@/lib/redis";

export async function POST(
  _request: Request,
  { params }: { params: { boardId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht authentifiziert" }, { status: 401 });
  }

  const { boardId } = params;

  const board = await getBoard(boardId);
  if (!board) {
    return NextResponse.json({ error: "Board nicht gefunden" }, { status: 404 });
  }

  // Nur Ersteller oder Admin dürfen das Board dauerhaft machen
  const isAdmin = session.user.role === "admin";
  const isCreator = board.createdBy === session.user.id;
  if (!isAdmin && !isCreator) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  await makeBoardPermanent(boardId);
  return NextResponse.json({ success: true });
}
