import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getNotesByBoard, getShapesByBoard, getUserColor, getBoard, getBoardTTL } from "@/lib/redis";
import Board from "../Board";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function BoardPage({
  params,
}: {
  params: { boardId: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { boardId } = params;

  const [board, notes, shapes, userColor, boardTtl] = await Promise.all([
    getBoard(boardId),
    getNotesByBoard(boardId),
    getShapesByBoard(boardId),
    getUserColor(session.user.id),
    getBoardTTL(boardId),
  ]);

  if (!board) notFound();

  return (
    <Board
      initialNotes={notes}
      initialShapes={shapes}
      boardId={boardId}
      boardName={board.name}
      username={session.user.name ?? "Unbekannt"}
      userEmail={session.user.email ?? ""}
      userId={session.user.id}
      initialUserColor={userColor}
      isAdmin={session.user.role === "admin"}
      boardTtl={boardTtl}
    />
  );
}
