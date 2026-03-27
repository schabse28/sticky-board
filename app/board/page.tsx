import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getNotesByBoard, getUserColor } from "@/lib/redis";
import Board from "./Board";

// Server Component: Session prüfen, initiale Daten aus Redis laden und
// an die interaktive Client-Komponente übergeben.
// boardId = "main" für alle Nutzer → gemeinsames Whiteboard.
export default async function BoardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const [notes, userColor] = await Promise.all([
    getNotesByBoard("main"),
    getUserColor(session.user.id),
  ]);

  return (
    <Board
      initialNotes={notes}
      boardId="main"
      username={session.user.name ?? "Unbekannt"}
      userId={session.user.id}
      initialUserColor={userColor}
    />
  );
}
