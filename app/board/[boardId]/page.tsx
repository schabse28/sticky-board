import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getNotesByBoard, getUserColor, getBoard } from "@/lib/redis";
import Board from "../Board";

export default async function BoardPage({
  params,
}: {
  params: { boardId: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const { boardId } = params;

  const [board, notes, userColor] = await Promise.all([
    getBoard(boardId),
    getNotesByBoard(boardId),
    getUserColor(session.user.id),
  ]);

  if (!board) notFound();

  return (
    <Board
      initialNotes={notes}
      boardId={boardId}
      boardName={board.name}
      username={session.user.name ?? "Unbekannt"}
      userId={session.user.id}
      initialUserColor={userColor}
      isAdmin={session.user.role === "admin"}
    />
  );
}
